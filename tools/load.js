/* 在 Node 中加载引擎（vm 上下文，等价于浏览器里的同一个 <script>）。
   用法：const E = require("./tools/load")(); new E.Campaign(E.CAMP_SCENARIOS.GUANDU, {...}) */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { engine } = require("./manifest");
const ROOT = path.join(__dirname, "..");
const EXPORTS = ["Battle","TacticalAI","attachRoundAI","Campaign","StrategicAI","CAMP_SCENARIOS","CP","UT","UNIT_ORDER","MISSION_NAME","T_PERSONA","P","STATUS","FORM"];
module.exports = function load(){
  const ctx = { console, Math, JSON, Date }; vm.createContext(ctx);
  const src = engine.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  vm.runInContext(src + `\n;globalThis.__E={${EXPORTS.map(k => `${k}:typeof ${k}!=="undefined"?${k}:undefined`).join(",")}};`, ctx, { filename: "engine-bundle.js" });
  return ctx.__E;
};
