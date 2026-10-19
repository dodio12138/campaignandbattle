/* 命令行批量推演（AI 对 AI）
   node tools/sim.js [剧本=GUANDU] [局数=20] [--history 倾向0~1] [--seed 起始种子] [--log 种子]
   例：node tools/sim.js YILING 50 --history 0.8
       node tools/sim.js GUANDU --log 1003 --history 1      # 打印单局日志 */
const E = require("./load")();
const args = process.argv.slice(2), flags = {}, pos = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith("--")) flags[args[i].slice(2)] = args[++i]; else pos.push(args[i]); }
const opt = k => flags[k];
const key = pos.find(a => !/^\d+$/.test(a)) || "GUANDU", N = +(pos.find(a => /^\d+$/.test(a)) || 20);
const sc = E.CAMP_SCENARIOS[key]; if (!sc) { console.error("未知剧本：" + key + "；可用：" + Object.keys(E.CAMP_SCENARIOS).join(", ")); process.exit(1); }
const hist = opt("history"), seed0 = +(opt("seed") ?? 1);
const play = seed => { const c = new E.Campaign(sc, { control: { A: "ai", B: "ai" }, seed, history: hist != null, tendency: hist != null ? +hist : 0 });
  for (let d = 0; d < (sc.maxDays || 60) + 5 && !c.over; d++) { for (const e of c.beginDay()) c.resolveAuto(e); c.endDay(); } return c; };
if (opt("log")) { const c = play(+opt("log")); for (const l of c.log) console.log(`D${l.day} ${l.kind ? "[" + l.kind + "] " : ""}${l.t}`); process.exit(0); }
const res = {}, oc = {}; let days = 0, fid = 0;
for (let i = 0; i < N; i++) { const c = play(seed0 + i); const k = c.over ? (c.over.side ? c.sideName(c.over.side) + "：" + c.over.text : c.over.text) : "未决";
  res[k] = (res[k] || 0) + 1; days += c.day;
  if (c.hist.outcomes.length) { const f = c.fidelity(); fid += f.score; for (const o of f.list) oc[o.text] = (oc[o.text] || 0) + (o.ok ? 1 : 0); } }
console.log(`${sc.name} · ${N} 局 · 种子 ${seed0}–${seed0 + N - 1} · ${hist != null ? "历史模式 倾向 " + hist : "自由推演"} · 平均 ${(days / N).toFixed(1)} 日`);
for (const [k, v] of Object.entries(res).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
if (Object.keys(oc).length) { console.log(`  史实吻合度 平均 ${Math.round(fid / N * 100)}%`); for (const [k, v] of Object.entries(oc)) console.log(`    ${Math.round(v / N * 100).toString().padStart(3)}%  ${k}`); }
