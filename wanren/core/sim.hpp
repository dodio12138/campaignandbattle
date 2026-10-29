#pragma once
#include "world.hpp"
#include "grid.hpp"
#include "formation.hpp"
#include "pool.hpp"
#include <memory>

struct Attack { int32_t a, t; uint8_t type; bool impact; };   // type: 0 刺 1 砍
struct Shot { float x0, y0, x1, y1; int tick; uint8_t side; bool hit; };   // 一支箭：起点、落点、发射 tick、是否命中（供画面用）
struct UnitAcc { int alive = 0, inSlot = 0, routed = 0, balk = 0, engaged = 0, push1 = 0, push2 = 0; float msum = 0, fsum = 0; double rsx = 0, rsy = 0; };
struct UnitSpeed { float walk = 1, run = 1, rout = 1; };
struct BBox { float minx = 1e9f, miny = 1e9f, maxx = -1e9f, maxy = -1e9f; };

// 并行约定：士卒阶段按网格顺序分块（BLOCK_SOLDIER 人一块）、士气阶段按下标分块；
// 所有跨士卒的写入（攻击、溃走事件、统计）都先落到「按块编号」的缓冲，再按块顺序串行应用，
// 所以结果与线程数无关（测试第 1 项）。
struct Sim {
  static constexpr int BLOCK_SOLDIER = 1024, BLOCK_MORALE = 2048;
  World w; Grid grid; std::unique_ptr<Pool> pool;
  std::vector<float> nx, ny;                 // 下一位置（并行阶段写）
  std::vector<uint8_t> engaged;              // 本 tick：1 接敌，2 勒马
  std::vector<std::vector<Attack>> attacksByBlock;
  std::vector<std::vector<int32_t>> routsByBlock;   // +i 溃走，-(i+1) 收拢
  std::vector<UnitAcc> accByBlock;           // nBlocks × units
  std::vector<BBox> bboxByBlock;
  std::vector<UnitSpeed> unitSpeed;
  std::vector<float> unitNearEnemy;          // 最近敌曲中心距离
  std::vector<int> unitNearEnemyId;
  std::vector<float> unitFatigue;
  std::vector<Shot> shots;                   // 最近 2 秒内的箭矢（画面用）
  BBox bbox;                                 // 下一次网格重建用的活人包围盒
  int kills[2] = {0, 0};
  double lastStepMs = 0;
  double phaseMs[6] = {0, 0, 0, 0, 0, 0};    // 累计：令+军团 / 网格 / 士卒并行 / 近战结算 / 齐射 / 士气+统计

  explicit Sim(uint32_t seed = 1, int threads = 0);
  void finalize();
  void step();
  void issue(int unit, Order o, bool immediate = false);
  int unitAt(float x, float y, float r) const;
  void log(const std::string& t) { w.events.push_back({w.tick, t}); }
  bool over(int& winner) const;
  int nearestEnemyUnit(int u, float maxR) const;

 private:
  void processOrders();
  void updateUnitsPre();
  void cavalryBrain(Unit& u);
  void startDisengage(Unit& u, float awayX, float awayY);
  void soldierBlock(int block);
  void resolveAttacks();
  void volleys();
  void moraleBlock(int block);
  void applyRoutEvents();
  void updateUnitsPost();
  void applyDown(int i, int by, bool missile);
  void squadHit(int i, float amount, float floorM = -1e9f);
  void computeBBox();
};
