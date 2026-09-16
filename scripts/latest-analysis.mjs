import {
  T4, ZFINAL, STRATF, ZFUT, Phi, lpois, poisLE, eventsAt, poolS,
  medianOf, analyzeLR, t80Analysis, t80Quantile, condPow, monthToDate,
  sBAT, passesVerdict
} from "../js/math/survival.js";
import { SHARE_P } from "../js/ui/state.js";

const ranges = {
  bat: [6, 20], batc: [0, 0.30], gpsc: [0, 0.75], gpsu: [6, 55],
  delay: [0, 6], xtx: [0, 0.25], cens: [0, 0.30], mid: [15, 32], k: [0.08, 0.30]
};
const sd = { bat: 2, batc: 0.025, gpsc: 0.15, gpsu: 13.5, delay: 1.5, xtx: 0.04, cens: 0.05, mid: 2.5, k: 0.04 };
const fields = Object.keys(sd);

function params(q) {
  return {
    bat: q.bat, batc: q.batc / 100, batk: q.batk != null ? q.batk : 1, gpsc: q.gpsc / 100, gpsu: q.gpsu,
    delay: q.delay, xtx: q.xtx / 100, cens: q.cens / 100, mid: q.mid, k: q.k,
    osmode: "itt", fh: false, stratF: STRATF, zfut: ZFUT
  };
}

let seed = 0x5e11a5;
function uniform() {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return (seed + 0.5) / 4294967296;
}
function normal() {
  const u = uniform(), v = uniform();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function clamp(field, value) {
  const [lo, hi] = ranges[field];
  return Math.max(lo, Math.min(hi, value));
}
function weightedQuantile(rows, field, q) {
  const sorted = [...rows].sort((a, b) => a[field] - b[field]);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.w;
    if (cumulative >= q * total) return row[field];
  }
  return sorted.at(-1)[field];
}
function calendar(month) {
  return monthToDate(month).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function run(name, preset, binding, draws) {
  const center = params(preset);
  const rows = [];
  for (let i = 0; i < draws; i++) {
    const p = { osmode: "itt", batk: 1, fh: false, stratF: STRATF, zfut: ZFUT };
    for (const field of fields) p[field] = clamp(field, center[field] + sd[field] * normal());
    const e58 = eventsAt(58, p, 80);
    if (Math.abs(e58 - 72) > 15) continue;
    const e46 = eventsAt(46, p, 80), e63 = eventsAt(63, p, 80), eStatus = eventsAt(T4, p, 80);
    const pooledMedian = medianOf(poolS, p);
    if (pooledMedian !== null && pooledMedian < 13) continue;
    const logLikelihood =
      lpois(60, e46) +
      lpois(12, Math.max(0, e58 - e46)) +
      lpois(6, Math.max(0, e63 - e58)) +
      Math.log(Math.max(1e-12, poisLE(1, Math.max(0, eStatus - e63))));
    const likelihood = Math.exp(logLikelihood);
    if (likelihood < 1e-11) continue;
    const interimZ = analyzeLR(46, p).z;
    const { t80, Tan, Dan } = t80Analysis(p, 72, 80);
    const final = analyzeLR(Tan, p);
    if (!Number.isFinite(final.hr)) continue;
    let w, pWin;
    if (binding) {
      const conditional = condPow(interimZ, final.z, Dan, p.zfut);
      w = likelihood * conditional.Pc;
      pWin = conditional.cp;
    } else {
      w = likelihood * Phi(interimZ - p.zfut);
      pWin = Phi(final.z - ZFINAL);
    }
    if (w > 0) rows.push({ w, pWin, hr: final.hr, t80 });
  }
  const weight = rows.reduce((s, x) => s + x.w, 0);
  const weight2 = rows.reduce((s, x) => s + x.w * x.w, 0);
  const pWin = rows.reduce((s, x) => s + x.w * x.pWin, 0) / weight;
  const t50 = weightedQuantile(rows, "t80", 0.5);
  return {
    scenario: name,
    interim: binding ? "binding" : "non-binding",
    usable: rows.length,
    effectiveN: Math.round(weight * weight / weight2),
    successPct: +(100 * pWin).toFixed(1),
    failurePct: +(100 * (1 - pWin)).toFixed(1),
    hrMean: +(rows.reduce((s, x) => s + x.w * x.hr, 0) / weight).toFixed(3),
    hrMedian: +weightedQuantile(rows, "hr", 0.5).toFixed(3),
    hr90: [weightedQuantile(rows, "hr", 0.05), weightedQuantile(rows, "hr", 0.95)].map(x => +x.toFixed(3)),
    t80MedianMonth: +t50.toFixed(2),
    t80MedianDate: calendar(t50),
    t80Parameter80: [weightedQuantile(rows, "t80", 0.1), weightedQuantile(rows, "t80", 0.9)].map(calendar)
  };
}

const draws = Number(process.env.ANALYSIS_DRAWS || 5000);
const scenarios = [
  run("Best Available Guess", SHARE_P.best, true, draws),
  run("Best Available Guess", SHARE_P.best, false, draws),
  run("Moderate-effect", SHARE_P.moderate, true, draws),
  run("Bear", SHARE_P.bear, true, draws)
];
const best = params(SHARE_P.best);
const vdmPoints = ["vdm", "vdmfit"].map((name) => {
  const p = params(SHARE_P[name]);
  const analysis = t80Analysis(p, 72, 110);
  return {
    scenario: name,
    reportedBatMedian: +medianOf(sBAT, p).toFixed(2),
    reportedBat3YearPct: +(100 * sBAT(36, p)).toFixed(1),
    events: [46, 58, 63, T4].map((month) => +eventsAt(month, p, 110).toFixed(1)),
    anchorCompatible: passesVerdict(p),
    readoutHr: +analyzeLR(analysis.Tan, p).hr.toFixed(3)
  };
});
console.log(JSON.stringify({
  asOf: "2026-09-16",
  statusMonth: T4,
  drawsPerScenario: draws,
  bestEventTime: {
    median: calendar(t80Quantile(best, 0.5)),
    predictive80: [calendar(t80Quantile(best, 0.1)), calendar(t80Quantile(best, 0.9))]
  },
  vdmPoints,
  scenarios
}, null, 2));
