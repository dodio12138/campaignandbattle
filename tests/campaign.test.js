/* 战役层回归测试：node --test */
const test = require("node:test"), assert = require("node:assert");
const E = require("../tools/load")();
const play = (key, opts) => { const sc = E.CAMP_SCENARIOS[key]; const c = new E.Campaign(sc, { control: { A: "ai", B: "ai" }, ...opts });
  for (let d = 0; d < (sc.maxDays || 60) + 5 && !c.over; d++) { for (const e of c.beginDay()) c.resolveAuto(e); c.endDay(); } return c; };

for (const key of Object.keys(E.CAMP_SCENARIOS)) {
  test(`${key}：剧本引用完整`, () => { const sc = E.CAMP_SCENARIOS[key], N = sc.nodes;
    for (const [a, b] of sc.edges) assert.ok(N[a] && N[b], `道路 ${a}-${b}`);
    for (const a of sc.armies) { assert.ok(N[a.at], a.id + " at"); if (a.mission.target) assert.ok(N[a.mission.target], a.id + " target"); }
    for (const v of sc.victory) { if (v.node) assert.ok(N[v.node]); if (v.army) assert.ok(sc.armies.some(a => a.id === v.army)); } });
  test(`${key}：AI 对 AI 能打完`, () => { for (let s = 1; s <= 5; s++) { const c = play(key, { seed: s }); assert.ok(c.over, "种子 " + s + " 未结束"); } });
  test(`${key}：同种子可完全复现`, () => { const a = play(key, { seed: 42, history: true, tendency: 0.7 }), b = play(key, { seed: 42, history: true, tendency: 0.7 });
    assert.strictEqual(a.day, b.day); assert.deepStrictEqual(a.over, b.over); assert.strictEqual(JSON.stringify(a.log), JSON.stringify(b.log)); });
  test(`${key}：史实倾向 100% 时吻合度高`, () => { let f = 0; for (let s = 1; s <= 10; s++) f += play(key, { seed: s, history: true, tendency: 1 }).fidelity().score; assert.ok(f / 10 >= 0.8, "平均吻合度 " + f / 10); });
}
test("烧粮仓：一次焚乌巢八成，袁军组织大降且数日难复", () => {
  const c = new E.Campaign(E.CAMP_SCENARIOS.GUANDU, { control: { A: "ai", B: "ai" }, seed: 7 });
  const org = () => { let t = 0, k = 0; for (const a of c.armies) if (a.side === "B" && !a.gone) for (const u of a.units) if (!u.gone && !E.UT[u.n].supply) { t += u.org / E.UT[u.n].org; k++; } return t / k; };
  const n = c.nodes.wuchao, b = n.depot.food * 0.8; n.depot.food -= b; c.depotLoss(n, b);
  assert.ok(org() < 0.7, "焚后组织 " + org()); c.endDay(); assert.ok(org() <= E.CP.SHAKEN_CAP + 1e-6, "动摇期组织上限");
});
test("截粮：截下运粮过半只小挫", () => {
  const c = new E.Campaign(E.CAMP_SCENARIOS.GUANDU, { control: { A: "ai", B: "ai" }, seed: 7 });
  c.convoyLoss(c.army("Y4"), 25, 30); const u = c.army("Y1").units[0]; assert.ok(u.org / E.UT[u.n].org > 0.9);
});
test("火攻：林木营寨在酷暑下火势强，雨天点不着", () => {
  const c = new E.Campaign(E.CAMP_SCENARIOS.YILING, { control: { A: "ai", B: "ai" }, seed: 3 }); const g = c.army("W2").gen;
  assert.ok(c.fireStrength("xiaoting", g, "酷暑") > 0.6); assert.strictEqual(c.fireStrength("xiaoting", g, "雨"), 0);
});
