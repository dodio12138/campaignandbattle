#include "gfx.hpp"
#include "text_backend.hpp"
#include <cstdio>
#include <cmath>

static const char* VS = R"(#version 330 core
layout(location=0) in vec2 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCol;
uniform vec2 uRes; uniform float uSize; out vec2 vUV; out vec4 vCol;
void main(){ vec2 p = aPos / uRes * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0); gl_PointSize = uSize; vUV = aUV; vCol = aCol; })";
static const char* FS = R"(#version 330 core
in vec2 vUV; in vec4 vCol; uniform sampler2D uTex; uniform int uMode; out vec4 o;
void main(){
  if (uMode == 1) { vec2 d = gl_PointCoord - vec2(0.5); if (dot(d,d) > 0.25) discard; o = vCol; }
  else if (uMode == 2) { o = vCol * texture(uTex, vUV); }
  else o = vCol; })";

static GLuint compile(GLenum t, const char* src) {
  GLuint s = glCreateShader(t); glShaderSource(s, 1, &src, nullptr); glCompileShader(s);
  GLint ok; glGetShaderiv(s, GL_COMPILE_STATUS, &ok); if (!ok) { char log[2048]; glGetShaderInfoLog(s, 2048, nullptr, log); fprintf(stderr, "shader: %s\n", log); }
  return s;
}

bool Gfx::init(SDL_Window* win, float dpiScale) {
  (void)win; dpi = dpiScale;
  GLuint vs = compile(GL_VERTEX_SHADER, VS), fs = compile(GL_FRAGMENT_SHADER, FS);
  prog_ = glCreateProgram(); glAttachShader(prog_, vs); glAttachShader(prog_, fs); glLinkProgram(prog_);
  GLint ok; glGetProgramiv(prog_, GL_LINK_STATUS, &ok); if (!ok) { fprintf(stderr, "link failed\n"); return false; }
  uRes_ = glGetUniformLocation(prog_, "uRes"); uTex_ = glGetUniformLocation(prog_, "uTex"); uSize_ = glGetUniformLocation(prog_, "uSize"); uMode_ = glGetUniformLocation(prog_, "uMode");
  // 批 VAO：x,y,u,v,r,g,b,a（8 float）
  glGenVertexArrays(1, &vao_); glGenBuffers(1, &vbo_);
  glBindVertexArray(vao_); glBindBuffer(GL_ARRAY_BUFFER, vbo_);
  glEnableVertexAttribArray(0); glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 32, (void*)0);
  glEnableVertexAttribArray(1); glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 32, (void*)8);
  glEnableVertexAttribArray(2); glVertexAttribPointer(2, 4, GL_FLOAT, GL_FALSE, 32, (void*)16);
  // 点 VAO：xy（float2）+ 颜色（ubyte4 归一化）
  glGenVertexArrays(1, &pvao_); glGenBuffers(1, &pvboXY_); glGenBuffers(1, &pvboC_);
  glBindVertexArray(pvao_);
  glBindBuffer(GL_ARRAY_BUFFER, pvboXY_); glEnableVertexAttribArray(0); glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 8, (void*)0);
  glBindBuffer(GL_ARRAY_BUFFER, pvboC_); glEnableVertexAttribArray(2); glVertexAttribPointer(2, 4, GL_UNSIGNED_BYTE, GL_TRUE, 4, (void*)0);
  glDisableVertexAttribArray(1); glVertexAttrib2f(1, 0, 0);
  glBindVertexArray(0);
  glEnable(GL_BLEND); glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  glEnable(GL_PROGRAM_POINT_SIZE);
  if (!textInit(basePt_ * dpi)) { fprintf(stderr, "文本后端初始化失败\n"); return false; }
  return true;
}

void Gfx::begin(int w, int h) {
  W_ = w; H_ = h; glViewport(0, 0, w, h);
  glClearColor(0.93f, 0.89f, 0.80f, 1.f);   // 宣纸色
  glClear(GL_COLOR_BUFFER_BIT);
  glUseProgram(prog_); glUniform2f(uRes_, (float)w, (float)h); glUniform1i(uTex_, 0);
}

void Gfx::points(const float* xy, const uint8_t* rgba, int n, float size) {
  if (n <= 0) return;
  flush();
  glBindVertexArray(pvao_);
  glBindBuffer(GL_ARRAY_BUFFER, pvboXY_); glBufferData(GL_ARRAY_BUFFER, n * 8, xy, GL_STREAM_DRAW);
  glBindBuffer(GL_ARRAY_BUFFER, pvboC_); glBufferData(GL_ARRAY_BUFFER, n * 4, rgba, GL_STREAM_DRAW);
  glUniform1i(uMode_, 1); glUniform1f(uSize_, size);
  glDrawArrays(GL_POINTS, 0, n);
  glBindVertexArray(0);
}

static inline void col(uint32_t c, float* o) { o[0] = (c & 255) / 255.f; o[1] = ((c >> 8) & 255) / 255.f; o[2] = ((c >> 16) & 255) / 255.f; o[3] = ((c >> 24) & 255) / 255.f; }

void Gfx::pushQuad(float x, float y, float w, float h, float u0, float v0, float u1, float v1, uint32_t rgba) {
  float c[4]; col(rgba, c);
  float v[6][4] = {{x, y, u0, v0}, {x + w, y, u1, v0}, {x + w, y + h, u1, v1}, {x, y, u0, v0}, {x + w, y + h, u1, v1}, {x, y + h, u0, v1}};
  for (auto& p : v) { batch_.insert(batch_.end(), {p[0], p[1], p[2], p[3], c[0], c[1], c[2], c[3]}); }
}
void Gfx::rect(float x, float y, float w, float h, uint32_t rgba) { pushQuad(x, y, w, h, 0, 0, 0, 0, rgba); }
void Gfx::tri(float x0, float y0, float x1, float y1, float x2, float y2, uint32_t rgba) {
  float c[4]; col(rgba, c);
  batch_.insert(batch_.end(), {x0, y0, 0, 0, c[0], c[1], c[2], c[3], x1, y1, 0, 0, c[0], c[1], c[2], c[3], x2, y2, 0, 0, c[0], c[1], c[2], c[3]});
}
void Gfx::line(float x0, float y0, float x1, float y1, float width, uint32_t rgba) {
  float dx = x1 - x0, dy = y1 - y0, l = sqrtf(dx * dx + dy * dy); if (l < 1e-4f) return;
  float nx = -dy / l * width * 0.5f, ny = dx / l * width * 0.5f;
  tri(x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, rgba); tri(x0 + nx, y0 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny, rgba);
}
void Gfx::circle(float cx, float cy, float r, float width, uint32_t rgba, int seg) {
  for (int i = 0; i < seg; i++) { float a0 = 6.2831853f * i / seg, a1 = 6.2831853f * (i + 1) / seg; line(cx + r * cosf(a0), cy + r * sinf(a0), cx + r * cosf(a1), cy + r * sinf(a1), width, rgba); }
}
void Gfx::flush() {
  if (batch_.empty()) return;
  glBindVertexArray(vao_); glBindBuffer(GL_ARRAY_BUFFER, vbo_);
  glBufferData(GL_ARRAY_BUFFER, batch_.size() * sizeof(float), batch_.data(), GL_STREAM_DRAW);
  glUniform1i(uMode_, 0);
  glDrawArrays(GL_TRIANGLES, 0, (GLsizei)(batch_.size() / 8));
  glBindVertexArray(0); batch_.clear();
}

const Tex& Gfx::textTex(const std::string& s, int pt) {
  std::string key = std::to_string(pt) + "|" + s;
  auto it = cache_.find(key); if (it != cache_.end()) return it->second;
  if (cache_.size() > 2000) { for (auto& k : cacheOrder_) { glDeleteTextures(1, &cache_[k].id); cache_.erase(k); } cacheOrder_.clear(); }
  std::vector<uint8_t> px; Tex t;
  if (textRender(s, pt ? 1.6f : 1.f, px, t.w, t.h)) {
    glGenTextures(1, &t.id); glBindTexture(GL_TEXTURE_2D, t.id);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, t.w, t.h, 0, GL_RGBA, GL_UNSIGNED_BYTE, px.data());
  }
  cacheOrder_.push_back(key);
  return cache_[key] = t;
}
float Gfx::text(const std::string& s, float x, float y, uint32_t rgba, int pt) {
  if (s.empty()) return 0;
  const Tex& t = textTex(s, pt); if (!t.id) return 0;
  flush();
  pushQuad(x, y, (float)t.w, (float)t.h, 0, 0, 1, 1, rgba);
  glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, t.id);
  glBindVertexArray(vao_); glBindBuffer(GL_ARRAY_BUFFER, vbo_);
  glBufferData(GL_ARRAY_BUFFER, batch_.size() * sizeof(float), batch_.data(), GL_STREAM_DRAW);
  glUniform1i(uMode_, 2); glDrawArrays(GL_TRIANGLES, 0, 6); glBindVertexArray(0); batch_.clear();
  return (float)t.w;
}
float Gfx::textWidth(const std::string& s, int pt) { return s.empty() ? 0.f : (float)textTex(s, pt).w; }
float Gfx::lineH(int pt) { return textLineHeight(pt ? 1.6f : 1.f); }
