/* 把内置剧本导出为 scenarios/*.json —— 可在页面「战役设置 → 导入 / 导出」中粘贴导入，作为自定义战役的起点 */
const fs = require("fs"), path = require("path"); const E = require("./load")();
for (const [k, sc] of Object.entries(E.CAMP_SCENARIOS)) { const f = path.join(__dirname, "../scenarios", k.toLowerCase() + ".json"); fs.writeFileSync(f, JSON.stringify(sc, null, 1) + "\n"); console.log("wrote", path.relative(process.cwd(), f)); }
