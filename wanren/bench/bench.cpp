// 基准：用法：wanren_bench [剧本 id] [tick 数] [线程数] [种子] [人数倍率]
#include "../core/sim.hpp"
#include "../core/ai.hpp"
#include "../core/scenario.hpp"
#include <cstdio>
#include <cstring>
#include <chrono>
#include <cmath>

int main(int argc, char** argv) {
  const char* id = argc > 1 ? argv[1] : "plain"; int ticks = argc > 2 ? atoi(argv[2]) : 3000; int threads = argc > 3 ? atoi(argv[3]) : 0; uint32_t seed = argc > 4 ? atoi(argv[4]) : 1; float scale = argc > 5 ? (float)atof(argv[5]) : 1.f;
  const ScenarioDef* sc = nullptr; for (auto& s : scenarios()) if (s.id == id) sc = &s;
  if (!sc) { printf("未知剧本 %s\n", id); return 1; }
  Sim sim(seed, threads); sim.w.P.load("params.txt");
  ScenarioDef def = *sc; def.aiSide[0] = def.aiSide[1] = true;   // AI 对 AI
  loadScenario(sim, def, 600.f * sqrtf(scale), scale);
  size_t n = sim.w.s.size();
  printf("剧本 %s，%zu 人，线程 %d\n", sc->title.c_str(), n, sim.pool->threads());
  auto t0 = std::chrono::steady_clock::now(); double maxMs = 0; int winner = -1; int t = 0;
  for (; t < ticks; t++) {
    for (int sd = 0; sd < 2; sd++) if (sim.w.sides[sd].ai) aiStep(sim, sd);
    sim.step(); if (sim.lastStepMs > maxMs) maxMs = sim.lastStepMs;
    if (sim.over(winner)) { t++; break; }
  }
  double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  printf("%d tick 用时 %.0f ms，平均 %.2f ms/tick（最慢 %.2f），每人每 tick %.0f ns\n", t, ms, ms / t, maxMs, ms * 1e6 / t / n);
  printf("分段耗时 ms/tick：令+军团 %.2f 网格 %.2f 士卒并行 %.2f 近战 %.2f 齐射 %.2f 士气统计 %.2f\n", sim.phaseMs[0]/t, sim.phaseMs[1]/t, sim.phaseMs[2]/t, sim.phaseMs[3]/t, sim.phaseMs[4]/t, sim.phaseMs[5]/t);
  printf("战场时间 %.1f 分钟；结局：%s\n", sim.w.time() / 60.f, winner < 0 ? "未决" : (sim.w.sides[winner].name + "胜").c_str());
  for (int sd = 0; sd < 2; sd++) { auto& S = sim.w.sides[sd]; printf("  %s：总 %d 在阵 %d 阵亡 %d 伤 %d 溃 %d%s%s\n", S.name.c_str(), S.total, S.alive, S.dead, S.wounded, S.routed, S.generalDown ? " 主将殁" : "", S.fled ? " 主将走" : ""); }
  for (auto& u : sim.w.units) printf("    %s %s 存 %d 亡 %d 伤 %d 溃 %d 凝聚 %.2f 士气 %.0f%s\n", sim.w.sides[u.side].name.c_str(), u.name.c_str(), u.alive, u.dead, u.wounded, u.routed, u.cohesion, u.moraleAvg, u.broken ? " 溃" : "");
  int shown = 0; for (auto& e : sim.w.events) { if (shown++ > 40) break; printf("  [%5.1fs] %s\n", e.tick * sim.w.P.dt, e.text.c_str()); }
  return 0;
}
