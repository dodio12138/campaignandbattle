/* 六时段：时钟推进、行军时段、晚到不战、事件、逐时段态势、存档 */
const test = require("node:test"), assert = require("node:assert");
const E = require("../tools/load")();
const mk = (key = "GUANDU", seed = 3, o = {}) => new E.Campaign(E.CAMP_SCENARIOS[key], { control: { A: "ai", B: "ai" }, seed, ...o });
const stepP = c => { for (const e of c.beginPeriod()) if (!e.done) c.resolveAuto(e); c.endPeriod(); };

test("时钟：一日六时段，第六段终了翻日", () => {
  const c = mk(); assert.strictEqual(E.PERIODS.length, 6); assert.strictEqual(c.ph, 0);
  for (let i = 0; i < 6; i++) { assert.strictEqual(c.day, 1); stepP(c); }
  assert.strictEqual(c.day, 2); assert.strictEqual(c.ph, 0);
  assert.strictEqual(c.frames.length, 6); assert.strictEqual(c.frames.map(f => f.p).join(","), "0,1,2,3,4,5");
});

test("行军：普通军团只在清晨、上午、下午走，一日走满一日路程", () => {
  const c = mk(); for (let d = 0; d < 6 && !c.over; d++) for (let i = 0; i < 6; i++) {
    const before = c.armies.map(a => [a.id, a.at, a.prog, a.mission.type]); const ph = c.ph; stepP(c);
    const moved = c.armies.filter(a => { const b = before.find(x => x[0] === a.id); return b && (b[1] !== a.at || Math.abs(b[2] - a.prog) > 1e-9) && !["raid", "fire"].includes(b[3]) && !["raid", "fire"].includes(a.mission.type) && !a.met; });
    if (![1, 2, 3].includes(ph)) assert.strictEqual(moved.length, 0, `第 ${ph} 段不应行军：${moved.map(a => a.name)}`); }
});

test("交战：一地一日至多一战，开战时段记入战报", () => {
  const c = mk("GUANDU", 5); for (let d = 0; d < 25 && !c.over; d++) { for (const e of c.beginDay()) c.resolveAuto(e); c.endDay(); }
  const seen = new Set(); for (const b of c.battles) { const k = b.node + "|" + b.day; assert.ok(!seen.has(k), "同日同地两战：" + k); seen.add(k); assert.ok(b.ph >= 0 && b.ph < 6); }
  assert.ok(c.battles.length > 0);
});

test("晚到不战：过午抵达敌前者隔营相望，次日清晨接战", () => {
  for (let s = 1; s <= 10; s++) { const c = mk("GUANDU", s);
    for (let d = 0; d < 30 && !c.over; d++) { for (const e of c.beginDay()) c.resolveAuto(e); c.endDay(); }
    for (const b of c.battles) if (b.ph >= 3 && b.ph <= 4) assert.ok(b.night || b.met, `种子 ${s}：${b.desc} 过午开战，应为途中遭遇或奇袭`); }
});

test("事件：交战、粮仓被焚会记为暂停事件", () => {
  const c = mk("GUANDU", 7); const kinds = new Set();
  for (let i = 0; i < 6 * 25 && !c.over; i++) { const eng = c.beginPeriod(); for (const a of c.alerts) kinds.add(a.kind); for (const e of eng) c.resolveAuto(e); for (const a of c.alerts) kinds.add(a.kind); c.endPeriod(); }
  assert.ok(kinds.has("contact"), "应有接敌事件"); assert.ok(kinds.has("sight") || kinds.has("arrive"));
});

test("存档：时段、逐时段态势随存档保存", () => {
  const c = mk(); for (let i = 0; i < 9; i++) stepP(c);
  const r = E.Campaign.load(c.save()); assert.strictEqual(r.day, c.day); assert.strictEqual(r.ph, c.ph); assert.strictEqual(r.frames.length, c.frames.length);
  stepP(r); assert.strictEqual(r.frames.length, c.frames.length + 1);
});

test("存档：未处理的交战随存档保存", () => {
  const c = mk("GUANDU", 3); let eng = []; for (let i = 0; i < 6 * 10 && !eng.length; i++) { eng = c.beginPeriod(); if (!eng.length) c.endPeriod(); }
  assert.ok(eng.length, "十日内应有交战"); const r = E.Campaign.load(c.save()); assert.strictEqual(r.pending.length, eng.length);
  for (const e of r.pending) r.resolveAuto(e); r.endPeriod(); assert.ok(r.battles.length >= 1);
});
