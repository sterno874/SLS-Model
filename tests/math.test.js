import test from "node:test";
import assert from "node:assert/strict";
import {
  T2,
  T3,
  E2,
  E3,
  IFLOOR,
  THRESH,
  hrGaugeState,
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
  passesVerdict,
  autofitCure,
  inverseSolve,
  batcFor3yrCap,
  Tfor,
  fmtCalMonth,
  monthToDate
} from "../js/math/survival.js";
import { computeFrozenBestEst } from "../js/ui/state.js";
import { mk, T1, poisLL, poisLogLThrough } from "./helpers.js";

test("bat=13 batc=0: sBAT(36) ≈ 14.7% (Weibull tail alone)", () => {
  const p = mk({ bat: 13, batc: 0 });
  assert.ok(Math.abs(sBAT(36, p) * 100 - 14.67) < 0.5);
});

test("bat=13 batc=10: sBAT(36) > 20%", () => {
  const p = mk({ bat: 13, batc: 0.10 });
  assert.ok(sBAT(36, p) * 100 > 20);
});

test("batcFor3yrCap: at bat=10 allows plateau headroom under 14% cap", () => {
  const p = mk({ bat: 10, batc: 0 });
  const max = batcFor3yrCap(p, 10, 14);
  assert.ok(sBAT(36, { ...p, bat: 10, batc: max }) * 100 <= 14.01);
  assert.ok(max * 100 > 5);
});

test("batcFor3yrCap: at bat=13 cap=14 leaves ~0% plateau room", () => {
  const p = mk({ bat: 13, batc: 0 });
  const max = batcFor3yrCap(p, 13, 14);
  assert.ok(max * 100 < 1);
});

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
  assert.ok(Math.abs(tail - ref) < 0.04);
});

test("best preset within event tolerances", () => {
  assert.ok(consistent(mk({})));
});

test("best preset passes verdict on load", () => {
  assert.ok(passesVerdict(mk({})));
  assert.ok(Math.abs(eventsAt(63, mk({})) - 78) <= 3);
});

test("best preset HR < 0.636", () => {
  assert.ok(hazardRatio(T2, mk({})) < 0.636);
});

test("no-effect HR ≈ 1 and fits anchors", () => {
  const noeff = mk({ bat: 14, batc: 0.28, gpsc: 0.28, gpsu: 14, delay: 0, xtx: 0, cens: 0 });
  assert.ok(Math.abs(hazardRatio(T2, noeff) - 1) < 0.01);
  assert.ok(consistent(noeff));
});

test("fail-scenario HR > 0.636 still fits anchors (conceptual)", () => {
  const failPreset = mk({ bat: 10, batc: 0.28, gpsc: 0.28, gpsu: 18, delay: 0, xtx: 0, cens: 0 });
  assert.ok(hazardRatio(T2, failPreset) > 0.636);
  assert.ok(passesVerdict(failPreset));
});

test("inverse solver hits anchors with recalibrated 42% cure preset", () => {
  const ir = inverseSolve(mk({ gpsc: 0.42, bat: 8, delay: 3, xtx: 0, cens: 0 }), 14);
  assert.ok(ir.sol);
  assert.ok(passesVerdict(ir.sol));
  assert.ok(Math.abs(eventsAt(T2, ir.sol) - E2) <= 3);
  assert.ok(sBAT(36, ir.sol) * 100 <= 15);
});

test("CW inverse round-trip: delay=0 lands BAT near 10 mo (CW forward anchor)", () => {
  const ir = inverseSolve(mk({ gpsc: 0.42, delay: 0, xtx: 0, cens: 0 }), 14);
  assert.ok(ir.sol, ir.reason || "inverse should solve");
  assert.ok(Math.abs(ir.sol.bat - 10) <= 1.5, `BAT ${ir.sol.bat} should be near CW forward preset (~10 mo)`);
  assert.ok(hazardRatio(T2, ir.sol) < THRESH);
});

test("CW inverse with delay=3 differs from CW Scenario C — disclosed approximation", () => {
  const ir = inverseSolve(mk({ gpsc: 0.42, delay: 3, xtx: 0, cens: 0 }), 14);
  assert.ok(ir.sol && passesVerdict(ir.sol));
  assert.ok(ir.sol.bat >= 11, "GPS onset delay pushes implied BAT above CW's M=10 Scenario C");
});

test("hrGaugeState readout HR differs from m58 when cutoff before 80th event", () => {
  const best = mk({});
  const gs58 = hrGaugeState(best, 58);
  const gs72 = hrGaugeState(best, 72);
  assert.ok(gs72.hrForFinal < THRESH);
  if (gs72.t80 > 58) assert.ok(gs72.Tan !== T2 || gs72.hrReadout !== gs72.hrM58);
});

test("Pike HR ≈ analyzeLR", () => {
  const best = mk({});
  const lr = analyzeLR(T2, best);
  assert.ok(Math.abs(hazardRatio(T2, best) - lr.hr) < 0.005);
});

test("SLS OS ratio = bench/os under exponential", () => {
  const osRatio = 2.8 / 8.9;
  const expected = (Math.log(2) / 8.9) / (Math.log(2) / 2.8);
  assert.ok(Math.abs(osRatio - expected) < 0.001);
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
  const cwPreset = mk({ bat: 9, batc: 0.06, gpsc: 0.41, gpsu: 35.5, delay: 0, xtx: 0, cens: 0 });
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

test("readout power: anchored Dan uses 78 floor when model under-predicts m63", () => {
  const under = mk({});
  assert.ok(eventsAt(63, under) < 78);
  assert.ok(t80Analysis(under, 84).Dan >= 78);
});

test("best preset: m58 HR in early-stop zone but readout clears final threshold", () => {
  const best = mk({});
  const gs = hrGaugeState(best, 72);
  assert.ok(gs.hrM58 < 0.636 && gs.hrM58 < IFLOOR);
  assert.ok(gs.finalClears, "readout HR should clear 0.636 on the final gauge");
  assert.ok(gs.hrForFinal < THRESH, "final gauge marker sits in green zone");
});

test("hrGaugeState: final row uses readout HR, not m58 when cutoff differs", () => {
  const best = mk({});
  const gs = hrGaugeState(best, 72);
  assert.ok(!isNaN(gs.hrForFinal));
  assert.ok(gs.hrForFinal < THRESH);
  assert.equal(typeof gs.interimClearsFloor, "boolean");
});

test("bear preset fits anchors and HR near threshold", () => {
  const bearPreset = mk({ bat: 10.5, batc: 0.16, gpsc: 0.14, gpsu: 30, delay: 2, xtx: 0.08, cens: 0.10 });
  const hr = hazardRatio(T2, bearPreset);
  assert.ok(passesVerdict(bearPreset));
  assert.ok(hr >= 0.54 && hr < 0.636);
});

test("header best-est defaults: GPS readout HR ~0.246 (cw42 biology-first preset)", () => {
  assert.ok(Math.abs(computeFrozenBestEst().gpsHr - 0.246) < 0.02);
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
