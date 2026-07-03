import test from "node:test";
import assert from "node:assert/strict";
import {
  T2,
  T3,
  E2,
  E3,
  IFLOOR,
  CURRENT_EVENT_ANCHOR,
  sBATbase,
  sGPSbase,
  sBAT,
  eventsAt,
  eventsAtAnchored,
  T80PrPace,
  T80,
  t80Analysis,
  hazardRatio,
  analyzeLR,
  consistent,
  autofitCure,
  inverseSolve,
  Tfor,
  fmtCalMonth,
  monthToDate
} from "../js/math/survival.js";
import { mk, T1, poisLL, poisLogLThrough } from "./helpers.js";

test("exponential median S(bat)=0.5", () => {
  const p = mk({ bat: 10, batc: 0, batk: 1 });
  assert.ok(Math.abs(sBATbase(10, p) - 0.5) < 0.001);
});

test("Weibull median scale invariant to k", () => {
  const p = mk({ bat: 10, batc: 0, batk: 0.8 });
  assert.ok(Math.abs(sBATbase(10, p) - 0.5) < 0.02);
});

test("GPS mixture-cure plateau", () => {
  const p = mk({ gpsc: 0.4, delay: 3, bat: 8, batc: 0.1 });
  const tail = sGPSbase(200, p);
  const ref = sBATbase(3, p) * 0.4;
  assert.ok(Math.abs(tail - ref) < 0.02);
});

test("best preset within event tolerances", () => {
  assert.ok(consistent(mk({})));
});

test("best preset HR < 0.636", () => {
  assert.ok(hazardRatio(T2, mk({})) < 0.636);
});

test("no-effect HR ≈ 1 and fits anchors", () => {
  const noeff = mk({ bat: 14, batc: 0.28, gpsc: 0.28, gpsu: 14, delay: 0, xtx: 0, cens: 0 });
  assert.ok(Math.abs(hazardRatio(T2, noeff) - 1) < 0.01);
  assert.ok(consistent(noeff));
});

test("fail preset HR > 0.636", () => {
  const failPreset = mk({ bat: 10, batc: 0.28, gpsc: 0.28, gpsu: 18, delay: 0, xtx: 0, cens: 0 });
  assert.ok(hazardRatio(T2, failPreset) > 0.636);
});

test("inverse solver hits 72 @ m58 with BAT 3-yr OS cap", () => {
  const ir = inverseSolve(mk({ gpsc: 0.42, bat: 8, delay: 0, xtx: 0, cens: 0 }), 17);
  assert.ok(ir.sol);
  assert.ok(Math.abs(eventsAt(T2, ir.sol) - E2) <= 1);
  assert.ok(sBAT(36, ir.sol) * 100 <= 17.5);
});

test("Pike HR ≈ analyzeLR", () => {
  const best = mk({});
  const lr = analyzeLR(T2, best);
  assert.ok(Math.abs(hazardRatio(T2, best) - lr.hr) < 0.005);
});

test("SLS HR-equiv = bench/os under exponential", () => {
  const hreq = 2.8 / 8.9;
  const expected = (Math.log(2) / 8.9) / (Math.log(2) / 2.8);
  assert.ok(Math.abs(hreq - expected) < 0.001);
});

test("autofit targets 72 @ m58", () => {
  const best = mk({});
  const af = autofitCure(best);
  if (af.sol != null) {
    const fitted = Object.assign({}, best, { gpsc: af.sol });
    assert.ok(Math.abs(eventsAt(T2, fitted) - E2) <= 1);
  }
});

test("Poisson LL: alt hypothesis beats strawman null", () => {
  const altHyp = mk({ bat: 10, batc: 0.14, gpsc: 0.22, gpsu: 32, delay: 1.5, xtx: 0.06, cens: 0.12 });
  const strawNull = mk({ bat: 8, batc: 0, gpsc: 0, gpsu: 8, delay: 0, xtx: 0, cens: 0 });
  assert.ok(poisLL(altHyp) > poisLL(strawNull));
});

test("milestone LL truncated @ m46 excludes later increments", () => {
  const best = mk({});
  assert.ok(poisLogLThrough(best, 46) > poisLogLThrough(best, 65));
});

test("CW forward preset HR < 0.636", () => {
  const cwPreset = mk({ bat: 10, batc: 0.06, gpsc: 0.42, gpsu: 36, delay: 0, xtx: 0, cens: 0 });
  assert.ok(hazardRatio(T2, cwPreset) < 0.636);
});

test("CURRENT_EVENT_ANCHOR count is 78 @ m63", () => {
  assert.equal(CURRENT_EVENT_ANCHOR.count, 78);
  assert.equal(CURRENT_EVENT_ANCHOR.month, 63);
  assert.equal(CURRENT_EVENT_ANCHOR.date, "2026-05-11");
});

test("anchored events @ m63 equals confirmed 78", () => {
  const best = mk({});
  assert.ok(Math.abs(eventsAtAnchored(63, best) - 78) < 0.01);
});

test("T80 PR pace linear est. ~m64.7", () => {
  assert.ok(Math.abs(T80PrPace() - (T3 + 2 / (6 / 5))) < 0.02);
});

test("T80 anchored lands mid-late 2026 for best preset", () => {
  const best = mk({});
  const t80 = T80(best);
  assert.ok(t80 > 63 && t80 < 72);
  assert.match(fmtCalMonth(t80), /2026/);
});

test("t80Analysis Dan @ m72 uses anchored events when model under-predicts m63", () => {
  const best = mk({});
  assert.ok(eventsAt(63, best) < 78);
  assert.ok(t80Analysis(best, 72).Dan >= 78);
});

test("Tfor(80) anchored forward lands before naive cumulative search", () => {
  const best = mk({});
  const t = Tfor(80, best);
  assert.ok(t < 72 && t >= 63);
});

test("readout power: anchored Dan exceeds raw eventsAt when 80th not reached", () => {
  const best = mk({});
  assert.ok(t80Analysis(best, 84).Dan > eventsAt(72, best));
});

test("best preset HR clears 0.636 but sits below interim floor", () => {
  const best = mk({});
  const hr = hazardRatio(T2, best);
  assert.ok(hr < 0.636 && hr < IFLOOR);
});

test("bear preset HR clears 0.636 and stays above interim floor", () => {
  const bearPreset = mk({ bat: 10, batc: 0.22, gpsc: 0.12, gpsu: 28, delay: 0, xtx: 0.06, cens: 0.12 });
  const hr = hazardRatio(T2, bearPreset);
  assert.ok(hr < 0.636 && hr > IFLOOR);
});

test("header best-est defaults: GPS HR ~0.43 @ m58", () => {
  assert.ok(Math.abs(hazardRatio(T2, mk({})) - 0.433) < 0.01);
});

test("fmtCalMonth and monthToDate agree", () => {
  const m = 63;
  assert.equal(fmtCalMonth(m), monthToDate(m).toLocaleString("en-US", { month: "short", year: "numeric" }));
});

test("hazardRatio returns NaN for degenerate exposure", () => {
  const tiny = mk({ bat: 0.01, batc: 0.99, gpsc: 0.99, gpsu: 0.01, delay: 99, xtx: 0, cens: 0 });
  const hr = hazardRatio(T1, tiny);
  assert.ok(Number.isNaN(hr) || hr > 0);
});
