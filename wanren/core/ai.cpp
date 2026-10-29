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
    if (u.guard) {   // 麾下：随全军重心之后 100 m，不主动接战
      float gx = mcx - adx * 100.f, gy = mcy - ady * 100.f;
      if (!engaged && hypotf(gx - u.cx, gy - u.cy) > 30.f && u.stance == ST_HOLD) sim.issue(u.id, {O_MOVE, gx, gy});
      continue;
    }
    if (kindIsMissile(u.kind) && u.outOfAmmo) continue;   // 矢尽者由核心自退到步兵身后
    if (kindIsMissile(u.kind) && !kindIsCav(u.kind)) {
      float range = u.kind == K_HXBOW ? P.hxbowRange : u.kind == K_XBOW ? P.xbowRange : P.bowRange;
      // 护弩：敌骑逼近（120 m 内且正向我来）→ 最近的本方步兵曲扑上拦截，弩手退到它身后
      int cavThreat = -1; float cavD = 120.f;
      for (auto& v : w.units) { if (v.side == side || !kindIsCav(v.kind) || v.alive < 10) continue; float dx = u.cx - v.cx, dy = u.cy - v.cy, dd = hypotf(dx, dy); if (dd < cavD && (dx * v.fx + dy * v.fy) / std::max(dd, 1.f) > 0.3f) { cavD = dd; cavThreat = v.id; } }
      if (cavThreat >= 0) {
        const Unit& C = w.units[cavThreat];
        int guard = -1; float gd = 150.f;
        for (auto& g : w.units) { if (g.side != side || kindIsMissile(g.kind) || kindIsCav(g.kind) || g.alive < 50 || g.stance == ST_PRONE || w.tick - g.lastEngagedTick < 30) continue; float dd = hypotf(g.cx - u.cx, g.cy - u.cy); if (dd < gd) { gd = dd; guard = g.id; } }
        if (guard >= 0) {
          const Unit& G = w.units[guard];
          if (G.stance != ST_CHARGE) sim.issue(guard, {O_CHARGE, C.cx, C.cy});
          if (!engaged && d > 15.f) { float bx = G.cx - adx * (G.hy + u.hy + 8.f), by = G.cy - ady * (G.hy + u.hy + 8.f); if (hypotf(bx - u.cx, by - u.cy) > 10.f) sim.issue(u.id, {O_MOVE, bx, by, 1}); }   // 平移退到步兵身后
          continue;
        }
      }
      if (d < 30.f && !engaged) { sim.issue(u.id, {O_RETREAT, u.cx - adx * 80.f, u.cy - ady * 80.f}); }
      else if (d > range * 0.9f && u.stance == ST_HOLD) { sim.issue(u.id, {O_MOVE, u.cx + adx * (d - range * 0.8f), u.cy + ady * (d - range * 0.8f)}); if (u.formation != F_LINE) sim.issue(u.id, {O_FORMATION, 0, 0, F_LINE}); }
      continue;
    }
    if (u.kind == K_CAV_BOW) {
      // 弓骑：游射循环由 cavalryBrain 执行，这里只在空闲时指定目标（优先远程 / 松动的敌曲）
      if (u.cavPhase != CP_NONE) continue;
      int best = -1; float bs = -1e9f;
      for (auto& v : w.units) { if (v.side == side || v.alive < 5 || v.stance == ST_PRONE) continue; float dd = hypotf(v.cx - u.cx, v.cy - u.cy); float score = -dd * 0.1f + (kindIsMissile(v.kind) ? 20.f : 0.f) + (v.cohesion < 0.5f ? 15.f : 0.f) - (kindIsCav(v.kind) ? 25.f : 0.f); if (score > bs) { bs = score; best = v.id; } }
      if (best >= 0) sim.issue(u.id, {O_FIRE, 0, 0, best});
      continue;
    }
    if (kindIsCav(u.kind)) {
      // 突骑：冲击循环由 cavalryBrain 执行；空闲时选目标（松动 / 侧背暴露 / 远程 / 溃的敌曲），否则绕到侧翼待机
      if (u.cavPhase != CP_NONE) continue;
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
        if (kindIsLong(v.kind) && v.cohesion > P.form[v.formation].balkCoh && cosA < -0.3f) score -= 60;
        score -= dd * 0.08f;
        if (score > bs) { bs = score; best = v.id; }
      }
      if (best >= 0 && bs > 10.f) { const Unit& V = w.units[best]; sim.issue(u.id, {O_CHARGE, V.cx, V.cy, best}); }
      else if (u.stance == ST_HOLD) {
        float side_ = (u.id % 2 == 0) ? 1.f : -1.f;
        float tx = ecx + rx * side_ * 180.f - adx * 120.f, ty = ecy + ry * side_ * 180.f - ady * 120.f;
        if (hypotf(tx - u.cx, ty - u.cy) > 30.f) sim.issue(u.id, {O_MOVE, tx, ty});
      }
      continue;
    }
    // 步兵主力：敌骑在侧而敌步兵未近 → 改数阵（密集，骑兵勒马门槛低）；敌步兵逼近或无骑威胁 → 回方阵
    {
      float nearFoot = 1e9f; for (auto& v : w.units) if (v.side != side && v.alive > 10 && !kindIsCav(v.kind) && v.stance != ST_PRONE) nearFoot = std::min(nearFoot, hypotf(v.cx - u.cx, v.cy - u.cy));
      if (u.cavThreat && nearFoot > 120.f && u.formation != F_DENSE && !engaged) { sim.issue(u.id, {O_FORMATION, 0, 0, F_DENSE}); continue; }
      if (u.formation == F_DENSE && (!u.cavThreat || nearFoot < 80.f) && !engaged) { sim.issue(u.id, {O_FORMATION, 0, 0, F_SQUARE}); continue; }
    }
    if (d < 45.f && !engaged) { if (u.stance != ST_CHARGE) sim.issue(u.id, {O_CHARGE, E.cx, E.cy}); }
    else if (!engaged && d < 400.f && u.stance == ST_HOLD) sim.issue(u.id, {O_MOVE, E.cx, E.cy});
    else if (!engaged && u.stance == ST_HOLD) sim.issue(u.id, {O_MOVE, u.cx + adx * 150.f, u.cy + ady * 150.f});
  }
}
