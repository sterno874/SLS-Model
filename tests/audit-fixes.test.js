import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  N_TOTAL, N_ARM, T4, ZFINAL, hrGaugeState, analyzeLR, eventsAt, sGPS,
  sGPSbase, censorSurvival, t80ConditionalCdf, t80Quantile,
  statusLogLikelihood, interimContribution
} from "../js/math/survival.js";
import { truncatedNormal, weightedQuantile } from "../js/math/stats.js";
import {
  paramsFromPreset,
  computeValuationMetrics
} from "../js/ui/state.js";
import { paramsFromPresetQ } from "./helpers.js";
import { P, INV } from "./fixtures/presets.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const js = readFileSync(path.join(root, "js/main.js"), "utf8");
const regalMcWorker = readFileSync(path.join(root, "js/workers/regal-mc-worker.js"), "utf8");
const html = readFileSync(path.join(root, "index.html"), "utf8");

// ---------- Finding 6: MC histogram dynamic bounds + clamped markers ----------
// Mirror of the exact formula used in renderMC() so the shipped math is pinned.
const HIST_HI = 1.05;
const loBoundFor = (lo, minHr) =>
  Math.min(0.1, Math.floor(Math.min(lo, minHr) * 20) / 20);
const histX = (v, loBound) => {
  const span = HIST_HI - loBound;
  return Math.max(0, Math.min(100, ((v - loBound) / span) * 100));
};

test("histogram lower bound extends below 0.30 for bullish scenarios", () => {
  // bull/cw-style spread with a 5th pct of 0.17 and a min draw of 0.15
  assert.equal(loBoundFor(0.17, 0.15), 0.1);
  // even lower draws extend the axis further down instead of clipping
  assert.equal(loBoundFor(0.06, 0.04), 0);
  // ordinary bearish spread keeps a 0.10 floor (never higher than 0.10)
  assert.ok(loBoundFor(0.55, 0.5) <= 0.1);
});

test("histogram markers are clamped to [0,100]", () => {
  const lb = loBoundFor(0.17, 0.15); // 0.10
  // in-range markers map inside the axis
  assert.ok(histX(0.3, lb) > 0 && histX(0.3, lb) < 100);
  // a marker below the axis floor clamps to 0 (never off-screen negative)
  assert.equal(histX(0.02, lb), 0);
  // a marker above the axis top clamps to 100
  assert.equal(histX(1.4, lb), 100);
});

test("renderMC uses a dynamic lower bound, not a hardcoded 0.30 marker scale", () => {
  assert.match(js, /loBound\s*=\s*Math\.min\(0\.10/);
  assert.match(js, /histX\s*=\s*v=>Math\.max\(0,Math\.min\(100/);
  // old off-screen-prone mapping must be gone
  assert.doesNotMatch(js, /\(lo-0\.30\)\/0\.75/);
  assert.doesNotMatch(js, /for\(let b=0\.30;/);
});

// ---------- Finding 7: verdict and significance use the same log-rank Z ----------
test("hrGaugeState.finalClears agrees with final log-rank Z for every preset", () => {
  const cutoffs = [66, 72, 78, 84];
  for (const name of Object.keys(P)) {
    const p = paramsFromPresetQ(P[name]);
    for (const c of cutoffs) {
      const gs = hrGaugeState(p, c);
      if (gs.hrForFinal == null || Number.isNaN(gs.hrForFinal)) continue;
      assert.equal(gs.finalClears, gs.zReadout > ZFINAL, `${name}@${c}: finalClears must track Z>ZFINAL`);
    }
  }
});

test("verdict branch is driven by gs.finalClears / readout Z, not the m58 snapshot", () => {
  // The verdict must key off the same readout value the gauge shows.
  assert.match(js, /const vHr=hrFin,vClears=gs\.finalClears;/);
  assert.match(js, /else if\(vClears\)\{/);
  // The old m58-only verdict test must be gone.
  assert.doesNotMatch(js, /else if\(hr<THRESH\)\{v\.className="verdict v-win"/);
});

test("engine uses all 127 expected participants as 63.5 per arm", () => {
  assert.equal(N_TOTAL, 127);
  assert.equal(N_ARM, 63.5);
});

test("GPS plateau is absolute and curve is continuous at delay", () => {
  const p = paramsFromPresetQ(P.best);
  assert.ok(Math.abs(sGPS(10000, p) - p.gpsc) < 1e-10);
  assert.ok(Math.abs(sGPSbase(p.delay - 1e-8, p) - sGPSbase(p.delay + 1e-8, p)) < 1e-7);
});

test("independent censoring lowers observed deaths and information consistently", () => {
  const p0 = paramsFromPresetQ(P.best), p30 = { ...p0, cens: 0.3 };
  assert.ok(Math.abs(censorSurvival(36, p30) - 0.7) < 1e-12);
  assert.ok(eventsAt(66, p30) < eventsAt(66, p0));
  assert.ok(analyzeLR(66, p30).z < analyzeLR(66, p0).z);
  const r46 = eventsAt(46, p30) / eventsAt(46, p0), r66 = eventsAt(66, p30) / eventsAt(66, p0);
  assert.notEqual(r46.toFixed(6), r66.toFixed(6), "censoring must not be a global count multiplier");
});

test("T80 CDF and quantile are inverse and path sampling integrates cutoff probability", () => {
  const p = paramsFromPresetQ(P.best), cutoff = 72, expected = t80ConditionalCdf(cutoff, p);
  for (const q of [0.1, 0.5, 0.9]) {
    const t = t80Quantile(p, q);
    assert.ok(Math.abs(t80ConditionalCdf(t, p) - q) < 2e-5);
  }
  const n = 2000;
  let reached = 0;
  for (let i = 0; i < n; i++) if (t80Quantile(p, (i + 0.5) / n) <= cutoff) reached++;
  assert.ok(Math.abs(reached / n - expected) < 1 / n + 1e-6);
});

test("Aug status toggle changes only the optional conditioning term", () => {
  const assumed = paramsFromPresetQ(P.best), confirmed = { ...assumed, assumeStatus: false };
  assert.ok(statusLogLikelihood(assumed) < 0);
  assert.equal(statusLogLikelihood(confirmed), 0);
  assert.equal(t80ConditionalCdf(T4, assumed), 0);
  assert.ok(t80ConditionalCdf(T4, confirmed) > 0);
  assert.ok(t80Quantile(confirmed, 0.5) < t80Quantile(assumed, 0.5));
});

test("binding and informational interim contributions are coherent", () => {
  const fit = 0.37, ia = 1.1, final = 2.4, Dan = 80;
  const info = interimContribution(false, fit, ia, final, Dan, 0.4);
  assert.equal(info.w, fit);
  assert.equal(info.Pc, 1);
  assert.equal(info.pw, interimContribution(false, fit, -5, final, Dan, 0.4).pw);
  const binding = interimContribution(true, fit, ia, final, Dan, 0.4);
  assert.ok(binding.Pc > 0 && binding.Pc < 1);
  assert.ok(Math.abs(binding.w - fit * binding.Pc) < 1e-12);
});

test("truncated draws have no clamped boundary atoms and weighted quantiles use weights", () => {
  let i = 0;
  const normals = [-10, 10, -0.5, 0, 0.5];
  const draw = () => normals[(i++) % normals.length];
  for (let j = 0; j < 100; j++) {
    const x = truncatedNormal(0.5, 0.2, 0, 1, draw, () => 0.37);
    assert.ok(x > 0 && x < 1);
  }
  const rows = [{ x: 1, w: 1 }, { x: 2, w: 1 }, { x: 9, w: 20 }];
  assert.equal(weightedQuantile(rows, "x", 0.5), 9);
});

test("uncertainty envelope uses the current truncated sampler", () => {
  assert.match(js, /function mcEnvelope[\s\S]*q\[f\]=sampleField\(f,ctr\[f\],0\.5\)/);
  assert.doesNotMatch(js, /\bclampf\s*\(/, "removed clampf helper must not remain in a lazy chart path");
  assert.match(js, /function sampleField\(f,mu,sdScale\)/);
});

test("full confidence-band redraw wins when animation-frame updates coalesce", () => {
  assert.match(js, /if\(pendingDrawRaf\)\{pendingDrawLight=pendingDrawLight&&!!light;return;\}/);
  assert.match(js, /onChange\("showUncertainty",function\(\)\{showUncertainty=this\.checked;deferWithLoading\(\(\)=>updateNow\(true\)/);
});

test("REGAL Monte Carlo runs off the browser main thread and is cancellable", () => {
  assert.match(js, /new Worker\(new URL\("\.\/workers\/regal-mc-worker\.js",import\.meta\.url\)/);
  assert.match(js, /function cancelRegalMC\(\)/);
  assert.match(js, /function clearRegalMCOutput\(msg\)\{\s*cancelRegalMC\(\)/);
  assert.doesNotMatch(js, /for\(let i=0;i<MAX;i\+\+\)\{\s*if\(performance\.now\(\)-t0>3[0-9]{3}\)/);
  assert.match(regalMcWorker, /function runForward\(data\)/);
  assert.match(regalMcWorker, /function runInverse\(data\)/);
  assert.match(regalMcWorker, /postMessage\(\{ type: "progress"/);
});

// ---------- Finding 8: approx-fit warning references pooled-median floor ----------
test("approx-fit warning cites the pooled-median floor, not e63", () => {
  assert.match(js, /pooled median OS/);
  assert.match(js, /must be >13\.5 m/);
  assert.doesNotMatch(js, /model e63 "\+e3\.toFixed/);
});

// ---------- Finding 9: lastMcPwin invalidation on param/preset/mode change ----------
test("lastMcPwin is reset on slider, preset, mode, and state changes", () => {
  const reScheduled = /function scheduleUpdate\(\)\{\s*lastMcPwin=null;/;
  const reForward = /function applyRegalPreset\([^)]*\)\{\s*lastMcPwin=null;/;
  const reInverse = /function applyInversePreset\([^)]*\)\{\s*lastMcPwin=null;/;
  const reMode = /function setRegalMode\([^)]*\)\{\s*lastMcPwin=null;/;
  assert.match(js, reScheduled, "scheduleUpdate should clear lastMcPwin");
  assert.match(js, reForward, "applyRegalPreset should clear lastMcPwin");
  assert.match(js, reInverse, "applyInversePreset should clear lastMcPwin");
  assert.match(js, reMode, "setRegalMode should clear lastMcPwin");
  assert.match(js, /restoringState=true;lastMcPwin=null;/, "applyState should clear lastMcPwin");
});

test("applyState wraps its body in try/finally that resets restoringState", () => {
  assert.match(js, /try\{[\s\S]*\}finally\{restoringState=false;\}/);
});

// ---------- Finding 10: main.js consumes state.js as the single source of truth ----------
test("main.js imports the pure helpers from ui/state.js instead of redefining them", () => {
  assert.match(js, /computeValuationMetrics as computeValuationMetricsPure/);
  assert.match(js, /paramsFromPreset as paramsFromPresetPure/);
  // The local wrappers must delegate, not carry their own arithmetic.
  assert.match(js, /function computeValuationMetrics\(\)\{\s*return computeValuationMetricsPure\(/);
  assert.match(js, /function paramsFromPreset\(name,q,mode\)\{\s*return paramsFromPresetPure\(name,q,mode,P,INV\);/);
});

test("state.js valuation + preset helpers produce stable fixture output (parity anchor)", () => {
  const m = computeValuationMetrics({
    cr2: 2800, cr1: 5500, gpen: 45, gprice: 145, gyears: 2.8,
    flpool: 9000, rrpool: 3500, spen: 38, sprice: 145, syears: 1.4,
    platform: 2.5, mult: 5, shares: 222, cash: 107.1, riskadj: false
  });
  // gross (no risk adj): gpsPeak = (2800+5500)*0.45*2.8*145/1000
  const expGps = ((2800 + 5500) * 0.45 * 2.8 * 145) / 1000;
  const expSls = ((9000 + 3500) * 0.38 * 1.4 * 145) / 1000;
  assert.ok(Math.abs(m.gpsPeak - expGps) < 1e-6);
  assert.ok(Math.abs(m.slsPeak - expSls) < 1e-6);
  assert.ok(Math.abs(m.EV - ((expGps + expSls) * 5 + 2.5 * 1000)) < 1e-6);
  assert.ok(Math.abs(m.ps - (m.EV + 107.1) / 222) < 1e-6);
  // preset helper resolves a forward preset to full params
  const fp = paramsFromPreset("best", null, "forward", P, INV);
  assert.ok(fp && typeof fp.bat === "number" && typeof fp.gpsc === "number");
});

// ---------- Findings 1/2/5: dead trial ID, broken citation, wrong CIK are gone ----------
test("dead / broken references are fully removed from shipped files", () => {
  assert.doesNotMatch(js, /NCT05309745/);
  assert.doesNotMatch(html, /NCT05309745/);
  assert.doesNotMatch(js, /PMC3011608/);
  assert.doesNotMatch(html, /PMC3011608/);
  assert.doesNotMatch(js, /data\/882095\//);
  assert.doesNotMatch(html, /data\/882095\//);
  // and the correct replacements are present
  assert.match(html, /NCT04588922/);
  assert.match(html, /haematologica\.org\/article\/view\/5781/);
  assert.match(js, /data\/1667633\//);
});

// ---------- Finding 12: every range slider has an accessible name ----------
test("every range input is associated with a label or aria-label", () => {
  const forAttrs = new Set(
    [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1])
  );
  const ranges = [...html.matchAll(/<input type="range"[^>]*\bid="([^"]+)"[^>]*>/g)];
  assert.ok(ranges.length >= 25, `expected 25+ range sliders, found ${ranges.length}`);
  for (const m of ranges) {
    const id = m[1];
    const tag = m[0];
    const hasFor = forAttrs.has(id);
    const hasAria = /aria-label=/.test(tag);
    // wrapping-label sliders enclose the input directly in <label>…<input>…</label>
    const wrapped = new RegExp(
      `<label[^>]*>[^<]*<input type="range"[^>]*id="${id}"`
    ).test(html);
    assert.ok(
      hasFor || hasAria || wrapped,
      `range slider #${id} has no <label for>, aria-label, or wrapping label`
    );
  }
});
