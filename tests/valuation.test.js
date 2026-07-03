import test from "node:test";
import assert from "node:assert/strict";

/** Mirrors computeValuationMetrics() in js/main.js (DOM-free for tests). */
function computeValuationMetrics(v) {
  const cr2 = v.cr2;
  const cr1 = v.cr1;
  const gpen = v.gpen / 100;
  const gprice = v.gprice;
  const gyears = v.gyears;
  const flpool = v.flpool;
  const rrpool = v.rrpool;
  const spen = v.spen / 100;
  const sprice = v.sprice;
  const syears = v.syears;
  const platform = v.platform;
  const mult = v.mult;
  const shares = v.shares;
  const ra = !!v.riskadj;
  const pG = (v.pgps != null ? v.pgps : 65) / 100;
  const pS = (v.psls != null ? v.psls : 55) / 100;
  const gpool = (cr2 + cr1) * gpen * gyears;
  let gpsPeak = (gpool * gprice) / 1000;
  let slsPeak = ((flpool + rrpool) * spen * syears * sprice) / 1000;
  if (ra) {
    gpsPeak *= pG;
    slsPeak *= pS;
  }
  const totPeak = gpsPeak + slsPeak;
  const EV = totPeak * mult + platform * 1000;
  const ps = EV / shares;
  return { gpool, gpsPeak, slsPeak, totPeak, EV, ps, riskAdjusted: ra };
}

const DEFAULTS = {
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

test("valuation peak/EV arithmetic matches header defaults (risk-adjusted)", () => {
  const { gpool, totPeak, EV, ps } = computeValuationMetrics(DEFAULTS);
  assert.ok(Math.abs(gpool - 10458) < 0.1);
  const gpsGross = (10458 * 145) / 1000;
  const slsGross = ((9000 + 3500) * 0.38 * 1.4 * 145) / 1000;
  const expectedTot = gpsGross * 0.65 + slsGross * 0.55;
  assert.ok(Math.abs(totPeak - expectedTot) < 0.1);
  assert.ok(Math.abs(EV - (expectedTot * 5 + 2500)) < 0.1);
  assert.ok(Math.abs(ps - 45.3) < 1);
});

test("gross EV when risk adjustment disabled", () => {
  const gross = computeValuationMetrics({ ...DEFAULTS, riskadj: false });
  const expectedTot =
    (10458 * 145) / 1000 + ((9000 + 3500) * 0.38 * 1.4 * 145) / 1000;
  assert.ok(Math.abs(gross.totPeak - expectedTot) < 0.1);
  assert.ok(gross.EV > computeValuationMetrics(DEFAULTS).EV);
});

test("EV scales linearly with multiple", () => {
  const low = computeValuationMetrics({ ...DEFAULTS, mult: 4 });
  const high = computeValuationMetrics({ ...DEFAULTS, mult: 6 });
  assert.ok(high.EV > low.EV);
  assert.ok(Math.abs((high.EV - low.EV) - (6 - 4) * low.totPeak) < 0.01);
});

test("per-share EV decreases with share count", () => {
  const base = computeValuationMetrics(DEFAULTS);
  const diluted = computeValuationMetrics({ ...DEFAULTS, shares: 300 });
  assert.ok(diluted.ps < base.ps);
  assert.ok(Math.abs(diluted.EV - base.EV) < 0.01);
});

test("platform lump sum adds to EV", () => {
  const noPlatform = computeValuationMetrics({ ...DEFAULTS, platform: 0 });
  const withPlatform = computeValuationMetrics(DEFAULTS);
  assert.ok(Math.abs(withPlatform.EV - noPlatform.EV - 2500) < 0.01);
});

test("risk adjustment scales GPS and SLS peaks independently", () => {
  const base = computeValuationMetrics(DEFAULTS);
  const gpsOnly = computeValuationMetrics({ ...DEFAULTS, psls: 0 });
  const slsOnly = computeValuationMetrics({ ...DEFAULTS, pgps: 0 });
  assert.ok(gpsOnly.totPeak < base.totPeak);
  assert.ok(slsOnly.totPeak < base.totPeak);
});
