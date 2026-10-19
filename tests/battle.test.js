/* 战斗层：由战役交战生成的战斗规格，同种子结果一致 */
const test = require("node:test"), assert = require("node:assert");
const E = require("../tools/load")();
test("战斗：同一规格同种子，结果一致", () => {
  const c = new E.Campaign(E.CAMP_SCENARIOS.GUANDU, { control: { A: "ai", B: "ai" }, seed: 5 });
  let e = null; for (let d = 0; d < 20 && !e; d++) { e = c.beginDay().find(x => !x.standoff) || null; if (!e) c.endDay(); }
  assert.ok(e, "20 日内应有交战"); const spec = c.battleSpec(e);
  const run = () => { const b = new E.Battle(JSON.parse(JSON.stringify(spec)), 99); const ais = { A: new E.TacticalAI("A", { persona: spec.A.ai.persona }), B: new E.TacticalAI("B", { persona: spec.B.ai.persona }) }; E.attachRoundAI(b, ais); return b.run(); };
  const r1 = run(), r2 = run(); assert.deepStrictEqual(JSON.parse(JSON.stringify(r1)), JSON.parse(JSON.stringify(r2)));
});
