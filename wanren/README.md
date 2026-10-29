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

地形：10 m 网格，高程 / 林 / 水 / 渡口 / 沼（`core/terrain.hpp`，剧本里用 `TerrainFeature` 摆放）；林慢、沼慢、水不可入、遇河自动绕渡口、仰攻吃亏、居高射远。

行进规则：转向按轮转做，角速度受外翼步速限制（宽阵转得慢但整齐），大角度轮转时减速；短距离侧向 / 后向调整自动平移；行进中绕开厚的友军方阵，薄横列（纵深 < 6 m）可穿过但两边都会乱一阵。

参数：复制 `params.example.txt` 为 `params.txt`（程序启动目录），每行 `key = value` 覆盖默认值；键名见 `core/params.hpp`。

操作：左键点选 / 框选，双击选整部；右键行进（拖动 = 到达后面向该方向，多曲时整体布局随之轮转；Shift 冲、Alt 退、Ctrl 平移保持朝向）；右键点敌曲：步兵行进到接敌再冲、突骑反复冲击、弓弩射、弓骑游射。H 止、R 退、P 伏盾/起、F 面向鼠标、L 列阵（选中各曲并排）；F1–F8 换阵（方 数 疏 圆 锥 雁 横 纵）；Ctrl+1–9 编组、1–9 选组、A 全选；空格暂停，`.` 单步，[ ] 倍速，J 跳到下一事件（接敌 / 齐射 / 溃 / 纪事后自动回 ×1）；Z 缩放到选中，Home 回本阵，G 本方交给 AI，Ctrl+N 换种子重开，Tab 换剧本；滚轮缩放，中键 / 方向键平移，点小地图跳转。曲旗旁的两条短条是士气（彩）与凝聚（灰）；选中的曲画出当前目标（实线）与在途命令（虚线 + 倒计时）；鼠标悬停显示该曲详情。玩家方弓弩默认「自保」：敌步兵近 30 m 自动退到本方步兵身后。
