#include "sim.hpp"
#include <cmath>
#include <algorithm>
#include <chrono>
#include <thread>
#include <cstdlib>

static inline float clampf(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }
static inline float len(float x, float y) { return sqrtf(x * x + y * y); }

Sim::Sim(uint32_t seed, int threads) : w(seed) {
  int n = threads > 0 ? threads : (int)std::thread::hardware_concurrency();
  if (n < 1) n = 1; if (n > 32) n = 32;
  pool = std::make_unique<Pool>(n);
}

void Sim::computeBBox() {
  bbox = BBox{};
  for (size_t i = 0; i < w.s.size(); i++) {
    if (w.s.state[i] >= S_WOUNDED) continue;
    bbox.minx = std::min(bbox.minx, w.s.x[i]); bbox.maxx = std::max(bbox.maxx, w.s.x[i]);
    bbox.miny = std::min(bbox.miny, w.s.y[i]); bbox.maxy = std::max(bbox.maxy, w.s.y[i]);
  }
  if (bbox.minx > bbox.maxx) { bbox = {0, 0, 1, 1}; }
}

void Sim::finalize() {
  grid.init(w.P); w.terrain.finalize();
  for (auto& u : w.units) {
    buildSlots(u, w.P);
    int n = (int)u.members.size();
    if (n) {
      int best = 0; float by = 1e9f;
      for (int i = 0; i < n; i++) if (u.slotY[i] < by - 1e-3f || (fabsf(u.slotY[i] - by) < 1e-3f && fabsf(u.slotX[i]) < fabsf(u.slotX[best]))) { by = u.slotY[i]; best = i; }
      u.officer = u.members[best]; w.s.flags[u.officer] |= 2;
      int fl = best + 1 < n ? best + 1 : (best > 0 ? best - 1 : best);
      u.flag = u.members[fl]; w.s.flags[u.flag] |= 4;
    }
    for (int i = 0; i < n; i++) { float wx, wy; slotWorld(u, i, wx, wy); int id = u.members[i]; w.s.x[id] = wx; w.s.y[id] = wy; }
    u.gx = u.cx; u.gy = u.cy;
  }
  for (int sd = 0; sd < 2; sd++) { auto& S = w.sides[sd]; S.total = 0; for (size_t i = 0; i < w.s.size(); i++) if (w.s.side[i] == sd) S.total++; if (S.general >= 0) { S.gx = w.s.x[S.general]; S.gy = w.s.y[S.general]; } }
  size_t n = w.s.size(), U = w.units.size();
  nx = w.s.x; ny = w.s.y; engaged.assign(n, 0);
  int nbS = (int)((n + BLOCK_SOLDIER - 1) / BLOCK_SOLDIER), nbM = (int)((n + BLOCK_MORALE - 1) / BLOCK_MORALE);
  attacksByBlock.resize(nbS); bboxByBlock.resize(nbS); quietByBlock.assign(nbS, 0); routsByBlock.resize(nbM); accByBlock.resize((size_t)nbM * U);
  unitSpeed.resize(U); unitNearEnemy.assign(U, 1e9f); unitNearEnemyId.assign(U, -1); unitFatigue.assign(U, 0);
  computeBBox();
  grid.build(w.s, bbox.minx, bbox.miny, bbox.maxx, bbox.maxy);
  updateUnitsPre();
  pool->parallelBlocks(nbM, [this](int b) { moraleBlock(b); });
  for (auto& v : routsByBlock) v.clear();
  updateUnitsPost();
}

void Sim::issue(int ui, Order o, bool immediate) {
  if (ui < 0 || ui >= (int)w.units.size()) return;
  Unit& u = w.units[ui]; const Params& P = w.P; const Side& S = w.sides[u.side];
  float delay = 0;
  if (!immediate) {
    float d = len(u.cx - S.gx, u.cy - S.gy);
    delay = d < P.flagVisible ? w.rng.range(P.orderDelayMin, P.orderDelayMax) : P.orderDelayBase + d / P.orderDelayRider;
    if (!u.officerAlive) delay *= 2.f;
  }
  o.execTick = w.tick + (int)(delay / P.dt);
  u.orders.push_back(o);
}

void Sim::processOrders() {
  const Params& P = w.P;
  for (auto& u : w.units) {
    while (!u.orders.empty() && u.orders.front().execTick <= w.tick) {
      Order o = u.orders.front(); u.orders.pop_front();
      switch (o.type) {
        case O_MOVE: u.gx = o.x; u.gy = o.y; u.stance = ST_MOVE; u.sidestep = (o.arg == 1); u.cavPhase = CP_NONE; u.cavTarget = -1; u.attackTarget = -1;
          u.faceOnArrive = (o.fx != 0.f || o.fy != 0.f); if (u.faceOnArrive) { float l = len(o.fx, o.fy); u.tfx = o.fx / l; u.tfy = o.fy / l; }
          break;
        case O_HALT: u.stance = ST_HOLD; u.gx = u.cx; u.gy = u.cy; u.cavPhase = CP_NONE; u.cavTarget = -1; u.attackTarget = -1; break;
        case O_CHARGE: u.gx = o.x; u.gy = o.y; u.stance = ST_CHARGE; u.charging = (int)(30.f / P.dt); u.sidestep = false; u.faceOnArrive = false;
          for (int id : u.members) if (w.s.state[id] == S_FORMED) w.s.morale[id] = std::min(100.f, w.s.morale[id] + P.mCharge);
          // 骑兵对指定敌曲：进入冲击循环（冲→接战→脱离→整队→再冲）；弓骑则游射
          u.giveUp = false;
          if (kindIsCav(u.kind) && o.arg >= 0 && o.arg < (int)w.units.size()) { u.cavTarget = o.arg; u.cavPhase = (u.kind == K_CAV_BOW) ? CP_SWEEP : CP_CHARGE; u.cavTimer = 0; u.cycles = 0; }
          else { u.cavPhase = CP_NONE; u.cavTarget = -1; }
          break;
        case O_RETREAT: u.gx = o.x; u.gy = o.y; u.stance = ST_RETREAT; u.cavPhase = CP_NONE; u.cavTarget = -1; u.attackTarget = -1; break;
        case O_FIRE: u.fireTarget = o.arg;
          if (u.kind == K_CAV_BOW && o.arg >= 0 && o.arg < (int)w.units.size()) { u.cavTarget = o.arg; u.cavPhase = CP_SWEEP; u.cavTimer = 0; }
          break;
        case O_FORMATION: u.formation = (uint8_t)o.arg; buildSlots(u, P); break;
        case O_FACE: { float l = len(o.x, o.y); if (l > 1e-4f) { u.tfx = o.x / l; u.tfy = o.y / l; u.stance = ST_TURN; u.gx = u.cx; u.gy = u.cy; u.cavPhase = CP_NONE; u.cavTarget = -1; } } break;
        case O_PRONE: u.stance = ST_PRONE; u.gx = u.cx; u.gy = u.cy; break;
        case O_ATTACK: if (o.arg >= 0 && o.arg < (int)w.units.size()) { u.attackTarget = o.arg; u.stance = ST_MOVE; u.sidestep = false; u.faceOnArrive = false; u.gx = w.units[o.arg].cx; u.gy = w.units[o.arg].cy; u.cavPhase = CP_NONE; u.cavTarget = -1; } break;
        case O_RISE: u.stance = ST_HOLD; break;
      }
    }
  }
}

int Sim::nearestEnemyUnit(int ui, float maxR) const {
  const Unit& u = w.units[ui]; int best = -1; float bd = maxR * maxR;
  for (auto& v : w.units) {
    if (v.side == u.side || v.alive <= 0 || v.stance == ST_PRONE) continue;
    float dx = v.cx - u.cx, dy = v.cy - u.cy, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = v.id; }
  }
  return best;
}

void Sim::startDisengage(Unit& u, float awayX, float awayY) {
  const Params& P = w.P;
  u.rallyX = clampf(u.cx + awayX * P.cavDisengageDist, 5.f, P.worldW - 5.f); u.rallyY = clampf(u.cy + awayY * P.cavDisengageDist, 5.f, P.worldH - 5.f);
  u.cavPhase = CP_DISENGAGE; u.cavTimer = 0; u.stance = ST_DISENGAGE; u.gx = u.rallyX; u.gy = u.rallyY; u.charging = 0;
  if (u.formation == F_WAVE && u.nWaves > 0) resetWaves(u);
}

void Sim::resetWaves(Unit& u) {
  u.waveQueue.clear();
  for (int k = 0; k <= u.nWaves; k++) { u.wavePhase[k] = WP_READY; u.waveTimer[k] = 0; u.waveContact[k] = -1; }
  for (int k = 0; k < u.nWaves; k++) { u.waveQueue.push_back(k); u.waveY[k] = u.waveBase[k]; }
  u.waveY[u.nWaves] = u.waveBase[u.nWaves]; u.reserveCommitted = false; u.waveLaunchTimer = 0;
}

// 波次轮冲（《六韬·均兵》）：首波冲、接战数秒、拨马回旋到队尾，次波接上；预备队待敌阵动摇乘隙突入
// 返回 true 表示本 tick 已处理（不走整曲冲击逻辑）
bool Sim::waveBrain(Unit& u, const Unit& T, float ux, float uy, float d, bool targetBroken, bool exhausted) {
  const Params& P = w.P; auto& s = w.s; int nW = u.nWaves;
  float gapE = d - T.hy - u.waveBase[0];                     // 首波阵线到敌阵前沿
  u.freeMove = true; u.tfx = ux; u.tfy = uy; u.sidestep = false; u.faceOnArrive = false; u.charging = 0;
  float standX = T.cx - ux * (T.hy + u.waveBase[0] + P.waveStandoff), standY = T.cy - uy * (T.hy + u.waveBase[0] + P.waveStandoff);
  bool blocked = (u.stance == ST_HOLD);                        // 上 tick 被友军挡住（行进逻辑把它停下了）
  u.stance = ST_MOVE; u.gx = standX; u.gy = standY;
  if (u.broken) { startDisengage(u, -ux, -uy); return true; }
  if (u.cavPhase == CP_CHARGE) {                              // 接近：整曲疏开推进到二十步外
    if (gapE < P.waveStandoff + 15.f || (blocked && gapE < P.waveStandoff + 80.f)) { u.cavPhase = CP_WAVES; u.cavTimer = 0; log(u.name + "五骑为列，前后相去二十步，次第冲突"); }
    else if (exhausted || u.cavTimer > 90.f) { u.cavPhase = CP_NONE; u.cavTarget = -1; u.freeMove = false; u.stance = ST_HOLD; u.gx = u.cx; u.gy = u.cy; }   // 久近不得：放弃，另择目标
    return true;
  }
  // CP_WAVES
  if (targetBroken) { resetWaves(u); u.cavPhase = CP_PURSUE; u.cavTimer = 0; u.freeMove = false; return false; }
  if (exhausted) { startDisengage(u, -ux, -uy); return true; }
  if (u.cycles >= 3 * nW && T.cohesion > 0.8f && T.routed * 10 < T.alive) {   // 轮冲三遍敌阵不动：撤出，另择目标（不硬耗）
    startDisengage(u, -ux, -uy); u.giveUp = true; log(u.name + "三冲不动，引去"); return true;
  }
  float attackY = u.waveBase[0] + std::max(0.f, gapE) + 10.f;
  u.waveLaunchTimer -= P.dt;
  bool anyAttack = false;
  for (int k = 0; k <= nW; k++) {
    if (u.wavePhase[k] == WP_READY) continue;
    u.waveTimer[k] += P.dt;
    int alive = 0, fight = 0, balk = 0, home = 0;
    for (size_t mi = 0; mi < u.members.size(); mi++) {
      if (u.slotWave[mi] != k) continue; int id = u.members[mi]; if (s.state[id] >= S_WOUNDED || s.state[id] == S_ROUT) continue;
      alive++; if (engaged[id] == 1) fight++; else if (engaged[id] == 2) balk++;
      if (u.wavePhase[k] == WP_RETURN) { float qx, qy; slotWorld(u, (int)mi, qx, qy); float ex = qx - s.x[id], ey = qy - s.y[id]; if (ex * ex + ey * ey < 25.f) home++; }
    }
    if (u.wavePhase[k] == WP_ATTACK) {
      anyAttack = true; u.waveY[k] = attackY;
      if (fight > 0 && u.waveContact[k] < 0) u.waveContact[k] = 0;
      if (u.waveContact[k] >= 0) u.waveContact[k] += P.dt;
      bool done = alive == 0 || u.waveContact[k] > P.cavMeleeSeconds || (balk > alive * 0.3f && u.waveTimer[k] > 3.f) || u.waveTimer[k] > 25.f;
      if (done) {   // 拨马回旋：冲击波回到队尾，预备队回原处
        u.wavePhase[k] = WP_RETURN; u.waveTimer[k] = 0; u.waveContact[k] = -1;
        if (k < nW) u.waveQueue.push_back(k);
      }
    } else if (u.wavePhase[k] == WP_RETURN) {
      if (alive == 0 || home >= alive * P.waveReturnFrac || u.waveTimer[k] > 30.f) { u.wavePhase[k] = WP_READY; u.waveTimer[k] = 0; }
    }
  }
  for (size_t q = 0; q < u.waveQueue.size(); q++) u.waveY[u.waveQueue[q]] = u.waveBase[q];   // 在列各波依次补位
  if (u.wavePhase[nW] != WP_ATTACK) u.waveY[nW] = u.waveBase[nW];
  // 预备队：敌阵动摇（凝聚 < 0.4 或溃者过四分之一）乘隙突入
  if (!u.reserveCommitted && u.wavePhase[nW] == WP_READY && (T.cohesion < 0.4f || T.routed * 4 > T.alive + T.routed)) {
    u.reserveCommitted = true; u.wavePhase[nW] = WP_ATTACK; u.waveTimer[nW] = 0; u.waveContact[nW] = -1;
    for (size_t mi = 0; mi < u.members.size(); mi++) if (u.slotWave[mi] == nW && s.state[u.members[mi]] == S_FORMED) s.morale[u.members[mi]] = std::min(100.f, s.morale[u.members[mi]] + P.mCharge);
    log(u.name + "预备队乘隙突入");
  }
  // 发下一波：上一波已拨马（无冲击波在场）、队首一波已归位、间隔已到
  bool launched = false;
  // 已无人的波退出轮换
  for (size_t q = 0; q < u.waveQueue.size();) { int k = u.waveQueue[q]; bool any = false; for (size_t mi = 0; mi < u.members.size() && !any; mi++) if (u.slotWave[mi] == k) { int id = u.members[mi]; if (s.state[id] == S_FORMED || s.state[id] == S_RALLY) any = true; } if (!any) u.waveQueue.erase(u.waveQueue.begin() + q); else q++; }
  if (!anyAttack && !u.waveQueue.empty() && u.waveLaunchTimer <= 0.f) {
    int k = u.waveQueue.front();
    if (u.wavePhase[k] == WP_READY) {
      u.waveQueue.erase(u.waveQueue.begin()); u.wavePhase[k] = WP_ATTACK; u.waveTimer[k] = 0; u.waveContact[k] = -1; u.waveY[k] = attackY;
      u.waveLaunchTimer = P.waveLaunchGap; u.cycles++; launched = true;
      for (size_t mi = 0; mi < u.members.size(); mi++) if (u.slotWave[mi] == k && s.state[u.members[mi]] == S_FORMED) s.morale[u.members[mi]] = std::min(100.f, s.morale[u.members[mi]] + P.mCharge * 0.5f);
    }
  }
  (void)launched;
  return true;
}

// 骑兵用法状态机（无镫时代：一冲即走，整队再冲；骑射横掠游射）
void Sim::cavalryBrain(Unit& u) {
  const Params& P = w.P;
  if (u.cavPhase == CP_NONE) { u.freeMove = false; return; }
  bool waves = (u.formation == F_WAVE && u.nWaves > 0);
  if (u.cavPhase != CP_SWEEP && u.cavPhase != CP_SWING && !(waves && (u.cavPhase == CP_CHARGE || u.cavPhase == CP_WAVES))) u.freeMove = false;
  if (u.cavTarget < 0 || u.cavTarget >= (int)w.units.size()) { u.cavPhase = CP_NONE; u.cavTarget = -1; return; }
  const Unit& T = w.units[u.cavTarget];
  if (T.alive + T.routed == 0) { u.cavPhase = CP_NONE; u.cavTarget = -1; u.stance = ST_HOLD; u.gx = u.cx; u.gy = u.cy; return; }
  bool targetBroken = T.broken || T.alive < T.routed;
  float dx = T.cx - u.cx, dy = T.cy - u.cy, d = len(dx, dy); float ux = d > 1e-3f ? dx / d : u.fx, uy = d > 1e-3f ? dy / d : u.fy;
  u.cavTimer += P.dt;
  bool engagedNow = w.tick - u.lastEngagedTick < 5;
  bool exhausted = unitFatigue[u.id] > 85.f || u.alive < 20 || u.moraleAvg < 35.f;
  auto keepCharging = [&] { u.stance = ST_CHARGE; u.charging = std::max(u.charging, 10); u.gx = T.cx; u.gy = T.cy; u.sidestep = false; u.faceOnArrive = false; };
  if (waves && (u.cavPhase == CP_CHARGE || u.cavPhase == CP_WAVES || u.cavPhase == CP_MELEE)) {
    if (u.cavPhase == CP_MELEE) u.cavPhase = CP_WAVES;
    if (waveBrain(u, T, ux, uy, d, targetBroken, exhausted)) return;
  }
  switch (u.cavPhase) {
    case CP_CHARGE:
      keepCharging();
      if (targetBroken) { u.cavPhase = CP_PURSUE; u.cavTimer = 0; }
      else if (engagedNow) { u.cavPhase = CP_MELEE; u.cavTimer = 0; u.cycles++; }
      else if (exhausted) startDisengage(u, -ux, -uy);
      break;
    case CP_MELEE:
      keepCharging();
      if (targetBroken) { u.cavPhase = CP_PURSUE; u.cavTimer = 0; }
      else if (u.cavTimer > P.cavMeleeSeconds || u.balkTicks > 20 || exhausted) startDisengage(u, -ux, -uy);
      break;
    case CP_DISENGAGE:
      u.stance = ST_DISENGAGE; u.gx = u.rallyX; u.gy = u.rallyY;
      if (len(u.rallyX - u.cx, u.rallyY - u.cy) < 5.f || u.cavTimer > 40.f) { u.cavPhase = CP_REFORM; u.cavTimer = 0; u.stance = ST_TURN; u.tfx = ux; u.tfy = uy; u.gx = u.cx; u.gy = u.cy; }
      break;
    case CP_REFORM: {
      if (u.stance != ST_TURN) u.stance = ST_HOLD;
      bool ready = u.cohesion > P.cavReformCohesion && unitFatigue[u.id] < 60.f && !engagedNow && u.stance == ST_HOLD;
      if (engagedNow && u.cavTimer > 3.f) startDisengage(u, -ux, -uy);     // 整队时被追上：再退
      else if (ready || u.cavTimer > P.cavReformMaxSeconds) {
        if (exhausted || u.giveUp) { u.cavPhase = CP_NONE; u.cavTarget = -1; u.giveUp = false; }
        else { u.cavPhase = targetBroken ? CP_PURSUE : CP_CHARGE; u.cavTimer = 0; for (int id : u.members) if (w.s.state[id] == S_FORMED) w.s.morale[id] = std::min(100.f, w.s.morale[id] + P.mCharge * 0.5f); }
      }
      break; }
    case CP_PURSUE:
      keepCharging(); u.gx = T.routed > 0 ? T.routX : T.cx; u.gy = T.routed > 0 ? T.routY : T.cy;   // 追的是跑着的人，不是空了的阵位
      if (u.cavTimer > P.cavPursueSeconds || exhausted || !targetBroken) startDisengage(u, -ux, -uy);
      break;
    case CP_SWEEP: case CP_SWING: {
      if (u.outOfAmmo) { u.cavPhase = CP_NONE; u.cavTarget = -1; u.freeMove = false; startDisengage(u, -ux, -uy); u.giveUp = true; break; }
      // 骑射：沿敌正面横掠（距 standoff），掠到头甩开 swingOut 再反向掠回；敌近则立即甩开
      float rx = T.fy, ry = -T.fx;                     // 敌阵右侧方向
      float lcx = T.cx + T.fx * (P.haStandoff + T.hy), lcy = T.cy + T.fy * (P.haStandoff + T.hy);
      float ext = T.hx + 30.f;
      float ex = lcx + rx * ext * u.sweepSign, ey = lcy + ry * ext * u.sweepSign;        // 本次横掠终点
      float sx = ex + T.fx * P.haSwingOut, sy = ey + T.fy * P.haSwingOut;                // 甩开点
      u.fireTarget = u.cavTarget; u.sidestep = false; u.faceOnArrive = false; u.freeMove = true; u.tfx = ux; u.tfy = uy;
      float nearEnemy = unitNearEnemy[u.id] - (unitNearEnemyId[u.id] >= 0 ? w.units[unitNearEnemyId[u.id]].halfWidth : 0.f);
      if (u.cavPhase == CP_SWEEP) {
        u.stance = ST_MOVE; u.charging = 0; u.gx = ex; u.gy = ey;
        if (len(ex - u.cx, ey - u.cy) < 8.f || nearEnemy < P.haFleeDist || engagedNow) { u.cavPhase = CP_SWING; u.cavTimer = 0; }
      } else {
        u.stance = ST_MOVE; u.charging = 0; u.gx = sx; u.gy = sy;
        if (len(sx - u.cx, sy - u.cy) < 8.f || u.cavTimer > 30.f) { u.sweepSign = -u.sweepSign; u.cavPhase = CP_SWEEP; u.cavTimer = 0; u.cycles++; }
      }
      if (exhausted && u.cavPhase == CP_SWING) { u.cavPhase = CP_NONE; u.cavTarget = -1; u.stance = ST_HOLD; u.gx = u.cx; u.gy = u.cy; u.freeMove = false; }
      break; }
    default: break;
  }
}

void Sim::updateUnitsPre() {
  const Params& P = w.P;
  // 曲级缓存：最近敌曲、速度表
  for (auto& u : w.units) {
    int e = nearestEnemyUnit(u.id, 1e9f);
    unitNearEnemyId[u.id] = e; unitNearEnemy[u.id] = e >= 0 ? len(w.units[e].cx - u.cx, w.units[e].cy - u.cy) : 1e9f;
    bool cav = kindIsCav(u.kind); UnitSpeed& us = unitSpeed[u.id];
    us.walk = cav ? P.walkHorse : P.walkFoot; us.rout = cav ? P.routHorse : P.routFoot;
    us.run = cav ? P.chargeHorse : P.runFoot;
  }
  // 让路：薄横列被本方成阵（厚阵，行进中）穿过时，在其路径处开口
  for (auto& v : w.units) {
    if (v.alive == 0 || v.hy >= 6.f) continue;
    for (auto& u : w.units) {
      if (u.id == v.id || u.side != v.side || u.alive == 0 || u.hy < 6.f) continue;
      if (!(u.stance == ST_MOVE || u.stance == ST_CHARGE || u.stance == ST_DISENGAGE || u.stance == ST_RETREAT)) continue;
      float dx = u.cx - v.cx, dy = u.cy - v.cy;
      float lx = dx * v.fy - dy * v.fx, ly = dx * v.fx + dy * v.fy;   // u 在 v 局部系：lx 沿横列，ly 向前
      float reach = u.halfWidth + v.hy + 25.f;
      if (fabsf(ly) < reach && fabsf(lx) < v.hx + u.hx) { v.gapX = lx; v.gapHW = u.hx + P.gapMargin; v.gapTimer = P.gapSeconds; }
    }
  }
  for (auto& u : w.units) {
    if (u.alive == 0) continue;
    // O_ATTACK：跟踪敌曲行进，到 45 m 转冲锋
    if (u.attackTarget >= 0) {
      const Unit& T = w.units[u.attackTarget];
      if (T.alive + T.routed == 0) { u.attackTarget = -1; u.stance = ST_HOLD; u.gx = u.cx; u.gy = u.cy; }
      else if (u.stance == ST_MOVE) { u.gx = T.cx; u.gy = T.cy; if (len(T.cx - u.cx, T.cy - u.cy) < P.attackChargeDist) { u.stance = ST_CHARGE; u.charging = (int)(30.f / P.dt); for (int id : u.members) if (w.s.state[id] == S_FORMED) w.s.morale[id] = std::min(100.f, w.s.morale[id] + P.mCharge); u.attackTarget = -1; } }
      else if (u.stance == ST_HOLD) u.attackTarget = -1;
    }
    // 弓弩自保：敌步兵近而未接战 → 平移退到最近本方步兵曲身后，退不了就直退
    if ((u.autoWithdraw || u.outOfAmmo) && kindIsMissile(u.kind) && !kindIsCav(u.kind) && w.tick % 10 == u.id % 10 && w.tick - u.lastEngagedTick > 30 && u.stance != ST_PRONE) {
      int e = unitNearEnemyId[u.id];
      if (e >= 0 && ((u.outOfAmmo && unitNearEnemy[u.id] < 400.f && u.stance == ST_HOLD) || (!kindIsCav(w.units[e].kind) && unitNearEnemy[u.id] - w.units[e].hy - u.hy < P.withdrawDist))) {
        const Unit& E = w.units[e]; float ax = u.cx - E.cx, ay = u.cy - E.cy, al = len(ax, ay); if (al < 1e-3f) { ax = -u.fx; ay = -u.fy; al = 1; } ax /= al; ay /= al;
        int g = -1; float gd = 150.f; for (auto& v : w.units) { if (v.side != u.side || v.id == u.id || kindIsMissile(v.kind) || kindIsCav(v.kind) || v.alive < 50) continue; float dd = len(v.cx - u.cx, v.cy - u.cy); if (dd < gd && (v.cx - u.cx) * ax + (v.cy - u.cy) * ay > 0) { gd = dd; g = v.id; } }
        Order o{O_MOVE, 0, 0, 1};
        if (g >= 0) { const Unit& G = w.units[g]; o.x = G.cx + ax * (G.hy + u.hy + 8.f); o.y = G.cy + ay * (G.hy + u.hy + 8.f); } else { o.x = u.cx + ax * 60.f; o.y = u.cy + ay * 60.f; }
        if (!(u.stance == ST_MOVE && len(u.gx - o.x, u.gy - o.y) < 10.f)) issue(u.id, o, true);
      }
    }
    if (kindIsCav(u.kind)) cavalryBrain(u);
    bool engagedRecently = w.tick - u.lastEngagedTick < 10;
    const Params::FormMod& fm = P.form[u.formation];
    float spd = ((u.stance == ST_CHARGE || u.stance == ST_DISENGAGE || u.freeMove) ? unitSpeed[u.id].run : unitSpeed[u.id].walk) * (1.f - unitFatigue[u.id] / 200.f) * P.unitSpeedMul * fm.speed;
    { uint8_t tt = w.terrain.typeAt(u.cx, u.cy); spd *= Terrain::speedMul(tt == T_WATER ? T_FORD : tt); }
    if (u.charging > 0) u.charging--;
    // 轮转：角速度受外翼步速限制（宽阵转得慢但整齐）；冲锋时放宽一倍
    auto turnToward = [&](float tx, float ty, float rateMul) -> float {
      float cur = atan2f(u.fy, u.fx), tgt = atan2f(ty, tx), diff = tgt - cur;
      while (diff > 3.14159f) diff -= 6.28318f; while (diff < -3.14159f) diff += 6.28318f;
      float omega = std::min(1.5708f, 0.8f * unitSpeed[u.id].walk * rateMul * fm.turn / std::max(u.halfWidth, 4.f));   // rad/s，上限 90°/s；0.8 留给士卒追槽位的余量
      float maxT = omega * P.dt; float stepA = clampf(diff, -maxT, maxT);
      cur += stepA; u.fx = cosf(cur); u.fy = sinf(cur);
      return fabsf(diff);
    };
    if (u.stance == ST_TURN) {
      if (turnToward(u.tfx, u.tfy, 1.f) < 0.02f) { u.fx = u.tfx; u.fy = u.tfy; u.stance = ST_HOLD; }
    } else if (u.stance == ST_MOVE || u.stance == ST_CHARGE || u.stance == ST_RETREAT || u.stance == ST_DISENGAGE) {
      float dx = u.gx - u.cx, dy = u.gy - u.cy, d = len(dx, dy);
      if (d < 1.f) { if (u.faceOnArrive) { u.stance = ST_TURN; u.faceOnArrive = false; } else u.stance = ST_HOLD; }
      else if (!(engagedRecently && u.stance != ST_CHARGE && u.stance != ST_DISENGAGE)) {
        float tx = dx / d, ty = dy / d; float remaining = 0.f; float mul = 1.f;
        // 短距离侧向 / 后向调整自动平移（不为几十米转两次向）
        bool shortLateral = (u.stance == ST_MOVE && !u.sidestep && d < std::max(20.f, 1.5f * u.halfWidth) && (tx * u.fx + ty * u.fy) < 0.7f);
        // 友军避让：把其他友军曲当圆形障碍，偏转行进方向（不绕敌军：敌军是目标）
        if (u.stance == ST_MOVE) {
          float ax = 0, ay = 0;
          auto radius = [](const Unit& q) { return q.hy < 6.f ? q.hy + 2.f : sqrtf(q.hx * q.hx + q.hy * q.hy); };   // 薄横列按纵深算，厚阵按对角
          for (auto& v : w.units) {
            if (v.id == u.id || v.side != u.side || v.alive == 0 || v.hy < 6.f) continue;   // 薄横列可穿过
            float vx = v.cx - u.cx, vy = v.cy - u.cy, vd = len(vx, vy); float R = radius(u) + radius(v) + 4.f;
            if (vd > R + 30.f || vd < 1e-3f) continue;
            float ahead = (vx * tx + vy * ty) / vd; if (ahead < 0.2f) continue;          // 只避让前方的
            float side = vx * ty - vy * tx;                                               // >0 在右侧
            float wgt = (R + 30.f - vd) / 30.f; wgt = std::min(1.5f, wgt) * ahead;
            float px_ = -ty, py_ = tx; if (side < 0) { px_ = -px_; py_ = -py_; }          // 障碍在右(side>0)则向左偏，在左则向右偏
            ax += px_ * wgt; ay += py_ * wgt;
            if (vd < R && d < R) { d = 0; }                                               // 目标点就在友军里：停下
          }
          if (d > 0 && (ax != 0 || ay != 0)) { tx += ax; ty += ay; float l = len(tx, ty); tx /= l; ty /= l; }
        }
        // 河：前方 30 m 内有水则沿岸走向最近渡口
        if (d > 0) {
          const Terrain& T = w.terrain; bool waterAhead = false;
          for (float la = 10.f; la <= 30.f; la += 10.f) if (T.blocked(u.cx + tx * la, u.cy + ty * la)) { waterAhead = true; break; }
          if (waterAhead && !T.blocked(u.gx, u.gy)) {
            float bx = 0, by = 0, bd = 1e9f; for (auto& f : T.fords) { float dd = len(f.first - u.cx, f.second - u.cy); if (dd < bd) { bd = dd; bx = f.first; by = f.second; } }
            if (bd < 1e9f && bd > 12.f) { float fx_ = bx - u.cx, fy_ = by - u.cy, fl = len(fx_, fy_); tx = fx_ / fl; ty = fy_ / fl; }   // 先去渡口
            else if (bd >= 1e9f) d = 0;   // 没有渡口：停
          }
        }
        if (d <= 0) { u.stance = ST_HOLD; u.gx = u.cx; u.gy = u.cy; }
        else if (u.stance == ST_DISENGAGE) { mul = 1.f; }                                   // 各骑自行拨马，整体直接退走，不轮转
        else if (u.freeMove) { turnToward(u.tfx, u.tfy, 6.f); mul = 1.f; }                   // 游射：面向目标，任意方向全速
        else if (u.stance == ST_RETREAT || (u.stance == ST_MOVE && (u.sidestep || shortLateral))) {
          // 保持朝向：倒走 0.8，横走 0.6
          float cosA = tx * u.fx + ty * u.fy; mul = cosA < -0.5f ? 0.8f : (cosA > 0.5f ? 1.f : 0.6f);
        } else {
          remaining = turnToward(tx, ty, (u.stance == ST_CHARGE || u.stance == ST_DISENGAGE) ? 2.f : 1.f);
          mul = (remaining > 0.5f && w.terrain.typeAt(u.cx, u.cy) != T_FORD) ? 0.5f : 1.f;   // 大角度轮转时中心减速，外翼才跟得上（渡口上不减：半济之际不恋阵）
        }
        if (d > 0) {
          float stepL = std::min(d, spd * mul * P.dt);
          // 中心也不入水：直走被挡则依次试 ±30°、±60°、±90°、±120°
          const Terrain& T = w.terrain; float mx = tx, my = ty;
          bool cavU = kindIsCav(u.kind);
          auto clear = [&](float rx_, float ry_) { return !T.blockedFor(u.cx + rx_ * 3.f, u.cy + ry_ * 3.f, cavU) && !T.blockedFor(u.cx + rx_ * 8.f, u.cy + ry_ * 8.f, cavU) && !T.blockedFor(u.cx + rx_ * 15.f, u.cy + ry_ * 15.f, cavU); };
          bool ok = clear(tx, ty);
          for (int k = 1; k <= 5 && !ok; k++) for (int sg = -1; sg <= 1 && !ok; sg += 2) { float ang = sg * k * 0.5236f, c = cosf(ang), sn = sinf(ang); float rx_ = tx * c - ty * sn, ry_ = tx * sn + ty * c; if (clear(rx_, ry_)) { mx = rx_; my = ry_; ok = true; } }
          if (!ok) { ok = !T.blockedFor(u.cx + tx * 3.f, u.cy + ty * 3.f, cavU); }   // 实在没有：只要眼前 3 m 不是水就走
          if (ok) { u.cx += mx * stepL; u.cy += my * stepL; }
        }
      }
    }
    // 伏盾：敌至三十米同时俱起
    if (u.stance == ST_PRONE) {
      int e = -1; float bestD = 1e9f;
      // 沿阵线每 20 m 采样一点，看 35 m 内有无敌人（宽横列不能只看中心）
      float rx = u.fy, ry = -u.fx; int nS = std::max(1, (int)(u.hx / 20.f));
      for (int k = -nS; k <= nS; k++) {
        float qx = u.cx + rx * (k * 20.f), qy = u.cy + ry * (k * 20.f);
        grid.forNear(qx, qy, 36.f, [&](const Packed& p) { if (p.side == u.side) return; float dx = p.x - qx, dy = p.y - qy, d = dx * dx + dy * dy; if (d < bestD) { bestD = d; e = p.unit; } });
      }
      if (e >= 0 && sqrtf(bestD) < 35.f) {
        const Unit& eu = w.units[e];
        u.stance = ST_CHARGE; u.charging = (int)(30.f / P.dt); u.gx = eu.cx; u.gy = eu.cy;
        for (int id : u.members) if (w.s.state[id] == S_FORMED) w.s.morale[id] = std::min(100.f, w.s.morale[id] + P.mCharge);
        for (auto& v : w.units) if (v.side == u.side && v.part == u.part && kindIsMissile(v.kind)) v.reload = 0;   // 强弩雷发
        log(u.name + "伏盾下不动，敌至数十步，同时俱起，扬尘大叫，直前冲突");
      }
    }
  }
}

// —— 士卒阶段：按网格顺序一块 BLOCK_SOLDIER 人 ——
void Sim::soldierBlock(int block) {
  const Params& P = w.P; auto& s = w.s; auto& buf = attacksByBlock[block]; buf.clear();
  const float dt = P.dt;
  BBox bb;
  int kb = block * BLOCK_SOLDIER, ke = std::min((int)grid.order.size(), kb + BLOCK_SOLDIER);
  const float balkCos = cosf(P.cavBalkFacing * 3.14159f / 180.f);
  for (int k = kb; k < ke; k++) {
    int i = grid.order[k];
    uint8_t st = s.state[i];
    const Unit& u = w.units[s.unit[i]];
    float px = s.x[i], py = s.y[i];
    uint8_t k_ = s.kind[i]; bool cav = kindIsCav(k_);
    float reach = k_ == K_HALBERD ? P.reachHalberd : k_ == K_SPEAR ? P.reachSpear : (k_ == K_CAV || k_ == K_CAV_ARMORED) ? P.reachLance : cav ? P.reachCavSword : P.reachSword;
    bool chargingU = (u.stance == ST_CHARGE || u.charging > 0);
    bool disengaging = (u.stance == ST_DISENGAGE); bool freeMoveU = u.freeMove;
    bool waveAttack = false;
    if (u.cavPhase == CP_WAVES && !u.slotWave.empty()) {   // 波次轮冲：各波各行其是
      uint8_t wph = u.wavePhase[u.slotWave[s.slot[i]]];
      waveAttack = (wph == WP_ATTACK); chargingU = waveAttack; disengaging = (wph == WP_RETURN);
    }
    float searchR = chargingU ? 8.f : 4.f;
    float sepx = 0, sepy = 0; const Packed* nearest = nullptr; float nd = 1e9f;
    float fleex = 0, fleey = 0; int enemyNear = 0, friend3 = 0, enemy3 = 0, routNear = 0;
    uint8_t mySide = s.side[i];
    const float sepR2 = P.sepRadius * P.sepRadius;
    // 无事者快路径：3×3 格内无敌、无本方溃兵，且本曲不乱 → 不扫邻居（只追槽位，省掉分离力；4 m 搜索半径下 3×3 格已覆盖）
    int cellI = grid.cellOf[i];
    bool needScan = chargingU || st != S_FORMED || u.cohesion <= 0.5f || cellI < 0 || grid.sum3(grid.sideCount[1 - mySide], cellI) != 0 || grid.sum3(grid.routCount[mySide], cellI) != 0;
    if (!needScan) quietByBlock[block]++;
    if (needScan)
    grid.forNear(px, py, searchR, [&](const Packed& p) {
      if (p.idx == i) return;
      float dx = p.x - px, dy = p.y - py, d2 = dx * dx + dy * dy;
      if (p.side != mySide) {
        if (d2 < nd) { nd = d2; nearest = &p; }
        if (d2 < 625.f) { enemyNear++; float inv = 1.f / (d2 + 1.f); fleex -= dx * inv; fleey -= dy * inv; }
        if (d2 < 9.f && p.state != S_ROUT) enemy3++;
      } else {
        if (d2 < 9.f && p.state == S_FORMED) friend3++;
        if (d2 < 16.f && p.state == S_ROUT) routNear++;
      }
      if (d2 < sepR2 && d2 > 1e-6f) { float d = sqrtf(d2); float f = (P.sepRadius - d) / P.sepRadius; sepx -= dx / d * f; sepy -= dy / d * f; }
    });
    s.routNear[i] = (uint8_t)std::min(routNear, 255); s.push[i] = 0;
    float ndist = nearest ? sqrtf(nd) : 1e9f;
    const UnitSpeed& us = unitSpeed[s.unit[i]];
    const Terrain& T = w.terrain; bool flatT = T.flatAt(px, py); uint8_t tt = flatT ? (uint8_t)T_OPEN : T.typeAt(px, py);
    float spd = (st == S_ROUT ? us.rout : (chargingU || disengaging || freeMoveU) ? (cav ? us.run : (s.armor[i] >= 2 ? P.runFootArmored : P.runFoot)) : us.walk) * (1.f - s.fatigue[i] / 200.f) * Terrain::speedMul(tt == T_WATER ? T_FORD : tt);
    float vx = 0, vy = 0; bool fighting = false;

    if (st == S_ROUT) {
      if (enemyNear) { float l = len(fleex, fleey); if (l > 1e-6f) { vx = fleex / l * spd; vy = fleey / l * spd; } }
      else {
        // 远离最近的敌曲；没有敌曲则向本方主将方向
        int e = unitNearEnemyId[s.unit[i]]; const Side& S = w.sides[mySide];
        float ex = 0, ey = 0; if (e >= 0) { ex = px - w.units[e].cx; ey = py - w.units[e].cy; }
        float el = len(ex, ey); float dx = S.gx - px, dy = S.gy - py, l = len(dx, dy);
        if (el > 1e-3f) { vx = ex / el * spd; vy = ey / el * spd; } else if (l > 1e-3f) { vx = dx / l * spd; vy = dy / l * spd; }
      }
      s.fatigue[i] = std::min(P.fatigueMax, s.fatigue[i] + P.fatigueRun);
    } else {
      bool balk = false;
      if (cav && nearest && ndist < P.cavBalkDist + 1.5f) {
        const Unit& eu = w.units[nearest->unit];
        bool wall = (kindIsLong(eu.kind) && eu.cohesion > P.form[eu.formation].balkCoh) || (eu.shield && eu.cohesion > 0.8f);   // 长兵阵，或稳固的盾墙
        if (wall && nearest->state == S_FORMED) {
          float ax = px - nearest->x, ay = py - nearest->y, al = len(ax, ay);
          float cosA = al > 1e-4f ? (ax * eu.fx + ay * eu.fy) / al : 1.f;
          if (cosA > balkCos) balk = true;
        }
      }
      if (nearest && ndist <= reach && u.stance != ST_PRONE && !disengaging) {
        fighting = true; engaged[i] = 1;
        if (s.cd[i] > 0) s.cd[i]--;
        else {
          float cdS = k_ == K_HALBERD ? P.cdHalberd : k_ == K_SPEAR ? P.cdSpear : (k_ == K_CAV || k_ == K_CAV_ARMORED) ? P.cdLance : P.cdSword;
          s.cd[i] = (uint8_t)(cdS / dt);
          bool impact = cav && (u.charging > 0 || waveAttack) && (len(s.vx[i], s.vy[i]) > 4.f) && !balk;
          uint8_t type = (k_ == K_SWORD || kindIsMissile(k_)) ? 1 : 0;
          buf.push_back({i, nearest->idx, type, impact});
        }
        s.fatigue[i] = std::min(P.fatigueMax, s.fatigue[i] + P.fatigueFight);
        s.morale[i] -= P.fightMorale;                                   // 久战生畏
        if (balk) { if (s.morale[i] > P.cavBalkFloor) s.morale[i] -= P.cavBalkMorale; engaged[i] = 2; }
        else if (!cav) {
          // 推挤：3 m 内人多的一方把人少的一方推开（纵深在此起作用）
          float ex = nearest->x - px, ey = nearest->y - py, el = len(ex, ey);
          const Unit& eu2 = w.units[nearest->unit];
          float score = (friend3 + 1.f) / (enemy3 + 1.f) * (u.hy / std::max(eu2.hy, 1.f));   // 局部人数比 × 纵深比
          if (el > 1e-3f) {
            if (score > P.pushRatio) { vx += ex / el * P.pushSpeed; vy += ey / el * P.pushSpeed; s.push[i] = 1; }
            else if (score < 1.f / P.pushRatio) { vx -= ex / el * P.pushSpeed; vy -= ey / el * P.pushSpeed; s.push[i] = 2; }
          }
        }
      } else {
        float tx, ty;
        bool chase = chargingU && !disengaging && k_ != K_CAV_BOW && nearest && ndist < 8.f && !balk;
        if (chase) { tx = nearest->x; ty = nearest->y; }
        else { slotWorld(u, s.slot[i], tx, ty); }
        float dx = tx - px, dy = ty - py, d = len(dx, dy);
        if (balk) { d = 0; engaged[i] = 2; if (s.morale[i] > P.cavBalkFloor) s.morale[i] -= P.cavBalkMorale; }
        if (d > 0.05f) {
          float want = std::min(spd, d * P.slotSpring);
          vx = dx / d * want; vy = dy / d * want;
          float walkRef = cav ? P.walkHorse : P.walkFoot;
          if (want > walkRef * 1.1f) s.fatigue[i] = std::min(P.fatigueMax, s.fatigue[i] + (cav ? P.cavFatigueCharge : P.fatigueRun) * 0.5f);
          else s.fatigue[i] = std::max(0.f, s.fatigue[i] - P.fatigueRest * 0.3f);
        } else {
          s.fatigue[i] = std::max(0.f, s.fatigue[i] - P.fatigueRest);
          if (st == S_RALLY) s.state[i] = S_FORMED;
        }
        if (st == S_RALLY && d < P.slotTol) s.state[i] = S_FORMED;
      }
      if (fighting) s.fatigue[i] = std::min(P.fatigueMax, s.fatigue[i] + P.fatigueFight);
    }
    vx += sepx * P.sepForce; vy += sepy * P.sepForce;
    float vl = len(vx, vy); float cap = st == S_ROUT ? spd : std::max(spd * Terrain::speedMul(tt == T_WATER ? T_FORD : tt), 1.5f * Terrain::speedMul(tt == T_WATER ? T_FORD : tt));
    if (vl > cap) { vx *= cap / vl; vy *= cap / vl; }
    // 上坡减速（平坦旷野跳过）
    if (!flatT && vl > 1e-3f) { float sl = T.slope(px, py, vx / vl, vy / vl); if (sl > 0.f) { float m = std::max(0.4f, 1.f - sl * P.slopeSpeed); vx *= m; vy *= m; } }
    s.vx[i] = vx; s.vy[i] = vy;
    float qx = clampf(px + vx * dt, 1.f, P.worldW - 1.f), qy = clampf(py + vy * dt, 1.f, P.worldH - 1.f);
    if (!flatT && T.blockedFor(qx, qy, cav) && !T.blockedFor(px, py, cav)) { qx = px; qy = py; s.vx[i] = s.vy[i] = 0; }   // 水不可入、马不越车营（已在里面的往外走）
    nx[i] = qx; ny[i] = qy;
    bb.minx = std::min(bb.minx, qx); bb.maxx = std::max(bb.maxx, qx); bb.miny = std::min(bb.miny, qy); bb.maxy = std::max(bb.maxy, qy);
    if (st != S_ROUT) {
      if (u.cavThreat && s.morale[i] > P.mCavNearFloor) s.morale[i] -= P.mCavNear;
      float cap2 = 100.f - s.fatigue[i] * P.mFatigueCap; if (s.morale[i] > cap2) s.morale[i] = cap2;
      if (!fighting && u.officerAlive && u.flagAlive && !u.broken && s.morale[i] < P.mRecoverCap) {
        float ox = s.x[u.officer] - px, oy = s.y[u.officer] - py;
        if (ox * ox + oy * oy < P.officerRadius * P.officerRadius) s.morale[i] += P.mRecover;
      }
    }
  }
  bboxByBlock[block] = bb;
}

void Sim::squadHit(int i, float amount, float floorM) {
  const Unit& u = w.units[w.s.unit[i]]; int sl = w.s.slot[i]; int b = (sl / 5) * 5, e = std::min((int)u.members.size(), b + 5);
  for (int k = b; k < e; k++) { int j = u.members[k]; if (j == i || w.s.state[j] >= S_WOUNDED) continue; float& m = w.s.morale[j]; if (m > floorM) m = std::max(floorM, m - amount); }
}

void Sim::applyDown(int i, int by, bool missile) {
  auto& s = w.s; const Params& P = w.P; Unit& u = w.units[s.unit[i]];
  bool wasRout = s.state[i] == S_ROUT;
  bool captured = wasRout && !missile && w.rng.uni() < P.captureProb;   // 溃兵被追上：多数就擒
  bool dead = !captured && w.rng.uni() < P.deadRatio;
  s.state[i] = captured ? S_CAPTURED : (dead ? S_DEAD : S_WOUNDED); s.vx[i] = s.vy[i] = 0;
  nx[i] = s.x[i]; ny[i] = s.y[i];                 // 两套位置数组从此一致
  int c = grid.cellOf[i]; if (c >= 0) grid.deaths[s.side[i]][c]++;
  squadHit(i, P.mDeathSquad);
  if (captured) { u.captured++; w.sides[s.side[i]].captured++; } else if (dead) { u.dead++; w.sides[s.side[i]].dead++; } else { u.wounded++; w.sides[s.side[i]].wounded++; }
  if (by >= 0) kills[s.side[by]]++;
  if (i == u.officer && u.officerAlive) { u.officerAlive = false; for (int j : u.members) if (s.state[j] < S_WOUNDED) s.morale[j] -= P.mOfficerDown; log(u.name + "军候" + (dead ? "阵殁" : "被创")); }
  if (i == u.flag && u.flagAlive) { u.flagAlive = false; for (int j : u.members) if (s.state[j] < S_WOUNDED) s.morale[j] -= P.mFlagDown; log(u.name + "旗倒"); }
  if (s.flags[i] & 16) { Side& S = w.sides[s.side[i]]; if (!S.generalDown) { S.generalDown = true; for (size_t j = 0; j < s.size(); j++) if (s.side[j] == s.side[i] && s.state[j] < S_WOUNDED) s.morale[j] -= P.mGeneralDown; log(S.name + "主将" + (dead ? "战殁" : "被创") + "，三军夺气"); } }
  (void)missile;
}

void Sim::resolveAttacks() {
  // 同时结算：第一遍按本 tick 开始时的状态掷命中、算伤害（不改状态），第二遍统一施加。
  // 谁先谁后不再有先手优势；WANREN_ATTACK_ORDER=index / block 可切回顺序结算做对照实验。
  const Params& P = w.P; auto& s = w.s;
  static int mode = -1; if (mode < 0) { const char* e = getenv("WANREN_ATTACK_ORDER"); mode = !e ? 0 : std::string(e) == "index" ? 1 : std::string(e) == "block" ? 2 : 0; }
  static std::vector<Attack> all; all.clear();
  for (auto& buf : attacksByBlock) { all.insert(all.end(), buf.begin(), buf.end()); buf.clear(); }
  if (mode == 1) std::stable_sort(all.begin(), all.end(), [](const Attack& x, const Attack& y) { return x.a < y.a; });
  static std::vector<float> dmgOf; dmgOf.assign(all.size(), 0.f);
  auto roll = [&](size_t k) -> float {
    const Attack& A = all[k]; int a = A.a, t = A.t;
    if (s.state[t] >= S_WOUNDED || s.state[a] >= S_WOUNDED) return 0.f;
    const Unit& ua = w.units[s.unit[a]]; const Unit& ut = w.units[s.unit[t]];
    float ax = s.x[a] - s.x[t], ay = s.y[a] - s.y[t], al = len(ax, ay);
    float cosA = al > 1e-4f ? (ax * ut.fx + ay * ut.fy) / al : 1.f;
    float facing = cosA < -0.5f ? P.hitRear : (cosA < 0.5f ? P.hitFlank : 1.f);
    bool front = cosA >= 0.5f;
    if (P.form[ut.formation].allRound) { facing = 1.f; front = true; }   // 圆阵：无侧背
    float hit = P.skillBase * (1.f - s.fatigue[a] * P.hitFatigue) * facing;
    hit *= 1.f + (ua.cohesion - 0.5f) * P.hitCohesionSelf;
    hit *= 1.f - (ut.cohesion - 0.5f) * P.hitCohesionEnemy;
    if (s.flags[a] & 8) hit *= 1.3f;
    if (s.state[t] == S_ROUT) hit *= P.hitRoutTarget;
    uint8_t ka = s.kind[a], kt = s.kind[t];
    if (ka == K_HALBERD && kt == K_SWORD) hit *= 1.1f;
    if (ka == K_SWORD && kindIsLong(kt) && al < 1.3f) hit *= 1.2f;
    if (kindIsMissile(ka)) hit *= 0.6f;
    if (A.impact) hit *= 1.5f;
    if (w.terrain.typeAt(s.x[a], s.y[a]) == T_STOCKADE) hit *= P.stockadeClimb;   // 翻越车营者难以施展
    { float ha = w.terrain.heightAt(s.x[a], s.y[a]), ht = w.terrain.heightAt(s.x[t], s.y[t]); if (ha < ht - P.hillStep) hit *= P.uphillHit; else if (ha > ht + P.hillStep) hit *= P.downhillHit; }
    if (s.state[t] != S_ROUT) s.morale[t] -= (front ? 0.f : P.mFlank) * (A.impact ? P.cavFlankMul : 1.f);
    if (w.rng.uni() >= hit) return 0.f;
    float dmg = ka == K_HALBERD ? P.dmgHalberd : ka == K_SPEAR ? P.dmgSpear : (ka == K_CAV || ka == K_CAV_ARMORED) ? P.dmgLance : P.dmgSword;
    float red = A.type == 0 ? P.armorPierce[s.armor[t]] : P.armorCut[s.armor[t]];
    if ((s.flags[t] & 1) && front && s.state[t] == S_FORMED) red = 1.f - (1.f - red) * (1.f - P.shieldPierce);
    dmg *= (1.f - red);
    if (A.impact) { dmg *= P.cavImpactMul * P.form[ua.formation].impact * (w.terrain.typeAt(s.x[a], s.y[a]) == T_FOREST ? P.forestImpact : 1.f); squadHit(t, P.mDeathNear * (front && ut.cohesion > 0.5f ? 1.f : P.cavFlankMul)); }
    return dmg;
  };
  auto apply = [&](size_t k) {
    const Attack& A = all[k]; int t = A.t; float dmg = dmgOf[k];
    if (dmg <= 0.f || s.state[t] >= S_WOUNDED || s.state[A.a] >= S_WOUNDED) return;
    s.hp[t] += dmg;
    if (s.hp[t] >= P.hp) applyDown(t, A.a, false);
  };
  if (mode == 0) { for (size_t k = 0; k < all.size(); k++) dmgOf[k] = roll(k); for (size_t k = 0; k < all.size(); k++) apply(k); }
  else { for (size_t k = 0; k < all.size(); k++) { dmgOf[k] = roll(k); apply(k); } }
}

void Sim::volleys() {
  const Params& P = w.P; auto& s = w.s;
  if (!shots.empty() && w.tick - shots.front().tick > 20) { size_t k = 0; while (k < shots.size() && w.tick - shots[k].tick > 20) k++; shots.erase(shots.begin(), shots.begin() + k); }
  const int WIN = 10;   // 一轮齐射分 10 个 tick 发完：消掉尖峰，画面上也更像持续的箭雨
  for (auto& u : w.units) {
    if (!kindIsMissile(u.kind) || u.alive == 0 || u.stance == ST_PRONE) continue;
    bool ha = (u.kind == K_CAV_BOW);
    bool xb = (u.kind == K_XBOW || u.kind == K_HXBOW) && P.xbowStagger;
    if (u.volleyLeft <= 0) {
      if (u.ammo <= 0.f) continue;
      u.reload -= P.dt;
      if (u.reload > 0) continue;
      if (w.tick - u.lastEngagedTick < (ha ? 5 : 20)) continue;
      float range, maxR, hitP, dmg, reloadT;
      switch (u.kind) {
        case K_XBOW: range = P.xbowRange; maxR = P.xbowMax; hitP = P.xbowHit; dmg = P.xbowDmg; reloadT = P.xbowReload; break;
        case K_HXBOW: range = P.hxbowRange; maxR = P.hxbowMax; hitP = P.hxbowHit; dmg = P.hxbowDmg; reloadT = P.hxbowReload; break;
        default: range = P.bowRange; maxR = P.bowMax; hitP = P.bowHit; dmg = P.bowDmg; reloadT = P.bowReload; break;
      }
      if (ha) { reloadT = P.haReload; hitP *= P.haMovingFire; }
      int tgt = u.fireTarget;
      if (tgt < 0 || w.units[tgt].alive == 0 || len(w.units[tgt].cx - u.cx, w.units[tgt].cy - u.cy) > maxR) tgt = nearestEnemyUnit(u.id, maxR);
      if (tgt < 0) { u.reload = 1.f; continue; }
      const Unit& T = w.units[tgt];
      float dist = len(T.cx - u.cx, T.cy - u.cy);
      if (dist < P.missileMinRange) { u.reload = 1.f; continue; }
      { float dh = w.terrain.heightAt(u.cx, u.cy) - w.terrain.heightAt(T.cx, T.cy); float rm = clampf(1.f + dh * P.heightRange, 0.8f, 1.25f); range *= rm; maxR *= rm; }
      if (u.fireDiscipline && dist > range && !kindIsCav(T.kind)) { u.reload = 0.5f; continue; }
      u.volleyLeft = WIN; u.volleyTarget = tgt; u.volleyShots = 0; u.volleyHits = 0; u.volleyRange = range; u.volleyMax = maxR; u.volleyHit = hitP; u.volleyDmg = dmg;
      if (xb) { u.volleyGroup ^= 1; reloadT *= 0.5f; }   // 弩分两番迭射：一番张弩、一番发，箭不断
      u.reload = reloadT * w.rng.range(0.9f, 1.1f);
    }
    // 窗口内：本 tick 发射 members 中 mi % WIN == 当前片 的人
    int slice = WIN - u.volleyLeft; u.volleyLeft--;
    int tgt = u.volleyTarget; if (tgt < 0 || w.units[tgt].alive + w.units[tgt].routed == 0) { u.volleyLeft = 0; continue; }
    const Unit& T = w.units[tgt];
    float dist = len(T.cx - u.cx, T.cy - u.cy);
    float rangeMul = dist <= u.volleyRange ? 1.f : std::max(0.f, (u.volleyMax - dist) / std::max(1.f, u.volleyMax - u.volleyRange));
    float sigma = dist * P.volleySpread + 2.f;
    const Params::FormMod& fmU = P.form[u.formation];
    for (size_t mi = (size_t)slice; mi < u.members.size(); mi += WIN) {
      int id = u.members[mi];
      if (s.state[id] != S_FORMED) continue;
      if (xb && (int)((mi / WIN) & 1) != u.volleyGroup) continue;
      if (!ha && !fmU.allShoot) { int rank = (int)((u.frontY - u.slotY[mi]) / P.rankGap + 0.5f); if (rank >= P.shooterRanks) continue; }
      // 射线上有本方士卒（本曲之外）：弩平射不能发；弓抛射越过，命中打折
      bool overFriend = false;
      if (!ha) {
        float sx0 = s.x[id], sy0 = s.y[id], ddx = T.cx - sx0, ddy = T.cy - sy0, L = len(ddx, ddy);
        if (L > 1.f) { ddx /= L; ddy /= L; float t0 = (u.frontY - u.slotY[mi]) + 4.f, t1 = L - T.hy - 6.f;
          for (float tt = t0; tt < t1; tt += 4.f) { int c = grid.idx(sx0 + ddx * tt, sy0 + ddy * tt); if (grid.sideCount[u.side][c] > 0) { overFriend = true; break; } } }
      }
      if (overFriend && xb) continue;
      u.volleyShots++;
      float ax = T.cx + w.rng.gauss() * sigma, ay = T.cy + w.rng.gauss() * sigma;
      int best = -1; float bd = 2.25f;
      grid.forNear(ax, ay, 1.5f, [&](const Packed& p) { if (p.side == u.side) return; float dx = p.x - ax, dy = p.y - ay, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = p.idx; } });
      shots.push_back({s.x[id], s.y[id], ax, ay, w.tick, u.side, false});
      if (best < 0 || s.state[best] >= S_WOUNDED) continue;
      const Unit& tu = w.units[s.unit[best]];
      float p = u.volleyHit * rangeMul * P.form[tu.formation].missileTaken * (overFriend ? P.bowOverhead : 1.f);
      { float bx = s.x[best], by = s.y[best]; float ex = u.cx - bx, ey = u.cy - by, el = len(ex, ey); if (el > 1.f && (w.terrain.typeAt(bx, by) == T_STOCKADE || w.terrain.typeAt(bx + ex / el * 8.f, by + ey / el * 8.f) == T_STOCKADE)) p *= P.stockadeCover; }
      float ix = u.cx - s.x[best], iy = u.cy - s.y[best], il = len(ix, iy); float cosA = il > 1e-4f ? (ix * tu.fx + iy * tu.fy) / il : 1.f;
      if ((s.flags[best] & 1) && cosA > 0.3f && s.state[best] == S_FORMED) p *= (1.f - P.shieldArrow);
      if (s.state[best] == S_ROUT) p *= 1.5f;
      if (w.terrain.typeAt(s.x[best], s.y[best]) == T_FOREST) p *= P.forestCover;
      if (w.rng.uni() >= p) continue;
      float red = P.armorArrow[s.armor[best]]; if (u.kind == K_HXBOW) red *= P.hxbowArmorBreak;
      if (s.flags[best] & 32) red = std::max(red, P.horseArmorArrow);
      s.hp[best] += u.volleyDmg * (1.f - red);
      u.volleyHits++; shots.back().hit = true; shots.back().x1 = s.x[best]; shots.back().y1 = s.y[best];
      if (s.hp[best] >= P.hp) applyDown(best, u.members[0], true);
    }
    if (u.volleyLeft == 0) {
      if (u.volleyShots > 0) { u.ammo -= xb ? 0.5f : 1.f; if (u.ammo <= 0.f && !u.outOfAmmo) { u.outOfAmmo = true; log(u.name + "矢尽"); } }
      if (u.volleyShots >= 100 && u.volleyHits * 10 >= u.volleyShots) log(u.name + "齐射，所中必倒");
    }
  }
}

// —— 士气 + 统计：按下标一块 BLOCK_MORALE 人 ——
void Sim::moraleBlock(int block) {
  const Params& P = w.P; auto& s = w.s; size_t U = w.units.size();
  UnitAcc* acc = &accByBlock[(size_t)block * U]; for (size_t u = 0; u < U; u++) acc[u] = UnitAcc{};
  auto& ev = routsByBlock[block]; ev.clear();
  int ib = block * BLOCK_MORALE, ie = std::min((int)s.size(), ib + BLOCK_MORALE);
  for (int i = ib; i < ie; i++) {
    if (s.state[i] >= S_WOUNDED) continue;
    int ui = s.unit[i]; const Unit& u = w.units[ui]; uint8_t sd = s.side[i];
    int c = grid.cellOf[i];
    if (c >= 0 && s.state[i] != S_ROUT) {
      int d = grid.deaths[sd][c], r = grid.routs[sd][c];   // 只看同格：看得见的才吓人（深阵不因此比横列更脆）
      int rn = s.routNear[i];
      if (d | r | rn) {
        float scale = (w.tick - u.lastEngagedTick < 50 ? 1.f : P.contagionIdle) * (1.f - P.contagionCohesion * u.cohesion);
        if (u.officerAlive && u.flagAlive) { float ox = s.x[u.officer] - s.x[i], oy = s.y[u.officer] - s.y[i]; if (ox * ox + oy * oy < P.officerRadius * P.officerRadius) scale *= P.officerSuppress; }   // 军候在侧、旗立，压得住
        if (d) s.morale[i] -= std::min(2, d) * P.mDeathNear * scale;                 // 看见同伴倒下：谁都怕
        // 看见同伴跑 / 溃兵从身边穿过：只在本来就动摇的人身上发酵（士气 70 以上免疫，35 时一半）；后队压得住前队
        // 而且只会把人压到溃走线以上 10 点：看见人跑只会动摇，不会直接溃；真正溃走要靠伤亡、侧背、疲劳、军候倒下
        float shaky = clampf((70.f - s.morale[i]) / 70.f, 0.f, 1.f);
        float floorM = ((s.flags[i] & 8) ? P.moraleThresholdElite : P.moraleThreshold) + 10.f;
        float loss = 0.f;
        if (r) loss += std::min(2, r) * P.mRoutNear * scale * shaky;
        if (rn) {
          float sc2 = shaky * (1.f - P.contagionCohesion * u.cohesion);
          if (u.officerAlive && u.flagAlive) { float ox = s.x[u.officer] - s.x[i], oy = s.y[u.officer] - s.y[i]; if (ox * ox + oy * oy < P.officerRadius * P.officerRadius) sc2 *= P.officerSuppress; }
          loss += std::min(rn, P.routNearCap) * P.routNearPerTick * sc2;
        }
        if (loss > 0.f && s.morale[i] > floorM) s.morale[i] = std::max(floorM, s.morale[i] - loss);
      }
    }
    s.morale[i] = clampf(s.morale[i], -50.f, 100.f);
    float th = (s.flags[i] & 8) ? P.moraleThresholdElite : P.moraleThreshold;
    if (s.state[i] != S_ROUT && s.morale[i] < th) { s.state[i] = S_ROUT; s.target[i] = -1; ev.push_back(i); }
    else if (s.state[i] == S_ROUT) {
      if (unitNearEnemy[ui] > P.rallyDist && u.officerAlive && s.morale[i] > -20.f) { s.morale[i] = std::max(s.morale[i], P.rallyMorale); s.state[i] = S_RALLY; }
      else s.morale[i] = std::min(s.morale[i] + P.mRecover * 0.5f, th + 5.f);
    }
    UnitAcc& a = acc[ui];
    if (s.state[i] == S_ROUT) { a.routed++; a.rsx += s.x[i]; a.rsy += s.y[i]; continue; }
    a.alive++; a.msum += s.morale[i]; a.fsum += s.fatigue[i]; if (s.push[i] == 1) a.push1++; else if (s.push[i] == 2) a.push2++;
    float wx, wy; slotWorld(u, s.slot[i], wx, wy);
    float dx = wx - s.x[i], dy = wy - s.y[i]; if (dx * dx + dy * dy < P.slotTol * P.slotTol) a.inSlot++;
    if (engaged[i] == 1) a.engaged = 1; else if (engaged[i] == 2) a.balk++;
  }
}

void Sim::applyRoutEvents() {
  const Params& P = w.P; auto& s = w.s;
  for (auto& ev : routsByBlock) for (int i : ev) { squadHit(i, P.mRoutSquad, P.moraleThreshold + 5.f); int c = grid.cellOf[i]; if (c >= 0) grid.routs[s.side[i]][c]++; }   // 同伍逃走：动摇，但本身不致溃
}

void Sim::updateUnitsPost() {
  const Params& P = w.P; auto& s = w.s; size_t U = w.units.size();
  int nbM = (int)routsByBlock.size();
  for (int sd = 0; sd < 2; sd++) { w.sides[sd].alive = 0; w.sides[sd].routed = 0; }
  for (auto& u : w.units) {
    UnitAcc t;
    for (int b = 0; b < nbM; b++) { const UnitAcc& a = accByBlock[(size_t)b * U + u.id]; t.alive += a.alive; t.inSlot += a.inSlot; t.routed += a.routed; t.balk += a.balk; t.engaged |= a.engaged; t.msum += a.msum; t.fsum += a.fsum; t.push1 += a.push1; t.push2 += a.push2; t.rsx += a.rsx; t.rsy += a.rsy; }
    if (t.routed > 0) { u.routX = (float)(t.rsx / t.routed); u.routY = (float)(t.rsy / t.routed); } else { u.routX = u.cx; u.routY = u.cy; }
    u.alive = t.alive; u.routed = t.routed; u.balking = t.balk; u.balkTicks = u.balking > 0 ? u.balkTicks + 1 : 0;
    if (t.engaged) u.lastEngagedTick = w.tick;
    // 推挤：曲中心随净推挤方向沿朝向前进 / 后退（被推的阵线后退，推进的阵线前压）
    if (t.push1 != t.push2 && u.alive > 0 && u.stance != ST_DISENGAGE) { float net = (float)(t.push1 - t.push2) / std::max(1, std::max(t.push1, t.push2)); float stepL = net * P.pushSpeed * P.centerPush * P.dt; u.cx += u.fx * stepL; u.cy += u.fy * stepL; }
    if (u.gapTimer > 0.f) u.gapTimer -= P.dt;
    u.cohesion = u.alive ? (float)t.inSlot / u.alive : 0.f;
    u.moraleAvg = u.alive ? t.msum / u.alive : 0.f;
    unitFatigue[u.id] = u.alive ? t.fsum / u.alive : 0.f;
    w.sides[u.side].alive += u.alive; w.sides[u.side].routed += u.routed;
    int total = u.alive + u.routed;
    if (!u.broken && total > 0 && u.routed > P.unitBrokenFrac * total && u.routed >= 10) {
      u.broken = true; log(u.name + "溃");
      for (auto& v : w.units) if (v.id != u.id && v.side == u.side && v.part == u.part && !v.broken)
        for (int j : v.members) if (s.state[j] < S_WOUNDED) s.morale[j] -= P.mSiblingBroken;
    }
    if (u.broken && total > 0 && u.routed < 0.2f * total) u.broken = false;
    if (w.tick % 10 == u.id % 10) {
      u.cavThreat = false;
      for (auto& v : w.units) {
        if (v.side == u.side || !kindIsCav(v.kind) || v.alive < 10) continue;
        float dx = v.cx - u.cx, dy = v.cy - u.cy, d2 = dx * dx + dy * dy;
        if (d2 < 3600.f) { float d = sqrtf(d2); if ((dx * u.fx + dy * u.fy) / d < 0.5f) { u.cavThreat = true; break; } }
      }
    }
  }
  for (int sd = 0; sd < 2; sd++) {
    Side& S = w.sides[sd];
    if (S.general >= 0 && s.state[S.general] < S_WOUNDED) { S.gx = s.x[S.general]; S.gy = s.y[S.general]; }
    if (!S.fled && !S.generalDown) {
      int brokenN = 0, unitsN = 0; for (auto& u : w.units) if (u.side == sd) { unitsN += (int)u.members.size(); if (u.broken || u.alive + u.routed == 0) brokenN += (int)u.members.size(); }   // 按人数计：小曲被冲散不算全军溃
      if (unitsN && brokenN > P.generalFleeFrac * unitsN) {
        S.fled = true; log(S.name + "主将见诸营皆溃，引亲骑走，三军夺气");
        for (size_t j = 0; j < s.size(); j++) if (s.side[j] == sd && s.state[j] < S_WOUNDED) s.morale[j] -= P.mGeneralDown;
        for (auto& u : w.units) if (u.side == sd) { Order o{O_RETREAT, S.gx + (S.gx - w.sides[1 - sd].gx), S.gy + (S.gy - w.sides[1 - sd].gy)}; issue(u.id, o, true); }
      }
    }
  }
}

void Sim::step() {
  using clk = std::chrono::steady_clock; auto t0 = clk::now(); auto tp = t0;
  auto lap = [&](int k) { auto n = clk::now(); phaseMs[k] += std::chrono::duration<double, std::milli>(n - tp).count(); tp = n; };
  w.tick++;
  processOrders();
  updateUnitsPre(); lap(0);
  grid.build(w.s, bbox.minx, bbox.miny, bbox.maxx, bbox.maxy, pool.get()); lap(1);
  std::fill(engaged.begin(), engaged.end(), 0);
  int nbS = (int)((grid.order.size() + BLOCK_SOLDIER - 1) / BLOCK_SOLDIER);
  std::fill(quietByBlock.begin(), quietByBlock.end(), 0);
  pool->parallelBlocks(nbS, [this](int b) { soldierBlock(b); });
  for (int b = 0; b < nbS; b++) quietTotal += quietByBlock[b]; scanTotal += (long)grid.order.size();
  std::swap(w.s.x, nx); std::swap(w.s.y, ny);
  bbox = BBox{}; for (int b = 0; b < nbS; b++) { const BBox& q = bboxByBlock[b]; bbox.minx = std::min(bbox.minx, q.minx); bbox.maxx = std::max(bbox.maxx, q.maxx); bbox.miny = std::min(bbox.miny, q.miny); bbox.maxy = std::max(bbox.maxy, q.maxy); }
  if (bbox.minx > bbox.maxx) bbox = {0, 0, 1, 1};
  lap(2);
  resolveAttacks(); lap(3);
  volleys(); lap(4);
  int nbM = (int)routsByBlock.size();
  pool->parallelBlocks(nbM, [this](int b) { moraleBlock(b); });
  grid.clearEvents();
  applyRoutEvents();
  updateUnitsPost(); lap(5);
  lastStepMs = std::chrono::duration<double, std::milli>(clk::now() - t0).count();
}

int Sim::unitAt(float x, float y, float r) const {
  int best = -1; float bd = r * r;
  for (auto& u : w.units) { if (u.alive == 0) continue; float dx = u.cx - x, dy = u.cy - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = u.id; } }
  if (best >= 0) return best;
  bd = 9.f;
  for (size_t i = 0; i < w.s.size(); i++) { if (w.s.state[i] >= S_WOUNDED) continue; float dx = w.s.x[i] - x, dy = w.s.y[i] - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = w.s.unit[i]; } }
  return best;
}

bool Sim::over(int& winner) const {
  for (int sd = 0; sd < 2; sd++) {
    const Side& S = w.sides[sd];
    if (S.fled || S.alive == 0 || (S.total > 0 && S.alive < 0.15f * S.total)) { winner = 1 - sd; return true; }
  }
  winner = -1; return false;
}
