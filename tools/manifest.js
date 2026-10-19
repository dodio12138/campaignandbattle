/* 源码清单：浏览器与 Node 共用同一加载顺序（全局脚本，后者可引用前者的顶层常量） */
module.exports = {
  engine: [
    "src/engine/round_engine.js",   // 战斗引擎
    "src/engine/tactics.js",        // 战术 AI
    "src/engine/round_adapter.js",  // 引擎→界面适配
    "src/engine/campaign.js",       // 战役层 + 战略 AI + 历史模式
    "src/data/scenarios.js",        // 内置剧本
  ],
  ui: { head: "src/ui/head.html", styles: "src/ui/styles.css", body: "src/ui/body.html", main: "src/ui/main.js", map: "src/ui/map_svg.js", camp: "src/ui/camp_ui.js", rmap: "src/ui/report_map.js", lab: "src/ui/camp_lab.js", cbatch: "src/ui/batch_camp.js", play: "src/ui/play.js", kit: "src/ui/kit.html" },
};
