import test from "node:test";
import assert from "node:assert/strict";
import {
  THRESH,
  IFLOOR,
  T2,
  hazardRatio,
  hrGaugeState,
  inverseSolve,
  passesVerdict,
  isBiologicallyPlausible
} from "../js/math/survival.js";
import {
  b64urlEncode,
  b64urlDecode,
  buildShareHash,
  decodeShareHash,
  parseEmbedMode,
  isValidTab,
  tabVisibility,
  paramsFromPresetQ,
  paramsFromPreset,
  isPlausible,
  computeValuationMetrics,
  computeFrozenBestEst,
  FROZEN_BEST_EST,
  VALID_TABS,
  EXPLAIN_LEVELS,
  REQUIRED_PRESET_KEYS,
  REQUIRED_INV_KEYS,
  BASIC_SHARES_M,
  FD_SHARES_M,
  ATM_SHARES_M,
  formatShareDilutionSubtitle
} from "../js/ui/state.js";
import { mk } from "./helpers.js";
import { P, INV, PLAUSIBLE_PRESET_NAMES, INVERSE_PRESET_NAMES } from "./fixtures/presets.js";

const PARAM_SHAPE_KEYS = [
  "bat",
  "batc",
  "batk",
  "gpsc",
  "gpsu",
  "delay",
  "xtx",
  "cens",
  "osmode",
  "mid",
  "k",
  "fh",
  "stratF",
  "zfut"
];

const VAL_DEFAULTS = {
  cr2: 2800,
  cr1: 5500,
  gpen: 45,
  gprice: 145,
  gyears: 2.8,
  flpool: 9000,
  rrpool: 3500,
  spen: 38,
  sprice: 145,
  syears: 1.4,
  platform: 2.5,
  mult: 5,
  shares: 222,
  cash: 107.1,
  riskadj: true,
  pgps: 65,
  psls: 55
};

test("paramsFromPreset('best') returns full survival param shape", () => {
  const p = paramsFromPreset("best", null, "forward", P, INV);
  assert.ok(p);
  for (const k of PARAM_SHAPE_KEYS) assert.ok(k in p, `missing key ${k}`);
  assert.equal(p.osmode, "itt");
  assert.equal(p.batk, 1);
  assert.equal(p.fh, false);
});

test("paramsFromPreset('best') maps percent sliders to fractions", () => {
  const p = paramsFromPreset("best", null, "forward", P, INV);
  assert.equal(p.bat, P.best.bat);
  assert.ok(Math.abs(p.batc - P.best.batc / 100) < 1e-9);
  assert.ok(Math.abs(p.gpsc - P.best.gpsc / 100) < 1e-9);
  assert.equal(p.gpsu, P.best.gpsu);
});

for (const name of Object.keys(P)) {
  test(`forward preset "${name}" has required slider keys`, () => {
    const q = P[name];
    for (const k of REQUIRED_PRESET_KEYS) {
      assert.ok(k in q, `${name} missing ${k}`);
      assert.ok(Number.isFinite(q[k]), `${name}.${k} should be finite`);
    }
    assert.ok("mcFloor" in q, `${name} should declare mcFloor`);
  });
}

for (const name of Object.keys(INV)) {
  test(`inverse preset "${name}" has required solver keys`, () => {
    const q = INV[name];
    for (const k of REQUIRED_INV_KEYS) {
      assert.ok(k in q, `${name} missing ${k}`);
      assert.ok(Number.isFinite(q[k]), `${name}.${k} should be finite`);
    }
  });
}

test("paramsFromPresetQ matches paramsFromPreset for forward presets", () => {
  for (const name of PLAUSIBLE_PRESET_NAMES) {
    const fromQ = paramsFromPresetQ(P[name]);
    const fromPreset = paramsFromPreset(name, null, "forward", P, INV);
    assert.deepEqual(fromQ, fromPreset);
  }
});

test("paramsFromPreset inverse cw42 returns finite solved medians", () => {
  const p = paramsFromPreset("cw42", null, "inverse", P, INV);
  assert.ok(p);
  for (const k of ["bat", "batc", "gpsc", "gpsu"]) {
    assert.ok(Number.isFinite(p[k]), `${k} should be finite`);
  }
  assert.ok(passesVerdict(p));
});

for (const name of INVERSE_PRESET_NAMES) {
  test(`inverse preset "${name}" solves to plausible params`, () => {
    const p = paramsFromPreset(name, null, "inverse", P, INV);
    assert.ok(p, `inverse ${name} should solve`);
    assert.ok(isPlausible(p));
  });
}

test("share state round-trip via buildShareHash (v1 delta format)", () => {
  const sample = {
    v: 1,
    tab: "gps",
    regalMode: "inverse",
    gps: { bat: 10, gpsc: 42 },
    ui: { explainLvl: "phd" }
  };
  const hash = buildShareHash(sample);
  assert.match(hash, /^#s1=/);
  const decoded = decodeShareHash(hash);
  assert.equal(decoded.regalMode, "inverse");
  assert.equal(decoded.gps.bat, 10);
  assert.equal(decoded.gps.gpsc, 42);
  assert.equal(decoded.ui.explainLvl, "phd");
});

test("b64url encode avoids padding and url-unsafe chars", () => {
  const enc = b64urlEncode('{"v":1,"tab":"value"}');
  assert.ok(!enc.includes("+"));
  assert.ok(!enc.includes("/"));
  assert.ok(!enc.endsWith("="));
});

test("parseEmbedMode detects ?embed=1", () => {
  assert.equal(parseEmbedMode("?embed=1", ""), true);
  assert.equal(parseEmbedMode("embed=1", ""), true);
});

test("parseEmbedMode detects embed flag inside share hash", () => {
  const hash = buildShareHash({ v: 1, embed: true, tab: "gps" });
  assert.equal(parseEmbedMode("", hash), true);
});

test("parseEmbedMode returns false without embed signals", () => {
  assert.equal(parseEmbedMode("", ""), false);
  assert.equal(parseEmbedMode("?tab=gps", "#s=abc"), false);
});

test("isValidTab accepts all primary tabs", () => {
  for (const t of VALID_TABS) assert.ok(isValidTab(t));
  assert.ok(!isValidTab("settings"));
});

test("tabVisibility exposes one active tab at a time", () => {
  for (const active of VALID_TABS) {
    const vis = tabVisibility(active);
    const shown = Object.entries(vis).filter(([, on]) => on).map(([id]) => id);
    assert.deepEqual(shown, [active]);
  }
});

test("tabVisibility throws on invalid tab id", () => {
  assert.throws(() => tabVisibility("bogus"), /invalid tab/);
});

for (const name of PLAUSIBLE_PRESET_NAMES) {
  test(`isPlausible true for biology-first preset "${name}"`, () => {
    const p = paramsFromPreset(name, null, "forward", P, INV);
    assert.ok(isPlausible(p));
    assert.ok(passesVerdict(p));
    assert.ok(isBiologicallyPlausible(p));
  });
}

test("isPlausible false for ridge noeffect preset (events fit, biology fails)", () => {
  const p = paramsFromPreset("noeffect", null, "forward", P, INV);
  assert.ok(passesVerdict(p));
  assert.ok(!isBiologicallyPlausible(p));
  assert.ok(!isPlausible(p));
});

test("hrGaugeState: best preset interim in early-stop zone, final clears threshold", () => {
  const best = mk({});
  const gs = hrGaugeState(best, 72);
  assert.ok(gs.hrM58 < IFLOOR);
  assert.ok(gs.finalClears);
  assert.ok(gs.hrForFinal < THRESH);
});

test("hrGaugeState: bear preset HR near win threshold", () => {
  const bear = paramsFromPreset("bear", null, "forward", P, INV);
  const gs = hrGaugeState(bear, 72);
  const hr = hazardRatio(T2, bear);
  assert.ok(hr >= 0.54 && hr < 0.636);
  assert.equal(typeof gs.interimClearsFloor, "boolean");
  assert.equal(typeof gs.finalClears, "boolean");
});

test("hrGaugeState: bull preset strongly clears final threshold", () => {
  const bull = paramsFromPreset("bull", null, "forward", P, INV);
  const gs = hrGaugeState(bull, 72);
  assert.ok(gs.hrForFinal < 0.4);
  assert.ok(gs.finalClears);
});

test("inverseSolve cw42 preset yields finite BAT and GPS uncured medians", () => {
  const q = INV.cw42;
  const ir = inverseSolve(
    mk({ gpsc: q.gpsc / 100, bat: 8, delay: q.delay, xtx: 0, cens: 0 }),
    q.batcap
  );
  assert.ok(ir.sol);
  assert.ok(Number.isFinite(ir.sol.bat));
  assert.ok(Number.isFinite(ir.sol.gpsu));
});

test("computeFrozenBestEst: biology-first risk-adj equity $/sh (default P(approval))", () => {
  const f = computeFrozenBestEst();
  // Readout HR (hrForFinal @ cutoff 72), not m58 snapshot (~0.270)
  assert.ok(Math.abs(f.gpsHr - 0.262) < 0.01);
  assert.ok(Math.abs(f.slsOsRatio - FROZEN_BEST_EST.slsPreset.sls_bench / FROZEN_BEST_EST.slsPreset.sls_os) < 1e-9);
  assert.match(f.label, /Biology-first/);
  assert.match(f.label, /risk-adj/i);
  assert.match(f.neutralRidgeHrNote, /0\.45/);
  const riskAdj = computeValuationMetrics(VAL_DEFAULTS);
  const gross = computeValuationMetrics({ ...VAL_DEFAULTS, riskadj: false });
  assert.ok(Math.abs(f.EV - riskAdj.EV) < 0.01);
  assert.ok(Math.abs(f.ps - riskAdj.ps) < 0.01);
  assert.ok(Math.abs(f.psGross - gross.ps) < 0.01);
  assert.ok(f.ps < f.psGross);
  // Base risk-adj equity $/sh ≈ $45.88 (EV + $107.1M cash) / 222M; gross ≈ $67.61
  assert.ok(Math.abs(f.ps - 45.88) < 0.1);
  assert.ok(Math.abs(f.psGross - 67.61) < 0.1);
});

test("computeFrozenBestEst: live P(approval) overrides update risk-adj $/sh", () => {
  const base = computeFrozenBestEst();
  const lower = computeFrozenBestEst({ pgps: 40, psls: 30 });
  assert.ok(lower.ps < base.ps);
  assert.ok(Math.abs(lower.gpsHr - base.gpsHr) < 1e-9);
});

test("computeValuationMetrics risk-adjusted lowers peak vs gross", () => {
  const adj = computeValuationMetrics(VAL_DEFAULTS);
  const gross = computeValuationMetrics({ ...VAL_DEFAULTS, riskadj: false });
  assert.ok(adj.totPeak < gross.totPeak);
  assert.ok(adj.EV < gross.EV);
  assert.equal(adj.riskAdjusted, true);
  assert.equal(gross.riskAdjusted, false);
});

test("computeValuationMetrics EV scales with multiple", () => {
  const base = computeValuationMetrics(VAL_DEFAULTS);
  const higher = computeValuationMetrics({ ...VAL_DEFAULTS, mult: 6 });
  assert.ok(higher.EV > base.EV);
});

test("dilution stress raises share count and lowers equity $/sh", () => {
  const base = computeValuationMetrics(VAL_DEFAULTS);
  const stress = computeValuationMetrics({ ...VAL_DEFAULTS, shares: ATM_SHARES_M });
  assert.equal(BASIC_SHARES_M, 181.3);
  assert.equal(FD_SHARES_M, 222);
  assert.equal(ATM_SHARES_M, 240);
  assert.ok(stress.ps < base.ps);
  assert.ok(Math.abs(stress.EV - base.EV) < 0.01, "EV must not change with share count");
});

test("181M vs 222M vs 240M FD show expected $/sh spread at same EV", () => {
  const at222 = computeValuationMetrics(VAL_DEFAULTS);
  const at181 = computeValuationMetrics({ ...VAL_DEFAULTS, shares: BASIC_SHARES_M });
  const at240 = computeValuationMetrics({ ...VAL_DEFAULTS, shares: ATM_SHARES_M });
  assert.ok(at181.ps > at222.ps);
  assert.ok(at240.ps < at222.ps);
  assert.ok(Math.abs(at181.EV - at222.EV) < 0.01);
  assert.ok(Math.abs(at240.EV - at222.EV) < 0.01);
  assert.ok(Math.abs(at222.ps - 45.88) < 0.15);
  assert.ok(Math.abs(at181.ps - at222.ps * (222 / 181.3)) < 0.05);
  assert.ok(Math.abs(at240.ps - at222.ps * (222 / 240)) < 0.05);
});

test("formatShareDilutionSubtitle highlights delta vs 222M FD", () => {
  assert.equal(formatShareDilutionSubtitle(222), "");
  assert.match(formatShareDilutionSubtitle(240), /240M FD|222M FD/);
  assert.match(formatShareDilutionSubtitle(240), /EV unchanged/);
});

test("EXPLAIN_LEVELS lists six explain tiers", () => {
  assert.equal(EXPLAIN_LEVELS.length, 6);
  assert.deepEqual(EXPLAIN_LEVELS, ["eli5", "ms", "hs", "col", "pro", "phd"]);
});
