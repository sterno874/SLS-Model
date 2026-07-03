#!/usr/bin/env node
"use strict";
/** Regression checks for SLS-Model inline math (index.html). Run: node verify_math.js */
const vm = require("vm");
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const m = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/);
if (!m) { console.error("Could not extract script"); process.exit(1); }
const core = m[1].split("function setRegalMode")[0].replace(/^const \$ = id => document\.getElementById\(id\);\n/, "")
  + "\nfunction T80(p){let lo=60,hi=130;if(eventsAt(hi,p,80)<80)return hi;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(eventsAt(m,p,80)<80)lo=m;else hi=m;}return (lo+hi)/2;}\n";
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

console.log("\n--- Summary: " + pass + " passed, " + fail + " failed ---");
process.exit(fail > 0 ? 1 : 0);
