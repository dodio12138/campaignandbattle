#include "ai.hpp"
#include <cmath>
#include <algorithm>

// 两点之间是否隔着马过不去的地形（车营 / 水）
static bool pathBlocked(const World& w, float x0, float y0, float x1, float y1, bool cav) {
  float dx = x1 - x0, dy = y1 - y0, L = hypotf(dx, dy); if (L < 1.f) return false;
  for (float t = 10.f; t < L - 10.f; t += 8.f) if (w.terrain.blockedFor(x0 + dx / L * t, y0 + dy / L * t, cav)) return true;
  return false;
}

static void centroid(const Sim& sim, int side, float& cx, float& cy, bool& any) {
  double sx = 0, sy = 0; int n = 0;
  for (auto& u : sim.w.units) if (u.side == side && u.alive > 0 && u.stance != ST_PRONE) { sx += u.cx * u.alive; sy += u.cy * u.alive; n += u.alive; }
  any = n > 0; if (n) { cx = (float)(sx / n); cy = (float)(sy / n); }
}

void aiStep(Sim& sim, int side) {
  World& w = sim.w; Side& S = w.sides[side]; const Params& P = w.P;
  S.aiTimer -= P.dt; if (S.aiTimer > 0) return;
  S.aiTimer = 1.f + (100 - S.command) / 40.f;   // 统帅高者议定快（90 → 1.25 s，50 → 2.25 s）
  if (S.fled) return;
  // 守待敌乱：敌军折损（亡伤降溃）过两成、或敌骑过半曲溃，则转入反击（乘乱击之）
  const Side& ES = w.sides[1 - side];
  bool defend = S.posture == 1 && !S.counter;
  if (defend) {
    int lost = ES.dead + ES.wounded + ES.captured + ES.routed;
    int cavU = 0, cavBroken = 0; for (auto& v : w.units) if (v.side != side && kindIsCav(v.kind) && v.kind != K_CAV_BOW && v.members.size() > 50) { cavU++; if (v.broken || v.alive < (int)v.members.size() / 3) cavBroken++; }   // 只看突骑（弓骑游走不决胜负）
    if ((ES.total > 0 && lost > 0.2f * ES.total) || (cavU > 0 && cavBroken * 5 >= cavU * 2)) { S.counter = true; defend = false; sim.log(S.name + "见敌阵动摇，纵兵乘之"); }
  }
  const float leash = 280.f;   // 守势时只与阵地 280 m 内之敌交锋
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
    if (u.guard) {   // 麾下：随全军重心之后 100 m（守势时守原处），不主动接战
      float gx = defend ? u.homeX : mcx - adx * 100.f, gy = defend ? u.homeY : mcy - ady * 100.f;
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
      else if (!defend && d > range * 0.9f && u.stance == ST_HOLD) { sim.issue(u.id, {O_MOVE, u.cx + adx * (d - range * 0.8f), u.cy + ady * (d - range * 0.8f)}); if (u.formation != F_LINE) sim.issue(u.id, {O_FORMATION, 0, 0, F_LINE}); }
      else if (defend && u.stance == ST_HOLD && hypotf(u.homeX - u.cx, u.homeY - u.cy) > 25.f) sim.issue(u.id, {O_MOVE, u.homeX, u.homeY, 1});   // 守势：回原位，平移不转身
      continue;
    }
    if (u.kind == K_CAV_BOW) {
      // 弓骑：游射循环由 cavalryBrain 执行，这里只在空闲时指定目标（优先远程 / 松动的敌曲）
      if (u.cavPhase != CP_NONE) continue;
      int best = -1; float bs = -1e9f;
      for (auto& v : w.units) { if (v.side == side || v.alive < 5 || v.stance == ST_PRONE) continue; if (defend && hypotf(v.cx - S.ax, v.cy - S.ay) > leash) continue; float dd = hypotf(v.cx - u.cx, v.cy - u.cy); float score = -dd * 0.1f + (kindIsMissile(v.kind) ? 20.f : 0.f) + (v.cohesion < 0.5f ? 15.f : 0.f) - (kindIsCav(v.kind) ? 25.f : 0.f); if (score > bs) { bs = score; best = v.id; } }
      if (best >= 0) sim.issue(u.id, {O_FIRE, 0, 0, best});
      else if (defend && u.stance == ST_HOLD && hypotf(u.homeX - u.cx, u.homeY - u.cy) > 30.f) sim.issue(u.id, {O_MOVE, u.homeX, u.homeY});
      continue;
    }
    if (kindIsCav(u.kind)) {
      // 突骑：冲击循环由 cavalryBrain 执行；空闲时选目标（松动 / 侧背暴露 / 远程 / 溃的敌曲），否则绕到侧翼待机
      if (u.cavPhase != CP_NONE) continue;
      int best = -1; float bs = -1e9f;
      bool arrogant = S.trait == 1, wise = S.intellect >= 70;
      for (auto& v : w.units) {
        if (v.side == side || v.alive < 5) continue;
        bool prone = v.stance == ST_PRONE;
        if (prone && wise) continue;                                   // 智者识破伏兵，不往伏处撞
        if (defend && hypotf(v.cx - S.ax, v.cy - S.ay) > leash) continue;
        if (pathBlocked(w, u.cx, u.cy, v.cx, v.cy, true)) continue;   // 隔着车营 / 水冲不过去
        float dx = v.cx - u.cx, dy = v.cy - u.cy, dd = hypotf(dx, dy); if (dd < 1e-3f) continue;
        float cosA = (dx * v.fx + dy * v.fy) / dd;   // >0 = 我在它后方
        float score = 0;
        if (v.broken || v.routed > v.alive) score += 50;
        if (v.cohesion < 0.5f) score += 30;
        if (kindIsMissile(v.kind)) score += 25;
        if (cosA > 0.3f) score += 35; else if (cosA > -0.3f) score += 15;
        bool wall = (kindIsLong(v.kind) || v.shield) && v.cohesion > P.form[v.formation].balkCoh && cosA < -0.3f;
        if (wall && !prone) score -= arrogant ? 20.f : 60.f;           // 骄将不把正面坚阵当回事
        if (wise && !arrogant && cosA < -0.3f && v.cohesion > 0.7f && v.moraleAvg > 55.f && w.tick - v.lastEngagedTick > 30) score -= 40.f;   // 智将不正面撞完整未战之阵（击便寇）
        if (arrogant) { score -= dd * 0.04f; if (prone) score += 60.f; else if (v.alive < 400) score += 10.f; }   // 见其兵少，便放骑欲陵蹈之：伏在阵前的先登看上去最少
        else score -= dd * 0.08f;
        if (score > bs) { bs = score; best = v.id; }
      }
      if (best >= 0 && bs > 10.f) { const Unit& V = w.units[best]; sim.issue(u.id, {O_CHARGE, V.cx, V.cy, best}); }
      else if (defend) { if (u.stance == ST_HOLD && hypotf(u.homeX - u.cx, u.homeY - u.cy) > 30.f) sim.issue(u.id, {O_MOVE, u.homeX, u.homeY}); }
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
    if (defend) {   // 守势：不出阵，敌贴近（25 m）才就地迎击；邻近友曲恶战则上前相救；否则回原位列阵待敌
      int help = -1; float hd = 150.f;
      for (auto& f : w.units) { if (f.side != side || f.id == u.id || f.alive < 30 || w.tick - f.lastEngagedTick > 20 || f.moraleAvg > 60.f) continue; float dd = hypotf(f.cx - u.cx, f.cy - u.cy); if (dd < hd) { hd = dd; help = f.id; } }
      if (help >= 0 && !engaged && !u.cavThreat) {
        int fe = sim.nearestEnemyUnit(help, 80.f);
        if (fe >= 0 && !pathBlocked(w, u.cx, u.cy, w.units[fe].cx, w.units[fe].cy, true)) { if (u.stance != ST_CHARGE && u.attackTarget != fe) sim.issue(u.id, {O_ATTACK, 0, 0, fe}); continue; }
      }
      if (d - E.hy - u.hy < 25.f && !engaged && !pathBlocked(w, u.cx, u.cy, E.cx, E.cy, true)) { if (u.stance != ST_CHARGE) sim.issue(u.id, {O_CHARGE, E.cx, E.cy}); }
      else if (!engaged && u.stance == ST_HOLD && hypotf(u.homeX - u.cx, u.homeY - u.cy) > 20.f) sim.issue(u.id, {O_MOVE, u.homeX, u.homeY, 1});
      continue;
    }
    if (d < 45.f && !engaged) { if (u.stance != ST_CHARGE) sim.issue(u.id, {O_CHARGE, E.cx, E.cy}); }
    else if (!engaged && d < 400.f && u.stance == ST_HOLD) sim.issue(u.id, {O_ATTACK, 0, 0, e});
    else if (!engaged && u.stance == ST_HOLD) sim.issue(u.id, {O_MOVE, u.cx + adx * 150.f, u.cy + ady * 150.f});
  }
}
