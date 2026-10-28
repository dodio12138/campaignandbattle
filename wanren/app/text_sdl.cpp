#include "text_backend.hpp"
#include <SDL_ttf.h>
#include <SDL.h>
#include <cstdio>
static TTF_Font* g_font[4] = {}; static float g_px = 14.f;
static TTF_Font* fontFor(float scale) {
  int slot = scale > 1.3f ? 1 : 0; if (g_font[slot]) return g_font[slot];
  const char* fonts[] = {"/System/Library/Fonts/Hiragino Sans GB.ttc", "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "C:/Windows/Fonts/msyh.ttc"};
  for (const char* f : fonts) { g_font[slot] = TTF_OpenFont(f, (int)(g_px * scale)); if (g_font[slot]) break; }
  return g_font[slot];
}
bool textInit(float px) { g_px = px; if (TTF_Init() != 0) return false; return fontFor(1.f) != nullptr; }
float textLineHeight(float scale) { TTF_Font* f = fontFor(scale); return f ? (float)TTF_FontLineSkip(f) : g_px * scale * 1.3f; }
bool textRender(const std::string& s, float scale, std::vector<uint8_t>& out, int& w, int& h) {
  TTF_Font* f = fontFor(scale); if (!f) return false;
  SDL_Color white = {255, 255, 255, 255};
  SDL_Surface* surf = TTF_RenderUTF8_Blended(f, s.c_str(), white); if (!surf) return false;
  SDL_Surface* conv = SDL_ConvertSurfaceFormat(surf, SDL_PIXELFORMAT_ABGR8888, 0); SDL_FreeSurface(surf);
  w = conv->w; h = conv->h; out.assign((uint8_t*)conv->pixels, (uint8_t*)conv->pixels + (size_t)w * h * 4); SDL_FreeSurface(conv);
  return true;
}
