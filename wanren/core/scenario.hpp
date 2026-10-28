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
struct ScenarioDef { std::string id, title, note; std::vector<UnitSpec> armies[2]; std::string sideName[2]; bool aiSide[2] = {false, true}; };

const std::vector<ScenarioDef>& scenarios();
// 把剧本装进 sim（两军相向，相距 dist 米）
void loadScenario(Sim& sim, const ScenarioDef& sc, float dist = 600.f);
int addUnit(Sim& sim, int side, const UnitSpec& sp, float cx, float cy, float fx, float fy, int part);
