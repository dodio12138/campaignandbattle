#include "formation.hpp"
#include <cmath>
#include <algorithm>

void buildSlots(Unit& u, const Params& P) {
  int n = (int)u.members.size();
  u.slotX.assign(n, 0); u.slotY.assign(n, 0);
  bool cav = kindIsCav(u.kind);
  float fg = cav ? P.cavFileGap : P.fileGap, rg = cav ? P.cavRankGap : P.rankGap;
  int files = std::max(1, u.files);
  switch (u.formation) {
    case F_DENSE: fg = cav ? P.cavFileGap * 0.85f : P.denseGap; rg = cav ? P.cavRankGap * 0.85f : P.denseGap * 1.4f; break;
    case F_LOOSE: fg = cav ? P.cavFileGap * 1.6f : P.looseGap; rg = cav ? P.cavRankGap * 1.4f : P.looseGap * 1.2f; break;
    case F_LINE:  files = std::max(1, (n + 2) / 3); break;
    case F_COLUMN: files = cav ? 4 : 5; break;
    default: break;
  }
  auto gridSlot = [&](int i, int f, float& x, float& y) { int r = i / f, c = i % f; int rowN = std::min(f, n - r * f); x = (c - (rowN - 1) * 0.5f) * fg; y = -r * rg; };

  if (u.formation == F_CIRCLE) {
    // 同心环，从外到内；外环面向外（朝向忽略，由士卒据位）
    int placed = 0; float r = 0.f; int ring = 0;
    std::vector<std::pair<float,float>> pts;
    while (placed < n) {
      float radius = std::max(1.0f, 0.f + ring * rg);
      int cnt = ring == 0 ? 1 : (int)std::floor(6.2831853f * radius / fg);
      cnt = std::min(cnt, n - placed);
      for (int k = 0; k < cnt; k++) { float a = 6.2831853f * k / cnt; pts.push_back({radius * cosf(a), radius * sinf(a)}); }
      placed += cnt; ring++;
    }
    // 外环先占（槽位从外向内编号，前排 = 外环）
    std::reverse(pts.begin(), pts.end());
    for (int i = 0; i < n; i++) { u.slotX[i] = pts[i].first; u.slotY[i] = pts[i].second; }
  } else if (u.formation == F_WEDGE) {
    // 锥形：第 r 排 1+2r 人（限 files），末不锐则不入
    int placed = 0, r = 0;
    while (placed < n) {
      int rowN = std::min({1 + 2 * r, files, n - placed});
      for (int c = 0; c < rowN; c++) { u.slotX[placed] = (c - (rowN - 1) * 0.5f) * fg; u.slotY[placed] = -r * rg; placed++; }
      r++;
    }
  } else if (u.formation == F_GOOSE) {
    // 雁行：两翼后掠 35°，便于交叉射击
    int ranks = std::max(1, (n + files - 1) / files);
    for (int i = 0; i < n; i++) {
      int r = i / files, c = i % files; int rowN = std::min(files, n - r * files);
      float x = (c - (rowN - 1) * 0.5f) * fg;
      u.slotX[i] = x; u.slotY[i] = -r * rg - fabsf(x) * 0.7f;
    }
    (void)ranks;
  } else {
    for (int i = 0; i < n; i++) gridSlot(i, files, u.slotX[i], u.slotY[i]);
  }
  // 重心归零（中心 = 槽位平均）
  double sx = 0, sy = 0; for (int i = 0; i < n; i++) { sx += u.slotX[i]; sy += u.slotY[i]; }
  if (n) { sx /= n; sy /= n; for (int i = 0; i < n; i++) { u.slotX[i] -= (float)sx; u.slotY[i] -= (float)sy; } }
  float hx = 2.f, hy = 2.f; for (int i = 0; i < n; i++) { hx = std::max(hx, fabsf(u.slotX[i])); hy = std::max(hy, fabsf(u.slotY[i])); }
  u.hx = hx; u.hy = hy; u.halfWidth = std::max(4.f, std::max(hx, hy));
  float fy = -1e9f; for (int i = 0; i < n; i++) fy = std::max(fy, u.slotY[i]); u.frontY = fy;
}
