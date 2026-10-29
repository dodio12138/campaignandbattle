#pragma once
#include "world.hpp"
// 生成阵形槽位（局部坐标：x 向右，y 向前；第 0 槽在前排左端；军候在末排中央）
void buildSlots(Unit& u, const Params& P);
// 槽位的世界坐标（含让路开口：开口范围内的槽位推到开口两侧）
inline void slotWorld(const Unit& u, int slot, float& wx, float& wy) {
  float lx = u.slotX[slot], ly = u.slotY[slot];
  if (u.gapTimer > 0.f) { float d = lx - u.gapX; if (d > -u.gapHW && d < u.gapHW) lx = u.gapX + (d >= 0 ? u.gapHW : -u.gapHW) + (d >= 0 ? 1.f : -1.f) * (u.gapHW - (d >= 0 ? d : -d)) * 0.3f; }
  if (u.formation == F_WAVE && !u.waveY.empty()) ly += u.waveY[u.slotWave[slot]];
  // 朝向 (fx,fy)：前 = (fx,fy)，右 = (fy,-fx)
  wx = u.cx + lx * u.fy + ly * u.fx;
  wy = u.cy - lx * u.fx + ly * u.fy;
}
