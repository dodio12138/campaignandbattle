#pragma once
#include "sim.hpp"
#include <string>
#include <vector>

struct UnitSpec {
  std::string name; uint8_t kind; int men; bool elite = false; bool shield = false; bool horseArmor = false;
  int armorPct[3] = {50, 40, 10};   // 无甲 / 胸甲 / 全甲 比例
  uint8_t formation = F_SQUARE; int files = 20;
  float ox = 0, oy = 0;             // 相对本军锚点的偏移（x 右，y 前）
  bool general = false;             // 主将随此曲
  bool prone = false;
};
struct TerrainFeature { enum Kind { HILL, RIDGE, FOREST, MARSH, RIVER } kind; float x0 = 0, y0 = 0, x1 = 0, y1 = 0, r = 0, h = 0; std::vector<float> fords; };   // 坐标相对战场中心（x 右，y 向 0 方的前方）
struct ScenarioDef { std::string id, title, note; std::vector<UnitSpec> armies[2]; std::string sideName[2]; bool aiSide[2] = {false, true}; std::vector<TerrainFeature> terrain; };

const std::vector<ScenarioDef>& scenarios();
// 把剧本装进 sim（两军相向，相距 dist 米）
void loadScenario(Sim& sim, const ScenarioDef& sc, float dist = 600.f, float scale = 1.f);   // scale：每曲人数倍率（压力测试用）
int addUnit(Sim& sim, int side, const UnitSpec& sp, float cx, float cy, float fx, float fy, int part);
