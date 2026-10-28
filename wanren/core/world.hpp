// 世界：士卒 SoA 数组 + 曲（单位）+ 军（side）
#pragma once
#include <cstdint>
#include <vector>
#include <string>
#include <deque>
#include "params.hpp"
#include "rng.hpp"

enum Kind : uint8_t { K_HALBERD, K_SPEAR, K_SWORD, K_BOW, K_XBOW, K_HXBOW, K_CAV, K_CAV_BOW, K_CAV_ARMORED, K_COUNT };
inline bool kindIsCav(uint8_t k) { return k >= K_CAV; }
inline bool kindIsMissile(uint8_t k) { return k == K_BOW || k == K_XBOW || k == K_HXBOW || k == K_CAV_BOW; }
inline bool kindIsLong(uint8_t k) { return k == K_HALBERD || k == K_SPEAR; }
inline const char* kindName(uint8_t k) {
  static const char* n[] = {"戟兵", "矛兵", "刀盾", "弓手", "弩手", "强弩", "突骑", "弓骑", "具装"};
  return k < K_COUNT ? n[k] : "?";
}

enum State : uint8_t { S_FORMED, S_ROUT, S_RALLY, S_WOUNDED, S_DEAD };
enum Formation : uint8_t { F_SQUARE, F_DENSE, F_LOOSE, F_CIRCLE, F_WEDGE, F_GOOSE, F_LINE, F_COLUMN, F_COUNT };
inline const char* formationName(uint8_t f) {
  static const char* n[] = {"方阵", "数阵", "疏阵", "圆阵", "锥形", "雁行", "横列", "纵队"};
  return f < F_COUNT ? n[f] : "?";
}
enum Stance : uint8_t { ST_HOLD, ST_MOVE, ST_CHARGE, ST_RETREAT, ST_PRONE };  // 伏盾 = ST_PRONE
enum OrderType : uint8_t { O_MOVE, O_HALT, O_CHARGE, O_RETREAT, O_FIRE, O_FORMATION, O_FACE, O_PRONE, O_RISE };

struct Order {
  OrderType type; float x = 0, y = 0; int arg = -1; int execTick = 0;
};

struct Unit {
  int id = 0; uint8_t side = 0; int part = 0;        // 部 id（同部为友邻）
  std::string name;
  uint8_t kind = K_HALBERD; bool elite = false; bool shield = false; bool horseArmor = false;
  uint8_t formation = F_SQUARE; int files = 20;
  float cx = 0, cy = 0, fx = 0, fy = 1;             // 中心、朝向（单位向量）
  float gx = 0, gy = 0;                             // 目标点
  uint8_t stance = ST_HOLD;
  int fireTarget = -1;                              // 射击目标曲
  float reload = 0;                                 // 齐射计时（秒）
  std::vector<int32_t> members;                     // 槽位 → 士卒下标
  std::vector<float> slotX, slotY;                  // 槽位局部坐标（x 右，y 前）
  int officer = -1, flag = -1;                      // 军候、旗手（士卒下标）
  bool officerAlive = true, flagAlive = true;
  bool broken = false, brokenNotified = false;
  float cohesion = 1.f, moraleAvg = 70.f;
  int alive = 0, dead = 0, wounded = 0, routed = 0;
  bool cavThreat = false;                           // 侧后有敌骑
  int charging = 0;                                 // 冲锋中剩余 tick
  int balking = 0;                                  // 本 tick 勒马徘徊的骑兵数
  int balkTicks = 0;                                // 连续勒马的 tick 数
  std::deque<Order> orders;
  int lastEngagedTick = -1000;
};

struct Side {
  std::string name; uint32_t color = 0xffffffff;
  int general = -1;                 // 主将所在士卒下标
  int generalUnit = -1;
  bool generalDown = false, fled = false;
  int alive = 0, dead = 0, wounded = 0, routed = 0, total = 0;
  float gx = 0, gy = 0;             // 主将位置（令由此发）
  bool ai = false;                  // 是否由 AI 指挥
  float aiTimer = 0;
};

struct Soldiers {
  std::vector<float> x, y, vx, vy, morale, fatigue, hp;
  std::vector<uint8_t> state, side, kind, armor, cd, flags;   // flags: bit0 shield, bit1 officer, bit2 flagbearer, bit3 elite, bit4 general, bit5 horseArmor
  std::vector<int32_t> unit, slot, target;
  size_t size() const { return x.size(); }
  void reserve(size_t n) { x.reserve(n); y.reserve(n); vx.reserve(n); vy.reserve(n); morale.reserve(n); fatigue.reserve(n); hp.reserve(n); state.reserve(n); side.reserve(n); kind.reserve(n); armor.reserve(n); cd.reserve(n); flags.reserve(n); unit.reserve(n); slot.reserve(n); target.reserve(n); }
  int add(float px, float py, uint8_t s, uint8_t k, uint8_t a, int u, int sl, float m) {
    x.push_back(px); y.push_back(py); vx.push_back(0); vy.push_back(0); morale.push_back(m); fatigue.push_back(0); hp.push_back(0);
    state.push_back(S_FORMED); side.push_back(s); kind.push_back(k); armor.push_back(a); cd.push_back(0); flags.push_back(0);
    unit.push_back(u); slot.push_back(sl); target.push_back(-1);
    return (int)x.size() - 1;
  }
};

struct Event {   // 给界面看的事件（史书体日志）
  int tick; std::string text;
};

struct World {
  Params P;
  Rng rng;
  Soldiers s;
  std::vector<Unit> units;
  Side sides[2];
  int tick = 0;
  std::vector<Event> events;
  explicit World(uint32_t seed = 1) : rng(seed) {}
  float time() const { return tick * P.dt; }
  int addUnit(const Unit& u) { units.push_back(u); units.back().id = (int)units.size() - 1; return units.back().id; }
};
