#pragma once
#include "world.hpp"
#include "grid.hpp"
#include "formation.hpp"
#include "pool.hpp"
#include <memory>

struct Attack { int32_t a, t; uint8_t type; bool impact; };   // type: 0 刺 1 砍

struct Sim {
  World w; Grid grid; std::unique_ptr<Pool> pool;
  std::vector<float> nx, ny;                 // 下一位置（并行阶段写）
  std::vector<uint8_t> engaged;              // 本 tick 接敌
  std::vector<std::vector<Attack>> attacks;  // 每线程
  std::vector<float> unitFatigue;
  // 统计
  int kills[2] = {0, 0};
  double lastStepMs = 0;
  double phaseMs[6] = {0, 0, 0, 0, 0, 0};   // 累计：令+军团 / 网格 / 士卒并行 / 近战结算 / 齐射 / 士气+统计

  explicit Sim(uint32_t seed = 1, int threads = 0);
  void finalize();            // 剧本装好后调用：建槽位、网格
  void step();
  void issue(int unit, Order o, bool immediate = false);   // 下令（经旗鼓延迟）
  int unitAt(float x, float y, float r) const;              // 点选
  void log(const std::string& t) { w.events.push_back({w.tick, t}); }
  bool over(int& winner) const;                             // 结束判定
  int nearestEnemyUnit(int u, float maxR) const;

 private:
  void processOrders();
  void updateUnitsPre();
  void soldierPhase(int b, int e, int t);
  void resolveAttacks();
  void volleys();
  void moraleAndRout();
  void updateUnitsPost();
  void applyDown(int i, int by, bool missile);
  void squadHit(int i, float amount);
  float speedOf(int i) const;
};
