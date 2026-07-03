import test from "node:test";
import assert from "node:assert/strict";
import { T2, hazardRatio, consistent } from "../js/math/survival.js";
import { paramsFromPresetQ } from "./helpers.js";
import { P, PLAUSIBLE_PRESET_NAMES } from "./fixtures/presets.js";

for (const name of PLAUSIBLE_PRESET_NAMES) {
  test(`forward preset "${name}" passes consistent()`, () => {
    const p = paramsFromPresetQ(P[name]);
    assert.ok(p, `preset ${name} should map to params`);
    assert.ok(
      consistent(p),
      `preset ${name} should fit blinded anchors (60/72/78) within tolerances`
    );
  });
}

test("bear preset is HR edge case and may not fit anchors", () => {
  const p = paramsFromPresetQ(P.bear);
  assert.equal(consistent(p), false);
});

test("fail preset HR exceeds win threshold", () => {
  const p = paramsFromPresetQ(P.fail);
  assert.ok(hazardRatio(T2, p) > 0.636);
});

test("noeffect preset HR near unity", () => {
  const p = paramsFromPresetQ(P.noeffect);
  assert.ok(Math.abs(hazardRatio(T2, p) - 1) < 0.02);
});

test("cw preset HR below win threshold", () => {
  const p = paramsFromPresetQ(P.cw);
  assert.ok(hazardRatio(T2, p) < 0.636);
});
