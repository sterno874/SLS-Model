import test from "node:test";
import assert from "node:assert/strict";
import {
  THRESH,
  IFLOOR,
  T2,
  hazardRatio,
  hrGaugeState,
  inverseSolve,
  passesVerdict
} from "../js/math/survival.js";
import {
  b64urlEncode,
  b64urlDecode,
  buildShareHash,
  parseEmbedMode,
  isValidTab,
  tabVisibility,
  paramsFromPresetQ,
  paramsFromPreset,
  isPlausible,
  computeValuationMetrics,
  VALID_TABS,
  EXPLAIN_LEVELS,
  REQUIRED_PRESET_KEYS,
  REQUIRED_INV_KEYS
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

test("share state round-trip via buildShareHash", () => {
  const sample = {
    v: 1,
    tab: "gps",
    regalMode: "inverse",
    gps: { bat: 10, gpsc: 42 },
    ui: { explainLvl: "phd" }
  };
  const hash = buildShareHash(sample);
  assert.match(hash, /^#s=/);
  const decoded = JSON.parse(b64urlDecode(hash.slice(3)));
  assert.deepEqual(decoded, sample);
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
  test(`isPlausible agrees with passesVerdict for "${name}"`, () => {
    const p = paramsFromPreset(name, null, "forward", P, INV);
    assert.equal(isPlausible(p), passesVerdict(p));
    assert.ok(isPlausible(p));
  });
}

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

test("EXPLAIN_LEVELS lists six explain tiers", () => {
  assert.equal(EXPLAIN_LEVELS.length, 6);
  assert.deepEqual(EXPLAIN_LEVELS, ["eli5", "ms", "hs", "col", "pro", "phd"]);
});
