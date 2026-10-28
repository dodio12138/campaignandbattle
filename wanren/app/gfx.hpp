// 渲染：OpenGL 3.3 core。点（士卒）一次 draw call；彩色三角形批（面板、旗、选框）；SDL_ttf 文本贴图缓存
#pragma once
#include <SDL.h>
#include <OpenGL/gl3.h>
#include <string>
#include <unordered_map>
#include <vector>
#include <cstdint>

struct Tex { GLuint id = 0; int w = 0, h = 0; };

class Gfx {
 public:
  bool init(SDL_Window* win, float dpi);
  void begin(int drawableW, int drawableH);
  // 点：pos 为屏幕坐标数组（x,y 交错），rgba 为每点颜色
  void points(const float* xy, const uint8_t* rgba, int n, float size);
  // 三角形批（屏幕坐标）
  void rect(float x, float y, float w, float h, uint32_t rgba);
  void line(float x0, float y0, float x1, float y1, float width, uint32_t rgba);
  void tri(float x0, float y0, float x1, float y1, float x2, float y2, uint32_t rgba);
  void circle(float cx, float cy, float r, float width, uint32_t rgba, int seg = 24);
  void flush();
  // 文本（UTF-8），返回宽度
  float text(const std::string& s, float x, float y, uint32_t rgba, int pt = 0);
  float textWidth(const std::string& s, int pt = 0);
  float lineH(int pt = 0);
  float dpi = 1.f;
 private:
  GLuint prog_ = 0, vao_ = 0, vbo_ = 0, pvao_ = 0, pvboXY_ = 0, pvboC_ = 0;
  GLint uRes_ = -1, uTex_ = -1, uSize_ = -1, uMode_ = -1;
  int W_ = 1, H_ = 1;
  std::vector<float> batch_;   // x,y,u,v,r,g,b,a
  int basePt_ = 14;
  std::unordered_map<std::string, Tex> cache_;
  std::vector<std::string> cacheOrder_;
  const Tex& textTex(const std::string& s, int pt);
  void pushQuad(float x, float y, float w, float h, float u0, float v0, float u1, float v1, uint32_t rgba);
};
inline uint32_t RGBA(int r, int g, int b, int a = 255) { return (uint32_t)r | ((uint32_t)g << 8) | ((uint32_t)b << 16) | ((uint32_t)a << 24); }
