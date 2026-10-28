#pragma once
#include <cstdint>
// 确定性随机：xoshiro128**（同种子同结果）
struct Rng {
  uint32_t s[4];
  explicit Rng(uint32_t seed = 1) { seed_(seed); }
  void seed_(uint32_t seed) {
    uint32_t z = seed ? seed : 0x9E3779B9u;
    for (int i = 0; i < 4; i++) { z += 0x9E3779B9u; uint32_t t = z; t = (t ^ (t >> 16)) * 0x85EBCA6Bu; t = (t ^ (t >> 13)) * 0xC2B2AE35u; s[i] = t ^ (t >> 16); }
  }
  static inline uint32_t rotl(uint32_t x, int k) { return (x << k) | (x >> (32 - k)); }
  inline uint32_t next() {
    uint32_t r = rotl(s[1] * 5, 7) * 9, t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11);
    return r;
  }
  inline float uni() { return (next() >> 8) * (1.0f / 16777216.0f); }     // [0,1)
  inline float range(float a, float b) { return a + (b - a) * uni(); }
  inline int below(int n) { return (int)(uni() * n); }
  inline float gauss() { float u = uni() + 1e-7f, v = uni(); return sqrtf(-2.f * logf(u)) * cosf(6.2831853f * v); }
};
#include <cmath>
