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

行进规则：转向按轮转做，角速度受外翼步速限制（宽阵转得慢但整齐），大角度轮转时减速；短距离侧向 / 后向调整自动平移；行进中绕开厚的友军方阵，薄横列（纵深 < 6 m）可穿过但两边都会乱一阵。

参数：复制 `params.example.txt` 为 `params.txt`（程序启动目录），每行 `key = value` 覆盖默认值；键名见 `core/params.hpp`。

操作：左键框选 / 点选己方曲；右键行进（拖动 = 到达后面向拖动方向；Shift 冲、Alt 退、Ctrl 平移保持朝向；点敌曲 = 冲 / 射）；H 止、R 退、P 伏盾/起、F 面向鼠标；1–8 换阵（方 数 疏 圆 锥 雁 横 纵）；空格暂停，`.` 单步，[ ] 倍速（×0.5 到 ×32 再到最快，顶栏显示实际倍率），A 全选，G 本方交给 AI，N 换种子重开，Tab 换剧本；滚轮缩放，中键 / 方向键平移。
