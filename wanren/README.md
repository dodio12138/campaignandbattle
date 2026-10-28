# 万人阵 · 汉末单兵级会战模拟

每名士卒一个点，伍什队屯曲部编组；玩家以「曲」为单位下令（行进、冲、退、射、换阵、伏盾），命令经金鼓旗令延迟到达；兵器、甲胄、无镫骑兵、阵法、士气与溃散按史料建模。考据与模型见 `docs/DESIGN.md`。

原生 C++20 + SDL2 + OpenGL 3.3，无其他依赖。

```bash
brew install sdl2 cmake               # macOS（中文用系统 CoreText，不需要 SDL2_ttf；Linux 另装 sdl2_ttf）
npm run build                          # = cmake -S . -B build && cmake --build build
./build/wanren [jieqiao|plain] [--seed N] [--side 0|1]   # 图形程序
./build/wanren jieqiao --screenshot out.bmp --ticks 1800  # 无交互：跑 N tick 截图退出（验证用）
./build/wanren_bench plain 3000 [线程数] [种子]            # 基准（AI 对 AI）
./build/wanren_test                                       # 回归测试
```

参数：复制 `params.example.txt` 为 `params.txt`（程序启动目录），每行 `key = value` 覆盖默认值；键名见 `core/params.hpp`。

操作：左键框选 / 点选己方曲；右键行进（Shift 冲、Alt 退，点敌曲 = 冲 / 射）；H 止、R 退、P 伏盾/起、F 面向鼠标；1–8 换阵（方 数 疏 圆 锥 雁 横 纵）；空格暂停，[ ] 倍速，A 全选，G 本方交给 AI，N 换种子重开，Tab 换剧本；滚轮缩放，中键 / 方向键平移。
