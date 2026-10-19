const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
test("构建产物包含全部源码段", () => {
  execFileSync(process.execPath, [path.join(__dirname, "../tools/build.js")]);
  const h = fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8");
  for (const s of ['<script id="engine">', '<script id="camp-ui">', "class Campaign", "const CAMP_SCENARIOS", "YILING", "<!doctype html>"]) assert.ok(h.includes(s), s);
});
