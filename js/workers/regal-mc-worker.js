import {
  E1, E2, E3, T4, eventsAt, medianOf, poolS, lpois, statusLogLikelihood,
  Phi, hazardRatio, analyzeLR, hrGaugeState, t80Analysis, mcPathToT80,
  interimContribution, consistent, passesVerdict, sBAT, inverseSolve
} from "../math/survival.js";
import { truncatedNormal } from "../math/stats.js";
import { paramsFromPreset, isPlausible } from "../ui/state.js";

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

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededNormal(random) {
  let u = 0, v = 0;
  while (!u) u = random();
  while (!v) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function quickPwin(ctr, binding, cutoff, nDraws, specs, seed, dataThrough = T4) {
  const random = seededRandom(seed);
  let W = 0, WP = 0;
  for (let i = 0; i < nDraws; i++) {
    const q = {
      osmode: "itt", batk: ctr.batk, fh: ctr.fh, assumeStatus: ctr.assumeStatus,
      stratF: ctr.stratF, zfut: ctr.zfut
    };
    for (const spec of specs) {
      q[spec.field] = truncatedNormal(
        ctr[spec.field], spec.sd, spec.min, spec.max,
        () => seededNormal(random), random
      );
    }
    const e46 = eventsAt(46, q, 60), e58 = eventsAt(58, q, 60), e63 = eventsAt(63, q, 60);
    let logL = 0;
    if (dataThrough >= 46) logL += lpois(60, e46);
    if (dataThrough >= 58) logL += lpois(12, Math.max(0, e58 - e46));
    if (dataThrough >= 63) logL += lpois(6, Math.max(0, e63 - e58));
    if (dataThrough >= T4) logL += statusLogLikelihood(q, 60);
    const fitWeight = Math.exp(logL);
    if (!(fitWeight > 0)) continue;
    const thIA = analyzeLR(46, q).z;
    const { Tan, Dan } = t80Analysis(q, cutoff, 60, random(), 12);
    const aFin = analyzeLR(Tan, q);
    if (Number.isNaN(aFin.hr)) continue;
    const { w, pw } = interimContribution(binding, fitWeight, thIA, aFin.z, Dan, q.zfut);
    W += w;
    WP += w * pw;
  }
  return W > 0 ? WP / W : NaN;
}

function runTornado(data) {
  const { ctr, binding, cutoff, specs, tornadoSpecs, draws } = data;
  const seed = 0x51A5EED;
  const basePw = quickPwin(ctr, binding, cutoff, draws, specs, seed);
  const baseHr = hazardRatio(58, ctr);
  const results = [];
  postMessage({ type: "tornadoProgress", completed: 0, total: tornadoSpecs.length, label: "baseline ready", basePw, baseHr, results });
  for (let i = 0; i < tornadoSpecs.length; i++) {
    const item = tornadoSpecs[i];
    let pwLo, pwHi;
    if (item.toggle) {
      pwLo = quickPwin(ctr, false, cutoff, draws, specs, seed);
      pwHi = quickPwin(ctr, true, cutoff, draws, specs, seed);
    } else {
      pwLo = quickPwin({ ...ctr, [item.field]: item.loValue }, binding, cutoff, draws, specs, seed);
      pwHi = quickPwin({ ...ctr, [item.field]: item.hiValue }, binding, cutoff, draws, specs, seed);
    }
    results.push({ lbl: item.lbl, lo: pwLo - basePw, hi: pwHi - basePw });
    postMessage({ type: "tornadoProgress", completed: i + 1, total: tornadoSpecs.length, label: item.lbl, basePw, baseHr, results });
  }
  return { basePw, baseHr, results };
}

function runT80Paths(data) {
  const { ctr, draws, bins = 60, iterations = 12, batSd = 0.5, gpscSd = 0.03 } = data;
  const times = [];
  for (let i = 0; i < draws; i++) {
    const q = {
      ...ctr,
      bat: ctr.bat + rn() * batSd,
      gpsc: Math.max(0, Math.min(0.75, ctr.gpsc + rn() * gpscSd))
    };
    times.push(mcPathToT80(q, bins, Math.random(), iterations));
    if ((i + 1) % 100 === 0) postMessage({ type: "pathProgress", completed: i + 1, total: draws });
  }
  times.sort((a, b) => a - b);
  return { times };
}

function runPwinBatch(data) {
  const results = [];
  for (let i = 0; i < data.tasks.length; i++) {
    const task = data.tasks[i];
    const pw = quickPwin(
      task.ctr, task.binding, task.cutoff, task.draws || data.draws,
      data.specs, task.seed == null ? 0x51A5EED + i * 997 : task.seed,
      task.dataThrough == null ? T4 : task.dataThrough
    );
    results.push({ id: task.id, pw });
    postMessage({ type: "batchProgress", completed: i + 1, total: data.tasks.length, id: task.id, results });
  }
  return { results };
}

function runBandSegments(data) {
  const bands = [];
  for (const config of data.configs) {
    const runs = [];
    let inRun = false, start = 0;
    for (let i = 0; i <= config.steps; i++) {
      const value = config.min + (config.max - config.min) * i / config.steps;
      const q = { ...data.ctr, [config.field]: value * config.scale };
      const ok = consistent(q, data.bins);
      if (ok && !inRun) { inRun = true; start = value; }
      if ((!ok || i === config.steps) && inRun) {
        inRun = false;
        const end = ok ? value : config.min + (config.max - config.min) * (i - 1) / config.steps;
        runs.push([start, end]);
      }
    }
    bands.push({ id: config.id, runs });
  }
  return { bands };
}

function metricsForScenario(item, data, index) {
  const p = item.params || paramsFromPreset(item.name, item.q, item.mode, data.P, data.INV);
  if (!p) return { id: item.id, name: item.name, mode: item.mode, error: "No solution" };
  const gs = hrGaugeState(p, item.cutoff);
  return {
    id: item.id, name: item.name, label: item.label, mode: item.mode,
    fit: isPlausible(p), fitEvents: passesVerdict(p), hr: gs.hrForFinal,
    clears: gs.finalClears, e46: eventsAt(46, p), e58: eventsAt(58, p),
    e63: eventsAt(63, p), pw: quickPwin(
      p, item.binding, item.cutoff, item.draws || data.draws, data.specs,
      item.seed == null ? 0xC0FFEE + index * 997 : item.seed,
      item.dataThrough == null ? T4 : item.dataThrough
    ),
    bat3: sBAT(36, p) * 100, gpsc: p.gpsc * 100,
    batMed: medianOf(sBAT, p)
  };
}

function runScenarioBatch(data) {
  const rows = [];
  for (let i = 0; i < data.items.length; i++) {
    rows.push(metricsForScenario(data.items[i], data, i));
    postMessage({ type: "scenarioProgress", completed: i + 1, total: data.items.length, rows });
  }
  return { rows };
}

function clampedDraw(spec, center) {
  return Math.max(spec.min, Math.min(spec.max, center + spec.sd * rn()));
}

function runSlsMonteCarlo(data) {
  const folds = [], flhrs = [];
  let pwSum = 0, big = 0;
  const byId = Object.fromEntries(data.specs.map((spec) => [spec.id, spec]));
  for (let i = 0; i < data.draws; i++) {
    const os = clampedDraw(byId.sls_os, data.centers.sls_os);
    const bench = clampedDraw(byId.sls_bench, data.centers.sls_bench);
    const flb = clampedDraw(byId.fl_base, data.centers.fl_base);
    const fls = clampedDraw(byId.fl_sls, data.centers.fl_sls);
    const fold = os / Math.max(0.5, bench);
    folds.push(fold);
    if (fold >= 2) big++;
    const flhr = flb / Math.max(1, fls);
    flhrs.push(flhr);
    const z = -Math.log(flhr) * Math.sqrt(data.flev) / 2;
    pwSum += Phi(z - 1.96);
  }
  return { folds, flhrs, pwSum, big, draws: data.draws };
}

function runValMonteCarlo(data) {
  const evs = [], pss = [];
  const byId = Object.fromEntries(data.specs.map((spec) => [spec.id, spec]));
  const draw = (id) => clampedDraw(byId[id], data.centers[id]);
  for (let i = 0; i < data.draws; i++) {
    const cr2 = draw("v_cr2"), cr1 = draw("v_cr1"), gpen = draw("v_gpen") / 100;
    const gprice = draw("v_gprice"), gyears = draw("v_gyears");
    const flpool = draw("v_flpool"), rrpool = draw("v_rrpool"), spen = draw("v_spen") / 100;
    const sprice = draw("v_sprice"), syears = draw("v_syears");
    const platform = draw("v_platform"), mult = draw("v_mult"), shares = draw("v_shares"), cash = draw("v_cash");
    let gp = (cr2 + cr1) * gpen * gyears * gprice / 1000;
    let sp = (flpool + rrpool) * spen * syears * sprice / 1000;
    if (data.riskAdjusted) { gp *= data.pG; sp *= data.pS; }
    const EV = (gp + sp) * mult + platform * 1000;
    evs.push(EV / 1000);
    pss.push((EV + cash) / shares);
  }
  return { evs, pss, draws: data.draws, riskAdjusted: data.riskAdjusted };
}

self.onmessage = (event) => {
  try {
    const data = event.data;
    let result;
    if (data.mode === "tornado") result = runTornado(data);
    else if (data.mode === "inverse") result = runInverse(data);
    else if (data.mode === "inverseSolve") result = inverseSolve(data.base, data.cap);
    else if (data.mode === "t80Paths") result = runT80Paths(data);
    else if (data.mode === "pwinBatch") result = runPwinBatch(data);
    else if (data.mode === "bandSegments") result = runBandSegments(data);
    else if (data.mode === "scenarioBatch") result = runScenarioBatch(data);
    else if (data.mode === "slsMonteCarlo") result = runSlsMonteCarlo(data);
    else if (data.mode === "valMonteCarlo") result = runValMonteCarlo(data);
    else result = runForward(data);
    postMessage({ type: "done", mode: data.mode, ...result });
  } catch (error) {
    postMessage({ type: "error", message: error?.message || String(error) });
  }
};
