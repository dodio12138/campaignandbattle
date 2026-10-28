#include "sim.hpp"
#include <cmath>
#include <algorithm>
#include <chrono>
#include <thread>

static inline float clampf(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }

Sim::Sim(uint32_t seed, int threads) : w(seed) {
  int n = threads > 0 ? threads : (int)std::thread::hardware_concurrency();
  if (n < 1) n = 1; if (n > 16) n = 16;
  pool = std::make_unique<Pool>(n);
  attacks.resize(n);
}

void Sim::finalize() {
  grid.init(w.P);
  for (auto& u : w.units) {
    buildSlots(u, w.P);
    // 军候 = 末排中央槽，旗手 = 其旁
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
  nx.resize(w.s.size()); ny.resize(w.s.size()); engaged.assign(w.s.size(), 0);
  unitFatigue.assign(w.units.size(), 0);
  grid.build(w.s);
  updateUnitsPost();
}

float Sim::speedOf(int i) const {
  const Params& P = w.P; const auto& s = w.s; const Unit& u = w.units[s.unit[i]];
  float f = 1.f - s.fatigue[i] / 200.f;
  bool cav = kindIsCav(s.kind[i]);
  float v;
  if (s.state[i] == S_ROUT) v = cav ? P.routHorse : P.routFoot;
  else if (u.stance == ST_CHARGE || u.charging > 0) v = cav ? P.chargeHorse : (s.armor[i] >= 2 ? P.runFootArmored : P.runFoot);
  else v = cav ? P.walkHorse : P.walkFoot;
  return v * f;
}

void Sim::issue(int ui, Order o, bool immediate) {
  if (ui < 0 || ui >= (int)w.units.size()) return;
  Unit& u = w.units[ui]; const Params& P = w.P; const Side& S = w.sides[u.side];
  float delay = 0;
  if (!immediate) {
    float d = hypotf(u.cx - S.gx, u.cy - S.gy);
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
        case O_MOVE: u.gx = o.x; u.gy = o.y; u.stance = ST_MOVE; break;
        case O_HALT: u.stance = ST_HOLD; u.gx = u.cx; u.gy = u.cy; break;
        case O_CHARGE: u.gx = o.x; u.gy = o.y; u.stance = ST_CHARGE; u.charging = (int)(30.f / P.dt);
          for (int id : u.members) if (w.s.state[id] == S_FORMED) w.s.morale[id] = std::min(100.f, w.s.morale[id] + P.mCharge);
          break;
        case O_RETREAT: u.gx = o.x; u.gy = o.y; u.stance = ST_RETREAT; break;
        case O_FIRE: u.fireTarget = o.arg; break;
        case O_FORMATION: u.formation = (uint8_t)o.arg; buildSlots(u, P); break;
        case O_FACE: { float l = hypotf(o.x, o.y); if (l > 1e-4f) { u.fx = o.x / l; u.fy = o.y / l; } } break;
        case O_PRONE: u.stance = ST_PRONE; u.gx = u.cx; u.gy = u.cy; break;
        case O_RISE: u.stance = ST_HOLD; break;
      }
    }
  }
}

void Sim::updateUnitsPre() {
  const Params& P = w.P;
  for (auto& u : w.units) {
    if (u.alive == 0) continue;
    bool engagedRecently = w.tick - u.lastEngagedTick < 10;
    float spd = kindIsCav(u.kind) ? (u.stance == ST_CHARGE ? P.chargeHorse : P.walkHorse) : (u.stance == ST_CHARGE ? P.runFoot : P.walkFoot);
    spd *= (1.f - unitFatigue[u.id] / 200.f) * P.unitSpeedMul;
    if (u.charging > 0) u.charging--;
    if (u.stance == ST_MOVE || u.stance == ST_CHARGE || u.stance == ST_RETREAT) {
      float dx = u.gx - u.cx, dy = u.gy - u.cy, d = hypotf(dx, dy);
      if (d < 1.f) { u.stance = ST_HOLD; }
      else if (!(engagedRecently && u.stance != ST_CHARGE)) {
        float stepL = std::min(d, spd * P.dt);
        u.cx += dx / d * stepL; u.cy += dy / d * stepL;
        if (u.stance != ST_RETREAT) {
          // 转向：每秒至多 90°
          float tx = dx / d, ty = dy / d; float cur = atan2f(u.fy, u.fx), tgt = atan2f(ty, tx), diff = tgt - cur;
          while (diff > 3.14159f) diff -= 6.28318f; while (diff < -3.14159f) diff += 6.28318f;
          float maxT = 1.5708f * P.dt; diff = clampf(diff, -maxT, maxT); cur += diff; u.fx = cosf(cur); u.fy = sinf(cur);
        }
      }
    }
    // 伏盾：敌至三十米同时俱起
    if (u.stance == ST_PRONE) {
      int e = -1; float bestD = 1e9f;
      grid.forNear(u.cx, u.cy, 40.f, [&](int j) { if (w.s.side[j] == u.side || w.s.state[j] >= S_WOUNDED) return; float dx = w.s.x[j] - u.cx, dy = w.s.y[j] - u.cy, d = dx * dx + dy * dy; if (d < bestD) { bestD = d; e = w.s.unit[j]; } });
      bestD = sqrtf(bestD);
      if (e >= 0) {
        const Unit& eu = w.units[e];
        if (bestD < 35.f) {
          u.stance = ST_CHARGE; u.charging = (int)(30.f / P.dt); u.gx = eu.cx; u.gy = eu.cy;
          for (int id : u.members) if (w.s.state[id] == S_FORMED) w.s.morale[id] = std::min(100.f, w.s.morale[id] + P.mCharge);
          for (auto& v : w.units) if (v.side == u.side && v.part == u.part && kindIsMissile(v.kind)) v.reload = 0;   // 强弩雷发
          log(u.name + "伏盾下不动，敌至数十步，同时俱起，扬尘大叫，直前冲突");
        }
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

void Sim::soldierPhase(int b, int e, int t) {
  const Params& P = w.P; auto& s = w.s; auto& buf = attacks[t];
  const float dt = P.dt;
  for (int i = b; i < e; i++) {
    uint8_t st = s.state[i];
    if (st >= S_WOUNDED) { nx[i] = s.x[i]; ny[i] = s.y[i]; continue; }
    const Unit& u = w.units[s.unit[i]];
    float px = s.x[i], py = s.y[i];
    bool cav = kindIsCav(s.kind[i]);
    uint8_t k = s.kind[i];
    float reach = k == K_HALBERD ? P.reachHalberd : k == K_SPEAR ? P.reachSpear : (k == K_CAV || k == K_CAV_ARMORED) ? P.reachLance : cav ? P.reachCavSword : P.reachSword;
    float searchR = (u.stance == ST_CHARGE || u.charging > 0) ? 8.f : 4.f;
    // 近邻：分离 + 最近敌
    float sepx = 0, sepy = 0; int nearest = -1; float nd = 1e9f;
    float fleex = 0, fleey = 0; int enemyNear = 0;
    uint8_t mySide = s.side[i];
    grid.forNear(px, py, searchR, [&](int j) {
      if (j == i) return;
      float dx = s.x[j] - px, dy = s.y[j] - py, d2 = dx * dx + dy * dy;
      if (s.side[j] != mySide) {
        if (d2 < nd) { nd = d2; nearest = j; }
        if (d2 < 625.f) { enemyNear++; float inv = 1.f / (d2 + 1.f); fleex -= dx * inv; fleey -= dy * inv; }
      }
      if (d2 < P.sepRadius * P.sepRadius && d2 > 1e-6f) { float d = sqrtf(d2); float f = (P.sepRadius - d) / P.sepRadius; sepx -= dx / d * f; sepy -= dy / d * f; }
    });
    float ndist = nearest >= 0 ? sqrtf(nd) : 1e9f;
    float vx = 0, vy = 0; float spd = speedOf(i);
    bool fighting = false;

    if (st == S_ROUT) {
      if (enemyNear) { float l = hypotf(fleex, fleey); if (l > 1e-6f) { vx = fleex / l * spd; vy = fleey / l * spd; } }
      else {
        // 向己方后方（主将方向或远离敌军重心）
        const Side& S = w.sides[mySide]; float dx = S.gx - px, dy = S.gy - py, l = hypotf(dx, dy);
        const Side& E = w.sides[1 - mySide]; float ex = px - E.gx, ey = py - E.gy, el = hypotf(ex, ey);
        if (el > 1e-3f) { vx = ex / el * spd; vy = ey / el * spd; } else if (l > 1e-3f) { vx = dx / l * spd; vy = dy / l * spd; }
      }
      s.fatigue[i] = std::min(P.fatigueMax, s.fatigue[i] + P.fatigueRun);
    } else {
      // 骑兵：面对稳固长兵阵勒马
      bool balk = false;
      if (cav && nearest >= 0 && ndist < P.cavBalkDist + 1.5f) {
        const Unit& eu = w.units[s.unit[nearest]];
        if (kindIsLong(eu.kind) && eu.cohesion > P.cavBalkCohesion && s.state[nearest] == S_FORMED) {
          float ax = px - s.x[nearest], ay = py - s.y[nearest], al = hypotf(ax, ay);
          float cosA = al > 1e-4f ? (ax * eu.fx + ay * eu.fy) / al : 1.f;
          if (cosA > cosf(P.cavBalkFacing * 3.14159f / 180.f)) balk = true;
        }
      }
      if (nearest >= 0 && ndist <= reach && u.stance != ST_PRONE) {
        fighting = true; engaged[i] = 1;
        if (s.cd[i] > 0) s.cd[i]--;
        else {
          float cdS = k == K_HALBERD ? P.cdHalberd : k == K_SPEAR ? P.cdSpear : (k == K_CAV || k == K_CAV_ARMORED) ? P.cdLance : P.cdSword;
          s.cd[i] = (uint8_t)(cdS / dt);
          bool impact = cav && (u.charging > 0) && (hypotf(s.vx[i], s.vy[i]) > 4.f) && !balk;
          uint8_t type = (k == K_SWORD || k == K_BOW || k == K_XBOW || k == K_HXBOW || k == K_CAV_BOW) ? 1 : 0;
          buf.push_back({i, nearest, type, impact});
        }
        s.fatigue[i] = std::min(P.fatigueMax, s.fatigue[i] + P.fatigueFight);
        if (balk) { if (s.morale[i] > P.cavBalkFloor) s.morale[i] -= P.cavBalkMorale; engaged[i] = 2; }
      } else {
        float tx, ty;
        bool chase = (u.stance == ST_CHARGE || u.charging > 0) && nearest >= 0 && ndist < 8.f && !balk;
        if (chase) { tx = s.x[nearest]; ty = s.y[nearest]; }
        else if (st == S_RALLY || st == S_FORMED) { slotWorld(u, s.slot[i], tx, ty); }
        else { tx = px; ty = py; }
        float dx = tx - px, dy = ty - py, d = hypotf(dx, dy);
        if (balk) { d = 0; engaged[i] = 2; if (s.morale[i] > P.cavBalkFloor) s.morale[i] -= P.cavBalkMorale; }
        if (d > 0.05f) {
          float want = std::min(spd, d * P.slotSpring);
          vx = dx / d * want; vy = dy / d * want;
          if (want > P.walkFoot * 1.1f || cav) s.fatigue[i] = std::min(P.fatigueMax, s.fatigue[i] + (cav && u.charging > 0 ? P.cavFatigueCharge : P.fatigueRun) * 0.5f);
          else s.fatigue[i] = std::max(0.f, s.fatigue[i] - P.fatigueRest * 0.3f);
        } else {
          s.fatigue[i] = std::max(0.f, s.fatigue[i] - P.fatigueRest);
          if (st == S_RALLY) s.state[i] = S_FORMED;
        }
        if (st == S_RALLY && d < P.slotTol) s.state[i] = S_FORMED;
      }
      if (fighting) { s.fatigue[i] = std::min(P.fatigueMax, s.fatigue[i] + P.fatigueFight); }
    }
    // 分离
    vx += sepx * P.sepForce; vy += sepy * P.sepForce;
    float vl = hypotf(vx, vy); float cap = st == S_ROUT ? spd : std::max(spd, 1.5f);
    if (vl > cap) { vx *= cap / vl; vy *= cap / vl; }
    s.vx[i] = vx; s.vy[i] = vy;
    nx[i] = clampf(px + vx * dt, 1.f, P.worldW - 1.f); ny[i] = clampf(py + vy * dt, 1.f, P.worldH - 1.f);
    // 士气：侧后有敌骑 / 疲劳上限
    if (st != S_ROUT) {
      if (u.cavThreat && s.morale[i] > P.mCavNearFloor) s.morale[i] -= P.mCavNear;
      float cap2 = 100.f - s.fatigue[i] * P.mFatigueCap; if (s.morale[i] > cap2) s.morale[i] = cap2;
      if (!fighting && u.officerAlive && u.flagAlive && !u.broken && s.morale[i] < P.mRecoverCap) {
        float ox = s.x[u.officer] - px, oy = s.y[u.officer] - py;
        if (ox * ox + oy * oy < P.officerRadius * P.officerRadius) s.morale[i] += P.mRecover;
      }
    }
  }
}

void Sim::squadHit(int i, float amount) {
  const Unit& u = w.units[w.s.unit[i]]; int sl = w.s.slot[i]; int b = (sl / 5) * 5, e = std::min((int)u.members.size(), b + 5);
  for (int k = b; k < e; k++) { int j = u.members[k]; if (j != i && w.s.state[j] < S_WOUNDED) w.s.morale[j] -= amount; }
}

void Sim::applyDown(int i, int by, bool missile) {
  auto& s = w.s; const Params& P = w.P; Unit& u = w.units[s.unit[i]];
  bool dead = w.rng.uni() < P.deadRatio;
  bool wasRout = s.state[i] == S_ROUT;
  s.state[i] = dead ? S_DEAD : S_WOUNDED; s.vx[i] = s.vy[i] = 0;
  int c = grid.cellOf[i]; if (c >= 0) grid.deaths[s.side[i]][c]++;
  squadHit(i, P.mDeathSquad);
  if (dead) { u.dead++; w.sides[s.side[i]].dead++; } else { u.wounded++; w.sides[s.side[i]].wounded++; }
  if (wasRout) { u.routed--; w.sides[s.side[i]].routed--; }
  if (by >= 0) kills[s.side[by]]++;
  if (i == u.officer && u.officerAlive) { u.officerAlive = false; for (int j : u.members) if (s.state[j] < S_WOUNDED) s.morale[j] -= P.mOfficerDown; log(u.name + "军候" + (dead ? "阵殁" : "被创")); }
  if (i == u.flag && u.flagAlive) { u.flagAlive = false; for (int j : u.members) if (s.state[j] < S_WOUNDED) s.morale[j] -= P.mFlagDown; log(u.name + "旗倒"); }
  if (s.flags[i] & 16) { Side& S = w.sides[s.side[i]]; if (!S.generalDown) { S.generalDown = true; for (size_t j = 0; j < s.size(); j++) if (s.side[j] == s.side[i] && s.state[j] < S_WOUNDED) s.morale[j] -= P.mGeneralDown; log(S.name + "主将" + (dead ? "战殁" : "被创") + "，三军夺气"); } }
  (void)missile;
}

void Sim::resolveAttacks() {
  const Params& P = w.P; auto& s = w.s;
  for (auto& buf : attacks) {
    for (const Attack& A : buf) {
      int a = A.a, t = A.t;
      if (s.state[t] >= S_WOUNDED || s.state[a] >= S_WOUNDED) continue;
      const Unit& ua = w.units[s.unit[a]]; const Unit& ut = w.units[s.unit[t]];
      // 方位：攻击来向相对目标朝向
      float ax = s.x[a] - s.x[t], ay = s.y[a] - s.y[t], al = hypotf(ax, ay);
      float cosA = al > 1e-4f ? (ax * ut.fx + ay * ut.fy) / al : 1.f;
      float facing = cosA < -0.5f ? P.hitRear : (cosA < 0.5f ? P.hitFlank : 1.f);
      bool front = cosA >= 0.5f;
      float hit = P.skillBase * (1.f - s.fatigue[a] * P.hitFatigue) * facing;
      hit *= 1.f + (ua.cohesion - 0.5f) * P.hitCohesionSelf;
      hit *= 1.f - (ut.cohesion - 0.5f) * P.hitCohesionEnemy;
      if (s.flags[a] & 8) hit *= 1.3f;
      if (s.state[t] == S_ROUT) hit *= P.hitRoutTarget;
      uint8_t ka = s.kind[a], kt = s.kind[t];
      if (ka == K_HALBERD && kt == K_SWORD) hit *= 1.1f;
      if (ka == K_SWORD && kindIsLong(kt) && al < 1.3f) hit *= 1.2f;   // 刀盾贴身
      if (kindIsMissile(ka)) hit *= 0.6f;                              // 弩手近身弱
      if (A.impact) hit *= 1.5f;
      if (s.state[t] != S_ROUT) s.morale[t] -= (front ? 0.f : P.mFlank) * (A.impact ? P.cavFlankMul : 1.f);
      if (w.rng.uni() >= hit) continue;
      float dmg = ka == K_HALBERD ? P.dmgHalberd : ka == K_SPEAR ? P.dmgSpear : (ka == K_CAV || ka == K_CAV_ARMORED) ? P.dmgLance : P.dmgSword;
      float red = A.type == 0 ? P.armorPierce[s.armor[t]] : P.armorCut[s.armor[t]];
      if ((s.flags[t] & 1) && front && s.state[t] == S_FORMED) red = 1.f - (1.f - red) * (1.f - P.shieldPierce);
      dmg *= (1.f - red);
      if (A.impact) { dmg *= P.cavImpactMul; squadHit(t, P.mDeathNear * (front && ut.cohesion > 0.5f ? 1.f : P.cavFlankMul)); }
      s.hp[t] += dmg;
      if (s.hp[t] >= P.hp) applyDown(t, a, false);
    }
    buf.clear();
  }
}

void Sim::volleys() {
  const Params& P = w.P; auto& s = w.s;
  for (auto& u : w.units) {
    if (!kindIsMissile(u.kind) || u.alive == 0 || u.stance == ST_PRONE) continue;
    u.reload -= P.dt;
    if (u.reload > 0) continue;
    if (w.tick - u.lastEngagedTick < 20) continue;
    float range, maxR, hitP, dmg, reloadT;
    switch (u.kind) {
      case K_XBOW: range = P.xbowRange; maxR = P.xbowMax; hitP = P.xbowHit; dmg = P.xbowDmg; reloadT = P.xbowReload; break;
      case K_HXBOW: range = P.hxbowRange; maxR = P.hxbowMax; hitP = P.hxbowHit; dmg = P.hxbowDmg; reloadT = P.hxbowReload; break;
      default: range = P.bowRange; maxR = P.bowMax; hitP = P.bowHit; dmg = P.bowDmg; reloadT = P.bowReload; break;
    }
    int tgt = u.fireTarget;
    if (tgt < 0 || w.units[tgt].alive == 0 || hypotf(w.units[tgt].cx - u.cx, w.units[tgt].cy - u.cy) > maxR) tgt = nearestEnemyUnit(u.id, maxR);
    if (tgt < 0) { u.reload = 1.f; continue; }
    const Unit& T = w.units[tgt];
    float dist = hypotf(T.cx - u.cx, T.cy - u.cy);
    if (dist < P.missileMinRange) { u.reload = 1.f; continue; }
    float rangeMul = dist <= range ? 1.f : std::max(0.f, (maxR - dist) / (maxR - range));
    float sigma = dist * P.volleySpread + 2.f;
    int shots = 0, hits = 0;
    for (int id : u.members) {
      if (s.state[id] != S_FORMED) continue;
      shots++;
      float ax = T.cx + w.rng.gauss() * sigma, ay = T.cy + w.rng.gauss() * sigma;
      int best = -1; float bd = 2.25f;
      grid.forNear(ax, ay, 1.5f, [&](int j) { if (s.side[j] == u.side) return; float dx = s.x[j] - ax, dy = s.y[j] - ay, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = j; } });
      if (best < 0) continue;
      float p = hitP * rangeMul;
      const Unit& tu = w.units[s.unit[best]];
      float ix = u.cx - s.x[best], iy = u.cy - s.y[best], il = hypotf(ix, iy); float cosA = il > 1e-4f ? (ix * tu.fx + iy * tu.fy) / il : 1.f;
      if ((s.flags[best] & 1) && cosA > 0.3f && s.state[best] == S_FORMED) p *= (1.f - P.shieldArrow);
      if (s.state[best] == S_ROUT) p *= 1.5f;
      if (w.rng.uni() >= p) continue;
      float red = P.armorArrow[s.armor[best]]; if (u.kind == K_HXBOW) red *= P.hxbowArmorBreak;
      if (s.flags[best] & 32) red = std::max(red, P.horseArmorArrow);
      s.hp[best] += dmg * (1.f - red);
      hits++;
      if (s.hp[best] >= P.hp) applyDown(best, u.members[0], true);
    }
    u.reload = reloadT * w.rng.range(0.9f, 1.1f);
    if (shots >= 200 && hits * 10 >= shots) log(u.name + "齐射，所中必倒");
  }
}

void Sim::moraleAndRout() {
  const Params& P = w.P; auto& s = w.s; size_t n = s.size();
  for (size_t i = 0; i < n; i++) {
    if (s.state[i] >= S_WOUNDED) continue;
    uint8_t sd = s.side[i];
    int d = grid.sumEvents(grid.deaths[sd], s.x[i], s.y[i], 4.f), r = grid.sumEvents(grid.routs[sd], s.x[i], s.y[i], 4.f);
    if (d | r) {
      const Unit& u = w.units[s.unit[i]];
      float scale = (w.tick - u.lastEngagedTick < 50 ? 1.f : P.contagionIdle) * (1.f - P.contagionCohesion * u.cohesion);
      if (d) s.morale[i] -= std::min(2, d) * P.mDeathNear * scale;
      if (r) s.morale[i] -= std::min(2, r) * P.mRoutNear * scale;
    }
    s.morale[i] = clampf(s.morale[i], -50.f, 100.f);
  }
  grid.clearEvents();
  for (size_t i = 0; i < n; i++) {
    if (s.state[i] >= S_WOUNDED) continue;
    Unit& u = w.units[s.unit[i]];
    float th = (s.flags[i] & 8) ? P.moraleThresholdElite : P.moraleThreshold;
    if (s.state[i] != S_ROUT && s.morale[i] < th) {
      s.state[i] = S_ROUT; s.target[i] = -1; u.routed++; w.sides[s.side[i]].routed++;
      int c = grid.cellOf[i]; if (c >= 0) grid.routs[s.side[i]][c]++;
      squadHit((int)i, P.mRoutSquad);
    } else if (s.state[i] == S_ROUT) {
      // 收拢：远离敌 150 m、军候尚在、曲未溃
      int e = nearestEnemyUnit(u.id, P.rallyDist);
      if (e < 0 && u.officerAlive && s.morale[i] > -20.f) {
        s.morale[i] = std::max(s.morale[i], P.rallyMorale); s.state[i] = S_RALLY; u.routed--; w.sides[s.side[i]].routed--;
      } else s.morale[i] = std::min(s.morale[i] + P.mRecover * 0.5f, th + 5.f);
    }
  }
}

void Sim::updateUnitsPost() {
  const Params& P = w.P; auto& s = w.s;
  std::vector<int> alive(w.units.size(), 0), inSlot(w.units.size(), 0), routed(w.units.size(), 0), balk(w.units.size(), 0);
  std::vector<float> msum(w.units.size(), 0), fsum(w.units.size(), 0);
  for (size_t i = 0; i < s.size(); i++) {
    if (s.state[i] >= S_WOUNDED) continue;
    int u = s.unit[i];
    if (s.state[i] == S_ROUT) { routed[u]++; continue; }
    alive[u]++; msum[u] += s.morale[i]; fsum[u] += s.fatigue[i];
    float wx, wy; slotWorld(w.units[u], s.slot[i], wx, wy);
    float dx = wx - s.x[i], dy = wy - s.y[i]; if (dx * dx + dy * dy < P.slotTol * P.slotTol) inSlot[u]++;
    if (engaged[i] == 1) w.units[u].lastEngagedTick = w.tick;
    if (engaged[i] == 2) balk[u]++;
  }
  for (int sd = 0; sd < 2; sd++) { w.sides[sd].alive = 0; }
  for (auto& u : w.units) {
    u.alive = alive[u.id]; u.routed = routed[u.id]; u.balking = balk[u.id]; u.balkTicks = u.balking > 0 ? u.balkTicks + 1 : 0;
    u.cohesion = u.alive ? (float)inSlot[u.id] / u.alive : 0.f;
    u.moraleAvg = u.alive ? msum[u.id] / u.alive : 0.f;
    unitFatigue[u.id] = u.alive ? fsum[u.id] / u.alive : 0.f;
    w.sides[u.side].alive += u.alive;
    int total = u.alive + u.routed;
    if (!u.broken && total > 0 && u.routed > P.unitBrokenFrac * total && u.routed >= 10) {
      u.broken = true; log(u.name + "溃");
      for (auto& v : w.units) if (v.id != u.id && v.side == u.side && v.part == u.part && !v.broken)
        for (int j : v.members) if (s.state[j] < S_WOUNDED) s.morale[j] -= P.mSiblingBroken;
    }
    if (u.broken && total > 0 && u.routed < 0.2f * total) u.broken = false;
    // 侧后敌骑（每秒一次）
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
      int brokenN = 0, unitsN = 0; for (auto& u : w.units) if (u.side == sd && u.members.size() > 50) { unitsN++; if (u.broken || u.alive + u.routed == 0) brokenN++; }
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
  grid.build(w.s); lap(1);
  std::fill(engaged.begin(), engaged.end(), 0);
  pool->parallelFor((int)w.s.size(), [this](int b, int e, int t) { soldierPhase(b, e, t); });
  std::swap(w.s.x, nx); std::swap(w.s.y, ny); lap(2);
  resolveAttacks(); lap(3);
  volleys(); lap(4);
  moraleAndRout();
  updateUnitsPost(); lap(5);
  lastStepMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
}

int Sim::unitAt(float x, float y, float r) const {
  int best = -1; float bd = r * r;
  for (auto& u : w.units) { if (u.alive == 0) continue; float dx = u.cx - x, dy = u.cy - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = u.id; } }
  if (best >= 0) return best;
  // 点在士卒上
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
