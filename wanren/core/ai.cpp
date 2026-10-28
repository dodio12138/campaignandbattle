#include "ai.hpp"
#include <cmath>
#include <algorithm>

static void centroid(const Sim& sim, int side, float& cx, float& cy, bool& any) {
  double sx = 0, sy = 0; int n = 0;
  for (auto& u : sim.w.units) if (u.side == side && u.alive > 0 && u.stance != ST_PRONE) { sx += u.cx * u.alive; sy += u.cy * u.alive; n += u.alive; }
  any = n > 0; if (n) { cx = (float)(sx / n); cy = (float)(sy / n); }
}

void aiStep(Sim& sim, int side) {
  World& w = sim.w; Side& S = w.sides[side]; const Params& P = w.P;
  S.aiTimer -= P.dt; if (S.aiTimer > 0) return; S.aiTimer = 2.f;
  if (S.fled) return;
  float ecx, ecy; bool anyE; centroid(sim, 1 - side, ecx, ecy, anyE);
  float mcx, mcy; bool anyM; centroid(sim, side, mcx, mcy, anyM);
  if (!anyE || !anyM) return;
  // 整体前进方向
  float adx = ecx - mcx, ady = ecy - mcy, al = hypotf(adx, ady); if (al < 1e-3f) return; adx /= al; ady /= al;
  float rx = ady, ry = -adx;   // 右侧
  for (auto& u : w.units) {
    if (u.side != side || u.alive == 0 || u.stance == ST_PRONE || !u.orders.empty()) continue;
    int e = sim.nearestEnemyUnit(u.id, 1e9f); if (e < 0) continue;
    const Unit& E = w.units[e]; float d = hypotf(E.cx - u.cx, E.cy - u.cy);
    bool engaged = w.tick - u.lastEngagedTick < 30;
    if (kindIsMissile(u.kind) && !kindIsCav(u.kind)) {
      float range = u.kind == K_HXBOW ? P.hxbowRange : u.kind == K_XBOW ? P.xbowRange : P.bowRange;
      if (d < 30.f && !engaged) { sim.issue(u.id, {O_RETREAT, u.cx - adx * 80.f, u.cy - ady * 80.f}); }
      else if (d > range * 0.9f && u.stance == ST_HOLD) { sim.issue(u.id, {O_MOVE, u.cx + adx * (d - range * 0.8f), u.cy + ady * (d - range * 0.8f)}); if (u.formation != F_LINE) sim.issue(u.id, {O_FORMATION, 0, 0, F_LINE}); }
      continue;
    }
    if (u.kind == K_CAV_BOW) {
      // 弓骑：在 60 m 外游走射击
      if (d < 45.f) sim.issue(u.id, {O_RETREAT, u.cx + (u.cx - E.cx) / d * 40.f, u.cy + (u.cy - E.cy) / d * 40.f});
      else if (d > 75.f) sim.issue(u.id, {O_MOVE, E.cx + (u.cx - E.cx) / d * 60.f, E.cy + (u.cy - E.cy) / d * 60.f});
      continue;
    }
    if (kindIsCav(u.kind)) {
      // 勒马徘徊过多：撤回整队
      if (u.balkTicks > 30) { sim.issue(u.id, {O_RETREAT, u.cx - adx * 150.f, u.cy - ady * 150.f}); u.balkTicks = 0; continue; }
      // 突骑：找松动 / 侧背暴露 / 远程 / 溃的敌曲
      int best = -1; float bs = -1e9f;
      for (auto& v : w.units) {
        if (v.side == side || v.alive < 5 || v.stance == ST_PRONE) continue;
        float dx = v.cx - u.cx, dy = v.cy - u.cy, dd = hypotf(dx, dy); if (dd < 1e-3f) continue;
        float cosA = (dx * v.fx + dy * v.fy) / dd;   // >0 = 我在它后方
        float score = 0;
        if (v.broken || v.routed > v.alive) score += 50;
        if (v.cohesion < 0.5f) score += 30;
        if (kindIsMissile(v.kind)) score += 25;
        if (cosA > 0.3f) score += 35; else if (cosA > -0.3f) score += 15;
        if (kindIsLong(v.kind) && v.cohesion > P.cavBalkCohesion && cosA < -0.3f) score -= 60;
        score -= dd * 0.08f;
        if (score > bs) { bs = score; best = v.id; }
      }
      if (best >= 0 && bs > 10.f) { const Unit& V = w.units[best]; if (u.stance != ST_CHARGE || hypotf(u.gx - V.cx, u.gy - V.cy) > 15.f) sim.issue(u.id, {O_CHARGE, V.cx, V.cy}); }
      else if (u.stance == ST_HOLD) {
        // 绕到侧翼待机
        float side_ = (u.id % 2 == 0) ? 1.f : -1.f;
        float tx = ecx + rx * side_ * 180.f - adx * 120.f, ty = ecy + ry * side_ * 180.f - ady * 120.f;
        if (hypotf(tx - u.cx, ty - u.cy) > 30.f) sim.issue(u.id, {O_MOVE, tx, ty});
      }
      continue;
    }
    // 步兵主力
    if (d < 45.f && !engaged) { if (u.stance != ST_CHARGE) sim.issue(u.id, {O_CHARGE, E.cx, E.cy}); }
    else if (!engaged && d < 400.f && u.stance == ST_HOLD) sim.issue(u.id, {O_MOVE, E.cx, E.cy});
    else if (!engaged && u.stance == ST_HOLD) sim.issue(u.id, {O_MOVE, u.cx + adx * 150.f, u.cy + ady * 150.f});
  }
}
