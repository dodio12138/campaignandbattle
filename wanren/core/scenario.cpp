#include "scenario.hpp"
#include <cmath>

int addUnit(Sim& sim, int side, const UnitSpec& sp, float cx, float cy, float fx, float fy, int part) {
  World& w = sim.w; const Params& P = w.P;
  Unit u; u.side = (uint8_t)side; u.part = part; u.name = sp.name; u.kind = sp.kind; u.elite = sp.elite; u.shield = sp.shield || sp.kind == K_SWORD; u.horseArmor = sp.horseArmor;
  u.formation = sp.formation; u.files = sp.files; u.cx = cx; u.cy = cy; u.fx = fx; u.fy = fy;
  if (sp.prone) u.stance = ST_PRONE;
  u.rearKind = sp.rearKind;
  switch (sp.kind) { case K_BOW: u.ammo = P.bowAmmo; break; case K_XBOW: u.ammo = P.xbowAmmo; break; case K_HXBOW: u.ammo = P.hxbowAmmo; break; case K_CAV_BOW: u.ammo = P.haAmmo; break; default: u.ammo = 0; }
  int id = w.addUnit(u);
  Unit& U = w.units[id];
  float m0 = sp.elite ? P.moraleInitElite : P.moraleInit;
  int filesEff = sp.formation == F_LINE ? std::max(1, (sp.men + 2) / 3) : std::max(1, sp.files);
  for (int i = 0; i < sp.men; i++) {
    int r = w.rng.below(100); uint8_t armor = r < sp.armorPct[0] ? 0 : (r < sp.armorPct[0] + sp.armorPct[1] ? 1 : 2);
    uint8_t kind = (sp.rearKind != 255 && i / filesEff >= P.longRanks) ? sp.rearKind : sp.kind;   // 长兵在前，短兵在后
    int sid = w.s.add(cx, cy, (uint8_t)side, kind, armor, id, i, m0 + w.rng.range(-5.f, 5.f));
    uint8_t f = 0; if (U.shield || kind == K_SWORD) f |= 1; if (sp.elite) f |= 8; if (sp.horseArmor) f |= 32;
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
  // 强弩千张夹承之：在先登两翼同一线上（弩平射，不能在先登身后）
  A.push_back({"强弩左", K_HXBOW, 500, true, false, false, {20, 60, 20}, F_LINE, 60, -236, 120});
  A.push_back({"强弩右", K_HXBOW, 500, true, false, false, {20, 60, 20}, F_LINE, 60, 236, 120});
  const char* names[] = {"前部左曲", "前部右曲", "中部左曲", "中部右曲", "后部左曲", "后部右曲"};
  for (int i = 0; i < 6; i++) { UnitSpec u{names[i], (i % 2) ? K_SPEAR : K_HALBERD, 1000, false, false, false, {40, 45, 15}, F_SQUARE, 50}; u.rearKind = K_SWORD; u.ox = (i % 2 ? 60.f : -60.f); u.oy = -(i / 2) * 50.f; if (i == 2) u.general = true; A.push_back(u); }
  A.push_back({"弓手", K_BOW, 600, false, false, false, {50, 40, 10}, F_LINE, 60, 0, 30});
  A.push_back({"亲骑", K_CAV, 200, true, false, false, {0, 30, 70}, F_WAVE, 15, 40, -160});
  // 具装：《魏武军策令》「本初马铠三百具」（官渡前后语；界桥时有无、有多少不可考，此取百骑）
  A.push_back({"具装", K_CAV_ARMORED, 100, true, false, true, {0, 0, 100}, F_WEDGE, 10, -40, -160});
  // 公孙瓒（AI）：骑兵万余（缩为 3000）为两翼，步兵三万（缩为 9000）居中
  auto& B = s.armies[1];
  B.push_back({"白马义从左", K_CAV_BOW, 600, true, false, false, {10, 50, 40}, F_LOOSE, 20, -220, 20});
  B.push_back({"白马义从右", K_CAV_BOW, 600, true, false, false, {10, 50, 40}, F_LOOSE, 20, 220, 20});
  B.push_back({"幽州突骑左", K_CAV, 900, false, false, false, {30, 50, 20}, F_WAVE, 30, -150, 60});
  B.push_back({"幽州突骑右", K_CAV, 900, false, false, false, {30, 50, 20}, F_WAVE, 30, 150, 60});
  const char* bn[] = {"步兵前左", "步兵前右", "步兵中左", "步兵中右", "步兵后左", "步兵后右"};
  for (int i = 0; i < 6; i++) { UnitSpec u{bn[i], (i % 3 == 2) ? K_SWORD : K_HALBERD, 1500, false, false, false, {55, 35, 10}, F_SQUARE, 60}; if (u.kind == K_HALBERD) u.rearKind = K_SWORD; u.ox = (i % 2 ? 70.f : -70.f); u.oy = -(i / 2) * 60.f; if (i == 3) u.general = true; B.push_back(u); }
  B.push_back({"弓弩", K_XBOW, 800, false, false, false, {50, 40, 10}, F_LINE, 80, 0, -200});
  // 磐河自北向南在战场东侧流过，界桥（渡口）在两军之间偏东；西侧略有起伏
  // 主帅：袁军前敌实为麹义（「久在凉州，晓习羌斗」），守而待敌乱；公孙瓒「见其兵少，便放骑欲陵蹈之」——骄
  s.gen[0] = {80, 75, 2, 1}; s.gen[1] = {80, 50, 1, 0};
  s.terrain.push_back({TerrainFeature::RIVER, 420, -900, 380, 900, 28, 0, {0.5f}});
  s.terrain.push_back({TerrainFeature::HILL, -350, 150, 0, 0, 220, 8});
  s.terrain.push_back({TerrainFeature::FOREST, -520, -200, 0, 0, 120, 0});
  return s;
}

static ScenarioDef plain() {
  ScenarioDef s; s.id = "plain"; s.title = "平野会战（万人对万人）"; s.note = "两军各万人，步骑弓弩齐备，自由演练。";
  s.sideName[0] = "曹操"; s.sideName[1] = "袁绍";
  for (int sd = 0; sd < 2; sd++) {
    auto& A = s.armies[sd];
    for (int i = 0; i < 6; i++) { UnitSpec u{std::string("步") + "一二三四五六"[0] , K_HALBERD, 1000}; u.name = std::string("步兵") + std::to_string(i + 1) + "曲"; u.kind = i % 3 == 0 ? K_SWORD : (i % 3 == 1 ? K_HALBERD : K_SPEAR); if (u.kind != K_SWORD) u.rearKind = K_SWORD; u.files = 50; u.ox = (i - 2.5f) * 65.f; u.oy = 0; if (i == 3) u.general = true; A.push_back(u); }
    A.push_back({"弩手左", K_XBOW, 600, false, false, false, {50, 40, 10}, F_LINE, 60, -120, 40});
    A.push_back({"弩手右", K_XBOW, 600, false, false, false, {50, 40, 10}, F_LINE, 60, 120, 40});
    A.push_back({"弓手", K_BOW, 600, false, false, false, {50, 40, 10}, F_LINE, 60, 0, 40});
    A.push_back({"骑左", K_CAV, 700, false, false, false, {20, 60, 20}, F_WAVE, 25, -280, -40});
    A.push_back({"骑右", K_CAV, 700, false, false, false, {20, 60, 20}, F_WAVE, 25, 280, -40});
    if (sd == 1) A.push_back({"精骑", K_CAV_ARMORED, 300, true, false, true, {0, 0, 100}, F_WEDGE, 15, 0, -120});
    else A.push_back({"陷阵", K_HALBERD, 700, true, false, false, {0, 0, 100}, F_DENSE, 35, 0, -80});
  }
  s.terrain.push_back({TerrainFeature::HILL, 0, 0, 0, 0, 180, 12});        // 两军之间一座土山
  s.terrain.push_back({TerrainFeature::FOREST, -420, 60, 0, 0, 140, 0});    // 西侧林
  s.terrain.push_back({TerrainFeature::MARSH, 450, -40, 0, 0, 90, 0});      // 东侧沼
  return s;
}

// 漠北之战：卫青「令武刚车自环为营，而纵五千骑往当匈奴，匈奴亦纵可万骑」（《史记·卫将军骠骑列传》）
// 西汉事，非汉末；用来检验车营挡骑。人数按 1:3 缩
static ScenarioDef mobei() {
  ScenarioDef s; s.id = "mobei"; s.title = "漠北之战（元狩四年，前 119）";
  s.note = "卫青令武刚车自环为营，纵五千骑往当匈奴，匈奴亦纵可万骑。";
  s.sideName[0] = "卫青"; s.sideName[1] = "单于";
  auto& A = s.armies[0];
  A.push_back({"强弩前", K_HXBOW, 400, true, false, false, {20, 60, 20}, F_LINE, 60, 0, 90});
  A.push_back({"强弩左", K_XBOW, 200, false, false, false, {30, 50, 20}, F_LINE, 60, -80, 30});
  A.push_back({"强弩右", K_XBOW, 200, false, false, false, {30, 50, 20}, F_LINE, 60, 80, 30});
  { UnitSpec u{"戟士", K_HALBERD, 800, false, false, false, {30, 50, 20}, F_SQUARE, 40, 0, 20}; u.rearKind = K_SWORD; u.general = true; A.push_back(u); }
  A.push_back({"汉骑", K_CAV, 1600, true, false, false, {20, 60, 20}, F_WAVE, 40, 260, 20});   // 在营东侧，不挡营内弩的射线
  s.terrain.push_back({TerrainFeature::STOCKADE_RING, 0, -300, 0, 0, 135, 0});
  s.gen[0] = {90, 85, 2, 1}; s.gen[1] = {75, 55, 1, 0};   // 卫青持重；单于见汉兵少而轻进   // 车营：以甲方锚点为心，半径 135 m
  auto& B = s.armies[1];
  B.push_back({"左贤骑射", K_CAV_BOW, 800, false, false, false, {60, 35, 5}, F_LOOSE, 25, -250, 0});
  B.push_back({"右贤骑射", K_CAV_BOW, 800, false, false, false, {60, 35, 5}, F_LOOSE, 25, 250, 0});
  B.push_back({"单于骑射", K_CAV_BOW, 800, true, false, false, {40, 50, 10}, F_LOOSE, 25, 0, 40});
  B.push_back({"突骑左", K_CAV, 1000, false, false, false, {40, 50, 10}, F_WAVE, 30, -120, -40});
  B.push_back({"突骑右", K_CAV, 1000, false, false, false, {40, 50, 10}, F_WAVE, 30, 120, -40});
  { UnitSpec g{"王庭骑", K_CAV, 300, true, false, false, {20, 50, 30}, F_WAVE, 20, 0, -160}; g.general = true; B.push_back(g); }
  return s;
}

const std::vector<ScenarioDef>& scenarios() {
  static std::vector<ScenarioDef> v = {jieqiao(), plain(), mobei()};
  return v;
}

void loadScenario(Sim& sim, const ScenarioDef& sc, float dist, float scale) {
  World& w = sim.w;
  size_t total = 0; for (int sd = 0; sd < 2; sd++) for (auto& u : sc.armies[sd]) total += (size_t)(u.men * scale);
  w.s.reserve(total);
  float cx = w.P.worldW * 0.5f, cy = w.P.worldH * 0.5f;
  w.terrain.init(w.P.worldW, w.P.worldH);
  for (const TerrainFeature& f : sc.terrain) {
    switch (f.kind) {
      case TerrainFeature::HILL: w.terrain.hill(cx + f.x0, cy + f.y0, f.r, f.h); break;
      case TerrainFeature::RIDGE: w.terrain.ridge(cx + f.x0, cy + f.y0, cx + f.x1, cy + f.y1, f.r, f.h); break;
      case TerrainFeature::FOREST: w.terrain.patch(T_FOREST, cx + f.x0, cy + f.y0, f.r); break;
      case TerrainFeature::MARSH: w.terrain.patch(T_MARSH, cx + f.x0, cy + f.y0, f.r); break;
      case TerrainFeature::RIVER: w.terrain.river({{cx + f.x0, cy + f.y0}, {cx + f.x1, cy + f.y1}}, f.r, f.fords, 40.f); break;
      case TerrainFeature::STOCKADE_RING: w.terrain.ring(cx + f.x0, cy + f.y0, f.r, T_STOCKADE); break;
    }
  }
  for (int sd = 0; sd < 2; sd++) {
    w.sides[sd].name = sc.sideName[sd]; w.sides[sd].ai = sc.aiSide[sd];
    w.sides[sd].command = sc.gen[sd].command; w.sides[sd].intellect = sc.gen[sd].intellect; w.sides[sd].trait = sc.gen[sd].trait; w.sides[sd].posture = sc.gen[sd].posture; w.sides[sd].counter = false;
    float fy = sd == 0 ? 1.f : -1.f;           // 0 方朝北（+y），1 方朝南
    float ay = cy - fy * dist * 0.5f;
    const Params& P = w.P;
    static const char* num[] = {"一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"};
    for (size_t i = 0; i < sc.armies[sd].size(); i++) {
      UnitSpec sp = sc.armies[sd][i];
      if (scale != 1.f) { sp.men = (int)(sp.men * scale); sp.files = (int)(sp.files * sqrtf(scale)); sp.ox *= sqrtf(scale); sp.oy *= sqrtf(scale); }
      bool hasGeneral = sp.general; sp.general = false;
      // 编制：超过 300 人按约 200 人一曲拆开，同一部（part = 剧本里的这一条）横向并列，总正面不变
      int k = (sp.split && sp.men > 300) ? std::max(2, (int)std::lround(sp.men / 200.0)) : 1; k = std::min(k, 12);
      bool cav = kindIsCav(sp.kind);
      auto widthOf = [&](int men, int files) -> float {
        if (sp.formation == F_LINE) return ((men + 2) / 3) * (cav ? P.cavFileGap : P.fileGap);
        if (sp.formation == F_WAVE) { int per = (int)(men * (1.f - P.reserveFrac)) / std::max(1, P.waveCount); return ((per + P.waveRanks - 1) / P.waveRanks) * P.waveFileGap; }
        return files * (cav ? P.cavFileGap : P.fileGap);
      };
      std::string base = sp.name; if (k > 1 && base.size() >= 3 && base.compare(base.size() - 3, 3, "曲") == 0) base = base.substr(0, base.size() - 3);
      int subFiles = std::max(1, sp.files / k);
      float subW = widthOf(sp.men / k, subFiles), gapW = 3.f;
      for (int j = 0; j < k; j++) {
        UnitSpec q = sp; q.men = sp.men / k + (j < sp.men % k ? 1 : 0); q.files = subFiles;
        if (k > 1) q.name = base + num[j] + "曲";
        q.ox = sp.ox + (j - (k - 1) * 0.5f) * (subW + gapW);
        float ux = cx + q.ox * fy, uy = ay + q.oy * fy;   // 右手系随朝向翻转
        addUnit(sim, sd, q, ux, uy, 0.f, fy, (int)i);
      }
      // 主将：另立麾下亲兵（精锐、全甲），在所属部之后 40 m；主将居中
      if (hasGeneral) {
        UnitSpec g{sc.sideName[sd] + "麾下", cav ? K_CAV : K_SWORD, P.guardMen, true, !cav, false, {0, 20, 80}, cav ? F_SQUARE : F_DENSE, 12};   // 骑兵为主的一方，麾下也是骑
        g.ox = sp.ox; g.oy = sp.oy - std::max(40.f, sp.men / std::max(1, sp.files) * P.rankGap * 0.5f + 25.f); g.general = true; g.split = false;
        int gid = addUnit(sim, sd, g, cx + g.ox * fy, ay + g.oy * fy, 0.f, fy, (int)i);
        w.units[gid].guard = true;
      }
    }
  }
  for (auto& u : w.units) if (kindIsMissile(u.kind) && !kindIsCav(u.kind)) { if (w.sides[u.side].ai) u.fireDiscipline = true; else u.autoWithdraw = true; }
  sim.finalize();
  sim.log(sc.title + "：" + sc.note);
}
