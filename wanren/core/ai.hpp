#pragma once
#include "sim.hpp"
// 一方由 AI 指挥：每 2 秒议定一次（统帅只决定「曲」级命令，命令同样经旗鼓延迟）
void aiStep(Sim& sim, int side);
