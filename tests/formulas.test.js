/**
 * Golden-value and property tests for formula-critical survival.js exports.
 * Designed to kill hand-crafted mutants in tests/mutation/mutations.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  THRESH,
  IFLOOR,
  ZFINAL,
  ZEFF,
  ZFUT,
  STRATF,
  T1,
  T2,
  T3,
  E1,
  E2,
  E3,
  hazardRatio,
  analyzeLR,
  eventsAt,
  eventsAtAnchored,
  T80,
  T80PrPace,
  t80Analysis,
  condPow,
  poolS,
  sBAT,
  sGPS,
  sBATbase,
  sGPSbase,
  txMix,
  Stx,
  hrGaugeState,
  inverseSolve,
  medianOf,
  consistent,
  passesVerdict,
  enrollCDF,
  rawC,
  rmst,
  Phi,
  phi,
  pois,
  poisLE,
  lpois,
  armDeaths,
  mcPathToT80,
  fmtCalRange,
  monthLabel,
  eventErr
} from "../js/math/survival.js";
import { mk } from "./helpers.js";
import { P, INV } from "./fixtures/presets.js";
import { paramsFromPresetQ } from "../js/ui/state.js";

const best = mk({});
const noeff = mk({ bat: 14, batc: 0.28, gpsc: 0.28, gpsu: 14, delay: 0, xtx: 0, cens: 0 });

// ---------- golden HR & log-rank ----------
test("golden: hazardRatio @ m58 for best preset ≈ 0.254", () => {
  assert.ok(Math.abs(hazardRatio(T2, best) - 0.253964) < 0.0002);
});

test("golden: hazardRatio @ m46 for best preset ≈ 0.289", () => {
  assert.ok(Math.abs(hazardRatio(T1, best) - 0.289295) < 0.0002);
});

test("golden: analyzeLR @ m58 HR ≈ 0.256, z ≈ 5.41", () => {
  const lr = analyzeLR(T2, best);
  assert.ok(Math.abs(lr.hr - 0.255565) < 0.001);
  assert.ok(Math.abs(lr.z - 5.414395) < 0.01);
  assert.ok(lr.z > 0, "GPS should beat BAT (positive z)");
});

test("property: identical BAT/GPS curves yield HR = 1", () => {
  assert.ok(Math.abs(hazardRatio(T2, noeff) - 1) < 1e-9);
  const lr = analyzeLR(T2, noeff);
  assert.ok(Math.abs(lr.hr - 1) < 1e-9);
});

test("property: GPS benefit implies HR < 1 for best preset", () => {
  assert.ok(hazardRatio(T2, best) < 1);
  assert.ok(analyzeLR(T2, best).hr < 1);
});

// ---------- events ----------
test("golden: eventsAt @ m46/m58/m63 for best preset", () => {
  assert.ok(Math.abs(eventsAt(46, best) - 58.969692) < 0.01);
  assert.ok(Math.abs(eventsAt(58, best) - 71.998679) < 0.01);
  assert.ok(Math.abs(eventsAt(63, best) - 75.788322) < 0.01);
});

test("golden: eventsAtAnchored locks exactly 78 @ m63", () => {
  assert.equal(eventsAtAnchored(63, best), 78);
});

test("property: eventsAt is non-decreasing in time", () => {
  let prev = 0;
  for (const t of [20, 30, 46, 58, 63, 65]) {
    const e = eventsAt(t, best);
    assert.ok(e >= prev - 0.001, `eventsAt(${t}) should be ≥ prior`);
    prev = e;
  }
});

test("property: eventsAtAnchored ≥ eventsAt for T ≥ T3", () => {
  for (const t of [63, 65, 70]) {
    assert.ok(eventsAtAnchored(t, best) >= eventsAt(t, best) - 0.01);
  }
});

test("golden: armDeaths BAT+GPS sum matches eventsAt (pre-censor)", () => {
  const p = mk({ cens: 0 });
  const raw = armDeaths(58, p, sBATbase) + armDeaths(58, p, sGPSbase);
  assert.ok(Math.abs(eventsAt(58, p) - raw) < 0.001);
});

// ---------- T80 ----------
test("golden: T80PrPace linear estimate ≈ 64.67 mo", () => {
  assert.ok(Math.abs(T80PrPace() - 64.666667) < 0.01);
});

test("golden: T80(best) ≈ 66.09 mo", () => {
  assert.ok(Math.abs(T80(best) - 66.090736) < 0.01);
});

test("golden: t80Analysis(best,72) Tan=t80, Dan=80 when t80≤cutoff", () => {
  const a = t80Analysis(best, 72);
  assert.ok(Math.abs(a.t80 - 66.090736) < 0.01);
  assert.ok(Math.abs(a.Tan - a.t80) < 0.01);
  assert.equal(a.Dan, 80);
});

test("mcPathToT80 reaches ≥80 events before month 120", () => {
  const t = mcPathToT80(best);
  assert.ok(t >= T3 && t <= 120);
  assert.ok(eventsAtAnchored(t, best) >= 79.5);
});

// ---------- conditional power ----------
test("golden: condPow(0.3, 0.5, 78) Pc ≈ 0.439, cp ≈ 0.108", () => {
  const { Pc, cp } = condPow(0.3, 0.5, 78);
  assert.ok(Math.abs(Pc - 0.439497) < 0.002);
  assert.ok(Math.abs(cp - 0.107783) < 0.0003);
  assert.ok(Pc > 0 && Pc < 1);
  assert.ok(cp >= 0 && cp <= 1);
});

test("condPow: higher thIA lowers conditional power", () => {
  const low = condPow(0.2, 0.5, 78).cp;
  const high = condPow(0.5, 0.5, 78).cp;
  assert.ok(high < low);
});

test("condPow: custom zfut changes Pc integration window", () => {
  const a = condPow(0.3, 0.5, 78, 0.3);
  const b = condPow(0.3, 0.5, 78, 0.5);
  assert.notEqual(a.Pc, b.Pc);
});

// ---------- survival curves ----------
test("golden: poolS(36,best) ≈ 0.414", () => {
  assert.ok(Math.abs(poolS(36, best) - 0.414222) < 0.001);
});

test("poolS equals average of sBAT and sGPS", () => {
  for (const t of [12, 24, 36, 48]) {
    const avg = 0.5 * sBAT(t, best) + 0.5 * sGPS(t, best);
    assert.ok(Math.abs(poolS(t, best) - avg) < 1e-12);
  }
});

test("golden: sBAT(36,best) ≈ 0.147, sGPS(36,best) ≈ 0.682", () => {
  assert.ok(Math.abs(sBAT(36, best) - 0.146683) < 0.001);
  assert.ok(Math.abs(sGPS(36, best) - 0.681760) < 0.001);
});

test("sGPSbase respects delay: flat BAT segment before onset", () => {
  const p = mk({ delay: 5, gpsc: 0.3 });
  assert.equal(sGPSbase(3, p), sBATbase(3, p));
  assert.ok(sGPSbase(6, p) < sGPSbase(5, p));
});

test("txMix with xtx=0 is identity", () => {
  const p = mk({ xtx: 0 });
  assert.equal(txMix(12, p, 0.5), 0.5);
});

test("golden: txMix with xtx=0.2 blends Stx and base", () => {
  const p = mk({ xtx: 0.2 });
  const base = sBATbase(12, p);
  const expected = 0.2 * Stx(12) + 0.8 * base;
  assert.ok(Math.abs(txMix(12, p, base) - expected) < 1e-12);
});

test("Stx(0) is between cure fraction and 1", () => {
  assert.ok(Stx(0) >= 0.45 && Stx(0) <= 1);
  assert.ok(Stx(24) < Stx(0));
});

test("rmst(sBAT,best,24) ≈ 13.54", () => {
  assert.ok(Math.abs(rmst(sBAT, best, 24) - 13.538844) < 0.01);
});

// ---------- hrGaugeState ----------
test("golden: hrGaugeState(best,72) field values", () => {
  const gs = hrGaugeState(best, 72);
  assert.ok(Math.abs(gs.hrInterim - 0.289295) < 0.001);
  assert.ok(Math.abs(gs.hrM58 - 0.253964) < 0.001);
  assert.ok(Math.abs(gs.hrReadout - 0.246245) < 0.001);
  assert.ok(Math.abs(gs.t80 - 66.090736) < 0.01);
  assert.equal(gs.Dan, 80);
  assert.equal(gs.interimWouldStop, true);
  assert.equal(gs.interimClearsFloor, false);
  assert.equal(gs.finalClears, true);
  assert.ok(gs.hrForFinal < THRESH);
});

test("hrGaugeState: IFLOOR and THRESH constants match exports", () => {
  assert.equal(IFLOOR, 0.547);
  assert.equal(THRESH, 0.636);
  assert.ok(gsBoundary());
  function gsBoundary() {
    const gs = hrGaugeState(best, 72);
    return gs.hrM58 < IFLOOR && gs.hrForFinal < THRESH;
  }
});

// ---------- inverse solve ----------
test("golden: inverseSolve cw42 yields bat≈13, gpsu≈54.09", () => {
  const ir = inverseSolve(mk({ gpsc: 0.42, bat: 8, delay: 3 }), 14);
  assert.ok(ir.sol);
  assert.ok(Math.abs(ir.sol.bat - 13) < 0.01);
  assert.ok(Math.abs(ir.sol.gpsu - 54.091928) < 0.01);
  assert.ok(ir.sol.batc < 0.001);
});

// ---------- verdict / median ----------
test("golden: medianOf(poolS,best) ≈ 24.71 mo", () => {
  assert.ok(Math.abs(medianOf(poolS, best) - 24.708079) < 0.01);
});

test("passesVerdict rejects low median even if events fit", () => {
  const fast = mk({ bat: 4, batc: 0, gpsc: 0.42, gpsu: 8, delay: 0 });
  if (consistent(fast)) {
    const pm = medianOf(poolS, fast);
    if (pm !== null && pm <= 13.5) assert.ok(!passesVerdict(fast));
  }
});

// ---------- enrollment / Poisson / normal CDF ----------
test("golden: enrollCDF(25,25,0.15) ≈ 0.560", () => {
  assert.ok(Math.abs(enrollCDF(25, 25, 0.15) - 0.559578) < 0.001);
});

test("enrollCDF endpoints: 0 at t≤0, 1 at t≥LMAX", () => {
  assert.equal(enrollCDF(0, 25, 0.15), 0);
  assert.equal(enrollCDF(38, 25, 0.15), 1);
});

test("rawC sigmoid: symmetric around midpoint", () => {
  const m = 25, k = 0.15;
  assert.ok(Math.abs(rawC(m, m, k) - 0.5) < 0.01);
});

test("golden: Phi(0) ≈ 0.5, phi(0) ≈ 0.399", () => {
  assert.ok(Math.abs(Phi(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(phi(0) - 0.398942) < 1e-6);
});

test("Phi monotonic: Phi(1) > Phi(0) > Phi(-1)", () => {
  assert.ok(Phi(1) > Phi(0));
  assert.ok(Phi(0) > Phi(-1));
});

test("golden: pois(3,5) and poisLE(3,5)", () => {
  assert.ok(Math.abs(pois(3, 5) - 0.140374) < 1e-5);
  assert.ok(Math.abs(poisLE(3, 5) - 0.265026) < 1e-5);
});

test("lpois: k=0, λ=0 returns 0; k>0, λ=0 returns -1e9", () => {
  assert.equal(lpois(0, 0), 0);
  assert.equal(lpois(3, 0), -1e9);
});

// ---------- calendar formatting ----------
test("fmtCalRange(58,63) spans Dec 2025–May 2026", () => {
  assert.match(fmtCalRange(58, 63), /Dec.*2025.*May.*2026/);
});

test("monthLabel returns parenthetical calendar string", () => {
  assert.match(monthLabel(63), /^\([A-Z][a-z]{2} \d{4}\)$/);
});

test("analyzeLR z uses default STRATF=0.9 when stratF omitted", () => {
  const p = mk({});
  delete p.stratF;
  const lr = analyzeLR(T2, p);
  const withExplicit = analyzeLR(T2, mk({ stratF: 0.9 }));
  assert.ok(Math.abs(lr.z - withExplicit.z) < 1e-12);
  assert.ok(Math.abs(lr.z - 5.414395) < 0.001);
});

test("eventsAt applies dropout censoring: critique preset", () => {
  const crit = paramsFromPresetQ(P.critique);
  assert.ok(Math.abs(eventsAt(58, crit) - 72.426900) < 0.01);
  const noDrop = { ...crit, cens: 0 };
  assert.ok(eventsAt(58, noDrop) > eventsAt(58, crit) + 3);
});

test("eventErr penalizes low pooled median (<13.5 mo)", () => {
  const bestErr = eventErr(best);
  const lowMed = mk({ bat: 6, batc: 0, gpsc: 0.42, gpsu: 20, delay: 0 });
  assert.ok(eventErr(lowMed) > bestErr + 100);
  assert.ok(medianOf(poolS, lowMed) < 13.5);
});

test("best preset e46 within ±4 of anchor 60", () => {
  const diff = Math.abs(eventsAt(T1, best) - E1);
  assert.ok(diff <= 4);
  assert.ok(diff > 0.5, "model-implied e46 differs from PR anchor 60");
});

test("passesVerdict requires pooled median > 13.5 mo for best preset", () => {
  const pm = medianOf(poolS, best);
  assert.ok(pm > 13.5);
  assert.ok(passesVerdict(best));
});

for (const name of Object.keys(P)) {
  test(`preset invariant: forward "${name}" events @ anchors within tolerance`, () => {
    const p = paramsFromPresetQ(P[name]);
    assert.ok(Math.abs(eventsAt(T1, p) - E1) <= 4, `e46 for ${name}`);
    assert.ok(Math.abs(eventsAt(T2, p) - E2) <= 3, `e58 for ${name}`);
    assert.ok(Math.abs(eventsAt(T3, p) - E3) <= 3, `e63 for ${name}`);
  });
}

for (const name of Object.keys(INV)) {
  test(`preset invariant: inverse "${name}" solved params pass passesVerdict`, () => {
    const q = INV[name];
    const ir = inverseSolve(
      mk({ gpsc: q.gpsc / 100, bat: 8, delay: q.delay || 0, xtx: 0, cens: 0 }),
      q.batcap || 14
    );
    assert.ok(ir.sol, ir.reason || "should solve");
    assert.ok(passesVerdict(ir.sol));
  });
}

// ---------- exported statistical constants ----------
test("stat constants: ZFINAL, ZEFF, ZFUT, STRATF", () => {
  assert.equal(ZFINAL, 2.012);
  assert.equal(ZEFF, 2.34);
  assert.equal(ZFUT, 0.4);
  assert.equal(STRATF, 0.9);
});
