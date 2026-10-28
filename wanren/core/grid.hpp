// 均匀网格 + 计数排序：每 tick 重建；同格士卒在 order 数组里连续
#pragma once
#include <vector>
#include <cstdint>
#include "world.hpp"

struct Grid {
  float cell = 4.f, invCell = 0.25f; int w = 0, h = 0;
  std::vector<int32_t> cellStart;   // 大小 w*h+1
  std::vector<int32_t> order;       // 按格排序的士卒下标
  std::vector<int32_t> cellOf;      // 每个士卒所在格（-1 = 不在网格）
  std::vector<int32_t> counts;
  // 事件计数（士气传播用）：每格每方的阵亡 / 逃走数
  std::vector<uint16_t> deaths[2], routs[2];

  void init(const Params& P) {
    cell = P.cellSize; invCell = 1.f / cell;
    w = (int)(P.worldW * invCell) + 1; h = (int)(P.worldH * invCell) + 1;
    cellStart.assign(w * h + 1, 0); counts.assign(w * h, 0);
    for (int sd = 0; sd < 2; sd++) { deaths[sd].assign(w * h, 0); routs[sd].assign(w * h, 0); }
  }
  inline int cx(float x) const { int c = (int)(x * invCell); return c < 0 ? 0 : (c >= w ? w - 1 : c); }
  inline int cy(float y) const { int c = (int)(y * invCell); return c < 0 ? 0 : (c >= h ? h - 1 : c); }
  inline int idx(float x, float y) const { return cy(y) * w + cx(x); }

  void build(const Soldiers& s) {
    size_t n = s.size();
    cellOf.resize(n);
    std::fill(counts.begin(), counts.end(), 0);
    for (size_t i = 0; i < n; i++) {
      if (s.state[i] >= S_WOUNDED) { cellOf[i] = -1; continue; }
      int c = idx(s.x[i], s.y[i]); cellOf[i] = c; counts[c]++;
    }
    int acc = 0;
    for (int c = 0; c < w * h; c++) { cellStart[c] = acc; acc += counts[c]; }
    cellStart[w * h] = acc;
    order.resize(acc);
    std::fill(counts.begin(), counts.end(), 0);
    for (size_t i = 0; i < n; i++) { int c = cellOf[i]; if (c < 0) continue; order[cellStart[c] + counts[c]++] = (int32_t)i; }
  }
  void clearEvents() { for (int sd = 0; sd < 2; sd++) { std::fill(deaths[sd].begin(), deaths[sd].end(), 0); std::fill(routs[sd].begin(), routs[sd].end(), 0); } }

  // 遍历 (x,y) 周围 r 米内的格子中的士卒
  template <class F> inline void forNear(float x, float y, float r, F&& f) const {
    int x0 = cx(x - r), x1 = cx(x + r), y0 = cy(y - r), y1 = cy(y + r);
    for (int yy = y0; yy <= y1; yy++) for (int xx = x0; xx <= x1; xx++) {
      int c = yy * w + xx; for (int k = cellStart[c]; k < cellStart[c + 1]; k++) f(order[k]);
    }
  }
  inline int sumEvents(const std::vector<uint16_t>& ev, float x, float y, float r) const {
    int x0 = cx(x - r), x1 = cx(x + r), y0 = cy(y - r), y1 = cy(y + r), sum = 0;
    for (int yy = y0; yy <= y1; yy++) for (int xx = x0; xx <= x1; xx++) sum += ev[yy * w + xx];
    return sum;
  }
};
