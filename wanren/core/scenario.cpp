#include "scenario.hpp"
#include <cmath>

int addUnit(Sim& sim, int side, const UnitSpec& sp, float cx, float cy, float fx, float fy, int part) {
  World& w = sim.w; const Params& P = w.P;
  Unit u; u.side = (uint8_t)side; u.part = part; u.name = sp.name; u.kind = sp.kind; u.elite = sp.elite; u.shield = sp.shield || sp.kind == K_SWORD; u.horseArmor = sp.horseArmor;
  u.formation = sp.formation; u.files = sp.files; u.cx = cx; u.cy = cy; u.fx = fx; u.fy = fy;
  if (sp.prone) u.stance = ST_PRONE;
  int id = w.addUnit(u);
  Unit& U = w.units[id];
  float m0 = sp.elite ? P.moraleInitElite : P.moraleInit;
  for (int i = 0; i < sp.men; i++) {
    int r = w.rng.below(100); uint8_t armor = r < sp.armorPct[0] ? 0 : (r < sp.armorPct[0] + sp.armorPct[1] ? 1 : 2);
    int sid = w.s.add(cx, cy, (uint8_t)side, sp.kind, armor, id, i, m0 + w.rng.range(-5.f, 5.f));
    uint8_t f = 0; if (U.shield) f |= 1; if (sp.elite) f |= 8; if (sp.horseArmor) f |= 32;
    w.s.flags[sid] = f;
    U.members.push_back(sid);
  }
  if (sp.general && !U.members.empty()) { int g = U.members[U.members.size() / 2]; w.s.flags[g] |= 16; w.sides[side].general = g; w.sides[side].generalUnit = id; }
  return id;
}

static ScenarioDef jieqiao() {
  ScenarioDef s; s.id = "jieqiao"; s.title = "界桥之战（初平三年，192）";
  s.note = "袁绍以麹义八百先登伏盾下，强弩千张夹承；公孙瓒步骑并进，白马义从为两翼。";
  s.sideName[0] = "袁绍"; s.sideName[1] = "公孙瓒";
  // 袁军（玩家）：先登居前伏盾，强弩两翼，步兵主力在后，主将中军
  auto& A = s.armies[0];
  A.push_back({"麹义先登", K_SWORD, 800, true, true, false, {0, 30, 70}, F_LINE, 60, 0, 120, false, true});
  A.push_back({"强弩左", K_HXBOW, 500, true, false, false, {20, 60, 20}, F_LINE, 60, -70, 90});
  A.push_back({"强弩右", K_HXBOW, 500, true, false, false, {20, 60, 20}, F_LINE, 60, 70, 90});
  const char* names[] = {"前部左曲", "前部右曲", "中部左曲", "中部右曲", "后部左曲", "后部右曲"};
  for (int i = 0; i < 6; i++) { UnitSpec u{names[i], (i % 2) ? K_SPEAR : K_HALBERD, 1000, false, false, false, {40, 45, 15}, F_SQUARE, 50}; u.ox = (i % 2 ? 60.f : -60.f); u.oy = -(i / 2) * 50.f; if (i == 2) u.general = true; A.push_back(u); }
  A.push_back({"弓手", K_BOW, 600, false, false, false, {50, 40, 10}, F_LINE, 60, 0, 30});
  A.push_back({"亲骑", K_CAV, 300, true, false, false, {0, 30, 70}, F_SQUARE, 15, 0, -160});
  // 公孙瓒（AI）：骑兵万余（缩为 3000）为两翼，步兵三万（缩为 9000）居中
  auto& B = s.armies[1];
  B.push_back({"白马义从左", K_CAV_BOW, 600, true, false, false, {10, 50, 40}, F_LOOSE, 20, -220, 20});
  B.push_back({"白马义从右", K_CAV_BOW, 600, true, false, false, {10, 50, 40}, F_LOOSE, 20, 220, 20});
  B.push_back({"幽州突骑左", K_CAV, 900, false, false, false, {30, 50, 20}, F_SQUARE, 30, -150, 60});
  B.push_back({"幽州突骑右", K_CAV, 900, false, false, false, {30, 50, 20}, F_SQUARE, 30, 150, 60});
  const char* bn[] = {"步兵前左", "步兵前右", "步兵中左", "步兵中右", "步兵后左", "步兵后右"};
  for (int i = 0; i < 6; i++) { UnitSpec u{bn[i], (i % 3 == 2) ? K_SWORD : K_HALBERD, 1500, false, false, false, {55, 35, 10}, F_SQUARE, 60}; u.ox = (i % 2 ? 70.f : -70.f); u.oy = -(i / 2) * 60.f; if (i == 3) u.general = true; B.push_back(u); }
  B.push_back({"弓弩", K_XBOW, 800, false, false, false, {50, 40, 10}, F_LINE, 80, 0, -200});
  return s;
}

static ScenarioDef plain() {
  ScenarioDef s; s.id = "plain"; s.title = "平野会战（万人对万人）"; s.note = "两军各万人，步骑弓弩齐备，自由演练。";
  s.sideName[0] = "曹操"; s.sideName[1] = "袁绍";
  for (int sd = 0; sd < 2; sd++) {
    auto& A = s.armies[sd];
    for (int i = 0; i < 6; i++) { UnitSpec u{std::string("步") + "一二三四五六"[0] , K_HALBERD, 1000}; u.name = std::string("步兵") + std::to_string(i + 1) + "曲"; u.kind = i % 3 == 0 ? K_SWORD : (i % 3 == 1 ? K_HALBERD : K_SPEAR); u.files = 50; u.ox = (i - 2.5f) * 65.f; u.oy = 0; if (i == 3) u.general = true; A.push_back(u); }
    A.push_back({"弩手左", K_XBOW, 600, false, false, false, {50, 40, 10}, F_LINE, 60, -120, 40});
    A.push_back({"弩手右", K_XBOW, 600, false, false, false, {50, 40, 10}, F_LINE, 60, 120, 40});
    A.push_back({"弓手", K_BOW, 600, false, false, false, {50, 40, 10}, F_LINE, 60, 0, 40});
    A.push_back({"骑左", K_CAV, 700, false, false, false, {20, 60, 20}, F_SQUARE, 25, -280, -40});
    A.push_back({"骑右", K_CAV, 700, false, false, false, {20, 60, 20}, F_SQUARE, 25, 280, -40});
    if (sd == 1) A.push_back({"精骑", K_CAV_ARMORED, 300, true, false, true, {0, 0, 100}, F_WEDGE, 15, 0, -120});
    else A.push_back({"陷阵", K_HALBERD, 700, true, false, false, {0, 0, 100}, F_DENSE, 35, 0, -80});
  }
  return s;
}

const std::vector<ScenarioDef>& scenarios() {
  static std::vector<ScenarioDef> v = {jieqiao(), plain()};
  return v;
}

void loadScenario(Sim& sim, const ScenarioDef& sc, float dist, float scale) {
  World& w = sim.w;
  size_t total = 0; for (int sd = 0; sd < 2; sd++) for (auto& u : sc.armies[sd]) total += (size_t)(u.men * scale);
  w.s.reserve(total);
  float cx = w.P.worldW * 0.5f, cy = w.P.worldH * 0.5f;
  for (int sd = 0; sd < 2; sd++) {
    w.sides[sd].name = sc.sideName[sd]; w.sides[sd].ai = sc.aiSide[sd];
    float fy = sd == 0 ? 1.f : -1.f;           // 0 方朝北（+y），1 方朝南
    float ay = cy - fy * dist * 0.5f;
    int part = 0;
    for (size_t i = 0; i < sc.armies[sd].size(); i++) {
      UnitSpec sp = sc.armies[sd][i];
      if (scale != 1.f) { sp.men = (int)(sp.men * scale); sp.files = (int)(sp.files * sqrtf(scale)); sp.ox *= sqrtf(scale); sp.oy *= sqrtf(scale); }
      float ux = cx + sp.ox * fy, uy = ay + sp.oy * fy;   // 右手系随朝向翻转
      addUnit(sim, sd, sp, ux, uy, 0.f, fy, part + (int)i / 2);
    }
  }
  sim.finalize();
  sim.log(sc.title + "：" + sc.note);
}
