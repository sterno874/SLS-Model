import test from "node:test";
import assert from "node:assert/strict";
import { computeValuationMetrics, computeFrozenBestEst } from "../js/ui/state.js";

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
  cash: 107.1,
  riskadj: true,
  pgps: 65,
  psls: 55
};

test("valuation peak/EV arithmetic matches header defaults (risk-adjusted)", () => {
  const { gpool, totPeak, EV, equity, ps, evPerShare } = computeValuationMetrics(DEFAULTS);
  assert.ok(Math.abs(gpool - 10458) < 0.1);
  const gpsGross = (10458 * 145) / 1000;
  const slsGross = ((9000 + 3500) * 0.38 * 1.4 * 145) / 1000;
  const expectedTot = gpsGross * 0.65 + slsGross * 0.55;
  assert.ok(Math.abs(totPeak - expectedTot) < 0.1);
  assert.ok(Math.abs(EV - (expectedTot * 5 + 2500)) < 0.1);
  assert.ok(Math.abs(equity - (EV + 107.1)) < 0.01);
  // Equity $/sh = (EV + cash) / shares ≈ $45.88 at defaults
  assert.ok(Math.abs(ps - (EV + 107.1) / 222) < 0.01);
  assert.ok(Math.abs(ps - 45.88) < 0.1);
  assert.ok(Math.abs(evPerShare - EV / 222) < 0.01);
  assert.ok(ps > evPerShare);
});

test("equity $/sh includes cash; EV/sh does not", () => {
  const withCash = computeValuationMetrics(DEFAULTS);
  const noCash = computeValuationMetrics({ ...DEFAULTS, cash: 0 });
  assert.ok(Math.abs(withCash.EV - noCash.EV) < 0.01);
  assert.ok(Math.abs(withCash.ps - noCash.ps - 107.1 / 222) < 0.01);
});

test("header strip equity $/sh matches valuation panel at defaults", () => {
  const panel = computeValuationMetrics(DEFAULTS);
  const header = computeFrozenBestEst();
  assert.ok(Math.abs(header.ps - panel.ps) < 1e-9);
  assert.ok(Math.abs(header.EV - panel.EV) < 1e-9);
  assert.ok(Math.abs(header.psGross - computeValuationMetrics({ ...DEFAULTS, riskadj: false }).ps) < 1e-9);
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
