// 文本光栅化后端：把 UTF-8 字符串渲成 RGBA（非预乘）位图。macOS 用 CoreText；其他平台用 SDL2_ttf
#pragma once
#include <string>
#include <vector>
#include <cstdint>
bool textInit(float pxSize);                       // 基础字号（像素）
bool textRender(const std::string& utf8, float scale, std::vector<uint8_t>& rgba, int& w, int& h);   // scale: 1 = 基础字号
float textLineHeight(float scale);
