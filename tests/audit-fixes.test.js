import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { THRESH, hrGaugeState } from "../js/math/survival.js";
import {
  paramsFromPreset,
  computeValuationMetrics
} from "../js/ui/state.js";
import { paramsFromPresetQ } from "./helpers.js";
import { P, INV } from "./fixtures/presets.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const js = readFileSync(path.join(root, "js/main.js"), "utf8");
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

// ---------- Finding 7: verdict uses the same readout HR as the final gauge ----------
test("hrGaugeState.finalClears agrees with hrForFinal vs THRESH for every preset", () => {
  const cutoffs = [66, 72, 78, 84];
  for (const name of Object.keys(P)) {
    const p = paramsFromPresetQ(P[name]);
    for (const c of cutoffs) {
      const gs = hrGaugeState(p, c);
      if (gs.hrForFinal == null || Number.isNaN(gs.hrForFinal)) continue;
      assert.equal(
        gs.finalClears,
        gs.hrForFinal < THRESH,
        `${name}@${c}: finalClears must track hrForFinal<THRESH`
      );
    }
  }
});

test("verdict branch is driven by gs.finalClears / readout HR, not the m58 snapshot", () => {
  // The verdict must key off the same readout value the gauge shows.
  assert.match(js, /const vHr=hrFin,vClears=gs\.finalClears;/);
  assert.match(js, /else if\(vClears\)\{/);
  // The old m58-only verdict test must be gone.
  assert.doesNotMatch(js, /else if\(hr<THRESH\)\{v\.className="verdict v-win"/);
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
