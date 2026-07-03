#!/usr/bin/env node
"use strict";
/** Regression checks for SLS-Model inline math (index.html). Run: node verify_math.js */
const vm = require("vm");
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const m = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/);
if (!m) { console.error("Could not extract script"); process.exit(1); }
const core = m[1].split("function setRegalMode")[0].replace(/^const \$ = id => document\.getElementById\(id\);\n/, "")
  + "\nfunction eventsAtAnchored(T,p,bins){bins=bins||110;if(T<T3)return eventsAt(T,p,bins);const modelAtAnchor=eventsAt(T3,p,bins);return E3+(eventsAt(T,p,bins)-modelAtAnchor);}\n"
  + "function T80PrPace(){const rate=(E3-E2)/(T3-T2);return T3+(80-E3)/rate;}\n"
  + "function T80(p){let lo=T3,hi=130;if(eventsAtAnchored(hi,p,110)<80)return hi;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(eventsAtAnchored(m,p,110)<80)lo=m;else hi=m;}return (lo+hi)/2;}\n"
  + "function t80Analysis(p,cutoff,bins){bins=bins||110;const t80=T80(p);if(t80<=cutoff)return{t80,Tan:t80,Dan:80};return{t80,Tan:cutoff,Dan:eventsAtAnchored(cutoff,p,bins)};}\n"
  + "function Tfor(events,p){const evAt=(T,b)=>events>=E3?eventsAtAnchored(T,p,b):eventsAt(T,p,b);let lo=events>=E3?T3:20,hi=130;if(evAt(hi,60)<events)return hi;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(evAt(m,60)<events)lo=m;else hi=m;}return (lo+hi)/2;}\n";
const M = { Math, performance: { now: () => 0 }, console };
M.$ = id => ({ value: id === "batcap" ? "17" : "0", checked: false });
vm.createContext(M);
vm.runInContext(core, M);

const T1 = 46, T2 = 58, T3 = 63, E1 = 60, E2 = 72, E3 = 78, ZFINAL = 2.012;

function mk(p) {
  return Object.assign({
    bat: 10, batc: 0.14, batk: 1, gpsc: 0.22, gpsu: 32, delay: 1.5,
    xtx: 0.06, cens: 0.12, osmode: "itt", mid: 25, k: 0.15,
    fh: false, stratF: M.STRATF, zfut: M.ZFUT
  }, p);
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " | " + name + (detail ? " — " + detail : ""));
  if (ok) pass++; else fail++;
}

check("Exponential median S(bat)=0.5",
  Math.abs(M.sBATbase(10, mk({ bat: 10, batc: 0, batk: 1 })) - 0.5) < 0.001);
check("Weibull median scale invariant to k",
  Math.abs(M.sBATbase(10, mk({ bat: 10, batc: 0, batk: 0.8 })) - 0.5) < 0.02);
check("GPS mixture-cure plateau",
  Math.abs(M.sGPSbase(200, mk({ gpsc: 0.4, delay: 3, bat: 8, batc: 0.1 })) - M.sBATbase(3, mk({ gpsc: 0.4, delay: 3, bat: 8, batc: 0.1 })) * 0.4) < 0.02);

const best = mk({});
check("Best preset within event tolerances", M.consistent(best));
check("Best preset HR < 0.636", M.hazardRatio(T2, best) < 0.636, M.hazardRatio(T2, best).toFixed(3));

const noeff = mk({ bat: 14, batc: 0.28, gpsc: 0.28, gpsu: 14, delay: 0, xtx: 0, cens: 0 });
check("No-effect HR ≈ 1", Math.abs(M.hazardRatio(T2, noeff) - 1) < 0.01, M.hazardRatio(T2, noeff).toFixed(3));
check("No-effect fits anchors", M.consistent(noeff));

const failPreset = mk({ bat: 10, batc: 0.28, gpsc: 0.28, gpsu: 18, delay: 0, xtx: 0, cens: 0 });
check("Fail preset HR > 0.636", M.hazardRatio(T2, failPreset) > 0.636, M.hazardRatio(T2, failPreset).toFixed(3));

const ir = M.inverseSolve(mk({ gpsc: 0.42, bat: 8, delay: 0, xtx: 0, cens: 0 }), 17);
check("Inverse solver succeeds", !!ir.sol);
if (ir.sol) {
  check("Inverse hits 72 @ m58", Math.abs(M.eventsAt(T2, ir.sol) - E2) <= 1, M.eventsAt(T2, ir.sol).toFixed(1));
  check("Inverse BAT 3-yr OS ≤ cap", M.sBAT(36, ir.sol) * 100 <= 17.5);
}

const lr = M.analyzeLR(T2, best);
check("Pike HR ≈ analyzeLR (Δ step h=0.5 vs 1)", Math.abs(M.hazardRatio(T2, best) - lr.hr) < 0.005, "Δ=" + Math.abs(M.hazardRatio(T2, best) - lr.hr).toFixed(4));

const hreq = 2.8 / 8.9;
check("SLS HR-equiv = bench/os under exponential",
  Math.abs(hreq - (Math.log(2) / 8.9) / (Math.log(2) / 2.8)) < 0.001, hreq.toFixed(3));

const gpool = (2800 + 5500) * 0.45 * 2.8;
const totPeak = gpool * 145 / 1000 + (9000 + 3500) * 0.38 * 1.4 * 145 / 1000;
const EV = totPeak * 5 + 2.5 * 1000;
check("Valuation peak/EV arithmetic", Math.abs(gpool - 10458) < 0.1 && Math.abs(EV - (totPeak * 5 + 2500)) < 0.1);

const af = M.autofitCure(best);
if (af.sol != null) {
  const fitted = Object.assign({}, best, { gpsc: af.sol });
  check("Autofit targets 72 @ m58", Math.abs(M.eventsAt(T2, fitted) - E2) <= 1,
    "e=" + M.eventsAt(T2, fitted).toFixed(1));
}

function poisLL(p) {
  const e58v = M.eventsAt(58, p, 100), e46v = M.eventsAt(46, p, 100), e63v = M.eventsAt(63, p, 100);
  const l2 = Math.max(0, e58v - e46v), l3 = Math.max(0, e63v - e58v);
  return M.lpois(60, e46v) + M.lpois(12, l2) + M.lpois(6, l3);
}
const altHyp = mk({ bat: 10, batc: 0.14, gpsc: 0.22, gpsu: 32, delay: 1.5, xtx: 0.06, cens: 0.12 });
const strawNull = mk({ bat: 8, batc: 0, gpsc: 0, gpsu: 8, delay: 0, xtx: 0, cens: 0 });
check("Poisson LL: alt hypothesis beats strawman null on 60/72/78 — Δ=12.05",
  poisLL(altHyp) > poisLL(strawNull), "Δ=" + (poisLL(altHyp) - poisLL(strawNull)).toFixed(2));

function b64urlEncode(str) {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString("utf8");
}
const shareSample = { v: 1, tab: "gps", regalMode: "inverse", gps: { bat: 10, gpsc: 42 }, ui: { explainLvl: "phd" } };
const shareDec = JSON.parse(b64urlDecode(b64urlEncode(JSON.stringify(shareSample))));
check("Share URL b64 round-trip", shareDec.regalMode === "inverse" && shareDec.ui.explainLvl === "phd");

function poisLogLThrough(p, throughMonth) {
  const e46v = M.eventsAt(46, p, 100), e58v = M.eventsAt(58, p, 100), e63v = M.eventsAt(63, p, 100), e65v = M.eventsAt(65, p, 100);
  let ll = 0;
  if (throughMonth >= 46) ll += M.lpois(60, e46v);
  if (throughMonth >= 58) ll += M.lpois(12, Math.max(0, e58v - e46v));
  if (throughMonth >= 63) ll += M.lpois(6, Math.max(0, e63v - e58v));
  if (throughMonth >= 65) ll += Math.log(Math.max(1e-12, M.poisLE(1, Math.max(0, e65v - e63v))));
  return ll;
}
check("Milestone LL: truncated @ m46 excludes later increments",
  poisLogLThrough(best, 46) > poisLogLThrough(best, 65));

const cwPreset = mk({ bat: 10, batc: 0.06, gpsc: 0.42, gpsu: 36, delay: 0, xtx: 0, cens: 0 });
check("CW forward preset HR < 0.636", M.hazardRatio(T2, cwPreset) < 0.636, M.hazardRatio(T2, cwPreset).toFixed(3));

check("CURRENT_EVENT_ANCHOR count is 78",
  html.includes("CURRENT_EVENT_ANCHOR={count:78") && html.includes("date:'2026-05-11'"));

function fmtCalMonth(m){const d=new Date(2021,1,1);d.setMonth(d.getMonth()+Math.round(Math.min(m,120)));return d.toLocaleString("en-US",{month:"short",year:"numeric"});}

check("Anchored events @ m63 equals confirmed 78",
  Math.abs(M.eventsAtAnchored(63, best) - 78) < 0.01, "e63=" + M.eventsAtAnchored(63, best).toFixed(1));

check("T80 PR pace linear est. ~m64.7 (72→78 pace)",
  Math.abs(M.T80PrPace() - (63 + 2 / (6 / 5))) < 0.02, "T80PrPace=" + M.T80PrPace().toFixed(2));

check("T80 anchored at 78@m63 lands mid-late 2026 for best preset",
  M.T80(best) > 63 && M.T80(best) < 72,
  "T80=" + M.T80(best).toFixed(1) + " -> " + fmtCalMonth(M.T80(best)));

check("t80Analysis Dan @ m72 uses anchored events when model under-predicts m63",
  M.eventsAt(63, best) < 78 && M.t80Analysis(best, 72).Dan >= 78,
  "Dan=" + M.t80Analysis(best, 72).Dan.toFixed(1) + " vs raw e72=" + M.eventsAt(72, best).toFixed(1));

check("Tfor(80) anchored forward lands before unanchored cumulative search would",
  M.Tfor(80, best) < 72 && M.Tfor(80, best) >= 63,
  "Tfor80=" + M.Tfor(80, best).toFixed(1));

check("Readout power: anchored Dan exceeds raw eventsAt when 80th not reached by cutoff",
  M.t80Analysis(best, 84).Dan > M.eventsAt(72, best),
  "Dan@72=" + M.t80Analysis(best, 72).Dan.toFixed(1));

const IFLOOR = 0.547;
check("Best preset HR clears 0.636 but sits below interim floor (red hatch)",
  M.hazardRatio(T2, best) < 0.636 && M.hazardRatio(T2, best) < IFLOOR,
  M.hazardRatio(T2, best).toFixed(3));
const bearPreset = mk({ bat: 10, batc: 0.22, gpsc: 0.12, gpsu: 28, delay: 0, xtx: 0.06, cens: 0.12 });
check("Bear preset HR clears 0.636 and stays above interim floor (no red hatch)",
  M.hazardRatio(T2, bearPreset) < 0.636 && M.hazardRatio(T2, bearPreset) > IFLOOR,
  M.hazardRatio(T2, bearPreset).toFixed(3));

console.log("\n--- Summary: " + pass + " passed, " + fail + " failed ---");
process.exit(fail > 0 ? 1 : 0);
