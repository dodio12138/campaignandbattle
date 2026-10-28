#include "text_backend.hpp"
#import <CoreText/CoreText.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreFoundation/CoreFoundation.h>
#include <cmath>

static float g_px = 14.f;
static CTFontRef fontFor(float scale) {
  static CTFontRef cache[8] = {}; static float sizes[8] = {}; 
  float px = g_px * scale;
  for (int i = 0; i < 8; i++) if (cache[i] && fabsf(sizes[i] - px) < 0.01f) return cache[i];
  const char* names[] = {"PingFangSC-Regular", "HiraginoSansGB-W3", "STHeitiSC-Light", "Helvetica"};
  CTFontRef f = nullptr;
  for (const char* n : names) {
    CFStringRef cs = CFStringCreateWithCString(nullptr, n, kCFStringEncodingUTF8);
    f = CTFontCreateWithName(cs, px, nullptr); CFRelease(cs);
    if (f) { CFStringRef got = CTFontCopyPostScriptName(f); bool ok = got && CFStringCompare(got, CFStringCreateWithCString(nullptr, n, kCFStringEncodingUTF8), 0) == kCFCompareEqualTo; if (got) CFRelease(got); if (ok) break; CFRelease(f); f = nullptr; }
  }
  if (!f) f = CTFontCreateWithName(CFSTR("Helvetica"), px, nullptr);
  for (int i = 0; i < 8; i++) if (!cache[i]) { cache[i] = f; sizes[i] = px; break; }
  return f;
}
bool textInit(float px) { g_px = px; return fontFor(1.f) != nullptr; }
float textLineHeight(float scale) { CTFontRef f = fontFor(scale); return (float)(CTFontGetAscent(f) + CTFontGetDescent(f) + CTFontGetLeading(f)) * 1.15f; }

bool textRender(const std::string& utf8, float scale, std::vector<uint8_t>& out, int& w, int& h) {
  CTFontRef font = fontFor(scale);
  CFStringRef str = CFStringCreateWithBytes(nullptr, (const UInt8*)utf8.data(), (CFIndex)utf8.size(), kCFStringEncodingUTF8, false);
  if (!str) return false;
  CGColorRef white = CGColorCreateGenericRGB(1, 1, 1, 1);
  const void* keys[] = {kCTFontAttributeName, kCTForegroundColorAttributeName};
  const void* vals[] = {font, white};
  CFDictionaryRef attrs = CFDictionaryCreate(nullptr, keys, vals, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  CFAttributedStringRef as = CFAttributedStringCreate(nullptr, str, attrs);
  CTLineRef line = CTLineCreateWithAttributedString(as);
  CGFloat ascent, descent, leading; double width = CTLineGetTypographicBounds(line, &ascent, &descent, &leading);
  w = (int)ceil(width) + 2; h = (int)ceil(ascent + descent) + 2;
  if (w < 1) w = 1; if (h < 1) h = 1;
  out.assign((size_t)w * h * 4, 0);
  CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
  CGContextRef ctx = CGBitmapContextCreate(out.data(), w, h, 8, w * 4, cs, kCGImageAlphaPremultipliedLast);
  CGContextSetTextPosition(ctx, 1, descent + 1);
  CTLineDraw(line, ctx);
  CGContextRelease(ctx); CGColorSpaceRelease(cs);
  CFRelease(line); CFRelease(as); CFRelease(attrs); CGColorRelease(white); CFRelease(str);
  // 预乘白字 → 非预乘：RGB 置 255，alpha 保留（CG 位图第 0 行即顶行，不必翻转）
  for (size_t i = 0; i < out.size(); i += 4) { out[i] = out[i + 1] = out[i + 2] = 255; }
  return true;
}
