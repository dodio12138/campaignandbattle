# campaignandbattle · 汉末会战沙盘

汉末三国题材的兵棋沙盘，参考 HOI4 的组织度/兵力双轨结算，分两层：

页面分两种模式：**游玩**（战役 / 战斗，先在大厅选剧本或战例、选阵营，再开打）与**编辑器**（战役编辑、战斗编辑、战术、规则、批量推演）。

- **战役层（大地图）**：据点、道路、粮仓与运粮、军团目标（坚守 / 进攻 / 截粮 / 火攻 / 增援 / 护粮 / 阻击 / 撤回）、天气与季节；两军相遇即转入战场。双方主帅由**战略 AI** 指挥，表现取决于统帅（决断、执行）与智略（情报、谋划）。
- **战场层（会战）**：回合制会战，兵种、阵型、地形、主将位置、城防与攻城器械、远程与骑兵冲击、计谋（佯退、激怒、诱敌等），以及带着目标作战的战术 AI（焚粮、坚守、护粮）。

此外还有**历史模式**：用随机种子固定推演，用「史实倾向」把随机推向史实，最后生成史书体纪事和史实吻合度。

纯前端、零依赖：构建产物是一个单文件 HTML，双击即可在浏览器中运行。

## 快速开始

```bash
# 需要 Node.js 18+
npm run build        # 生成 dist/index.html（直接用浏览器打开）、dist/artifact.html 和控件样板 dist/ui-kit.html
npm run serve        # 本地预览 http://localhost:8848（不缓存，构建后刷新即见）
npm test             # 回归测试（战役能打完、同种子可复现、历史模式吻合度、烧仓/截粮/火攻规则）
npm run sim -- YILING 50 --history 0.8      # 命令行批量推演
npm run sim -- GUANDU --log 1003 --history 1 # 打印某一局的完整日志
npm run export-scenarios                     # 内置剧本导出为 scenarios/*.json
```

不想装 Node 也可以：直接打开 `dist/index.html`。

## 目录

```
src/
  engine/round_engine.js   战斗引擎：兵种、状态（STATUS）、阵型（FORM）、地形、任务、城防器械、天气
  engine/tactics.js        战术 AI：条件 DSL、战术库、性格与智略门槛
  engine/round_adapter.js  引擎 → 界面的视图适配
  engine/campaign.js       战役层：补给、交战、战略 AI（StrategicAI）、历史模式、火攻/烧仓/截粮
  data/scenarios.js        内置剧本：官渡之战、夷陵之战
  ui/head.html  ui/body.html  ui/styles.css
  ui/main.js               战场、模式与页签切换、战斗编辑、批量推演、战术编辑、规则编辑
  ui/camp_ui.js            战役地图、战役编辑器、自动推演、战役报告与史书体
  ui/map_svg.js            地图绘制（道路曲线、进军箭头、兵旗、标记），战役地图与报告共用
  ui/report_map.js         战役报告：战役示意图、每日战况回放、导出 PNG
  ui/play.js               游玩模式：战役开局大厅、选战例大厅、战场军令（玩家下达战术）
  ui/kit.html              控件样板（构建为 dist/ui-kit.html）
tools/
  manifest.js              源码加载顺序（浏览器与 Node 共用）
  build.js                 拼装单文件页面 → dist/
  load.js                  在 Node 的 vm 中加载引擎（测试与脚本用）
  sim.js                   命令行批量推演
  export-scenarios.js      剧本导出 JSON
tests/                     node:test 回归测试
scenarios/                 剧本 JSON（可在页面「编辑器 → 战役编辑 → 导入 / 导出」中导入）
docs/DESIGN.md             规则与系统说明（参数含义、AI 决策逻辑）
docs/UI-GUIDE.md           界面控件使用条例（改界面前先看）
docs/CHANGELOG.md          版本记录
dist/                      构建产物（勿手改）
```

所有引擎文件都是「全局脚本」，没有 import/export：浏览器里按 `tools/manifest.js` 的顺序拼进同一个 `<script>`，Node 里由 `tools/load.js` 放进同一个 vm 上下文。新增引擎文件时把它加进 manifest 即可。

## 开发流程

1. 改 `src/` 下的文件；改界面时遵守 `docs/UI-GUIDE.md`，新控件先加进 `src/ui/kit.html`。
2. `npm run build`，刷新浏览器里的 `dist/index.html`。
3. `npm test`；调平衡时用 `npm run sim` 批量看胜率和吻合度。
4. 要更新在线版（claude.ai Artifact），发布 `dist/artifact.html`：发布时会自动套 `<html>` 外壳，所以这个文件不含外壳。

## 新增战役

- **页面里做**：打开「编辑器 → 战役编辑」→「新建空白战役」或「复制为新战役」，编辑据点（可拖动）、道路、军团、胜负条件；用「导入 / 导出」得到 JSON，存进 `scenarios/`。
- **内置为剧本**：把 JSON 作为一个新键加进 `src/data/scenarios.js` 的 `CAMP_SCENARIOS`，重新构建；`npm test` 会自动检查它的引用完整、能打完、可复现。
- 历史模式需要 `history.anchors`（史实锚点）和 `history.outcomes`（史实结局），格式见 `docs/DESIGN.md`。

## 浏览器存档

设置与存档存在浏览器 localStorage，键名：

| 键 | 内容 |
|---|---|
| `hm-camp-v2` | 当前战役进度 |
| `hm-camp-cfg-v1` | 战役设置（剧本、指挥方、历史模式、种子） |
| `hm-camp-sc4` | 剧本（含编辑过的内置剧本与自定义战役） |
| `hm-camp-cp2` | 战役参数 |
| `hm-rules-v14` / `hm-tactics-v3` | 战斗规则 / 战术编辑 |
| `hm-play-v1` | 游玩大厅里的选择（剧本、战例、阵营） |

不同打开方式（本地文件、在线 Artifact）属于不同来源，存档不互通；自定义战役请用「导入 / 导出」JSON 迁移。

## 来源

由 claude.ai 上的「汉末会战沙盘」Artifact（v17）拆分迁移而来；拆分前后页面行为一致（构建产物与在线版逐段对比、浏览器自动化测试通过）。
