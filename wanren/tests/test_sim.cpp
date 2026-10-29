// 回归测试（原生，无框架）：复现性、阵形槽位、骑兵勒马、弩齐射、溃散、胜负可分
#include "../core/sim.hpp"
#include "../core/ai.hpp"
#include "../core/scenario.hpp"
#include <cstdio>
#include <cmath>
#include <cstdlib>
static int fails = 0;
#define CHECK(c, msg) do { if (!(c)) { printf("失败: %s (%s)\n", msg, #c); fails++; } else printf("通过: %s\n", msg); } while (0)

static const ScenarioDef& find(const char* id) { for (auto& s : scenarios()) if (s.id == id) return s; abort(); }

static void runAI(Sim& sim, int ticks) { for (int t = 0; t < ticks; t++) { for (int sd = 0; sd < 2; sd++) aiStep(sim, sd); sim.step(); int wnr; if (sim.over(wnr)) break; } }

int main() {
  // 1. 复现性：同种子同结果
  {
    ScenarioDef def = find("plain"); def.aiSide[0] = def.aiSide[1] = true;
    Sim a(7, 4), b(7, 1); loadScenario(a, def); loadScenario(b, def);
    runAI(a, 1500); runAI(b, 1500);
    bool same = a.w.sides[0].dead == b.w.sides[0].dead && a.w.sides[1].dead == b.w.sides[1].dead && a.w.sides[0].routed == b.w.sides[0].routed;
    for (size_t i = 0; i < a.w.s.size() && same; i += 97) if (fabsf(a.w.s.x[i] - b.w.s.x[i]) > 1e-4f) same = false;
    CHECK(same, "同种子、不同线程数，1500 tick 后逐人位置与伤亡一致");
  }
  // 2. 阵形槽位：方阵排数、圆阵、锥形
  {
    Sim sim(1, 1); Params P;
    UnitSpec sp{"试", K_HALBERD, 200}; sp.files = 20;
    int id = addUnit(sim, 0, sp, 100, 100, 0, 1, 0); sim.finalize();
    Unit& u = sim.w.units[id];
    float minY = 1e9, maxY = -1e9; for (float y : u.slotY) { minY = std::min(minY, y); maxY = std::max(maxY, y); }
    CHECK(fabsf((maxY - minY) - 9 * P.rankGap) < 1e-3f, "200 人 20 列方阵为 10 排");
    CHECK(sim.w.s.flags[u.officer] & 2 && u.slotY[sim.w.s.slot[u.officer]] <= minY + 1e-3f, "军候在末排");
    u.formation = F_WEDGE; buildSlots(u, P);
    int front = 0; float top = -1e9; for (float y : u.slotY) top = std::max(top, y); for (float y : u.slotY) if (fabsf(y - top) < 1e-3f) front++;
    CHECK(front == 1, "锥形阵前锋一人");
    u.formation = F_CIRCLE; buildSlots(u, P);
    float r0 = hypotf(u.slotX[0], u.slotY[0]), rl = hypotf(u.slotX[199], u.slotY[199]);
    CHECK(r0 > rl, "圆阵第 0 槽在外环、末槽在内");
  }
  // 3. 骑兵正面冲稳固戟阵会勒马、伤亡远小于冲溃兵
  {
    Sim sim(3, 1);
    UnitSpec inf{"戟阵", K_HALBERD, 600}; inf.files = 60; inf.armorPct[0] = 40; inf.armorPct[1] = 40; inf.armorPct[2] = 20;
    UnitSpec cav{"突骑", K_CAV, 300}; cav.files = 30;
    int a = addUnit(sim, 0, inf, 500, 500, 0, 1, 0); int b = addUnit(sim, 1, cav, 500, 620, 0, -1, 0); sim.finalize();
    sim.issue(b, {O_CHARGE, 500, 480}, true);
    for (int t = 0; t < 600; t++) sim.step();
    const Unit& I = sim.w.units[a]; const Unit& C = sim.w.units[b];
    printf("   正面冲戟阵 60s：戟阵 亡伤 %d/%d 溃 %d；骑 亡伤 %d/%d 溃 %d\n", I.dead, I.wounded, I.routed, C.dead, C.wounded, C.routed);
    CHECK(I.dead + I.wounded < 120, "正面冲稳固戟阵一分钟内戟阵折损有限");
    CHECK(C.routed + C.dead + C.wounded > 30, "骑兵在戟阵前徘徊受挫");
    // 同样的骑兵冲击背面
    Sim s2(3, 1); int a2 = addUnit(s2, 0, inf, 500, 500, 0, 1, 0); int b2 = addUnit(s2, 1, cav, 500, 380, 0, 1, 0); s2.finalize();
    s2.issue(b2, {O_CHARGE, 500, 520}, true);
    for (int t = 0; t < 600; t++) s2.step();
    const Unit& I2 = s2.w.units[a2];
    printf("   背后冲戟阵 60s：戟阵 亡伤 %d/%d 溃 %d\n", I2.dead, I2.wounded, I2.routed);
    CHECK(I2.dead + I2.wounded + I2.routed > I.dead + I.wounded + I.routed, "背后冲击比正面冲击更有效");
  }
  // 4. 强弩齐射：200 m 外无伤，120 m 内有伤
  {
    Sim sim(5, 1);
    UnitSpec xb{"强弩", K_HXBOW, 500}; xb.formation = F_LINE; xb.files = 100;
    UnitSpec inf{"戟", K_HALBERD, 600}; inf.files = 60;
    int a = addUnit(sim, 0, xb, 500, 500, 0, 1, 0); int b = addUnit(sim, 1, inf, 500, 800, 0, -1, 0); sim.finalize();
    for (int t = 0; t < 300; t++) sim.step();
    for (int id : sim.w.units[b].members) sim.w.s.y[id] -= 60.f;
    sim.w.units[b].cy -= 60.f;   // 直接挪到 240 m 处
    CHECK(sim.w.units[b].dead + sim.w.units[b].wounded == 0, "300 m 外强弩不及");
    for (int t = 0; t < 300; t++) sim.step();
    CHECK(sim.w.units[b].dead + sim.w.units[b].wounded == 0, "240 m 外强弩不及");
    sim.issue(b, {O_MOVE, 500, 620}, true);
    for (int t = 0; t < 1500; t++) sim.step();
    int hurt = sim.w.units[b].dead + sim.w.units[b].wounded;
    printf("   强弩 500 张对 120 m 处戟兵 90 s：亡伤 %d\n", hurt);
    CHECK(hurt > 40, "进入射程后强弩有杀伤");
  }
  // 5. 界桥 AI 对 AI 能分胜负，伤亡量级合史
  {
    ScenarioDef def = find("jieqiao"); def.aiSide[0] = def.aiSide[1] = true;
    Sim sim(11, 0); loadScenario(sim, def); runAI(sim, 12000);
    int wnr; bool fin = sim.over(wnr);
    auto& A = sim.w.sides[0]; auto& B = sim.w.sides[1];
    printf("   界桥 %.1f 分钟：%s 亡 %d 伤 %d 溃 %d；%s 亡 %d 伤 %d 溃 %d；胜者 %s\n", sim.w.time() / 60, A.name.c_str(), A.dead, A.wounded, A.routed, B.name.c_str(), B.dead, B.wounded, B.routed, fin ? sim.w.sides[wnr].name.c_str() : "未决");
    CHECK(fin, "20 分钟内分出胜负");
    CHECK(A.dead + B.dead > 100, "有实质伤亡");
    CHECK(A.dead < 0.4f * A.total && B.dead < 0.4f * B.total, "阵亡不超过四成（合史）");
  }
  // 6. 行进：横向行进 100 m 时全程凝聚不散；平移保持朝向；到达后按指定方向站定
  {
    Sim sim(2, 1); Params P;
    UnitSpec sp{"曲", K_HALBERD, 200}; sp.files = 20;
    int a = addUnit(sim, 0, sp, 500, 500, 0, 1, 0); int b = addUnit(sim, 0, sp, 800, 500, 0, 1, 0); sim.finalize();
    sim.issue(a, {O_MOVE, 600, 500}, true);                       // 向右 100 m（与朝向垂直）：轮转后行进
    Order o{O_MOVE, 830, 500, 1}; sim.issue(b, o, true);           // 平移 30 m：保持朝向
    float minCoh = 1.f; int arrivedA = -1;
    for (int t = 0; t < 1500; t++) { sim.step(); const Unit& U = sim.w.units[a]; minCoh = std::min(minCoh, U.cohesion); if (arrivedA < 0 && U.stance == ST_HOLD && t > 5) arrivedA = t; }
    const Unit& A = sim.w.units[a]; const Unit& B = sim.w.units[b];
    printf("   横向行进：最低凝聚 %.2f，到达 tick %d，朝向 (%.2f,%.2f)；平移后朝向 (%.2f,%.2f) 中心 x=%.1f\n", minCoh, arrivedA, A.fx, A.fy, B.fx, B.fy, B.cx);
    CHECK(minCoh > 0.6f, "横向行进全程凝聚不低于 60%");
    CHECK(arrivedA > 0 && fabsf(A.cx - 600) < 2.f, "横向行进在 150 s 内到达");
    CHECK(A.fx > 0.9f, "行进后面向行进方向");
    CHECK(fabsf(B.fy - 1.f) < 1e-3f && fabsf(B.cx - 830) < 2.f, "平移保持原朝向且到达");
    Order o2{O_MOVE, 600, 450}; o2.fx = 0; o2.fy = -1; sim.issue(a, o2, true);   // 走到点后面向南
    for (int t = 0; t < 1500; t++) sim.step();
    CHECK(sim.w.units[a].fy < -0.95f && sim.w.units[a].stance == ST_HOLD, "到达后转向指定方向并站定");
  }
  // 7. 突骑反复冲击：3 分钟内至少冲 2 轮，每轮接战不超过设定秒数；骑兵不会耗死在人堆里
  {
    Sim sim(4, 1);
    UnitSpec inf{"刀盾", K_SWORD, 600}; inf.files = 60; inf.armorPct[0] = 60; inf.armorPct[1] = 30; inf.armorPct[2] = 10;
    UnitSpec cav{"突骑", K_CAV, 300}; cav.files = 30; cav.elite = true;
    int a = addUnit(sim, 0, inf, 500, 500, 0, 1, 0); int b = addUnit(sim, 1, cav, 700, 500, -1, 0, 0); sim.finalize();   // 从侧翼冲（正面是盾墙，马不肯前）
    sim.issue(b, {O_CHARGE, 500, 500, a}, true);
    int maxMelee = 0, meleeRun = 0, cycles = 0; uint8_t last = CP_NONE; int disengages = 0;
    for (int t = 0; t < 1800; t++) {
      sim.step(); const Unit& C = sim.w.units[b];
      if (C.cavPhase == CP_MELEE) { meleeRun++; maxMelee = std::max(maxMelee, meleeRun); } else meleeRun = 0;
      if (C.cavPhase == CP_DISENGAGE && last != CP_DISENGAGE) disengages++;
      last = C.cavPhase; cycles = C.cycles;
    }
    const Unit& I = sim.w.units[a]; const Unit& C = sim.w.units[b];
    printf("   突骑对刀盾 3 分钟：冲击 %d 轮，脱离 %d 次，最长连续接战 %.1f s；刀盾 亡伤 %d/%d 溃 %d；骑 亡伤 %d/%d 溃 %d 疲 %.0f\n", cycles, disengages, maxMelee * 0.1, I.dead, I.wounded, I.routed, C.dead, C.wounded, C.routed, sim.unitFatigue[b]);
    CHECK(cycles >= 2 && disengages >= 2, "突骑（侧翼）至少冲击两轮并脱离");
    CHECK(maxMelee * 0.1 <= sim.w.P.cavMeleeSeconds + 1.5, "每轮接战不超过设定秒数");
    CHECK(C.dead + C.wounded < 100, "骑兵没有耗死在人堆里");
  }
  // 8. 骑射游射：2 分钟内始终在敌 20 m 以外、持续移动、有杀伤、自身几乎无损
  {
    Sim sim(6, 1);
    UnitSpec inf{"戟", K_HALBERD, 600}; inf.files = 60;
    UnitSpec ha{"弓骑", K_CAV_BOW, 300}; ha.files = 30; ha.formation = F_LOOSE;
    int a = addUnit(sim, 0, inf, 500, 500, 0, 1, 0); int b = addUnit(sim, 1, ha, 500, 700, 0, -1, 0); sim.finalize();
    sim.issue(b, {O_FIRE, 0, 0, a}, true);
    float minD = 1e9f; double movingTicks = 0; int sweeps = 0;
    for (int t = 0; t < 1200; t++) {
      sim.step(); const Unit& H = sim.w.units[b];
      float d = 1e9f; for (int id : H.members) if (sim.w.s.state[id] < S_WOUNDED) for (int jd : sim.w.units[a].members) { if (sim.w.s.state[jd] >= S_WOUNDED) continue; float dd = hypotf(sim.w.s.x[id] - sim.w.s.x[jd], sim.w.s.y[id] - sim.w.s.y[jd]); if (dd < d) d = dd; }
      if (t > 100) minD = std::min(minD, d);
      if (t > 100 && H.stance != ST_HOLD) movingTicks++;
      sweeps = H.cycles;
    }
    const Unit& I = sim.w.units[a]; const Unit& H = sim.w.units[b];
    printf("   弓骑游射 2 分钟：最近距离 %.0f m，移动占比 %.0f%%，折返 %d 次；戟兵 亡伤 %d/%d；弓骑 亡伤 %d/%d\n", minD, movingTicks / 11.0, sweeps, I.dead, I.wounded, H.dead, H.wounded);
    CHECK(minD > 15.f, "弓骑与敌保持距离");
    CHECK(movingTicks / 11.0 > 80, "弓骑持续运动");
    CHECK(sweeps >= 2, "至少折返两次");
    CHECK(I.dead + I.wounded > 10 && H.dead + H.wounded < 5, "游射有杀伤且自身几乎无损");
  }
  // 9. 阵形效果：横列比方阵射得多；疏阵比数阵少吃箭
  {
    auto hurtAfter = [](uint8_t shooterForm, uint8_t targetForm, int shooterFiles) {
      Sim sim(8, 1);
      UnitSpec xb{"弩", K_XBOW, 600}; xb.formation = shooterForm; xb.files = shooterFiles;
      UnitSpec inf{"戟", K_HALBERD, 600}; inf.formation = targetForm; inf.files = 30;
      int a = addUnit(sim, 0, xb, 500, 500, 0, 1, 0); int b = addUnit(sim, 1, inf, 500, 600, 0, -1, 0); sim.finalize();
      for (int t = 0; t < 900; t++) sim.step();
      return sim.w.units[b].dead + sim.w.units[b].wounded;
    };
    int line = hurtAfter(F_LINE, F_SQUARE, 200), square = hurtAfter(F_SQUARE, F_SQUARE, 30);
    int dense = hurtAfter(F_LINE, F_DENSE, 200), loose = hurtAfter(F_LINE, F_LOOSE, 200);
    printf("   弩 600 张 90 s：横列射方阵 伤 %d，方阵射方阵 伤 %d；横列射数阵 %d，射疏阵 %d\n", line, square, dense, loose);
    CHECK(line > square * 1.5, "横列全员可射，远多于深方阵");
    CHECK(dense > loose * 1.5, "数阵比疏阵吃箭多");
  }
  // 10. 推挤：十排纵深的戟阵对三排横列，60 s 后横列被推退、阵线后弯
  {
    Sim sim(9, 1);
    UnitSpec deep{"深阵", K_HALBERD, 1000}; deep.files = 50;
    UnitSpec thin{"横列", K_HALBERD, 150}; thin.files = 50;
    int a = addUnit(sim, 0, deep, 500, 480, 0, 1, 0); int b = addUnit(sim, 1, thin, 500, 500, 0, -1, 0); sim.finalize();
    float y0 = sim.w.units[b].cy;
    sim.issue(a, {O_MOVE, 500, 520}, true);
    for (int t = 0; t < 600; t++) sim.step();
    const Unit& T = sim.w.units[b]; const Unit& D = sim.w.units[a];
    printf("   推挤 60 s：横列中心后退 %.1f m，深阵中心前进 %.1f m；横列 亡伤 %d 溃 %d，深阵 亡伤 %d\n", T.cy - y0, D.cy - 480.f, T.dead + T.wounded, T.routed, D.dead + D.wounded);
    CHECK(T.cy - y0 > 2.f, "横列被推退");
    CHECK(D.routed < 300, "深阵前排折损不致全曲崩溃（后队压得住）");
  }
  // 11. 溃兵传染有方向性：溃兵穿过本阵的曲掉士气，远处的曲不掉
  {
    Sim sim(10, 1);
    UnitSpec sp{"曲", K_HALBERD, 400}; sp.files = 40;
    int near_ = addUnit(sim, 0, sp, 500, 450, 0, 1, 0); int far_ = addUnit(sim, 0, sp, 800, 450, 0, 1, 0);
    UnitSpec vict{"前曲", K_HALBERD, 400}; vict.files = 40;
    int v = addUnit(sim, 0, vict, 500, 520, 0, 1, 1);
    UnitSpec en{"敌", K_HALBERD, 200}; en.files = 20; addUnit(sim, 1, en, 500, 650, 0, -1, 0);   // 敌在北 130 m，溃兵不会收拢
    sim.finalize();
    for (int id : sim.w.units[v].members) { sim.w.s.state[id] = S_ROUT; sim.w.s.morale[id] = -50; }   // 前曲全溃（士气 -50，几分钟内不会收拢），往南跑穿过 near_
    for (int id : sim.w.units[near_].members) sim.w.s.morale[id] = 50;   // 被穿过的曲本已动摇（士气 50）
    for (int id : sim.w.units[far_].members) sim.w.s.morale[id] = 50;
    float mNear = 100, mFar = 100;
    for (int t = 0; t < 450; t++) { sim.step(); mNear = std::min(mNear, sim.w.units[near_].moraleAvg); mFar = std::min(mFar, sim.w.units[far_].moraleAvg); }
    printf("   溃兵穿阵 45 s：被穿过的曲（本已动摇）溃 %d 人、最低士气 %.0f；300 m 外同样动摇的曲溃 %d 人\n", sim.w.units[near_].routed, mNear, sim.w.units[far_].routed);
    CHECK(mNear < mFar - 5.f, "溃兵穿过的曲士气明显更低（被压向溃走线，但不直接溃）");
    CHECK(sim.w.units[far_].routed == 0 && mFar > 45.f, "远处的曲不受影响");
  }
  // 12. 追击与俘降：溃兵被骑兵追上多数就擒
  {
    Sim sim(12, 1);
    UnitSpec inf{"步", K_SWORD, 400}; inf.files = 40;
    UnitSpec cav{"骑", K_CAV, 200}; cav.files = 20;
    int a = addUnit(sim, 0, inf, 500, 500, 0, 1, 0); int b = addUnit(sim, 1, cav, 500, 600, 0, -1, 0); sim.finalize();
    for (int id : sim.w.units[a].members) { sim.w.s.state[id] = S_ROUT; sim.w.s.morale[id] = -30; }
    sim.w.units[a].broken = true;
    sim.issue(b, {O_CHARGE, 500, 500, a}, true);
    for (int t = 0; t < 900; t++) sim.step();
    const Unit& I = sim.w.units[a];
    printf("   骑兵追溃兵 90 s：亡 %d 伤 %d 降 %d 尚在逃 %d\n", I.dead, I.wounded, I.captured, I.routed);
    CHECK(I.captured > 20 && I.captured > I.dead, "溃兵被追上多数就擒");
  }
  // 13. 让路：方阵穿过本方弓手横列时横列开口，两边都不乱
  {
    Sim sim(13, 1);
    UnitSpec blk{"方阵", K_HALBERD, 600}; blk.files = 30;
    UnitSpec bow{"弓手", K_BOW, 300}; bow.formation = F_LINE; bow.files = 100;
    int a = addUnit(sim, 0, blk, 500, 460, 0, 1, 0); int b = addUnit(sim, 0, bow, 500, 520, 0, 1, 1); sim.finalize();
    sim.issue(a, {O_MOVE, 500, 620}, true);
    float minA = 1.f, minB = 1.f;
    for (int t = 0; t < 1500; t++) { sim.step(); if (t > 50) { minA = std::min(minA, sim.w.units[a].cohesion); minB = std::min(minB, sim.w.units[b].cohesion); } }
    printf("   方阵穿过弓手横列：方阵最低凝聚 %.2f，弓手最低凝聚 %.2f，方阵到达 y=%.0f\n", minA, minB, sim.w.units[a].cy);
    CHECK(minA > 0.6f, "穿过时方阵不散");
    CHECK(fabsf(sim.w.units[a].cy - 620) < 3.f, "方阵穿过后到达");
  }
  // 14. 地形：林中行进慢；河挡路、绕渡口过；居高临下近战占优
  {
    Sim sim(14, 1);
    sim.w.terrain.patch(T_FOREST, 600, 500, 80);   // 覆盖路程中段 160 m
    sim.w.terrain.river({{900, 0}, {900, 1000}}, 30, {0.7f}, 40);   // 渡口在 y=700
    UnitSpec sp{"曲", K_HALBERD, 200}; sp.files = 20;
    int a = addUnit(sim, 0, sp, 500, 500, 1, 0, 0); int b = addUnit(sim, 0, sp, 500, 620, 1, 0, 0); sim.finalize();
    sim.issue(a, {O_MOVE, 700, 500}, true); sim.issue(b, {O_MOVE, 700, 620}, true);   // a 穿林，b 走旷野
    int ta = -1, tb = -1;
    for (int t = 0; t < 3000; t++) { sim.step(); if (ta < 0 && sim.w.units[a].stance == ST_HOLD && t > 5) ta = t; if (tb < 0 && sim.w.units[b].stance == ST_HOLD && t > 5) tb = t; if (ta > 0 && tb > 0) break; }
    printf("   林中 200 m 用时 %.0f s，旷野 %.0f s\n", ta * 0.1, tb * 0.1);
    CHECK(ta > tb * 1.3, "林中行进明显更慢");
    sim.issue(b, {O_MOVE, 1100, 500}, true);   // 要过河：直线被挡，应绕到 y=700 渡口
    bool wet = false; float maxY = 0;
    for (int t = 0; t < 9000; t++) { sim.step(); const Unit& B = sim.w.units[b]; maxY = std::max(maxY, B.cy); for (int id : B.members) if (sim.w.terrain.typeAt(sim.w.s.x[id], sim.w.s.y[id]) == T_WATER) wet = true; if (B.stance == ST_HOLD && t > 5) break; }
    printf("   过河：最北到 y=%.0f，到达 x=%.0f，是否下水 %s\n", maxY, sim.w.units[b].cx, wet ? "是" : "否");
    CHECK(!wet && sim.w.units[b].cx > 1050, "绕渡口过河，无人下水");
    // 居高临下
    auto duel = [](bool hill) { Sim sim(15, 1); if (hill) sim.w.terrain.hill(500, 520, 80, 10); UnitSpec x{"甲", K_HALBERD, 300}; x.files = 30; UnitSpec y{"乙", K_HALBERD, 300}; y.files = 30;
      int a = addUnit(sim, 0, x, 500, 480, 0, 1, 0); int b = addUnit(sim, 1, y, 500, 512, 0, -1, 0); sim.finalize(); sim.issue(a, {O_MOVE, 500, 500}, true); for (int t = 0; t < 900; t++) sim.step(); return std::make_pair(sim.w.units[a].dead + sim.w.units[a].wounded, sim.w.units[b].dead + sim.w.units[b].wounded); };
    auto flat = duel(false), up = duel(true);
    printf("   平地对攻 90 s：甲伤 %d 乙伤 %d；乙居高：甲伤 %d 乙伤 %d\n", flat.first, flat.second, up.first, up.second);
    CHECK((float)up.first / std::max(1, up.second) > (float)flat.first / std::max(1, flat.second), "仰攻一方吃亏");
  }
  // 15. 行进到接敌再冲：200 m 外下 O_ATTACK，到 45 m 内才冲锋；弓弩自保：敌步兵逼近自动退到本方步兵身后
  {
    Sim sim(16, 1);
    UnitSpec sp{"戟", K_HALBERD, 400}; sp.files = 40;
    int a = addUnit(sim, 0, sp, 500, 500, 0, 1, 0); int b = addUnit(sim, 1, sp, 500, 700, 0, -1, 0); sim.finalize();
    sim.issue(a, {O_ATTACK, 0, 0, b}, true);
    int chargeAt = -1; float chargeDist = 0;
    for (int t = 0; t < 1500; t++) { sim.step(); const Unit& A = sim.w.units[a]; if (chargeAt < 0 && A.stance == ST_CHARGE) { chargeAt = t; chargeDist = hypotf(sim.w.units[b].cx - A.cx, sim.w.units[b].cy - A.cy); } }
    printf("   O_ATTACK：%d s 后转冲锋，当时距敌 %.0f m，疲劳 %.0f\n", chargeAt / 10, chargeDist, sim.unitFatigue[a]);
    CHECK(chargeAt > 0 && chargeDist < 50.f && chargeDist > 20.f, "到 45 m 内才冲锋");
    Sim s2(17, 1);
    UnitSpec xb{"弩", K_XBOW, 300}; xb.formation = F_LINE; xb.files = 100;
    UnitSpec inf{"步", K_HALBERD, 600}; inf.files = 30;
    int x = addUnit(s2, 0, xb, 500, 520, 0, 1, 0); int g = addUnit(s2, 0, inf, 500, 470, 0, 1, 0); int e = addUnit(s2, 1, inf, 500, 640, 0, -1, 0); s2.finalize();
    s2.w.units[x].autoWithdraw = true;
    s2.issue(e, {O_MOVE, 500, 560}, true);
    for (int t = 0; t < 1800; t++) s2.step();
    const Unit& X = s2.w.units[x]; const Unit& G = s2.w.units[g];
    printf("   弓弩自保：敌步兵到 %.0f，弩手 y=%.0f（步兵 y=%.0f），弩手亡伤 %d\n", s2.w.units[e].cy, X.cy, G.cy, X.dead + X.wounded);
    CHECK(X.cy < G.cy && X.dead + X.wounded < 30, "弩手退到步兵身后且几乎无损");
  }
  printf(fails ? "\n%d 项失败\n" : "\n全部通过\n", fails);
  return fails ? 1 : 0;
}
