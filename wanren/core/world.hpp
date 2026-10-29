// 世界：士卒 SoA 数组 + 曲（单位）+ 军（side）
#pragma once
#include <cstdint>
#include <vector>
#include <string>
#include <deque>
#include "params.hpp"
#include "rng.hpp"
#include "terrain.hpp"

enum Kind : uint8_t { K_HALBERD, K_SPEAR, K_SWORD, K_BOW, K_XBOW, K_HXBOW, K_CAV, K_CAV_BOW, K_CAV_ARMORED, K_COUNT };
inline bool kindIsCav(uint8_t k) { return k >= K_CAV; }
inline bool kindIsMissile(uint8_t k) { return k == K_BOW || k == K_XBOW || k == K_HXBOW || k == K_CAV_BOW; }
inline bool kindIsLong(uint8_t k) { return k == K_HALBERD || k == K_SPEAR; }
inline const char* kindName(uint8_t k) {
  static const char* n[] = {"戟兵", "矛兵", "刀盾", "弓手", "弩手", "强弩", "突骑", "弓骑", "具装"};
  return k < K_COUNT ? n[k] : "?";
}

enum State : uint8_t { S_FORMED, S_ROUT, S_RALLY, S_WOUNDED, S_DEAD, S_CAPTURED };   // >= S_WOUNDED 即退出战斗
enum Formation : uint8_t { F_SQUARE, F_DENSE, F_LOOSE, F_CIRCLE, F_WEDGE, F_GOOSE, F_LINE, F_COLUMN, F_WAVE, F_COUNT };   // F_WAVE：骑兵波次（《六韬·均兵》）
inline const char* formationName(uint8_t f) {
  static const char* n[] = {"方阵", "数阵", "疏阵", "圆阵", "锥形", "雁行", "横列", "纵队", "波次"};
  return f < F_COUNT ? n[f] : "?";
}
enum Stance : uint8_t { ST_HOLD, ST_MOVE, ST_CHARGE, ST_RETREAT, ST_PRONE, ST_TURN, ST_DISENGAGE };  // 伏盾 = ST_PRONE；ST_TURN = 原地轮转；ST_DISENGAGE = 骑兵脱离（不接战，疾驰回整队点）
enum CavPhase : uint8_t { CP_NONE, CP_CHARGE, CP_MELEE, CP_DISENGAGE, CP_REFORM, CP_PURSUE, CP_SWEEP, CP_SWING, CP_WAVES };
inline const char* cavPhaseName(uint8_t p) { static const char* n[] = {"", "冲击", "接战", "脱离", "整队", "追击", "游射", "回旋", "轮冲"}; return p < 9 ? n[p] : ""; }
enum WavePhase : uint8_t { WP_READY, WP_ATTACK, WP_RETURN };
enum OrderType : uint8_t { O_MOVE, O_HALT, O_CHARGE, O_RETREAT, O_FIRE, O_FORMATION, O_FACE, O_PRONE, O_RISE, O_ATTACK };   // O_ATTACK：步兵行进到敌曲 45 m 再冲（省疲劳）

struct Order {
  OrderType type; float x = 0, y = 0; int arg = -1;   // O_MOVE: arg 0 行进（朝向随行进方向）/ 1 平移（保持朝向横走、倒走）
  float fx = 0, fy = 0;                                // O_MOVE: 到达后转向此方向（0,0 = 不转）
  int execTick = 0;
};

struct Unit {
  int id = 0; uint8_t side = 0; int part = 0;        // 部 id（同部为友邻）
  std::string name;
  uint8_t kind = K_HALBERD; bool elite = false; bool shield = false; bool horseArmor = false;
  uint8_t formation = F_SQUARE; int files = 20;
  float cx = 0, cy = 0, fx = 0, fy = 1;             // 中心、朝向（单位向量）
  float gx = 0, gy = 0;                             // 目标点
  float tfx = 0, tfy = 1;                           // 目标朝向（ST_TURN 用；行进到达后若 faceOnArrive 则转向它）
  bool faceOnArrive = false; bool sidestep = false; // 平移：不转向
  bool freeMove = false;                            // 骑兵自由机动（游射）：面向目标、任意方向全速，不轮转
  float halfWidth = 10.f;                           // 阵形半宽（轮转角速度 = 步速 / 半宽）
  float hx = 10.f, hy = 7.f;                        // 横向 / 纵向半长；thin = 薄横列（纵深 < 6 m），别的曲可穿过它
  float frontY = 0.f;                               // 前排槽位的 y（算排数用）
  uint8_t cavPhase = CP_NONE; float cavTimer = 0;   // 骑兵用法状态机
  int cavTarget = -1; float rallyX = 0, rallyY = 0; int sweepSign = 1; int cycles = 0;
  // 波次（F_WAVE）：nWaves 道冲击波 + 1 道预备队（id = nWaves）。slotY 是波内的局部 y，waveY[w] 是该波当前在本曲坐标里的 y
  int nWaves = 0; std::vector<uint8_t> slotWave; std::vector<float> waveY, waveBase, waveTimer, waveContact;
  std::vector<uint8_t> wavePhase; std::vector<int> waveQueue;   // waveQueue：在列待发的波，前者在前
  float waveLaunchTimer = 0; bool reserveCommitted = false; bool giveUp = false;
  float ammo = 0; bool outOfAmmo = false; int volleyGroup = 0;   // 远程：剩余矢（按人计的齐射数）；弩分两番迭射
  uint8_t rearKind = 255; bool guard = false;                    // 混编时后排兵种；主将麾下
  uint8_t stance = ST_HOLD;
  int fireTarget = -1;                              // 射击目标曲
  float reload = 0;                                 // 齐射计时（秒）
  int volleyLeft = 0, volleyTarget = -1, volleyShots = 0, volleyHits = 0; float volleyRange = 0, volleyMax = 0, volleyHit = 0, volleyDmg = 0;   // 齐射窗口：分 10 个 tick 发完
  std::vector<int32_t> members;                     // 槽位 → 士卒下标
  std::vector<float> slotX, slotY;                  // 槽位局部坐标（x 右，y 前）
  int officer = -1, flag = -1;                      // 军候、旗手（士卒下标）
  bool officerAlive = true, flagAlive = true;
  bool broken = false, brokenNotified = false;
  float cohesion = 1.f, moraleAvg = 70.f;
  int alive = 0, dead = 0, wounded = 0, routed = 0, captured = 0;
  float gapX = 0, gapHW = 0, gapTimer = 0;
  float routX = 0, routY = 0;                       // 本曲溃兵的重心（追击用）
  bool fireDiscipline = false;                      // 弩待敌进入有效射程再射（AI 方默认开；对骑兵仍可远射）
  bool autoWithdraw = false;                        // 弓弩自保：敌步兵近 30 m 且未接战时自动退到本方步兵身后（玩家方弓弩默认开）
  int attackTarget = -1;                            // O_ATTACK 跟踪的敌曲          // 让路：局部 x 处开口（薄横列被友军成阵穿过时）
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
  int alive = 0, dead = 0, wounded = 0, routed = 0, captured = 0, total = 0;
  float gx = 0, gy = 0;             // 主将位置（令由此发）
  bool ai = false;                  // 是否由 AI 指挥
  float aiTimer = 0;
};

struct Soldiers {
  std::vector<float> x, y, vx, vy, morale, fatigue, hp;
  std::vector<uint8_t> state, side, kind, armor, cd, flags, routNear, push;   // routNear: 4 m 内本方溃兵数；push: 0 无 1 推进 2 被推   // flags: bit0 shield, bit1 officer, bit2 flagbearer, bit3 elite, bit4 general, bit5 horseArmor
  std::vector<int32_t> unit, slot, target;
  size_t size() const { return x.size(); }
  void reserve(size_t n) { x.reserve(n); y.reserve(n); vx.reserve(n); vy.reserve(n); morale.reserve(n); fatigue.reserve(n); hp.reserve(n); state.reserve(n); side.reserve(n); kind.reserve(n); armor.reserve(n); cd.reserve(n); flags.reserve(n); routNear.reserve(n); push.reserve(n); unit.reserve(n); slot.reserve(n); target.reserve(n); }
  int add(float px, float py, uint8_t s, uint8_t k, uint8_t a, int u, int sl, float m) {
    x.push_back(px); y.push_back(py); vx.push_back(0); vy.push_back(0); morale.push_back(m); fatigue.push_back(0); hp.push_back(0);
    state.push_back(S_FORMED); side.push_back(s); kind.push_back(k); armor.push_back(a); cd.push_back(0); flags.push_back(0); routNear.push_back(0); push.push_back(0);
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
  Terrain terrain;
  Soldiers s;
  std::vector<Unit> units;
  Side sides[2];
  int tick = 0;
  std::vector<Event> events;
  explicit World(uint32_t seed = 1) : rng(seed) { terrain.init(P.worldW, P.worldH); }
  float time() const { return tick * P.dt; }
  int addUnit(const Unit& u) { units.push_back(u); units.back().id = (int)units.size() - 1; return units.back().id; }
};
