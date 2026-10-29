// 均匀网格 + 计数排序：每 tick 按活人包围盒重建（格数只随战场实际范围走，不随世界大小走）
// 排序时顺便把邻居扫描要的热数据打包成 16 字节连续数组（Packed），按格顺序排列
#pragma once
#include <vector>
#include <cstdint>
#include <algorithm>
#include "world.hpp"
#include "pool.hpp"

struct Packed { float x, y; int32_t idx; uint16_t unit; uint8_t side, state; };

struct Grid {
  float cell = 4.f, invCell = 0.25f; float ox = 0, oy = 0; int w = 1, h = 1;
  std::vector<int32_t> cellStart;   // 大小 w*h+1
  std::vector<int32_t> order;       // 按格排序的士卒下标
  std::vector<Packed> packed;       // 与 order 同序
  std::vector<int32_t> cellOf;      // 每个士卒所在格（-1 = 不在网格）
  std::vector<int32_t> counts;
  std::vector<uint16_t> deaths[2], routs[2];   // 每格每方的阵亡 / 逃走事件数（士气传播用）
  std::vector<uint16_t> sideCount[2], routCount[2];   // 每格每方人数 / 溃兵数

  void init(const Params& P) { cell = P.cellSize; invCell = 1.f / cell; }
  inline int cx(float x) const { int c = (int)((x - ox) * invCell); return c < 0 ? 0 : (c >= w ? w - 1 : c); }
  inline int cy(float y) const { int c = (int)((y - oy) * invCell); return c < 0 ? 0 : (c >= h ? h - 1 : c); }
  inline int idx(float x, float y) const { return cy(y) * w + cx(x); }

  // bbox：活人的包围盒（外扩一格）。串行计数排序：两遍扫描 + 一次前缀和；试过原子并行版，前缀和与原子开销抵消了收益
  void build(const Soldiers& s, float minx, float miny, float maxx, float maxy, Pool* pool = nullptr) {
    ox = minx - cell; oy = miny - cell;
    w = std::max(1, (int)((maxx - ox) * invCell) + 2); h = std::max(1, (int)((maxy - oy) * invCell) + 2);
    size_t n = s.size(); int nc = w * h;
    cellOf.resize(n); counts.assign(nc, 0); cellStart.resize(nc + 1);
    for (size_t i = 0; i < n; i++) {
      if (s.state[i] >= S_WOUNDED) { cellOf[i] = -1; continue; }
      int c = idx(s.x[i], s.y[i]); cellOf[i] = c; counts[c]++;
    }
    int acc = 0;
    for (int c = 0; c < nc; c++) { cellStart[c] = acc; acc += counts[c]; counts[c] = 0; }
    cellStart[nc] = acc;
    order.resize(acc); packed.resize(acc);
    for (size_t i = 0; i < n; i++) {
      int c = cellOf[i]; if (c < 0) continue;
      int k = cellStart[c] + counts[c]++;
      order[k] = (int32_t)i;
      packed[k] = {s.x[i], s.y[i], (int32_t)i, (uint16_t)s.unit[i], s.side[i], s.state[i]};
    }
    for (int sd = 0; sd < 2; sd++) { if ((int)deaths[sd].size() != nc) { deaths[sd].assign(nc, 0); routs[sd].assign(nc, 0); } }   // 平时由 clearEvents 清零
    computeCellFlags(pool);
  }
  // 排序后按格顺序统计每格人数 / 溃兵数（顺序访问，按格块并行）；3×3 聚合由士卒自己做 18 次顺序读（试过预聚合成字节：遍历全部格子反而更贵）
  void computeCellFlags(Pool* pool) {
    int nc = w * h; const int B = 4096;
    for (int sd = 0; sd < 2; sd++) { sideCount[sd].resize(nc); routCount[sd].resize(nc); }
    auto par = [&](int blocks, const std::function<void(int)>& fn) { if (pool) pool->parallelBlocks(blocks, fn); else for (int b = 0; b < blocks; b++) fn(b); };
    par((nc + B - 1) / B, [&](int b) {
      int e = std::min(nc, (b + 1) * B);
      for (int c = b * B; c < e; c++) { uint16_t s0 = 0, s1 = 0, r0 = 0, r1 = 0; for (int k = cellStart[c]; k < cellStart[c + 1]; k++) { const Packed& p = packed[k]; if (p.side == 0) { s0++; if (p.state == S_ROUT) r0++; } else { s1++; if (p.state == S_ROUT) r1++; } } sideCount[0][c] = s0; sideCount[1][c] = s1; routCount[0][c] = r0; routCount[1][c] = r1; }
    });
  }
  void clearEvents() { for (int sd = 0; sd < 2; sd++) { std::fill(deaths[sd].begin(), deaths[sd].end(), 0); std::fill(routs[sd].begin(), routs[sd].end(), 0); } }

  // 遍历 (x,y) 周围 r 米内各格里的士卒（打包数据）
  template <class F> inline void forNear(float x, float y, float r, F&& f) const {
    int x0 = cx(x - r), x1 = cx(x + r), y0 = cy(y - r), y1 = cy(y + r);
    for (int yy = y0; yy <= y1; yy++) {
      int kb = cellStart[yy * w + x0], ke = cellStart[yy * w + x1 + 1];   // 同一行的连续格在 packed 里连续
      for (int k = kb; k < ke; k++) f(packed[k]);
    }
  }
  // 3×3 格内某计数之和（以格坐标给）
  inline int sum3(const std::vector<uint16_t>& ev, int c) const { int cxi = c % w, cyi = c / w, sum = 0; for (int yy = std::max(0, cyi - 1); yy <= std::min(h - 1, cyi + 1); yy++) for (int xx = std::max(0, cxi - 1); xx <= std::min(w - 1, cxi + 1); xx++) sum += ev[yy * w + xx]; return sum; }
  inline int sumEvents(const std::vector<uint16_t>& ev, float x, float y, float r) const {
    int x0 = cx(x - r), x1 = cx(x + r), y0 = cy(y - r), y1 = cy(y + r), sum = 0;
    for (int yy = y0; yy <= y1; yy++) for (int xx = x0; xx <= x1; xx++) sum += ev[yy * w + xx];
    return sum;
  }
};
