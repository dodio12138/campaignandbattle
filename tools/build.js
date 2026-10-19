/* 构建：把 src/ 拼成单文件页面
   dist/index.html    —— 完整 HTML 文档，可直接双击用浏览器打开
   dist/artifact.html —— 不含 <html>/<body> 外壳，用于发布为 claude.ai Artifact（发布时自动套壳） */
const fs = require("fs"), path = require("path");
const { engine, ui } = require("./manifest");
const ROOT = path.join(__dirname, ".."), rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const pkg = JSON.parse(rd("package.json"));
const eng = engine.map(f => `/* ==== ${f} ==== */\n` + rd(f)).join("\n");
const inner = [
  rd(ui.head).trim(),
  `<style>\n${rd(ui.styles)}</style>`,
  rd(ui.body).trim(),
  `<script id="engine">\n${eng}\n</script>`,
  `<script>\n${rd(ui.main)}</script>`,
  `<script id="map-svg">\n${rd(ui.map)}</script>`,
  `<script id="camp-ui">\n${rd(ui.camp)}</script>`,
  `<script id="report-map">\n${rd(ui.rmap)}</script>`,
  `<script id="play-ui">\n${rd(ui.play)}</script>`,
].join("\n");
fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist/artifact.html"), inner + "\n");
const full = `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<!-- ${pkg.name} v${pkg.version} · 由 tools/build.js 生成，请勿直接修改，改 src/ 后重新构建 -->\n</head>\n<body>\n${inner}\n</body>\n</html>\n`;
fs.writeFileSync(path.join(ROOT, "dist/index.html"), full);
// 控件样板页：与正式页面共用样式（见 docs/UI-GUIDE.md）
const kit = `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${rd(ui.head).trim().replace("<title>汉末会战沙盘</title>", "<title>控件样板</title>")}\n<style>\n${rd(ui.styles)}</style>\n</head>\n<body>\n${rd(ui.kit).trim()}\n</body>\n</html>\n`;
fs.writeFileSync(path.join(ROOT, "dist/ui-kit.html"), kit);
console.log(`built dist/index.html (${(full.length/1024).toFixed(0)} KB), dist/artifact.html and dist/ui-kit.html`);
