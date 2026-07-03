import test from "node:test";
import assert from "node:assert/strict";
import { T1, T2, hazardRatio, consistent, passesVerdict, eventsAt, T3, E3, inverseSolve } from "../js/math/survival.js";
import { paramsFromPresetQ, mk } from "./helpers.js";
import { P, INV, PLAUSIBLE_PRESET_NAMES, INVERSE_PRESET_NAMES } from "./fixtures/presets.js";

for (const name of PLAUSIBLE_PRESET_NAMES) {
  test(`forward preset "${name}" passes consistent()`, () => {
    const p = paramsFromPresetQ(P[name]);
    assert.ok(p, `preset ${name} should map to params`);
    assert.ok(
      consistent(p),
      `preset ${name} should fit blinded anchors (60/72/78) within tolerances`
    );
  });

  test(`forward preset "${name}" passes passesVerdict()`, () => {
    const p = paramsFromPresetQ(P[name]);
    assert.ok(passesVerdict(p), `preset ${name} should pass full trajectory verdict`);
  });
}

test("bear preset HR near win threshold", () => {
  const p = paramsFromPresetQ(P.bear);
  const hr = hazardRatio(T2, p);
  assert.ok(hr >= 0.54 && hr < 0.636, `bear HR ${hr} should be near but below 0.636`);
});

test("noeffect preset HR near unity", () => {
  const p = paramsFromPresetQ(P.noeffect);
  assert.ok(Math.abs(hazardRatio(T2, p) - 1) < 0.02);
});

test("cw preset HR below win threshold", () => {
  const p = paramsFromPresetQ(P.cw);
  assert.ok(hazardRatio(T2, p) < 0.636);
});

test("default best preset passes verdict (full trajectory match)", () => {
  const p = paramsFromPresetQ(P.best);
  assert.ok(passesVerdict(p), "best preset should pass verdict at m46/m58/m63");
  const e3 = eventsAt(T3, p);
  assert.ok(Math.abs(e3 - E3) <= 3, `e63 ${e3} should be within ±3 of 78`);
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
