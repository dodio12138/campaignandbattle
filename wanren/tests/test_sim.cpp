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
  printf(fails ? "\n%d 项失败\n" : "\n全部通过\n", fails);
  return fails ? 1 : 0;
}
