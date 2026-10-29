// 万人阵 · 主程序：窗口、相机、输入、军令、HUD、小地图。模拟在独立线程（simthread.hpp），这里只读快照
#include "gfx.hpp"
#include "simthread.hpp"
#include <cstdio>
#include <cmath>
#include <algorithm>
#include <memory>
#include <set>
#include <map>

struct Camera {
  float cx = 1500, cy = 1500, zoom = 2.f;   // 像素/米
  int W = 1600, H = 1000;
  void toScreen(float wx, float wy, float& sx, float& sy) const { sx = (wx - cx) * zoom + W * 0.5f; sy = H * 0.5f - (wy - cy) * zoom; }
  void toWorld(float sx, float sy, float& wx, float& wy) const { wx = (sx - W * 0.5f) / zoom + cx; wy = cy - (sy - H * 0.5f) / zoom; }
};

static const uint32_t C_RED = RGBA(176, 36, 36), C_BLUE = RGBA(36, 72, 170), C_INK = RGBA(40, 30, 20), C_GREY = RGBA(120, 110, 100), C_GOLD = RGBA(220, 160, 20);
static const char* HELP1 = "左键 点选 / 框选 / 双击选整部    右键 行进 (拖动 = 到达后面向该方向; Shift 冲 / Alt 退 / Ctrl 平移)    右键点敌曲: 步兵行进到接敌再冲, 突骑反复冲击, 弓弩射, 弓骑游射";
static const char* HELP2 = "H 止  R 退  P 伏盾/起  F 面向鼠标  L 列阵    F1–F9 换阵: 方 数 疏 圆 锥 雁 横 纵 波次(骑)    Ctrl+1–9 编组  1–9 选组  A 全选    空格 暂停  . 单步  [ ] 倍速  J 跳到下一事件    Z 缩放到选中  Home 回本阵  G 本方交 AI  Ctrl+N 重开  Tab 换剧本";

struct App {
  SDL_Window* win = nullptr; SDL_GLContext ctx = nullptr; Gfx gfx; Camera cam; float dpi = 1.f;
  SimThread st; int scenarioIdx = 0; uint32_t seed = 1; int player = 0;
  std::shared_ptr<const Snapshot> cur, prev; double curArrival = 0; int seenGeneration = -1;
  GLuint terrainTex = 0; float terrainWorldW = 3000, terrainWorldH = 3000;
  std::vector<float> xy; std::vector<uint8_t> rgba;
  std::set<int> sel; std::set<int> groups[10];
  bool dragging = false, selecting = false; int selX0 = 0, selY0 = 0, mx = 0, my = 0;
  bool rdown = false; int rX0 = 0, rY0 = 0;
  uint32_t lastClickMs = 0; int lastClickUnit = -1;
  bool keys[4] = {false, false, false, false};
  double fps = 0; int frames = 0; double fpsT = 0; double nowS = 0;
  std::string shotPath; int shotTicks = 0; double runSeconds = 0; int shotAfter = 0; float shotZoom = 0; int centerUnit = -1; std::vector<Order> demoOrders; std::vector<int> demoUnits; bool shotSelectAll = false;
  float mmSize = 240.f;   // 小地图边长（逻辑像素）

  void requestLoad() { Cmd c; c.type = Cmd::RESET; c.scenario = scenarioIdx; c.seed = seed; c.player = player; st.push(c); }
  void buildTerrainTexture(const Terrain& T) {
    if (terrainTex) { glDeleteTextures(1, &terrainTex); terrainTex = 0; }
    std::vector<uint8_t> px((size_t)T.w * T.h * 4);
    float hmin = 1e9f, hmax = -1e9f; for (float v : T.height) { hmin = std::min(hmin, v); hmax = std::max(hmax, v); }
    float hr = std::max(1.f, hmax - hmin);
    for (int j = 0; j < T.h; j++) for (int i = 0; i < T.w; i++) {
      size_t k = (size_t)j * T.w + i; uint8_t t = T.type[k]; float hn = (T.height[k] - hmin) / hr; uint8_t r, g, b;
      switch (t) {
        case T_FOREST: r = 120; g = 150; b = 95; break;
        case T_WATER: r = 150; g = 180; b = 205; break;
        case T_FORD: r = 190; g = 200; b = 195; break;
        case T_MARSH: r = 170; g = 175; b = 130; break;
        case T_STOCKADE: r = 120; g = 85; b = 50; break;
        default: { float sh = 1.f - hn * 0.28f; r = (uint8_t)(237 * sh); g = (uint8_t)(227 * sh); b = (uint8_t)(204 * sh); }
      }
      if (t == T_OPEN || t == T_FOREST) { float hh = T.height[k]; float m = fmodf(hh, 3.f); if (m < 0.35f && hh > 0.5f) { r = (uint8_t)(r * 0.85f); g = (uint8_t)(g * 0.85f); b = (uint8_t)(b * 0.85f); } }
      px[k * 4] = r; px[k * 4 + 1] = g; px[k * 4 + 2] = b; px[k * 4 + 3] = 255;
    }
    terrainTex = gfx.makeTexture(T.w, T.h, px.data()); terrainWorldW = T.w * T.cell; terrainWorldH = T.h * T.cell;
  }
  void homeCamera(const Snapshot& s) {
    float sx = 0, sy = 0; int n = 0; for (auto& u : s.units) if (u.side == player && u.alive > 0) { sx += u.cx; sy += u.cy; n++; }
    if (n) { cam.cx = sx / n; cam.cy = sy / n + 120.f * (player == 0 ? 1 : -1); }
    cam.zoom = 1.6f * dpi;
  }
  void onNewGeneration(const Snapshot& s) { sel.clear(); for (auto& g : groups) g.clear(); prev.reset(); if (s.terrain) buildTerrainTexture(*s.terrain); homeCamera(s); }
  int unitAt(const Snapshot& s, float x, float y, float r) const {
    int best = -1; float bd = r * r;
    for (auto& u : s.units) { if (u.alive == 0) continue; float dx = u.cx - x, dy = u.cy - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = u.id; } }
    if (best >= 0) return best;
    bd = 9.f;
    for (size_t i = 0; i < s.x.size(); i++) { if (s.state[i] >= S_WOUNDED) continue; float dx = s.x[i] - x, dy = s.y[i] - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = s.unit[i]; } }
    return best;
  }
  void zoomToSelection(const Snapshot& s) {
    if (sel.empty()) return; float x0 = 1e9f, y0 = 1e9f, x1 = -1e9f, y1 = -1e9f;
    for (int u : sel) { const UnitView& U = s.units[u]; x0 = std::min(x0, U.cx - U.hx - 20); x1 = std::max(x1, U.cx + U.hx + 20); y0 = std::min(y0, U.cy - U.hy - 20); y1 = std::max(y1, U.cy + U.hy + 20); }
    cam.cx = (x0 + x1) * 0.5f; cam.cy = (y0 + y1) * 0.5f;
    cam.zoom = std::clamp(std::min(cam.W / (x1 - x0), cam.H * 0.8f / (y1 - y0)), 0.15f * dpi, 30.f * dpi);
  }
  // —— 军令（全部进队列） ——
  void order(int u, Order o) { Cmd c; c.type = Cmd::ORDER; c.unit = u; c.order = o; st.push(c); }
  void avgFacing(const Snapshot& s, float& fx, float& fy) { fx = 0; fy = 0; for (int u : sel) { fx += s.units[u].fx; fy += s.units[u].fy; } float l = hypotf(fx, fy); if (l < 1e-4f) { fx = 0; fy = 1; } else { fx /= l; fy /= l; } }
  // 多曲行进：保持相对位置；给了到达朝向则把整体布局绕重心转到新朝向（整部轮转）
  void orderMove(const Snapshot& s, float wx, float wy, OrderType t, int arg = -1, float ffx = 0, float ffy = 0) {
    if (sel.empty()) return;
    float cx = 0, cy = 0; for (int u : sel) { cx += s.units[u].cx; cy += s.units[u].cy; } cx /= sel.size(); cy /= sel.size();
    float afx, afy; avgFacing(s, afx, afy);
    float cosR = 1, sinR = 0;
    if (ffx != 0 || ffy != 0) { float l = hypotf(ffx, ffy); float nfx = ffx / l, nfy = ffy / l; float a0 = atan2f(afy, afx), a1 = atan2f(nfy, nfx); cosR = cosf(a1 - a0); sinR = sinf(a1 - a0); }
    for (int u : sel) { const UnitView& U = s.units[u]; float ox = U.cx - cx, oy = U.cy - cy; float rx = ox * cosR - oy * sinR, ry = ox * sinR + oy * cosR; Order o{t, wx + rx, wy + ry, arg}; o.fx = ffx; o.fy = ffy; order(u, o); }
  }
  void orderOnEnemy(const Snapshot& s, int e) {
    for (int u : sel) { const UnitView& U = s.units[u]; const UnitView& E = s.units[e]; if (kindIsMissile(U.kind)) order(u, {O_FIRE, 0, 0, e}); else if (kindIsCav(U.kind)) order(u, {O_CHARGE, E.cx, E.cy, e}); else order(u, {O_ATTACK, 0, 0, e}); }
  }
  void orderRetreat(const Snapshot& s) {
    for (int u : sel) { const UnitView& U = s.units[u]; const Side& E = s.sides[1 - U.side]; float dx = U.cx - E.gx, dy = U.cy - E.gy, l = hypotf(dx, dy); if (l < 1) { dx = 0; dy = 1; l = 1; } order(u, {O_RETREAT, U.cx + dx / l * 120.f, U.cy + dy / l * 120.f}); }
  }
  // 列阵：选中各曲沿当前平均朝向的垂线并排，左右按原来的横向次序，间隔 8 m
  void orderLineUp(const Snapshot& s) {
    if (sel.size() < 2) return;
    float cx = 0, cy = 0; for (int u : sel) { cx += s.units[u].cx; cy += s.units[u].cy; } cx /= sel.size(); cy /= sel.size();
    float fx, fy; avgFacing(s, fx, fy); float rx = fy, ry = -fx;
    std::vector<std::pair<float, int>> ord; for (int u : sel) ord.push_back({(s.units[u].cx - cx) * rx + (s.units[u].cy - cy) * ry, u});
    std::sort(ord.begin(), ord.end());
    float total = 0; for (auto& p : ord) total += s.units[p.second].hx * 2; total += 8.f * (ord.size() - 1);
    float pos = -total * 0.5f;
    for (auto& p : ord) { const UnitView& U = s.units[p.second]; float c = pos + U.hx; Order o{O_MOVE, cx + rx * c, cy + ry * c, -1}; o.fx = fx; o.fy = fy; order(p.second, o); pos += U.hx * 2 + 8.f; }
  }
  void selectPart(const Snapshot& s, int unit) { int part = s.units[unit].part; for (auto& u : s.units) if (u.side == player && u.part == part && u.alive > 0) sel.insert(u.id); }
  bool inMinimap(int x, int y) const { float x0 = cam.W / dpi - mmSize - 10, y0 = cam.H / dpi - mmSize - 10 - 30; return x >= x0 && x <= x0 + mmSize && y >= y0 && y <= y0 + mmSize; }
  void minimapToWorld(int x, int y, float& wx, float& wy) const { float x0 = cam.W / dpi - mmSize - 10, y0 = cam.H / dpi - mmSize - 10 - 30; wx = (x - x0) / mmSize * terrainWorldW; wy = (1.f - (y - y0) / mmSize) * terrainWorldH; }

  void handle(SDL_Event& e) {
    const Snapshot* s = cur.get(); if (!s) return;
    SDL_Keymod m = SDL_GetModState(); bool ctrl = (m & (KMOD_CTRL | KMOD_GUI)) != 0;
    if (e.type == SDL_MOUSEWHEEL) { float wx, wy; cam.toWorld(mx * dpi, my * dpi, wx, wy); cam.zoom *= e.wheel.y > 0 ? 1.15f : (1 / 1.15f); cam.zoom = std::clamp(cam.zoom, 0.15f * dpi, 30.f * dpi); float nx, ny; cam.toWorld(mx * dpi, my * dpi, nx, ny); cam.cx += wx - nx; cam.cy += wy - ny; }
    else if (e.type == SDL_MOUSEMOTION) { mx = e.motion.x; my = e.motion.y; if (dragging) { cam.cx -= e.motion.xrel * dpi / cam.zoom; cam.cy += e.motion.yrel * dpi / cam.zoom; } }
    else if (e.type == SDL_MOUSEBUTTONDOWN) {
      if (e.button.button == SDL_BUTTON_MIDDLE) dragging = true;
      else if (e.button.button == SDL_BUTTON_LEFT) {
        if (inMinimap(e.button.x, e.button.y)) { minimapToWorld(e.button.x, e.button.y, cam.cx, cam.cy); return; }
        selecting = true; selX0 = e.button.x; selY0 = e.button.y;
      }
      else if (e.button.button == SDL_BUTTON_RIGHT) { rdown = true; rX0 = e.button.x; rY0 = e.button.y; }
    } else if (e.type == SDL_MOUSEBUTTONUP) {
      if (e.button.button == SDL_BUTTON_MIDDLE) dragging = false;
      else if (e.button.button == SDL_BUTTON_RIGHT && rdown) {
        rdown = false;
        float wx, wy; cam.toWorld(rX0 * dpi, rY0 * dpi, wx, wy);
        int ddx = e.button.x - rX0, ddy = e.button.y - rY0; bool drag = ddx * ddx + ddy * ddy > 144;
        int hit = drag ? -1 : unitAt(*s, wx, wy, 12.f / cam.zoom * dpi + 6.f);
        if (hit >= 0 && s->units[hit].side != player) orderOnEnemy(*s, hit);
        else if (m & KMOD_SHIFT) orderMove(*s, wx, wy, O_CHARGE);
        else if (m & KMOD_ALT) orderMove(*s, wx, wy, O_RETREAT);
        else if (drag) { float ux, uy; cam.toWorld(e.button.x * dpi, e.button.y * dpi, ux, uy); orderMove(*s, wx, wy, O_MOVE, ctrl ? 1 : -1, ux - wx, uy - wy); }
        else orderMove(*s, wx, wy, O_MOVE, ctrl ? 1 : -1);
      } else if (e.button.button == SDL_BUTTON_LEFT && selecting) {
        selecting = false; if (!(m & KMOD_SHIFT)) sel.clear();
        int x0 = std::min(selX0, e.button.x), x1 = std::max(selX0, e.button.x), y0 = std::min(selY0, e.button.y), y1 = std::max(selY0, e.button.y);
        if (x1 - x0 < 4 && y1 - y0 < 4) {
          float wx, wy; cam.toWorld(e.button.x * dpi, e.button.y * dpi, wx, wy); int hit = unitAt(*s, wx, wy, 12.f / cam.zoom * dpi + 6.f);
          uint32_t now = SDL_GetTicks(); bool dbl = hit >= 0 && hit == lastClickUnit && now - lastClickMs < 400; lastClickMs = now; lastClickUnit = hit;
          if (hit >= 0 && s->units[hit].side == player) { if (dbl) selectPart(*s, hit); else sel.insert(hit); }
        } else for (auto& u : s->units) { if (u.side != player || u.alive == 0) continue; float sx, sy; cam.toScreen(u.cx, u.cy, sx, sy); sx /= dpi; sy /= dpi; if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) sel.insert(u.id); }
      }
    } else if (e.type == SDL_KEYDOWN) {
      SDL_Keycode k = e.key.keysym.sym;
      if (k == SDLK_SPACE) st.paused = !st.paused;
      else if (k == SDLK_PERIOD) { st.paused = true; st.stepOnce = 1; }
      else if (k == SDLK_LEFTBRACKET) st.speedIdx = std::max(0, st.speedIdx.load() - 1);
      else if (k == SDLK_RIGHTBRACKET) st.speedIdx = std::min(SimThread::NSPEED - 1, st.speedIdx.load() + 1);
      else if (k == SDLK_j) { st.jump = st.jump.load() ? 0 : 1; st.paused = false; }
      else if (k == SDLK_h) for (int u : sel) order(u, {O_HALT});
      else if (k == SDLK_r) orderRetreat(*s);
      else if (k == SDLK_p) for (int u : sel) order(u, {s->units[u].stance == ST_PRONE ? O_RISE : O_PRONE});
      else if (k == SDLK_f) { float wx, wy; cam.toWorld(mx * dpi, my * dpi, wx, wy); for (int u : sel) order(u, {O_FACE, wx - s->units[u].cx, wy - s->units[u].cy}); }
      else if (k == SDLK_l) orderLineUp(*s);
      else if (k >= SDLK_F1 && k <= SDLK_F9) for (int u : sel) { if (k == SDLK_F9 && !kindIsCav(s->units[u].kind)) continue; order(u, {O_FORMATION, 0, 0, (int)(k - SDLK_F1)}); }   // F9 波次仅骑兵
      else if (k >= SDLK_1 && k <= SDLK_9) { int gi = k - SDLK_0; if (ctrl) groups[gi] = sel; else if (!groups[gi].empty()) { if (!(m & KMOD_SHIFT)) sel.clear(); for (int u : groups[gi]) if (s->units[u].alive > 0) sel.insert(u); } }
      else if (k == SDLK_a && !ctrl) { sel.clear(); for (auto& u : s->units) if (u.side == player && u.alive > 0) sel.insert(u.id); }
      else if (k == SDLK_a && ctrl) { sel.clear(); for (auto& u : s->units) if (u.side == player && u.alive > 0) sel.insert(u.id); }
      else if (k == SDLK_g) { Cmd c; c.type = Cmd::TOGGLE_AI; st.push(c); }
      else if (k == SDLK_n && ctrl) { seed++; requestLoad(); }
      else if (k == SDLK_TAB) { scenarioIdx = (scenarioIdx + 1) % (int)scenarios().size(); requestLoad(); }
      else if (k == SDLK_z) zoomToSelection(*s);
      else if (k == SDLK_HOME) homeCamera(*s);
      else if (k == SDLK_ESCAPE) sel.clear();
      if (k == SDLK_UP || k == SDLK_w) keys[0] = true; if (k == SDLK_DOWN || k == SDLK_s) keys[1] = true; if (k == SDLK_LEFT) keys[2] = true; if (k == SDLK_RIGHT || k == SDLK_d) keys[3] = true;
    } else if (e.type == SDL_KEYUP) {
      SDL_Keycode k = e.key.keysym.sym;
      if (k == SDLK_UP || k == SDLK_w) keys[0] = false; if (k == SDLK_DOWN || k == SDLK_s) keys[1] = false; if (k == SDLK_LEFT) keys[2] = false; if (k == SDLK_RIGHT || k == SDLK_d) keys[3] = false;
    }
  }

  static uint32_t moraleColor(float m) { if (m > 60) return RGBA(70, 150, 70); if (m > 40) return RGBA(200, 160, 40); return RGBA(190, 60, 50); }
  void dashed(float x0, float y0, float x1, float y1, float width, uint32_t c) { float dx = x1 - x0, dy = y1 - y0, l = hypotf(dx, dy); if (l < 1) return; float seg = 8 * dpi; int n = (int)(l / seg); for (int i = 0; i < n; i += 2) { float a = i * seg / l, b = std::min(1.f, (i + 1) * seg / l); gfx.line(x0 + dx * a, y0 + dy * a, x0 + dx * b, y0 + dy * b, width, c); } }

  void draw(const Snapshot& s, const Snapshot* p, double alpha, bool fast, bool swap = true) {
    int dw, dh; SDL_GL_GetDrawableSize(win, &dw, &dh); cam.W = dw; cam.H = dh;
    gfx.begin(dw, dh);
    if (terrainTex) { float x0, y0, x1, y1; cam.toScreen(0, terrainWorldH, x0, y0); cam.toScreen(terrainWorldW, 0, x1, y1); gfx.texQuad(x0, y0, x1 - x0, y1 - y0, terrainTex, 0, 1, 1, 0); }
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
      if (st == S_CAPTURED) { xy2.push_back(sx); xy2.push_back(sy); c2.insert(c2.end(), {110, 110, 120, 140}); continue; }
      if (red) { r = 176; g = 36; b = 36; } else { r = 36; g = 72; b = 170; }
      if (st == S_ROUT) { r = (uint8_t)(r * 0.5f + 120); g = (uint8_t)(g * 0.5f + 120); b = (uint8_t)(b * 0.5f + 120); }
      if (kindIsMissile(s.kind[i])) g = (uint8_t)std::min(255, g + 60);
      if (s.flags[i] & 16) { r = 240; g = 200; b = 40; }
      xy[live * 2] = sx; xy[live * 2 + 1] = sy; rgba[live * 4] = r; rgba[live * 4 + 1] = g; rgba[live * 4 + 2] = b; rgba[live * 4 + 3] = a; live++;
    }
    float ps = std::clamp(0.9f * cam.zoom, 1.5f * dpi, 14.f * dpi);
    if (!xy2.empty()) gfx.points(xy2.data(), c2.data(), (int)xy2.size() / 2, ps * 0.8f);
    gfx.points(xy.data(), rgba.data(), live, ps);
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
    // 曲：旗、朝向、选中圈、士气 / 凝聚条、名字、命令线
    bool showDetail = cam.zoom > 0.6f * dpi && !fast;
    for (auto& u : s.units) {
      if (u.alive + u.routed == 0) continue;
      float sx, sy; cam.toScreen(u.cx, u.cy, sx, sy);
      if (sx < -200 || sy < -200 || sx > dw + 200 || sy > dh + 200) continue;
      uint32_t c = u.side == 0 ? C_RED : C_BLUE; bool isSel = sel.count(u.id) > 0; float fl = 10.f * dpi;
      gfx.line(sx, sy, sx, sy - fl * 2.2f, 1.5f * dpi, C_INK);
      if (u.flagAlive) gfx.tri(sx, sy - fl * 2.2f, sx + fl * 1.2f, sy - fl * 1.8f, sx, sy - fl * 1.3f, c);
      gfx.line(sx, sy, sx + u.fx * 18.f * dpi, sy - u.fy * 18.f * dpi, 1.2f * dpi, u.stance == ST_CHARGE ? RGBA(200, 120, 0) : C_GREY);
      if (isSel) gfx.circle(sx, sy, 14.f * dpi, 2.f * dpi, C_GOLD);
      if (u.broken) gfx.circle(sx, sy, 10.f * dpi, 1.f * dpi, C_GREY, 12);
      if (showDetail || isSel) {
        // 士气条（彩）与凝聚条（灰），在旗杆右侧
        float bw = 22.f * dpi, bh = 3.f * dpi, bx = sx + 4 * dpi, by = sy - fl * 1.0f;
        gfx.rect(bx, by, bw, bh, RGBA(0, 0, 0, 50)); gfx.rect(bx, by, bw * std::clamp(u.moraleAvg / 100.f, 0.f, 1.f), bh, moraleColor(u.moraleAvg));
        gfx.rect(bx, by + bh + 1.5f * dpi, bw, bh, RGBA(0, 0, 0, 50)); gfx.rect(bx, by + bh + 1.5f * dpi, bw * std::clamp(u.cohesion, 0.f, 1.f), bh, RGBA(90, 90, 100));
      }
      bool firstOfPart = u.id == 0 || s.units[u.id - 1].part != u.part || s.units[u.id - 1].side != u.side;   // 同部只标第一曲，放大后全标
      if (((cam.zoom > 0.9f * dpi && (firstOfPart || cam.zoom > 2.5f * dpi)) && !fast) || isSel) {
        std::string lab = st.unitNames[u.id] + (u.stance == ST_PRONE ? "(伏)" : "");
        if (isSel) lab += " " + std::to_string(u.alive);
        float tw = gfx.textWidth(lab); gfx.flush(); gfx.text(lab, sx - tw * 0.5f, sy - fl * 2.2f - gfx.lineH() - 2, c);
      }
      if (isSel) {
        if (u.stance == ST_MOVE || u.stance == ST_CHARGE || u.stance == ST_RETREAT || u.stance == ST_DISENGAGE) { float gx, gy; cam.toScreen(u.gx, u.gy, gx, gy); gfx.line(sx, sy, gx, gy, 1.f * dpi, RGBA(220, 160, 20, 160)); gfx.circle(gx, gy, 4 * dpi, 1.5f * dpi, RGBA(220, 160, 20, 200), 10); }
        if (u.pendType != 255) {   // 在途的下一道令：虚线 + 倒计时
          float tx = u.pendX, ty = u.pendY; bool hasPt = (u.pendType == O_MOVE || u.pendType == O_CHARGE || u.pendType == O_RETREAT);
          if (u.pendType == O_ATTACK && u.attackTarget < 0) { /* 目标在 arg 里，快照未带；画在本曲上方 */ }
          if (hasPt) { float gx, gy; cam.toScreen(tx, ty, gx, gy); dashed(sx, sy, gx, gy, 1.f * dpi, RGBA(120, 100, 40, 180)); gfx.circle(gx, gy, 4 * dpi, 1.f * dpi, RGBA(120, 100, 40, 200), 10); }
          char tb[32]; snprintf(tb, sizeof tb, "令 %.1fs", u.pendTicks * 0.1f); gfx.flush(); gfx.text(tb, sx + 16 * dpi, sy - fl * 2.6f, RGBA(120, 100, 40));
        }
      }
    }
    if (rdown) { int ddx = mx - rX0, ddy = my - rY0; if (ddx * ddx + ddy * ddy > 144) gfx.line(rX0 * dpi, rY0 * dpi, mx * dpi, my * dpi, 2.f * dpi, RGBA(220, 160, 20, 200)); }
    if (selecting) { int x0 = std::min(selX0, mx), y0 = std::min(selY0, my); gfx.rect(x0 * dpi, y0 * dpi, abs(mx - selX0) * dpi, abs(my - selY0) * dpi, RGBA(220, 160, 20, 50)); }
    gfx.flush();
    drawHud(s, dw, dh);
    drawMinimap(s, dw, dh);
    drawTooltip(s);
    gfx.flush();
    if (swap) SDL_GL_SwapWindow(win); else glFinish();
  }

  void drawTooltip(const Snapshot& s) {
    float wx, wy; cam.toWorld(mx * dpi, my * dpi, wx, wy); int hit = unitAt(s, wx, wy, 10.f / cam.zoom * dpi + 4.f);
    if (hit < 0) return; const UnitView& U = s.units[hit]; char buf[256];
    snprintf(buf, sizeof buf, "%s · %s · %s  存%d 亡%d 伤%d 降%d 溃%d  士气%.0f 凝聚%.0f%%", st.unitNames[hit].c_str(), kindName(U.kind), formationName(U.formation), U.alive, U.dead, U.wounded, U.captured, U.routed, U.moraleAvg, U.cohesion * 100);
    float tw = gfx.textWidth(buf), lh = gfx.lineH(); float x = mx * dpi + 14 * dpi, y = my * dpi + 14 * dpi; if (x + tw > cam.W) x = cam.W - tw - 4;
    gfx.rect(x - 4 * dpi, y - 2 * dpi, tw + 8 * dpi, lh + 4 * dpi, RGBA(255, 252, 240, 230)); gfx.flush(); gfx.text(buf, x, y, U.side == 0 ? C_RED : C_BLUE);
  }

  void drawMinimap(const Snapshot& s, int dw, int dh) {
    if (!terrainTex) return;
    float sz = mmSize * dpi, x0 = dw - sz - 10 * dpi, y0 = dh - sz - 10 * dpi - 30 * dpi;
    gfx.rect(x0 - 2 * dpi, y0 - 2 * dpi, sz + 4 * dpi, sz + 4 * dpi, RGBA(60, 50, 40, 220)); gfx.flush();
    gfx.texQuad(x0, y0, sz, sz, terrainTex, 0, 1, 1, 0);
    auto toMM = [&](float wx, float wy, float& px, float& py) { px = x0 + wx / terrainWorldW * sz; py = y0 + (1.f - wy / terrainWorldH) * sz; };
    for (auto& u : s.units) { if (u.alive == 0) continue; float px, py; toMM(u.cx, u.cy, px, py); float r = std::max(2.f * dpi, u.hx / terrainWorldW * sz); gfx.rect(px - r, py - r * 0.6f, r * 2, r * 1.2f, u.side == 0 ? C_RED : C_BLUE); if (sel.count(u.id)) gfx.circle(px, py, r + 2 * dpi, 1.f * dpi, C_GOLD, 8); }
    float ax, ay, bx, by; cam.toWorld(0, 0, ax, ay); cam.toWorld((float)dw, (float)dh, bx, by); float px0, py0, px1, py1; toMM(ax, ay, px0, py0); toMM(bx, by, px1, py1);
    px0 = std::clamp(px0, x0, x0 + sz); px1 = std::clamp(px1, x0, x0 + sz); py0 = std::clamp(py0, y0, y0 + sz); py1 = std::clamp(py1, y0, y0 + sz);
    gfx.line(px0, py0, px1, py0, 1.f * dpi, C_INK); gfx.line(px1, py0, px1, py1, 1.f * dpi, C_INK); gfx.line(px1, py1, px0, py1, 1.f * dpi, C_INK); gfx.line(px0, py1, px0, py0, 1.f * dpi, C_INK);
    gfx.flush();
  }

  void drawHud(const Snapshot& s, int dw, int dh) {
    float lh = gfx.lineH(), pad = 8 * dpi; char buf[512];
    gfx.rect(0, 0, (float)dw, lh * 2.3f + pad, RGBA(255, 252, 240, 215)); gfx.flush();
    for (int sd = 0; sd < 2; sd++) {
      const Side& S = s.sides[sd];
      snprintf(buf, sizeof buf, "%s%s  总 %d  在阵 %d  阵亡 %d  伤 %d  降 %d  溃 %d%s%s", S.name.c_str(), sd == player ? "（我）" : "（AI）", S.total, S.alive, S.dead, S.wounded, S.captured, S.routed, S.generalDown ? "  主将殁" : "", S.fled ? "  主将走" : "");
      gfx.text(buf, pad + sd * dw * 0.5f, pad * 0.5f, sd == 0 ? C_RED : C_BLUE);
    }
    float sp = SimThread::SPEEDS[st.speedIdx.load()]; char spd[64];
    if (st.jump.load()) snprintf(spd, sizeof spd, "跳到下一事件 · 实际 ×%.1f", s.actualSpeed);
    else if (st.paused) snprintf(spd, sizeof spd, "暂停（. 单步）");
    else if (sp > 0) snprintf(spd, sizeof spd, "目标 ×%g · 实际 ×%.1f", sp, s.actualSpeed);
    else snprintf(spd, sizeof spd, "最快 · 实际 ×%.1f", s.actualSpeed);
    snprintf(buf, sizeof buf, "%s  %.1f 分  %s  人 %zu  tick %.2f ms  %.0f fps  线程 %d  %s", st.title.c_str(), s.time / 60.0, spd, s.nSoldiers, s.stepMs, fps, s.threads, s.ended ? (s.winner >= 0 ? (s.sides[s.winner].name + "胜").c_str() : "罢兵") : "");
    gfx.text(buf, pad, pad * 0.5f + lh, C_INK);
    // 底部：帮助两行 + 选中面板（每曲一行，最多 8 行）
    int nSel = std::min<int>(8, (int)sel.size()); if ((int)sel.size() > 8) nSel++;   // 多出的「…共 N 曲」占一行
    float bottomH = lh * (2.4f + nSel) + pad;
    gfx.rect(0, dh - bottomH, (float)dw, bottomH, RGBA(255, 252, 240, 215)); gfx.flush();
    gfx.text(HELP1, pad, dh - lh * 2 - pad * 0.5f, C_GREY); gfx.text(HELP2, pad, dh - lh - pad * 0.5f, C_GREY);
    if (nSel) {
      float y = dh - bottomH + pad * 0.5f; int shown = 0;
      for (int u : sel) {
        const UnitView& U = s.units[u];
        char cav[32] = ""; if (U.cavPhase) snprintf(cav, sizeof cav, " %s·第%d轮", cavPhaseName(U.cavPhase), U.cycles);
        char kn[64]; snprintf(kn, sizeof kn, "%s%s%s", kindName(U.kind), U.rearKind != 255 ? "+" : "", U.rearKind != 255 ? kindName(U.rearKind) : "");
        char am[24] = ""; if (kindIsMissile(U.kind)) snprintf(am, sizeof am, "  矢%.0f", std::max(0.f, U.ammo));
        snprintf(buf, sizeof buf, "%s [%s%s] %s%s  存%d 亡%d 伤%d 降%d 溃%d  疲%.0f%s%s%s%s", st.unitNames[u].c_str(), kn, U.elite ? "·精" : "", formationName(U.formation), am, U.alive, U.dead, U.wounded, U.captured, U.routed, U.fatigue, cav, U.officerAlive ? "" : " 军候殁", U.flagAlive ? "" : " 旗倒", U.pendType != 255 ? " 令在途" : "");
        gfx.text(buf, pad, y, C_INK);
        float bx = dw - (mmSize + 320) * dpi, bw = 110 * dpi, bh = lh * 0.45f;   // 条放在小地图左侧
        gfx.rect(bx, y + lh * 0.15f, bw, bh, RGBA(0, 0, 0, 40)); gfx.rect(bx, y + lh * 0.15f, bw * std::clamp(U.moraleAvg / 100.f, 0.f, 1.f), bh, moraleColor(U.moraleAvg));
        gfx.rect(bx + bw + 10 * dpi, y + lh * 0.15f, bw, bh, RGBA(0, 0, 0, 40)); gfx.rect(bx + bw + 10 * dpi, y + lh * 0.15f, bw * std::clamp(U.cohesion, 0.f, 1.f), bh, RGBA(90, 90, 100));
        gfx.flush(); gfx.text("气", bx - 18 * dpi, y, C_GREY); gfx.text("凝", bx + bw - 8 * dpi, y, C_GREY);
        y += lh; if (++shown >= 8) break;
      }
      if ((int)sel.size() > 8) { snprintf(buf, sizeof buf, "…共 %zu 曲", sel.size()); gfx.text(buf, pad, y, C_GREY); }
    }
    int cnt = (int)s.events.size(); float ex = dw - 420 * dpi, ey = lh * 2.3f + pad * 2;
    gfx.rect(ex - pad, ey - pad * 0.5f, 420 * dpi, cnt * lh + pad, RGBA(255, 252, 240, 170)); gfx.flush();
    for (int i = 0; i < cnt; i++) { const Event& e = s.events[i]; snprintf(buf, sizeof buf, "%5.1f′ %s", e.tick * 0.1 / 60.0, e.text.c_str()); gfx.text(buf, ex, ey + i * lh, C_INK); }
    gfx.flush();
  }

  int run(int argc, char** argv) {
    for (int i = 1; i < argc; i++) { std::string a = argv[i]; if (a == "--seed" && i + 1 < argc) seed = atoi(argv[++i]); else if (a == "--screenshot" && i + 1 < argc) shotPath = argv[++i]; else if (a == "--ticks" && i + 1 < argc) shotTicks = atoi(argv[++i]); else if (a == "--run-seconds" && i + 1 < argc) runSeconds = atof(argv[++i]); else if (a == "--after" && i + 1 < argc) shotAfter = atoi(argv[++i]); else if (a == "--zoom" && i + 1 < argc) shotZoom = (float)atof(argv[++i]); else if (a == "--center" && i + 1 < argc) centerUnit = atoi(argv[++i]); else if (a == "--select-all") shotSelectAll = true; else if (a == "--move" && i + 1 < argc) { int u; float x, y; if (sscanf(argv[++i], "%d,%f,%f", &u, &x, &y) == 3) { demoUnits.push_back(u); demoOrders.push_back({O_MOVE, x, y}); } } else if (a == "--charge" && i + 1 < argc) { int u, t; if (sscanf(argv[++i], "%d,%d", &u, &t) == 2) { demoUnits.push_back(u); demoOrders.push_back({O_CHARGE, 0, 0, t}); } } else if (a == "--side" && i + 1 < argc) player = atoi(argv[++i]); else if (a == "--speed" && i + 1 < argc) st.speedIdx = std::clamp(atoi(argv[++i]), 0, SimThread::NSPEED - 1); else for (size_t k = 0; k < scenarios().size(); k++) if (scenarios()[k].id == a) scenarioIdx = (int)k; }
    if (SDL_Init(SDL_INIT_VIDEO) != 0) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3); SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE); SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    win = SDL_CreateWindow("万人阵 · 汉末会战", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 1600, 1000, SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI);
    if (!win) { fprintf(stderr, "window: %s\n", SDL_GetError()); return 1; }
    ctx = SDL_GL_CreateContext(win); SDL_GL_SetSwapInterval(0);
    int ww, wh, dw, dh; SDL_GetWindowSize(win, &ww, &wh); SDL_GL_GetDrawableSize(win, &dw, &dh); dpi = (float)dw / ww;
    if (!gfx.init(win, dpi)) return 1;
    if (!shotPath.empty()) {
      for (int k = 0; k < 20; k++) { SDL_Event e; while (SDL_PollEvent(&e)) {} SDL_Delay(10); }
      st.loadNow(scenarioIdx, seed, player);
      Sim* sim = st.simNow();
      for (size_t k = 0; k < demoUnits.size(); k++) { Order o = demoOrders[k]; const Unit& U = sim->w.units[demoUnits[k]]; if (o.type == O_CHARGE) { const Unit& T = sim->w.units[o.arg]; o.x = T.cx; o.y = T.cy; } else { o.x += U.cx; o.y += U.cy; } sim->issue(demoUnits[k], o, false); }
      for (int t = 0; t < shotTicks; t++) st.tickNow();
      if (demoUnits.empty()) for (int t = 0; t < 1200; t++) { bool recent = false; for (const Shot& sh : sim->shots) if (sim->w.tick - sh.tick <= 5) { recent = true; break; } if (recent) break; st.tickNow(); }
      auto s0 = st.snapshotNow(); onNewGeneration(*s0);
      if (centerUnit >= 0) { cam.cx = sim->w.units[centerUnit].cx; cam.cy = sim->w.units[centerUnit].cy; }
      else if (!sim->shots.empty()) { double sx = 0, sy = 0; float wgt = shotAfter >= 10 ? 1.f : 0.5f; for (const Shot& sh : sim->shots) { sx += sh.x0 + (sh.x1 - sh.x0) * wgt; sy += sh.y0 + (sh.y1 - sh.y0) * wgt; } cam.cx = (float)(sx / sim->shots.size()); cam.cy = (float)(sy / sim->shots.size()); }
      if (shotZoom > 0) cam.zoom = shotZoom * dpi;
      for (int t = 0; t < shotAfter; t++) st.tickNow();
      auto s1 = st.snapshotNow();
      if (shotSelectAll) { for (auto& u : s1->units) if (u.side == player) sel.insert(u.id); } else if (centerUnit >= 0) sel.insert(centerUnit); else { sel.insert(0); sel.insert(1); }
      for (int u : demoUnits) sel.insert(u);
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
        float sp = SimThread::SPEEDS[st.speedIdx.load()]; bool fast = st.jump.load() || sp == 0 || sp >= 8.f;
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
