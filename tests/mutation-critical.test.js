import test from "node:test";
import assert from "node:assert/strict";
import {
  THRESH, IFLOOR, ZFINAL, N_ARM, LMAX, E3, T1, T2,
  hazardRatio, analyzeLR, eventsAt, eventsAtAnchored, T80PrPace,
  condPow, poolS, sBAT, sGPS, sBATbase, sGPSbase, txMix, Stx,
  censorSurvival, consistent, passesVerdict, isBiologicallyPlausible,
  enrollCDF, Phi, lpois, armDeaths
} from "../js/math/survival.js";
import { b64urlEncode, computeValuationMetrics, paramsFromPresetQ } from "../js/ui/state.js";
import { mk } from "./helpers.js";
import { P } from "./fixtures/presets.js";

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test("formula-critical mutation sentinels", () => {
  assert.deepEqual({ THRESH, IFLOOR, ZFINAL, N_ARM, LMAX, E3 }, {
    THRESH: 0.636, IFLOOR: 0.547, ZFINAL: 2.012, N_ARM: 63, LMAX: 38, E3: 78
  });

  const best = mk({});
  close(hazardRatio(T2, best), 0.262507, 0.0002);
  const lr = analyzeLR(T2, best);
  close(lr.hr, 0.262507, 0.001);
  close(lr.z, 5.335752, 0.01);
  const implicitStrata = { ...best };
  delete implicitStrata.stratF;
  close(analyzeLR(T2, implicitStrata).z, lr.z, 1e-12);
  close(eventsAt(T1, best), 59.814121, 0.001);
  close(eventsAtAnchored(63, best), 78, 1e-12);
  close(T80PrPace(), 64.666667, 0.001);

  close(censorSurvival(36, { ...best, cens: 0.3 }), 0.7, 1e-12);
  close(armDeaths(58, best, sBATbase), 52.453816, 0.001);
  close(armDeaths(58, best, sGPSbase), 20.318116, 0.001);
  close(poolS(36, best), 0.5 * sBAT(36, best) + 0.5 * sGPS(36, best), 1e-12);
  close(sBATbase(36, best), 0.146786, 0.001);
  close(sGPSbase(6, { ...best, delay: 5, gpsc: 0.3 }), 0.758445, 0.00001);
  const txp = { ...best, xtx: 0.2 };
  const base = sBATbase(12, txp), atTx = sBATbase(6, txp);
  close(txMix(12, txp, base, atTx), 0.2 * atTx * Stx(6) + 0.8 * base, 1e-12);

  const cp = condPow(0.3, 0.5, 78);
  close(cp.Pc, 0.439497, 0.00001);
  close(cp.cp, 0.107783, 0.00001);
  close(enrollCDF(25, 25, 0.15), 0.559578, 0.00001);
  close(Phi(0), 0.5, 1e-8);
  assert.equal(lpois(1, 0), -1e9);

  const preset = paramsFromPresetQ(P.best);
  assert.equal(consistent(preset), true);
  assert.equal(passesVerdict(preset), true);
  assert.equal(isBiologicallyPlausible(mk({ bat: 14, batc: 0.28, gpsc: 0.28, gpsu: 14, delay: 0 })), false);

  const valuation = computeValuationMetrics({
    cr2: 2800, cr1: 5500, gpen: 45, gprice: 145, gyears: 2.8,
    flpool: 9000, rrpool: 3500, spen: 38, sprice: 145, syears: 1.4,
    platform: 2.5, mult: 5, shares: 217.6, cash: 138.3,
    riskadj: true, pgps: 65, psls: 55
  });
  close(valuation.gpool, 10458, 0.1);
  close(valuation.totPeak, 1516.004, 0.1);
  close(valuation.EV, 10080.02, 0.1);
  close(valuation.equity, valuation.EV + 138.3, 0.01);
  assert.doesNotMatch(b64urlEncode("ÿÿ"), /[+/=]/);
});
