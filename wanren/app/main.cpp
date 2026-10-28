// 万人阵 · 主程序：窗口、相机、输入、军令、HUD
#include "gfx.hpp"
#include "../core/sim.hpp"
#include "../core/ai.hpp"
#include "../core/scenario.hpp"
#include <cstdio>
#include <cmath>
#include <algorithm>
#include <memory>
#include <set>

struct Camera {
  float cx = 1500, cy = 1500, zoom = 2.f;   // 像素/米
  int W = 1600, H = 1000;
  void toScreen(float wx, float wy, float& sx, float& sy) const { sx = (wx - cx) * zoom + W * 0.5f; sy = H * 0.5f - (wy - cy) * zoom; }
  void toWorld(float sx, float sy, float& wx, float& wy) const { wx = (sx - W * 0.5f) / zoom + cx; wy = cy - (sy - H * 0.5f) / zoom; }
};

static const uint32_t C_RED = RGBA(176, 36, 36), C_BLUE = RGBA(36, 72, 170), C_INK = RGBA(40, 30, 20), C_GREY = RGBA(120, 110, 100);
static const char* HELP = "左键框选 / 点选己方曲    右键: 行进 (Shift 冲 / Alt 退 / 点敌曲 = 冲或射)    H 止  R 退  P 伏盾/起  F 面向鼠标    1-8 换阵: 方 数 疏 圆 锥 雁 横 纵    空格 暂停  [ ] 速度  A 全选  G 本方交 AI  N 重开  Tab 换剧本  滚轮缩放  中键/WASD 平移";

struct App {
  SDL_Window* win = nullptr; SDL_GLContext ctx = nullptr; Gfx gfx; Camera cam; float dpi = 1.f;
  std::unique_ptr<Sim> sim; int scenarioIdx = 0; uint32_t seed = 1; int player = 0;
  std::vector<float> px, py;          // 上一 tick 位置（插值）
  std::vector<float> xy; std::vector<uint8_t> rgba;
  std::set<int> sel; bool paused = false; float speed = 1.f; double acc = 0;
  bool dragging = false, selecting = false; int selX0 = 0, selY0 = 0, mx = 0, my = 0;
  bool keys[6] = {false, false, false, false, false, false};
  double fps = 0; int frames = 0; double fpsT = 0; int winner = -1; bool ended = false;
  std::vector<double> stepHist;
  std::string shotPath; int shotTicks = 0; double runSeconds = 0;   // --screenshot 路径 --ticks N：跑 N tick 后截图退出

  void load() {
    sim = std::make_unique<Sim>(seed, 0); sim->w.P.load("params.txt");
    ScenarioDef def = scenarios()[scenarioIdx]; def.aiSide[player] = false; def.aiSide[1 - player] = true;
    loadScenario(*sim, def);
    px = sim->w.s.x; py = sim->w.s.y; sel.clear(); acc = 0; ended = false; winner = -1;
    // 相机对准玩家方
    float sx = 0, sy = 0; int n = 0; for (auto& u : sim->w.units) if (u.side == player) { sx += u.cx; sy += u.cy; n++; }
    if (n) { cam.cx = sx / n; cam.cy = sy / n + 120.f * (player == 0 ? 1 : -1); }
    cam.zoom = 1.6f * dpi;
  }
  void tick() {
    px = sim->w.s.x; py = sim->w.s.y;
    for (int sd = 0; sd < 2; sd++) if (sim->w.sides[sd].ai) aiStep(*sim, sd);
    sim->step();
    stepHist.push_back(sim->lastStepMs); if (stepHist.size() > 60) stepHist.erase(stepHist.begin());
    if (!ended && sim->over(winner)) { ended = true; sim->log(winner >= 0 ? sim->w.sides[winner].name + "胜" : "罢兵"); }
  }
  // —— 军令 ——
  void orderMove(float wx, float wy, OrderType t) {
    if (sel.empty()) return;
    float cx = 0, cy = 0; for (int u : sel) { cx += sim->w.units[u].cx; cy += sim->w.units[u].cy; } cx /= sel.size(); cy /= sel.size();
    for (int u : sel) { Unit& U = sim->w.units[u]; sim->issue(u, {t, wx + (U.cx - cx), wy + (U.cy - cy)}); }
  }
  void orderOnEnemy(int e) {
    for (int u : sel) { Unit& U = sim->w.units[u]; const Unit& E = sim->w.units[e]; if (kindIsMissile(U.kind) && !kindIsCav(U.kind)) sim->issue(u, {O_FIRE, 0, 0, e}); else sim->issue(u, {O_CHARGE, E.cx, E.cy}); }
  }
  void orderRetreat() {
    for (int u : sel) { Unit& U = sim->w.units[u]; const Side& E = sim->w.sides[1 - U.side]; float dx = U.cx - E.gx, dy = U.cy - E.gy, l = hypotf(dx, dy); if (l < 1) { dx = 0; dy = 1; l = 1; } sim->issue(u, {O_RETREAT, U.cx + dx / l * 120.f, U.cy + dy / l * 120.f}); }
  }
  void orderFace(float wx, float wy) { for (int u : sel) { Unit& U = sim->w.units[u]; sim->issue(u, {O_FACE, wx - U.cx, wy - U.cy}); } }
  void orderFormation(int f) { for (int u : sel) sim->issue(u, {O_FORMATION, 0, 0, f}); }
  void orderProne() { for (int u : sel) { Unit& U = sim->w.units[u]; sim->issue(u, {U.stance == ST_PRONE ? O_RISE : O_PRONE}); } }

  void handle(SDL_Event& e) {
    if (e.type == SDL_MOUSEWHEEL) { float wx, wy; cam.toWorld(mx * dpi, my * dpi, wx, wy); cam.zoom *= e.wheel.y > 0 ? 1.15f : (1 / 1.15f); cam.zoom = std::clamp(cam.zoom, 0.15f * dpi, 30.f * dpi); float nx, ny; cam.toWorld(mx * dpi, my * dpi, nx, ny); cam.cx += wx - nx; cam.cy += wy - ny; }
    else if (e.type == SDL_MOUSEMOTION) { mx = e.motion.x; my = e.motion.y; if (dragging) { cam.cx -= e.motion.xrel * dpi / cam.zoom; cam.cy += e.motion.yrel * dpi / cam.zoom; } }
    else if (e.type == SDL_MOUSEBUTTONDOWN) {
      if (e.button.button == SDL_BUTTON_MIDDLE) dragging = true;
      else if (e.button.button == SDL_BUTTON_LEFT) { selecting = true; selX0 = e.button.x; selY0 = e.button.y; }
      else if (e.button.button == SDL_BUTTON_RIGHT) {
        float wx, wy; cam.toWorld(e.button.x * dpi, e.button.y * dpi, wx, wy);
        int hit = sim->unitAt(wx, wy, 12.f / cam.zoom * dpi + 6.f);
        SDL_Keymod m = SDL_GetModState();
        if (hit >= 0 && sim->w.units[hit].side != player) orderOnEnemy(hit);
        else if (m & KMOD_SHIFT) orderMove(wx, wy, O_CHARGE);
        else if (m & KMOD_ALT) orderMove(wx, wy, O_RETREAT);
        else orderMove(wx, wy, O_MOVE);
      }
    } else if (e.type == SDL_MOUSEBUTTONUP) {
      if (e.button.button == SDL_BUTTON_MIDDLE) dragging = false;
      else if (e.button.button == SDL_BUTTON_LEFT && selecting) {
        selecting = false; SDL_Keymod m = SDL_GetModState(); if (!(m & KMOD_SHIFT)) sel.clear();
        int x0 = std::min(selX0, e.button.x), x1 = std::max(selX0, e.button.x), y0 = std::min(selY0, e.button.y), y1 = std::max(selY0, e.button.y);
        if (x1 - x0 < 4 && y1 - y0 < 4) { float wx, wy; cam.toWorld(e.button.x * dpi, e.button.y * dpi, wx, wy); int hit = sim->unitAt(wx, wy, 12.f / cam.zoom * dpi + 6.f); if (hit >= 0 && sim->w.units[hit].side == player) sel.insert(hit); }
        else for (auto& u : sim->w.units) { if (u.side != player || u.alive == 0) continue; float sx, sy; cam.toScreen(u.cx, u.cy, sx, sy); sx /= dpi; sy /= dpi; if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) sel.insert(u.id); }
      }
    } else if (e.type == SDL_KEYDOWN) {
      SDL_Keycode k = e.key.keysym.sym;
      if (k == SDLK_SPACE) paused = !paused;
      else if (k == SDLK_LEFTBRACKET) speed = std::max(0.25f, speed / 2);
      else if (k == SDLK_RIGHTBRACKET) speed = std::min(32.f, speed * 2);
      else if (k == SDLK_h) for (int u : sel) sim->issue(u, {O_HALT});
      else if (k == SDLK_r) orderRetreat();
      else if (k == SDLK_p) orderProne();
      else if (k == SDLK_f) { float wx, wy; cam.toWorld(mx * dpi, my * dpi, wx, wy); orderFace(wx, wy); }
      else if (k >= SDLK_1 && k <= SDLK_8) orderFormation(k - SDLK_1);
      else if (k == SDLK_a) { sel.clear(); for (auto& u : sim->w.units) if (u.side == player && u.alive > 0) sel.insert(u.id); }
      else if (k == SDLK_g) sim->w.sides[player].ai = !sim->w.sides[player].ai;
      else if (k == SDLK_n) { seed++; load(); }
      else if (k == SDLK_TAB) { scenarioIdx = (scenarioIdx + 1) % (int)scenarios().size(); load(); }
      else if (k == SDLK_ESCAPE) sel.clear();
      else if (k == SDLK_w) keys[0] = true; else if (k == SDLK_s) keys[1] = true; else if (k == SDLK_a) keys[2] = true; else if (k == SDLK_d) keys[3] = true;
      if (k == SDLK_UP) keys[0] = true; if (k == SDLK_DOWN) keys[1] = true; if (k == SDLK_LEFT) keys[2] = true; if (k == SDLK_RIGHT) keys[3] = true;
    } else if (e.type == SDL_KEYUP) {
      SDL_Keycode k = e.key.keysym.sym;
      if (k == SDLK_w || k == SDLK_UP) keys[0] = false; if (k == SDLK_s || k == SDLK_DOWN) keys[1] = false; if (k == SDLK_LEFT) keys[2] = false; if (k == SDLK_d || k == SDLK_RIGHT) keys[3] = false;
    }
  }

  void draw(double alpha, bool swap = true) {
    int dw, dh; SDL_GL_GetDrawableSize(win, &dw, &dh); cam.W = dw; cam.H = dh;
    gfx.begin(dw, dh);
    const auto& s = sim->w.s; size_t n = s.size();
    xy.resize(n * 2); rgba.resize(n * 4);
    // 先画倒下的（在底层），再画活着的；两次 draw
    static std::vector<float> xy2; static std::vector<uint8_t> c2; xy2.clear(); c2.clear();
    int live = 0;
    for (size_t i = 0; i < n; i++) {
      float wx = px[i] + (s.x[i] - px[i]) * (float)alpha, wy = py[i] + (s.y[i] - py[i]) * (float)alpha;
      float sx, sy; cam.toScreen(wx, wy, sx, sy);
      if (sx < -10 || sy < -10 || sx > dw + 10 || sy > dh + 10) continue;
      uint8_t st = s.state[i]; bool red = s.side[i] == 0;
      uint8_t r, g, b, a = 255;
      if (st == S_DEAD) { r = 60; g = 50; b = 45; a = 170; xy2.push_back(sx); xy2.push_back(sy); c2.insert(c2.end(), {r, g, b, a}); continue; }
      if (st == S_WOUNDED) { r = red ? 150 : 100; g = red ? 90 : 100; b = red ? 90 : 150; a = 120; xy2.push_back(sx); xy2.push_back(sy); c2.insert(c2.end(), {r, g, b, a}); continue; }
      if (red) { r = 176; g = 36; b = 36; } else { r = 36; g = 72; b = 170; }
      if (st == S_ROUT) { r = (uint8_t)(r * 0.5f + 120); g = (uint8_t)(g * 0.5f + 120); b = (uint8_t)(b * 0.5f + 120); }
      if (kindIsMissile(s.kind[i])) { g = (uint8_t)std::min(255, g + 60); }
      if (s.flags[i] & 16) { r = 240; g = 200; b = 40; }
      xy[live * 2] = sx; xy[live * 2 + 1] = sy; rgba[live * 4] = r; rgba[live * 4 + 1] = g; rgba[live * 4 + 2] = b; rgba[live * 4 + 3] = a; live++;
    }
    float ps = std::clamp(0.9f * cam.zoom, 1.5f * dpi, 14.f * dpi);
    if (!xy2.empty()) gfx.points(xy2.data(), c2.data(), (int)xy2.size() / 2, ps * 0.8f);
    gfx.points(xy.data(), rgba.data(), live, ps);
    // 曲：旗、朝向、选中圈、名字
    for (auto& u : sim->w.units) {
      if (u.alive + u.routed == 0) continue;
      float sx, sy; cam.toScreen(u.cx, u.cy, sx, sy);
      if (sx < -200 || sy < -200 || sx > dw + 200 || sy > dh + 200) continue;
      uint32_t c = u.side == 0 ? C_RED : C_BLUE;
      bool isSel = sel.count(u.id) > 0;
      float fl = 10.f * dpi;
      gfx.line(sx, sy, sx, sy - fl * 2.2f, 1.5f * dpi, C_INK);
      if (u.flagAlive) gfx.tri(sx, sy - fl * 2.2f, sx + fl * 1.2f, sy - fl * 1.8f, sx, sy - fl * 1.3f, c);
      gfx.line(sx, sy, sx + u.fx * 18.f * dpi, sy - u.fy * 18.f * dpi, 1.2f * dpi, u.stance == ST_CHARGE ? RGBA(200, 120, 0) : C_GREY);
      if (isSel) gfx.circle(sx, sy, 14.f * dpi, 2.f * dpi, RGBA(220, 160, 20));
      if (u.broken) gfx.circle(sx, sy, 10.f * dpi, 1.f * dpi, C_GREY, 12);
      if (cam.zoom > 0.9f * dpi || isSel) {
        std::string lab = u.name + (u.stance == ST_PRONE ? "(伏)" : "");
        float tw = gfx.textWidth(lab); gfx.flush(); gfx.text(lab, sx - tw * 0.5f, sy - fl * 2.2f - gfx.lineH() - 2, c);
      }
    }
    if (!sel.empty()) for (int u : sel) { const Unit& U = sim->w.units[u]; if (U.stance == ST_MOVE || U.stance == ST_CHARGE || U.stance == ST_RETREAT) { float sx, sy, gx, gy; cam.toScreen(U.cx, U.cy, sx, sy); cam.toScreen(U.gx, U.gy, gx, gy); gfx.line(sx, sy, gx, gy, 1.f * dpi, RGBA(220, 160, 20, 160)); } }
    if (selecting) { int x0 = std::min(selX0, mx), y0 = std::min(selY0, my); gfx.rect(x0 * dpi, y0 * dpi, abs(mx - selX0) * dpi, abs(my - selY0) * dpi, RGBA(220, 160, 20, 50)); }
    gfx.flush();
    drawHud(dw, dh);
    if (swap) SDL_GL_SwapWindow(win); else glFinish();
  }

  void drawHud(int dw, int dh) {
    float lh = gfx.lineH(), pad = 8 * dpi;
    // 顶部：两军
    gfx.rect(0, 0, (float)dw, lh * 2.3f + pad, RGBA(255, 252, 240, 215)); gfx.flush();
    char buf[512];
    for (int sd = 0; sd < 2; sd++) {
      const Side& S = sim->w.sides[sd];
      snprintf(buf, sizeof buf, "%s%s  总 %d  在阵 %d  阵亡 %d  伤 %d  溃 %d%s%s", S.name.c_str(), sd == player ? "（我）" : "（AI）", S.total, S.alive, S.dead, S.wounded, S.routed, S.generalDown ? "  主将殁" : "", S.fled ? "  主将走" : "");
      gfx.text(buf, pad + sd * dw * 0.5f, pad * 0.5f, sd == 0 ? C_RED : C_BLUE);
    }
    double avg = 0; for (double v : stepHist) avg += v; if (!stepHist.empty()) avg /= stepHist.size();
    snprintf(buf, sizeof buf, "%s  %.1f 分  速度 ×%.2g%s  人 %zu  tick %.2f ms  %.0f fps  线程 %d  %s", scenarios()[scenarioIdx].title.c_str(), sim->w.time() / 60.0, speed, paused ? "  暂停" : "", sim->w.s.size(), avg, fps, sim->pool->threads(), ended ? (winner >= 0 ? (sim->w.sides[winner].name + "胜").c_str() : "罢兵") : "");
    gfx.text(buf, pad, pad * 0.5f + lh, C_INK);
    // 底部：帮助 + 选中
    float bottomH = lh * (sel.empty() ? 1.6f : 4.2f) + pad;
    gfx.rect(0, dh - bottomH, (float)dw, bottomH, RGBA(255, 252, 240, 215)); gfx.flush();
    gfx.text(HELP, pad, dh - lh - pad * 0.5f, C_GREY);
    if (!sel.empty()) {
      float y = dh - bottomH + pad * 0.5f; int shown = 0; std::string line;
      for (int u : sel) {
        const Unit& U = sim->w.units[u];
        snprintf(buf, sizeof buf, "%s[%s%s] %s 存%d 亡%d 伤%d 溃%d 凝%.0f%% 气%.0f 疲%.0f%s%s%s   ", U.name.c_str(), kindName(U.kind), U.elite ? "·精" : "", formationName(U.formation), U.alive, U.dead, U.wounded, U.routed, U.cohesion * 100, U.moraleAvg, sim->unitFatigue[U.id], U.officerAlive ? "" : " 军候殁", U.flagAlive ? "" : " 旗倒", U.orders.empty() ? "" : " 令在途");
        line += buf; if (++shown % 2 == 0) { gfx.text(line, pad, y, C_INK); y += lh; line.clear(); }
        if (shown >= 6) break;
      }
      if (!line.empty()) gfx.text(line, pad, y, C_INK);
    }
    // 右侧：纪事
    const auto& ev = sim->w.events; int cnt = std::min<int>(14, (int)ev.size());
    float ex = dw - 420 * dpi, ey = lh * 2.3f + pad * 2;
    gfx.rect(ex - pad, ey - pad * 0.5f, 420 * dpi, cnt * lh + pad, RGBA(255, 252, 240, 170)); gfx.flush();
    for (int i = 0; i < cnt; i++) { const Event& e = ev[ev.size() - cnt + i]; snprintf(buf, sizeof buf, "%5.1f′ %s", e.tick * sim->w.P.dt / 60.0, e.text.c_str()); gfx.text(buf, ex, ey + i * lh, C_INK); }
    gfx.flush();
  }

  int run(int argc, char** argv) {
    for (int i = 1; i < argc; i++) { std::string a = argv[i]; if (a == "--seed" && i + 1 < argc) seed = atoi(argv[++i]); else if (a == "--screenshot" && i + 1 < argc) shotPath = argv[++i]; else if (a == "--ticks" && i + 1 < argc) shotTicks = atoi(argv[++i]); else if (a == "--run-seconds" && i + 1 < argc) runSeconds = atof(argv[++i]); else if (a == "--side" && i + 1 < argc) player = atoi(argv[++i]); else for (size_t k = 0; k < scenarios().size(); k++) if (scenarios()[k].id == a) scenarioIdx = (int)k; }
    if (SDL_Init(SDL_INIT_VIDEO) != 0) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3); SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE); SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    win = SDL_CreateWindow("万人阵 · 汉末会战", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 1600, 1000, SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI);
    if (!win) { fprintf(stderr, "window: %s\n", SDL_GetError()); return 1; }
    ctx = SDL_GL_CreateContext(win); SDL_GL_SetSwapInterval(0);   // 不用 Cocoa 垂直同步（SDL3 兼容层在窗口未显示时会卡死），自行限帧 60 fps
    int ww, wh, dw, dh; SDL_GetWindowSize(win, &ww, &wh); SDL_GL_GetDrawableSize(win, &dw, &dh); dpi = (float)dw / ww;
    if (!gfx.init(win, dpi)) return 1;
    load();
    if (!shotPath.empty()) {
      SDL_GL_SetSwapInterval(0);
      for (int k = 0; k < 20; k++) { SDL_Event e; while (SDL_PollEvent(&e)) {} SDL_Delay(10); }
      for (int t = 0; t < shotTicks; t++) tick();
      sel.insert(sim->w.units[0].id); sel.insert(sim->w.units[1].id);
      glReadBuffer(GL_BACK);
      draw(1.0, false);
      int dw, dh; SDL_GL_GetDrawableSize(win, &dw, &dh); std::vector<uint8_t> pix((size_t)dw * dh * 4);
      glReadPixels(0, 0, dw, dh, GL_RGBA, GL_UNSIGNED_BYTE, pix.data());
      for (int y = 0; y < dh / 2; y++) for (int x = 0; x < dw * 4; x++) std::swap(pix[(size_t)y * dw * 4 + x], pix[(size_t)(dh - 1 - y) * dw * 4 + x]);
      SDL_Surface* sf = SDL_CreateRGBSurfaceWithFormatFrom(pix.data(), dw, dh, 32, dw * 4, SDL_PIXELFORMAT_RGBA32);
      SDL_SaveBMP(sf, shotPath.c_str()); SDL_FreeSurface(sf);
      printf("截图 %s（%dx%d），tick %d，%.2f ms/tick\n", shotPath.c_str(), dw, dh, sim->w.tick, sim->lastStepMs);
      SDL_GL_DeleteContext(ctx); SDL_DestroyWindow(win); SDL_Quit(); return 0;
    }
    uint64_t last = SDL_GetPerformanceCounter(); double freq = (double)SDL_GetPerformanceFrequency();
    bool quit = false; double elapsed = 0;
    while (!quit) {
      if (runSeconds > 0 && elapsed >= runSeconds) { printf("自动退出：%.1f 秒，%.0f fps，tick %d，%.2f ms/tick\n", elapsed, fps, sim->w.tick, sim->lastStepMs); break; }
      SDL_Event e; while (SDL_PollEvent(&e)) { if (e.type == SDL_QUIT) quit = true; else handle(e); }
      uint64_t now = SDL_GetPerformanceCounter(); double dtReal = (now - last) / freq; last = now; if (dtReal > 0.25) dtReal = 0.25; elapsed += dtReal;
      float pan = 600.f / cam.zoom * (float)dtReal * dpi; if (keys[0]) cam.cy += pan; if (keys[1]) cam.cy -= pan; if (keys[2]) cam.cx -= pan; if (keys[3]) cam.cx += pan;
      if (!paused) { acc += dtReal * speed; int steps = 0; while (acc >= sim->w.P.dt && steps < 64) { tick(); acc -= sim->w.P.dt; steps++; } if (steps == 64) acc = 0; }
      frames++; fpsT += dtReal; if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
      draw(paused ? 1.0 : std::clamp(acc / sim->w.P.dt, 0.0, 1.0));
      double frameMs = (SDL_GetPerformanceCounter() - now) * 1000.0 / freq; if (frameMs < 15.0) SDL_Delay((Uint32)(15.0 - frameMs));
    }
    SDL_GL_DeleteContext(ctx); SDL_DestroyWindow(win); SDL_Quit();
    return 0;
  }
};

int main(int argc, char** argv) { App app; return app.run(argc, argv); }
