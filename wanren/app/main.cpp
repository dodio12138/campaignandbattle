// 万人阵 · 主程序：窗口、相机、输入、军令、HUD。模拟在独立线程（simthread.hpp），这里只读快照
#include "gfx.hpp"
#include "simthread.hpp"
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
static const char* HELP = "左键框选 / 点选己方曲    右键: 行进, 拖动 = 到达后面向拖动方向 (Shift 冲 / Alt 退 / Ctrl 平移 / 点敌曲 = 步兵冲, 突骑反复冲击, 弓弩射, 弓骑游射)    H 止  R 退  P 伏盾/起  F 面向鼠标    1-8 换阵: 方 数 疏 圆 锥 雁 横 纵    空格 暂停  . 单步  [ ] 倍速  A 全选  G 本方交 AI  N 重开  Tab 换剧本  滚轮缩放  中键/方向键平移";

struct App {
  SDL_Window* win = nullptr; SDL_GLContext ctx = nullptr; Gfx gfx; Camera cam; float dpi = 1.f;
  SimThread st; int scenarioIdx = 0; uint32_t seed = 1; int player = 0;
  std::shared_ptr<const Snapshot> cur, prev; double curArrival = 0; int seenGeneration = -1;
  std::vector<float> xy; std::vector<uint8_t> rgba;
  std::set<int> sel;
  bool dragging = false, selecting = false; int selX0 = 0, selY0 = 0, mx = 0, my = 0;
  bool rdown = false; int rX0 = 0, rY0 = 0;
  bool keys[4] = {false, false, false, false};
  double fps = 0; int frames = 0; double fpsT = 0; double nowS = 0;
  std::string shotPath; int shotTicks = 0; double runSeconds = 0; int shotAfter = 0; float shotZoom = 0; int centerUnit = -1; std::vector<Order> demoOrders; std::vector<int> demoUnits;

  void requestLoad() { Cmd c; c.type = Cmd::RESET; c.scenario = scenarioIdx; c.seed = seed; c.player = player; st.push(c); }
  void onNewGeneration(const Snapshot& s) {
    sel.clear(); prev.reset();
    float sx = 0, sy = 0; int n = 0; for (auto& u : s.units) if (u.side == player) { sx += u.cx; sy += u.cy; n++; }
    if (n) { cam.cx = sx / n; cam.cy = sy / n + 120.f * (player == 0 ? 1 : -1); }
    cam.zoom = 1.6f * dpi;
  }
  int unitAt(const Snapshot& s, float x, float y, float r) const {
    int best = -1; float bd = r * r;
    for (auto& u : s.units) { if (u.alive == 0) continue; float dx = u.cx - x, dy = u.cy - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = u.id; } }
    if (best >= 0) return best;
    bd = 9.f;
    for (size_t i = 0; i < s.x.size(); i++) { if (s.state[i] >= S_WOUNDED) continue; float dx = s.x[i] - x, dy = s.y[i] - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = s.unit[i]; } }
    return best;
  }
  // —— 军令（全部进队列） ——
  void order(int u, Order o) { Cmd c; c.type = Cmd::ORDER; c.unit = u; c.order = o; st.push(c); }
  void orderMove(const Snapshot& s, float wx, float wy, OrderType t, int arg = -1, float ffx = 0, float ffy = 0) {
    if (sel.empty()) return;
    float cx = 0, cy = 0; for (int u : sel) { cx += s.units[u].cx; cy += s.units[u].cy; } cx /= sel.size(); cy /= sel.size();
    for (int u : sel) { const UnitView& U = s.units[u]; Order o{t, wx + (U.cx - cx), wy + (U.cy - cy), arg}; o.fx = ffx; o.fy = ffy; order(u, o); }
  }
  void orderOnEnemy(const Snapshot& s, int e) {
    for (int u : sel) { const UnitView& U = s.units[u]; const UnitView& E = s.units[e]; if (kindIsMissile(U.kind)) order(u, {O_FIRE, 0, 0, e}); else order(u, {O_CHARGE, E.cx, E.cy, e}); }
  }
  void orderRetreat(const Snapshot& s) {
    for (int u : sel) { const UnitView& U = s.units[u]; const Side& E = s.sides[1 - U.side]; float dx = U.cx - E.gx, dy = U.cy - E.gy, l = hypotf(dx, dy); if (l < 1) { dx = 0; dy = 1; l = 1; } order(u, {O_RETREAT, U.cx + dx / l * 120.f, U.cy + dy / l * 120.f}); }
  }

  void handle(SDL_Event& e) {
    const Snapshot* s = cur.get(); if (!s) return;
    if (e.type == SDL_MOUSEWHEEL) { float wx, wy; cam.toWorld(mx * dpi, my * dpi, wx, wy); cam.zoom *= e.wheel.y > 0 ? 1.15f : (1 / 1.15f); cam.zoom = std::clamp(cam.zoom, 0.15f * dpi, 30.f * dpi); float nx, ny; cam.toWorld(mx * dpi, my * dpi, nx, ny); cam.cx += wx - nx; cam.cy += wy - ny; }
    else if (e.type == SDL_MOUSEMOTION) { mx = e.motion.x; my = e.motion.y; if (dragging) { cam.cx -= e.motion.xrel * dpi / cam.zoom; cam.cy += e.motion.yrel * dpi / cam.zoom; } }
    else if (e.type == SDL_MOUSEBUTTONDOWN) {
      if (e.button.button == SDL_BUTTON_MIDDLE) dragging = true;
      else if (e.button.button == SDL_BUTTON_LEFT) { selecting = true; selX0 = e.button.x; selY0 = e.button.y; }
      else if (e.button.button == SDL_BUTTON_RIGHT) { rdown = true; rX0 = e.button.x; rY0 = e.button.y; }
    } else if (e.type == SDL_MOUSEBUTTONUP) {
      if (e.button.button == SDL_BUTTON_MIDDLE) dragging = false;
      else if (e.button.button == SDL_BUTTON_RIGHT && rdown) {
        rdown = false;
        float wx, wy; cam.toWorld(rX0 * dpi, rY0 * dpi, wx, wy);
        int ddx = e.button.x - rX0, ddy = e.button.y - rY0; bool drag = ddx * ddx + ddy * ddy > 144;
        int hit = drag ? -1 : unitAt(*s, wx, wy, 12.f / cam.zoom * dpi + 6.f);
        SDL_Keymod m = SDL_GetModState();
        if (hit >= 0 && s->units[hit].side != player) orderOnEnemy(*s, hit);
        else if (m & KMOD_SHIFT) orderMove(*s, wx, wy, O_CHARGE);
        else if (m & KMOD_ALT) orderMove(*s, wx, wy, O_RETREAT);
        else if (drag) { float ux, uy; cam.toWorld(e.button.x * dpi, e.button.y * dpi, ux, uy); orderMove(*s, wx, wy, O_MOVE, (m & KMOD_CTRL) ? 1 : -1, ux - wx, uy - wy); }
        else orderMove(*s, wx, wy, O_MOVE, (m & KMOD_CTRL) ? 1 : -1);
      }
      else if (e.button.button == SDL_BUTTON_LEFT && selecting) {
        selecting = false; SDL_Keymod m = SDL_GetModState(); if (!(m & KMOD_SHIFT)) sel.clear();
        int x0 = std::min(selX0, e.button.x), x1 = std::max(selX0, e.button.x), y0 = std::min(selY0, e.button.y), y1 = std::max(selY0, e.button.y);
        if (x1 - x0 < 4 && y1 - y0 < 4) { float wx, wy; cam.toWorld(e.button.x * dpi, e.button.y * dpi, wx, wy); int hit = unitAt(*s, wx, wy, 12.f / cam.zoom * dpi + 6.f); if (hit >= 0 && s->units[hit].side == player) sel.insert(hit); }
        else for (auto& u : s->units) { if (u.side != player || u.alive == 0) continue; float sx, sy; cam.toScreen(u.cx, u.cy, sx, sy); sx /= dpi; sy /= dpi; if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) sel.insert(u.id); }
      }
    } else if (e.type == SDL_KEYDOWN) {
      SDL_Keycode k = e.key.keysym.sym;
      if (k == SDLK_SPACE) st.paused = !st.paused;
      else if (k == SDLK_PERIOD) { st.paused = true; st.stepOnce = 1; }
      else if (k == SDLK_LEFTBRACKET) st.speedIdx = std::max(0, st.speedIdx.load() - 1);
      else if (k == SDLK_RIGHTBRACKET) st.speedIdx = std::min(SimThread::NSPEED - 1, st.speedIdx.load() + 1);
      else if (k == SDLK_h) for (int u : sel) order(u, {O_HALT});
      else if (k == SDLK_r) orderRetreat(*s);
      else if (k == SDLK_p) for (int u : sel) order(u, {s->units[u].stance == ST_PRONE ? O_RISE : O_PRONE});
      else if (k == SDLK_f) { float wx, wy; cam.toWorld(mx * dpi, my * dpi, wx, wy); for (int u : sel) order(u, {O_FACE, wx - s->units[u].cx, wy - s->units[u].cy}); }
      else if (k >= SDLK_1 && k <= SDLK_8) for (int u : sel) order(u, {O_FORMATION, 0, 0, (int)(k - SDLK_1)});
      else if (k == SDLK_a) { sel.clear(); for (auto& u : s->units) if (u.side == player && u.alive > 0) sel.insert(u.id); }
      else if (k == SDLK_g) { Cmd c; c.type = Cmd::TOGGLE_AI; st.push(c); }
      else if (k == SDLK_n) { seed++; requestLoad(); }
      else if (k == SDLK_TAB) { scenarioIdx = (scenarioIdx + 1) % (int)scenarios().size(); requestLoad(); }
      else if (k == SDLK_ESCAPE) sel.clear();
      if (k == SDLK_UP || k == SDLK_w) keys[0] = true; if (k == SDLK_DOWN || k == SDLK_s) keys[1] = true; if (k == SDLK_LEFT) keys[2] = true; if (k == SDLK_RIGHT || k == SDLK_d) keys[3] = true;
    } else if (e.type == SDL_KEYUP) {
      SDL_Keycode k = e.key.keysym.sym;
      if (k == SDLK_UP || k == SDLK_w) keys[0] = false; if (k == SDLK_DOWN || k == SDLK_s) keys[1] = false; if (k == SDLK_LEFT) keys[2] = false; if (k == SDLK_RIGHT || k == SDLK_d) keys[3] = false;
    }
  }

  void draw(const Snapshot& s, const Snapshot* p, double alpha, bool fast, bool swap = true) {
    int dw, dh; SDL_GL_GetDrawableSize(win, &dw, &dh); cam.W = dw; cam.H = dh;
    gfx.begin(dw, dh);
    size_t n = s.x.size();
    bool interp = p && !fast && p->x.size() == n && p->generation == s.generation;
    xy.resize(n * 2); rgba.resize(n * 4);
    static std::vector<float> xy2; static std::vector<uint8_t> c2; xy2.clear(); c2.clear();
    int live = 0;
    for (size_t i = 0; i < n; i++) {
      float wx = s.x[i], wy = s.y[i];
      if (interp) { wx = p->x[i] + (wx - p->x[i]) * (float)alpha; wy = p->y[i] + (wy - p->y[i]) * (float)alpha; }
      float sx, sy; cam.toScreen(wx, wy, sx, sy);
      if (sx < -10 || sy < -10 || sx > dw + 10 || sy > dh + 10) continue;
      uint8_t st = s.state[i]; bool red = s.side[i] == 0;
      uint8_t r, g, b, a = 255;
      if (st == S_DEAD) { xy2.push_back(sx); xy2.push_back(sy); c2.insert(c2.end(), {60, 50, 45, 170}); continue; }
      if (st == S_WOUNDED) { xy2.push_back(sx); xy2.push_back(sy); c2.insert(c2.end(), {(uint8_t)(red ? 150 : 100), (uint8_t)(red ? 90 : 100), (uint8_t)(red ? 90 : 150), 120}); continue; }
      if (red) { r = 176; g = 36; b = 36; } else { r = 36; g = 72; b = 170; }
      if (st == S_ROUT) { r = (uint8_t)(r * 0.5f + 120); g = (uint8_t)(g * 0.5f + 120); b = (uint8_t)(b * 0.5f + 120); }
      if (kindIsMissile(s.kind[i])) g = (uint8_t)std::min(255, g + 60);
      if (s.flags[i] & 16) { r = 240; g = 200; b = 40; }
      xy[live * 2] = sx; xy[live * 2 + 1] = sy; rgba[live * 4] = r; rgba[live * 4 + 1] = g; rgba[live * 4 + 2] = b; rgba[live * 4 + 3] = a; live++;
    }
    float ps = std::clamp(0.9f * cam.zoom, 1.5f * dpi, 14.f * dpi);
    if (!xy2.empty()) gfx.points(xy2.data(), c2.data(), (int)xy2.size() / 2, ps * 0.8f);
    gfx.points(xy.data(), rgba.data(), live, ps);
    // 箭矢（高倍速不画）
    if (!fast) {
      const float flight = 1.0f, flash = 0.4f; const float dt = 0.1f;
      for (const Shot& sh : s.shots) {
        float age = (s.tick - sh.tick) * dt + (float)alpha * dt;
        uint32_t c = sh.side == 0 ? RGBA(120, 30, 30, 200) : RGBA(30, 50, 120, 200);
        if (age < flight) {
          float dist = hypotf(sh.x1 - sh.x0, sh.y1 - sh.y0); float t1 = age / flight, t0 = std::max(0.f, t1 - std::min(0.12f, 4.f / std::max(dist, 1.f)));
          float h = 4.f * t1 * (1.f - t1) * 0.08f * dist, h0 = 4.f * t0 * (1.f - t0) * 0.08f * dist;
          float ax0, ay0, ax1, ay1; cam.toScreen(sh.x0 + (sh.x1 - sh.x0) * t0, sh.y0 + (sh.y1 - sh.y0) * t0 + h0, ax0, ay0); cam.toScreen(sh.x0 + (sh.x1 - sh.x0) * t1, sh.y0 + (sh.y1 - sh.y0) * t1 + h, ax1, ay1);
          if (ax1 < -20 || ay1 < -20 || ax1 > dw + 20 || ay1 > dh + 20) continue;
          gfx.line(ax0, ay0, ax1, ay1, std::max(1.f, 0.35f * cam.zoom), c);
        } else if (sh.hit && age < flight + flash) {
          float k = (age - flight) / flash; float sx, sy; cam.toScreen(sh.x1, sh.y1, sx, sy);
          if (sx < -20 || sy < -20 || sx > dw + 20 || sy > dh + 20) continue;
          gfx.circle(sx, sy, (1.2f + 3.f * k) * std::max(1.2f, 0.8f * cam.zoom), std::max(1.5f, 0.5f * cam.zoom), RGBA(235, 140, 20, (int)(255 * (1.f - k * 0.8f))), 12);
        }
      }
      gfx.flush();
    }
    for (auto& u : s.units) {
      if (u.alive + u.routed == 0) continue;
      float sx, sy; cam.toScreen(u.cx, u.cy, sx, sy);
      if (sx < -200 || sy < -200 || sx > dw + 200 || sy > dh + 200) continue;
      uint32_t c = u.side == 0 ? C_RED : C_BLUE; bool isSel = sel.count(u.id) > 0; float fl = 10.f * dpi;
      gfx.line(sx, sy, sx, sy - fl * 2.2f, 1.5f * dpi, C_INK);
      if (u.flagAlive) gfx.tri(sx, sy - fl * 2.2f, sx + fl * 1.2f, sy - fl * 1.8f, sx, sy - fl * 1.3f, c);
      gfx.line(sx, sy, sx + u.fx * 18.f * dpi, sy - u.fy * 18.f * dpi, 1.2f * dpi, u.stance == ST_CHARGE ? RGBA(200, 120, 0) : C_GREY);
      if (isSel) gfx.circle(sx, sy, 14.f * dpi, 2.f * dpi, RGBA(220, 160, 20));
      if (u.broken) gfx.circle(sx, sy, 10.f * dpi, 1.f * dpi, C_GREY, 12);
      if ((cam.zoom > 0.9f * dpi && !fast) || isSel) {
        std::string lab = st.unitNames[u.id] + (u.stance == ST_PRONE ? "(伏)" : "");
        float tw = gfx.textWidth(lab); gfx.flush(); gfx.text(lab, sx - tw * 0.5f, sy - fl * 2.2f - gfx.lineH() - 2, c);
      }
      if (isSel && (u.stance == ST_MOVE || u.stance == ST_CHARGE || u.stance == ST_RETREAT)) { float gx, gy; cam.toScreen(u.gx, u.gy, gx, gy); gfx.line(sx, sy, gx, gy, 1.f * dpi, RGBA(220, 160, 20, 160)); }
    }
    if (rdown) { int ddx = mx - rX0, ddy = my - rY0; if (ddx * ddx + ddy * ddy > 144) gfx.line(rX0 * dpi, rY0 * dpi, mx * dpi, my * dpi, 2.f * dpi, RGBA(220, 160, 20, 200)); }
    if (selecting) { int x0 = std::min(selX0, mx), y0 = std::min(selY0, my); gfx.rect(x0 * dpi, y0 * dpi, abs(mx - selX0) * dpi, abs(my - selY0) * dpi, RGBA(220, 160, 20, 50)); }
    gfx.flush();
    drawHud(s, dw, dh);
    if (swap) SDL_GL_SwapWindow(win); else glFinish();
  }

  void drawHud(const Snapshot& s, int dw, int dh) {
    float lh = gfx.lineH(), pad = 8 * dpi; char buf[512];
    gfx.rect(0, 0, (float)dw, lh * 2.3f + pad, RGBA(255, 252, 240, 215)); gfx.flush();
    for (int sd = 0; sd < 2; sd++) {
      const Side& S = s.sides[sd];
      snprintf(buf, sizeof buf, "%s%s  总 %d  在阵 %d  阵亡 %d  伤 %d  溃 %d%s%s", S.name.c_str(), sd == player ? "（我）" : "（AI）", S.total, S.alive, S.dead, S.wounded, S.routed, S.generalDown ? "  主将殁" : "", S.fled ? "  主将走" : "");
      gfx.text(buf, pad + sd * dw * 0.5f, pad * 0.5f, sd == 0 ? C_RED : C_BLUE);
    }
    float sp = SimThread::SPEEDS[st.speedIdx.load()]; char spd[64];
    if (st.paused) snprintf(spd, sizeof spd, "暂停（. 单步）");
    else if (sp > 0) snprintf(spd, sizeof spd, "目标 ×%g · 实际 ×%.1f", sp, s.actualSpeed);
    else snprintf(spd, sizeof spd, "最快 · 实际 ×%.1f", s.actualSpeed);
    snprintf(buf, sizeof buf, "%s  %.1f 分  %s  人 %zu  tick %.2f ms  %.0f fps  线程 %d  %s", st.title.c_str(), s.time / 60.0, spd, s.nSoldiers, s.stepMs, fps, s.threads, s.ended ? (s.winner >= 0 ? (s.sides[s.winner].name + "胜").c_str() : "罢兵") : "");
    gfx.text(buf, pad, pad * 0.5f + lh, C_INK);
    float bottomH = lh * (sel.empty() ? 1.6f : 4.2f) + pad;
    gfx.rect(0, dh - bottomH, (float)dw, bottomH, RGBA(255, 252, 240, 215)); gfx.flush();
    gfx.text(HELP, pad, dh - lh - pad * 0.5f, C_GREY);
    if (!sel.empty()) {
      float y = dh - bottomH + pad * 0.5f; int shown = 0; std::string line;
      for (int u : sel) {
        const UnitView& U = s.units[u];
        char cav[32] = ""; if (U.cavPhase) snprintf(cav, sizeof cav, " %s·第%d轮", cavPhaseName(U.cavPhase), U.cycles);
        snprintf(buf, sizeof buf, "%s[%s%s] %s 存%d 亡%d 伤%d 溃%d 凝%.0f%% 气%.0f 疲%.0f%s%s%s%s   ", st.unitNames[u].c_str(), kindName(U.kind), U.elite ? "·精" : "", formationName(U.formation), U.alive, U.dead, U.wounded, U.routed, U.cohesion * 100, U.moraleAvg, U.fatigue, cav, U.officerAlive ? "" : " 军候殁", U.flagAlive ? "" : " 旗倒", U.ordersPending ? " 令在途" : "");
        line += buf; if (++shown % 2 == 0) { gfx.text(line, pad, y, C_INK); y += lh; line.clear(); }
        if (shown >= 6) break;
      }
      if (!line.empty()) gfx.text(line, pad, y, C_INK);
    }
    int cnt = (int)s.events.size(); float ex = dw - 420 * dpi, ey = lh * 2.3f + pad * 2;
    gfx.rect(ex - pad, ey - pad * 0.5f, 420 * dpi, cnt * lh + pad, RGBA(255, 252, 240, 170)); gfx.flush();
    for (int i = 0; i < cnt; i++) { const Event& e = s.events[i]; snprintf(buf, sizeof buf, "%5.1f′ %s", e.tick * 0.1 / 60.0, e.text.c_str()); gfx.text(buf, ex, ey + i * lh, C_INK); }
    gfx.flush();
  }

  int run(int argc, char** argv) {
    for (int i = 1; i < argc; i++) { std::string a = argv[i]; if (a == "--seed" && i + 1 < argc) seed = atoi(argv[++i]); else if (a == "--screenshot" && i + 1 < argc) shotPath = argv[++i]; else if (a == "--ticks" && i + 1 < argc) shotTicks = atoi(argv[++i]); else if (a == "--run-seconds" && i + 1 < argc) runSeconds = atof(argv[++i]); else if (a == "--after" && i + 1 < argc) shotAfter = atoi(argv[++i]); else if (a == "--zoom" && i + 1 < argc) shotZoom = (float)atof(argv[++i]); else if (a == "--center" && i + 1 < argc) centerUnit = atoi(argv[++i]); else if (a == "--move" && i + 1 < argc) { int u; float x, y; if (sscanf(argv[++i], "%d,%f,%f", &u, &x, &y) == 3) { demoUnits.push_back(u); demoOrders.push_back({O_MOVE, x, y}); } } else if (a == "--charge" && i + 1 < argc) { int u, t; if (sscanf(argv[++i], "%d,%d", &u, &t) == 2) { demoUnits.push_back(u); demoOrders.push_back({O_CHARGE, 0, 0, t}); } } else if (a == "--side" && i + 1 < argc) player = atoi(argv[++i]); else if (a == "--speed" && i + 1 < argc) st.speedIdx = std::clamp(atoi(argv[++i]), 0, SimThread::NSPEED - 1); else for (size_t k = 0; k < scenarios().size(); k++) if (scenarios()[k].id == a) scenarioIdx = (int)k; }
    if (SDL_Init(SDL_INIT_VIDEO) != 0) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3); SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE); SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    win = SDL_CreateWindow("万人阵 · 汉末会战", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 1600, 1000, SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI);
    if (!win) { fprintf(stderr, "window: %s\n", SDL_GetError()); return 1; }
    ctx = SDL_GL_CreateContext(win); SDL_GL_SetSwapInterval(0);   // 不用 Cocoa 垂直同步（SDL3 兼容层在窗口未显示时会卡死），自行限帧
    int ww, wh, dw, dh; SDL_GetWindowSize(win, &ww, &wh); SDL_GL_GetDrawableSize(win, &dw, &dh); dpi = (float)dw / ww;
    if (!gfx.init(win, dpi)) return 1;
    if (!shotPath.empty()) {   // 截图模式：主线程直接驱动模拟
      for (int k = 0; k < 20; k++) { SDL_Event e; while (SDL_PollEvent(&e)) {} SDL_Delay(10); }
      st.loadNow(scenarioIdx, seed, player);
      Sim* sim = st.simNow();
      for (size_t k = 0; k < demoUnits.size(); k++) { Order o = demoOrders[k]; const Unit& U = sim->w.units[demoUnits[k]]; if (o.type == O_CHARGE) { const Unit& T = sim->w.units[o.arg]; o.x = T.cx; o.y = T.cy; } else { o.x += U.cx; o.y += U.cy; } sim->issue(demoUnits[k], o, true); }   // --move 的坐标是相对该曲中心的偏移；--charge 曲,目标曲
      for (int t = 0; t < shotTicks; t++) st.tickNow();
      if (demoUnits.empty()) for (int t = 0; t < 1200; t++) { bool recent = false; for (const Shot& sh : sim->shots) if (sim->w.tick - sh.tick <= 5) { recent = true; break; } if (recent) break; st.tickNow(); }
      auto s0 = st.snapshotNow(); onNewGeneration(*s0);
      if (centerUnit >= 0) { cam.cx = sim->w.units[centerUnit].cx; cam.cy = sim->w.units[centerUnit].cy; }
      else if (!sim->shots.empty()) { double sx = 0, sy = 0; float wgt = shotAfter >= 10 ? 1.f : 0.5f; for (const Shot& sh : sim->shots) { sx += sh.x0 + (sh.x1 - sh.x0) * wgt; sy += sh.y0 + (sh.y1 - sh.y0) * wgt; } cam.cx = (float)(sx / sim->shots.size()); cam.cy = (float)(sy / sim->shots.size()); }
      if (shotZoom > 0) cam.zoom = shotZoom * dpi;
      for (int t = 0; t < shotAfter; t++) st.tickNow();
      auto s1 = st.snapshotNow(); if (centerUnit >= 0) sel.insert(centerUnit); else { sel.insert(0); sel.insert(1); }
      glReadBuffer(GL_BACK); draw(*s1, nullptr, 1.0, false, false);
      SDL_GL_GetDrawableSize(win, &dw, &dh); std::vector<uint8_t> pix((size_t)dw * dh * 4);
      glReadPixels(0, 0, dw, dh, GL_RGBA, GL_UNSIGNED_BYTE, pix.data());
      for (int y = 0; y < dh / 2; y++) for (int x = 0; x < dw * 4; x++) std::swap(pix[(size_t)y * dw * 4 + x], pix[(size_t)(dh - 1 - y) * dw * 4 + x]);
      SDL_Surface* sf = SDL_CreateRGBSurfaceWithFormatFrom(pix.data(), dw, dh, 32, dw * 4, SDL_PIXELFORMAT_RGBA32);
      SDL_SaveBMP(sf, shotPath.c_str()); SDL_FreeSurface(sf);
      printf("截图 %s（%dx%d），tick %d，%.2f ms/tick\n", shotPath.c_str(), dw, dh, sim->w.tick, sim->lastStepMs);
      SDL_GL_DeleteContext(ctx); SDL_DestroyWindow(win); SDL_Quit(); return 0;
    }
    requestLoad(); st.start();
    uint64_t last = SDL_GetPerformanceCounter(); double freq = (double)SDL_GetPerformanceFrequency();
    bool quit = false; double elapsed = 0;
    while (!quit) {
      if (runSeconds > 0 && elapsed >= runSeconds) { printf("自动退出：%.1f 秒，%.0f fps，tick %d，实际 ×%.1f，%.2f ms/tick\n", elapsed, fps, cur ? cur->tick : 0, cur ? cur->actualSpeed : 0.0, cur ? cur->stepMs : 0.0); break; }
      SDL_Event e; while (SDL_PollEvent(&e)) { if (e.type == SDL_QUIT) quit = true; else handle(e); }
      uint64_t now = SDL_GetPerformanceCounter(); double dtReal = (now - last) / freq; last = now; if (dtReal > 0.25) dtReal = 0.25; elapsed += dtReal; nowS += dtReal;
      float pan = 600.f / cam.zoom * (float)dtReal * dpi; if (keys[0]) cam.cy += pan; if (keys[1]) cam.cy -= pan; if (keys[2]) cam.cx -= pan; if (keys[3]) cam.cx += pan;
      auto sn = st.latest();
      if (sn && sn != cur) { prev = cur; cur = sn; curArrival = nowS; if (cur->generation != seenGeneration) { seenGeneration = cur->generation; onNewGeneration(*cur); } }
      frames++; fpsT += dtReal; if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
      if (cur) {
        float sp = SimThread::SPEEDS[st.speedIdx.load()]; bool fast = sp == 0 || sp >= 8.f;
        double alpha = 1.0;
        if (!fast && prev && !st.paused) { double period = 0.1 / sp; alpha = std::clamp((nowS - curArrival) / period, 0.0, 1.0); }
        draw(*cur, prev.get(), alpha, fast);
      }
      double frameMs = (SDL_GetPerformanceCounter() - now) * 1000.0 / freq; if (frameMs < 15.0) SDL_Delay((Uint32)(15.0 - frameMs));
    }
    st.stop();
    SDL_GL_DeleteContext(ctx); SDL_DestroyWindow(win); SDL_Quit();
    return 0;
  }
};

int main(int argc, char** argv) { App app; return app.run(argc, argv); }
