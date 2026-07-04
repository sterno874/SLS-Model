import test from "node:test";
import assert from "node:assert/strict";
import { T1, T2, T4, hazardRatio, consistent, passesVerdict, isBiologicallyPlausible, medianOf, sBAT, sGPS, eventsAt, T3, E3, inverseSolve } from "../js/math/survival.js";
import { paramsFromPresetQ, mk } from "./helpers.js";
import { P, INV, PLAUSIBLE_PRESET_NAMES, INVERSE_PRESET_NAMES, RIDGE_PRESET_NAMES } from "./fixtures/presets.js";
import {
  isPlausible,
  resolveForwardPresetParams,
  decodeShareHash,
  buildShareHash,
  SHARE_P,
  paramsFromPresetQ as paramsFromPresetQState
} from "../js/ui/state.js";

for (const name of PLAUSIBLE_PRESET_NAMES) {
  test(`forward preset "${name}" passes consistent()`, () => {
    const p = paramsFromPresetQ(P[name]);
    assert.ok(p, `preset ${name} should map to params`);
    assert.ok(
      consistent(p),
      `preset ${name} should fit blinded anchors (60/72/78) within tolerances`
    );
  });

  test(`forward preset "${name}" passes passesVerdict() and isBiologicallyPlausible()`, () => {
    const p = paramsFromPresetQ(P[name]);
    assert.ok(passesVerdict(p), `preset ${name} should pass full trajectory verdict`);
    assert.ok(isBiologicallyPlausible(p), `preset ${name} should pass biological BAT caps`);
  });
}

for (const name of RIDGE_PRESET_NAMES) {
  test(`ridge preset "${name}" fits anchors with HR ≈ 1 but fails biological BAT cap`, () => {
    const p = paramsFromPresetQ(P[name]);
    assert.ok(passesVerdict(p), `ridge preset ${name} should still pass event trajectory`);
    assert.ok(Math.abs(hazardRatio(T2, p) - 1) < 0.02);
    assert.ok(!isBiologicallyPlausible(p), `ridge preset ${name} should fail BAT mOS cap`);
    const batMed = medianOf(sBAT, p);
    assert.ok(batMed !== null && batMed > 15, `ridge BAT mOS ${batMed} should exceed 15m cap`);
    assert.ok(batMed > 23 && batMed < 25, `ridge BAT mOS ~24m, got ${batMed?.toFixed(1)}`);
  });
}

test("capbreach preset fits anchors but fails biological BAT cap", () => {
  const p = paramsFromPresetQ(P.capbreach);
  assert.ok(passesVerdict(p));
  assert.ok(!isBiologicallyPlausible(p));
});

test("bear preset HR near win threshold", () => {
  const p = paramsFromPresetQ(P.bear);
  const hr = hazardRatio(T2, p);
  assert.ok(hr >= 0.54 && hr < 0.636, `bear HR ${hr} should be near but below 0.636`);
});

test("capbreach preset fits anchors but HR misses win threshold", () => {
  const p = paramsFromPresetQ(P.capbreach);
  assert.ok(passesVerdict(p));
  const hr = hazardRatio(T2, p);
  assert.ok(hr > 0.636, `capbreach HR ${hr} should miss 0.636 threshold`);
});

test("cw preset HR below win threshold", () => {
  const p = paramsFromPresetQ(P.cw);
  assert.ok(hazardRatio(T2, p) < 0.636);
});

test("default best preset passes verdict (full trajectory match)", () => {
  const p = paramsFromPresetQ(P.best);
  assert.ok(passesVerdict(p), "best preset should pass verdict at m46/m58/m63");
  assert.ok(isBiologicallyPlausible(p), "best preset should pass biological BAT caps");
  const e3 = eventsAt(T3, p);
  assert.ok(Math.abs(e3 - E3) <= 3, `e63 ${e3} should be within ±3 of 78`);
  // e65 must sit comfortably inside [77,80) — old gpsu=54.1 landed at 77.11 and froze the chart
  const e65 = eventsAt(65, p);
  assert.ok(e65 >= 77.5 && e65 < 79.5, `e65 ${e65} should have margin inside [77,80)`);
});

test("P.best applyRegalPreset path isPlausible with margin on all anchors", () => {
  // Mirrors applyRegalPreset("best") → paramsFromPresetQ(P.best) → readParams()
  const p = paramsFromPresetQState(SHARE_P.best);
  assert.equal(p.bat, 13);
  assert.equal(p.gpsu, 47.5);
  assert.equal(p.gpsc, 0.42);
  assert.ok(isPlausible(p), "Best Available Guess must be isPlausible after applyRegalPreset path");
  const e46 = eventsAt(T1, p);
  const e58 = eventsAt(T2, p);
  const e63 = eventsAt(T3, p);
  const e65 = eventsAt(T4, p);
  // Print exact anchors for the fix report (assert messages include values on failure)
  assert.ok(Math.abs(e46 - 60) <= 3, `e46=${e46}`);
  assert.ok(Math.abs(e58 - 72) <= 2.5, `e58=${e58}`);
  assert.ok(Math.abs(e63 - 78) <= 2.5, `e63=${e63}`);
  assert.ok(e65 >= 77.5 && e65 < 79.5, `e65=${e65} needs margin in [77,80)`);
  assert.ok(medianOf(sBAT, p) <= 15, "BAT median within biology cap");
  assert.ok(medianOf(sGPS, p) > 50, "GPS mixture-cure median should be well above uncured mOS");
});

test("named preset wins over stale share-hash gps deltas", () => {
  // Reproduces the live bug: Best ★ selected, BAT mOS 13.0, GPS mOS ~72.7, yellow
  // e46/e58/e63 warning. That signature is bat=13,gpsc=42,gpsu=60,delay=6 — slider
  // drift (or a stale hash delta) while activeRegalPreset stayed "best".
  const staleGps = {
    bat: 13,
    batc: 0,
    batk: 1,
    gpsc: 42,
    gpsu: 60,
    delay: 6,
    xtx: 0,
    cens: 0,
    mid: 25,
    k: 0.15,
    batcap: 14,
    autofit: false,
    fhTest: false,
    stratF: 0.9,
    zfut: 0.4,
    mcFloor: true,
    cutoff: 72
  };
  const staleParams = paramsFromPresetQ({
    bat: 13,
    batc: 0,
    gpsc: 42,
    gpsu: 60,
    delay: 6,
    mid: 25,
    k: 0.15,
    xtx: 0,
    cens: 0
  });
  assert.equal(isPlausible(staleParams), false, "stale gpsu=60/delay=6 must fail fit (reproduces user bug)");
  assert.ok(
    Math.abs(medianOf(sGPS, staleParams) - 72.7) < 0.2,
    `stale GPS median should be ~72.7 (user report), got ${medianOf(sGPS, staleParams)}`
  );
  const resolved = resolveForwardPresetParams("best", staleGps);
  assert.equal(resolved.gpsu, SHARE_P.best.gpsu);
  assert.equal(resolved.delay, SHARE_P.best.delay);
  assert.ok(isPlausible(resolved), "resolveForwardPresetParams(best) must be plausible");
});

test("decodeShareHash with rp=best ignores conflicting survival deltas via resolve path", () => {
  // Encode a state that claims best but carries non-fitting survival overrides.
  const hash = buildShareHash({
    v: 1,
    tab: "gps",
    regalMode: "forward",
    activeRegalPreset: "best",
    activeInvPreset: "cw42",
    activeSlsPreset: "best",
    activeValPreset: "best",
    gps: {
      ...SHARE_P.best,
      batk: 1,
      batcap: 14,
      autofit: false,
      fhTest: false,
      stratF: 0.9,
      zfut: 0.4,
      cutoff: 72,
      gpsu: 60,
      delay: 6
    }
  });
  const s = decodeShareHash(hash);
  assert.ok(s);
  assert.equal(s.activeRegalPreset, "best");
  assert.equal(s.gps.gpsu, 60, "raw decode still has delta (encode fidelity)");
  assert.equal(s.gps.delay, 6);
  const p = resolveForwardPresetParams(s.activeRegalPreset, s.gps);
  assert.equal(p.gpsu, 47.5);
  assert.equal(p.delay, 3);
  assert.ok(isPlausible(p));
});

for (const name of INVERSE_PRESET_NAMES) {
  test(`inverse preset "${name}" passes passesVerdict() via inverseSolve`, () => {
    const q = INV[name];
    const base = mk({
      gpsc: q.gpsc / 100,
      delay: q.delay || 0,
      xtx: (q.xtx || 0) / 100,
      cens: (q.cens || 0) / 100,
      mid: q.mid || 25,
      k: q.k || 0.15,
      bat: 8
    });
    const ir = inverseSolve(base, q.batcap || 17);
    assert.ok(ir.sol, `inverse preset ${name} should solve: ${ir.reason || ""}`);
    const p = Object.assign({}, ir.sol, { batk: 1, fh: false, stratF: 0.9, zfut: 0.4 });
    assert.ok(passesVerdict(p), `inverse preset ${name} should pass full trajectory verdict`);
    assert.ok(Math.abs(eventsAt(T1, p) - 60) <= 4, `e46 should be within ±4 of 60`);
    assert.ok(Math.abs(eventsAt(T2, p) - 72) <= 3, `e58 should be within ±3 of 72`);
    assert.ok(Math.abs(eventsAt(T3, p) - 78) <= 3, `e63 should be within ±3 of 78`);
  });
}
