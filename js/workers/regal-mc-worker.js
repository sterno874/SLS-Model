import {
  E1, E2, E3, eventsAt, medianOf, poolS, lpois, statusLogLikelihood,
  analyzeLR, t80Analysis, interimContribution, consistent, inverseSolve
} from "../math/survival.js";
import { truncatedNormal } from "../math/stats.js";

function rn() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleField(spec, mu) {
  return truncatedNormal(mu, spec.sd, spec.min, spec.max, rn, Math.random);
}

function progress(mode, tried, usable, started, force = false) {
  const now = performance.now();
  if (force || now - progress.lastPosted >= 150) {
    progress.lastPosted = now;
    postMessage({ type: "progress", mode, tried, usable, elapsed: now - started });
  }
}
progress.lastPosted = 0;

function runForward(data) {
  const { ctr, binding, cutoff, specs, maxDraws, timeLimitMs } = data;
  const acc = [];
  const started = performance.now();
  let tried = 0;
  for (let i = 0; i < maxDraws; i++) {
    if (performance.now() - started > timeLimitMs) break;
    tried++;
    const p = {
      osmode: "itt", batk: ctr.batk, fh: ctr.fh, assumeStatus: ctr.assumeStatus,
      stratF: ctr.stratF, zfut: ctr.zfut
    };
    for (const spec of specs) p[spec.field] = sampleField(spec, ctr[spec.field]);
    const e58 = eventsAt(58, p, 80);
    const e46 = eventsAt(46, p, 80), e63 = eventsAt(63, p, 80);
    const pm = medianOf(poolS, p);
    if (pm !== null && pm < 13.5) {
      progress("forward", tried, acc.length, started);
      continue;
    }
    const l1 = e46, l2 = Math.max(0, e58 - e46), l3 = Math.max(0, e63 - e58);
    const logL = lpois(60, l1) + lpois(12, l2) + lpois(6, l3) + statusLogLikelihood(p, 80);
    const Lev = Math.exp(logL);
    if (!(Lev > 0)) {
      progress("forward", tried, acc.length, started);
      continue;
    }
    const thIA = analyzeLR(46, p).z;
    const { t80, Tan, Dan } = t80Analysis(p, cutoff, 80, Math.random());
    const aFin = analyzeLR(Tan, p);
    if (Number.isNaN(aFin.hr)) {
      progress("forward", tried, acc.length, started);
      continue;
    }
    const { w, pw } = interimContribution(binding, Lev, thIA, aFin.z, Dan, p.zfut);
    acc.push({
      hr: aFin.hr, w, pw, reached: t80 <= cutoff, fit: consistent(p, 80),
      fitErr: Math.sqrt(((e46 - E1) ** 2 + (e58 - E2) ** 2 + (e63 - E3) ** 2) / 3)
    });
    progress("forward", tried, acc.length, started);
  }
  progress("forward", tried, acc.length, started, true);
  return { acc, tried };
}

function runInverse(data) {
  const { ctr, binding, cutoff, maxDraws, timeLimitMs, baseCap, gpscSd } = data;
  const acc = [];
  const started = performance.now();
  let tried = 0;
  for (let i = 0; i < maxDraws; i++) {
    if (performance.now() - started > timeLimitMs) break;
    tried++;
    const cap = truncatedNormal(baseCap, 1.5, 12, 22, rn, Math.random);
    const p = {
      osmode: "itt", batk: ctr.batk, fh: ctr.fh, assumeStatus: ctr.assumeStatus,
      stratF: ctr.stratF, zfut: ctr.zfut, delay: ctr.delay, xtx: ctr.xtx,
      cens: ctr.cens, mid: ctr.mid, k: ctr.k,
      gpsc: truncatedNormal(ctr.gpsc, gpscSd, 0.05, 0.75, rn, Math.random), bat: 8
    };
    const ir = inverseSolve(p, cap);
    if (!ir.sol) {
      progress("inverse", tried, acc.length, started);
      continue;
    }
    const s = ir.sol;
    const { t80, Tan, Dan } = t80Analysis(s, cutoff, 80, Math.random());
    const aFin = analyzeLR(Tan, s);
    if (Number.isNaN(aFin.hr)) {
      progress("inverse", tried, acc.length, started);
      continue;
    }
    const thIA = analyzeLR(46, s).z;
    const fitWeight = Math.exp(-ir.err * 0.08);
    const { w, pw } = interimContribution(binding, fitWeight, thIA, aFin.z, Dan, ctr.zfut);
    acc.push({
      hr: aFin.hr, w, pw, reached: t80 <= cutoff, gpsu: s.gpsu, bat: s.bat,
      fit: consistent(s, 80), fitErr: Math.sqrt(ir.err / 3)
    });
    progress("inverse", tried, acc.length, started);
  }
  progress("inverse", tried, acc.length, started, true);
  return { acc, tried };
}

self.onmessage = (event) => {
  try {
    const data = event.data;
    const result = data.mode === "inverse" ? runInverse(data) : runForward(data);
    postMessage({ type: "done", mode: data.mode, ...result });
  } catch (error) {
    postMessage({ type: "error", message: error?.message || String(error) });
  }
};
