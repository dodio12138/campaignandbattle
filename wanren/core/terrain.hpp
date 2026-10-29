// 地形：固定 10 m 网格，高程 + 类型（旷野 / 林 / 水 / 渡口 / 沼）。与近邻网格无关
#pragma once
#include <vector>
#include <cstdint>
#include <cmath>
#include <algorithm>

enum TerrainType : uint8_t { T_OPEN, T_FOREST, T_WATER, T_FORD, T_MARSH, T_COUNT };
inline const char* terrainName(uint8_t t) { static const char* n[] = {"旷野", "林", "水", "渡口", "沼泽"}; return t < T_COUNT ? n[t] : "?"; }

struct Terrain {
  float cell = 10.f; int w = 1, h = 1; float worldW = 3000, worldH = 3000;
  std::vector<float> height; std::vector<uint8_t> type;
  std::vector<std::pair<float, float>> fords;   // 渡口中心（供绕行）
  void init(float W, float H) { worldW = W; worldH = H; w = (int)(W / cell) + 1; h = (int)(H / cell) + 1; height.assign((size_t)w * h, 0.f); type.assign((size_t)w * h, T_OPEN); fords.clear(); }
  inline int ix(float x) const { int c = (int)(x / cell); return c < 0 ? 0 : (c >= w ? w - 1 : c); }
  inline int iy(float y) const { int c = (int)(y / cell); return c < 0 ? 0 : (c >= h ? h - 1 : c); }
  inline float heightAt(float x, float y) const { return height[(size_t)iy(y) * w + ix(x)]; }
  inline uint8_t typeAt(float x, float y) const { return type[(size_t)iy(y) * w + ix(x)]; }
  inline bool blocked(float x, float y) const { return typeAt(x, y) == T_WATER; }
  // 速度倍率（类型）
  static inline float speedMul(uint8_t t) { switch (t) { case T_FOREST: return 0.6f; case T_FORD: return 0.4f; case T_MARSH: return 0.5f; case T_WATER: return 0.f; default: return 1.f; } }
  // 沿方向 (dx,dy)（单位向量）的坡度：每米升高米数
  inline float slope(float x, float y, float dx, float dy) const { float h0 = heightAt(x, y), h1 = heightAt(x + dx * cell, y + dy * cell); return (h1 - h0) / cell; }
  // —— 生成 ——
  void hill(float cx, float cy, float r, float hgt) { for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) { float dx = (i + 0.5f) * cell - cx, dy = (j + 0.5f) * cell - cy, d = sqrtf(dx * dx + dy * dy); if (d < r) { float t = 1.f - d / r; height[(size_t)j * w + i] += hgt * t * t * (3 - 2 * t); } } }
  void ridge(float x0, float y0, float x1, float y1, float halfW, float hgt) { for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) { float px = (i + 0.5f) * cell, py = (j + 0.5f) * cell; float d = distSeg(px, py, x0, y0, x1, y1); if (d < halfW) { float t = 1.f - d / halfW; height[(size_t)j * w + i] += hgt * t * t * (3 - 2 * t); } } }
  void patch(uint8_t t, float cx, float cy, float r) { for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) { float dx = (i + 0.5f) * cell - cx, dy = (j + 0.5f) * cell - cy; if (dx * dx + dy * dy < r * r) type[(size_t)j * w + i] = t; } }
  void rect(uint8_t t, float x0, float y0, float x1, float y1) { for (int j = iy(y0); j <= iy(y1); j++) for (int i = ix(x0); i <= ix(x1); i++) type[(size_t)j * w + i] = t; }
  // 河：折线，宽 width；fordAt 为沿线的渡口位置（0–1 参数）
  void river(const std::vector<std::pair<float, float>>& pts, float width, const std::vector<float>& fordAt, float fordLen = 30.f) {
    float total = 0; std::vector<float> cum{0}; for (size_t k = 1; k < pts.size(); k++) { total += hypotf(pts[k].first - pts[k - 1].first, pts[k].second - pts[k - 1].second); cum.push_back(total); }
    for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) {
      float px = (i + 0.5f) * cell, py = (j + 0.5f) * cell; float best = 1e9f, bestS = 0;
      for (size_t k = 1; k < pts.size(); k++) { float sParam; float d = distSegParam(px, py, pts[k - 1].first, pts[k - 1].second, pts[k].first, pts[k].second, sParam); if (d < best) { best = d; bestS = cum[k - 1] + sParam * (cum[k] - cum[k - 1]); } }
      if (best < width * 0.5f) { bool ford = false; for (float f : fordAt) if (fabsf(bestS - f * total) < fordLen * 0.5f) ford = true; type[(size_t)j * w + i] = ford ? T_FORD : T_WATER; height[(size_t)j * w + i] -= 2.f; }
    }
    for (float f : fordAt) { float sT = f * total; for (size_t k = 1; k < pts.size(); k++) if (sT <= cum[k]) { float t = (sT - cum[k - 1]) / std::max(1e-3f, cum[k] - cum[k - 1]); fords.push_back({pts[k - 1].first + (pts[k].first - pts[k - 1].first) * t, pts[k - 1].second + (pts[k].second - pts[k - 1].second) * t}); break; } }
  }
  static float distSegParam(float px, float py, float x0, float y0, float x1, float y1, float& t) { float vx = x1 - x0, vy = y1 - y0, l2 = vx * vx + vy * vy; t = l2 > 1e-6f ? std::clamp(((px - x0) * vx + (py - y0) * vy) / l2, 0.f, 1.f) : 0.f; float cx = x0 + vx * t, cy = y0 + vy * t; return hypotf(px - cx, py - cy); }
  static float distSeg(float px, float py, float x0, float y0, float x1, float y1) { float t; return distSegParam(px, py, x0, y0, x1, y1, t); }
};
