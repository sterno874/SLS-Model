#!/usr/bin/env node
"use strict";
/** Build css/, js/math/survival.js, js/main.js, slim index.html from monolithic source. */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = process.argv[2] || path.join(root, "index.html");
let html = fs.readFileSync(src, "utf8");
if (!html.includes("<style>")) {
  throw new Error("Source must be monolithic index.html with <style> block");
}

const css = html.match(/<style>\s*([\s\S]*?)<\/style>/)[1].trim();
fs.mkdirSync(path.join(root, "css"), { recursive: true });
fs.writeFileSync(path.join(root, "css/main.css"), css + "\n");

const js = '"use strict";\n' + html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>\s*<script>/)[1].trim();
const mathEnd = js.indexOf("// ---------- anchor-constrained inversion (mixture-cure inverse fit to event anchors) ----------");
const mathStart = js.indexOf("\nconst LN2 =");
const uiPrefix = js.slice(0, mathStart).trim();
const mathBlock = js.slice(mathStart + 1, mathEnd).trim();
const appRest = js.slice(mathEnd).trim();

// Strip DOM helpers accidentally inside math block (plausibility lives in UI)
const mathClean = mathBlock
  .replace(/\nfunction isPlausible[\s\S]*?\n\/\/ ---------- auto-fit ----------/, "\n// ---------- auto-fit ----------")
  .replace(/\nlet lastConsistentP=null;\n/, "\n");

// Remove duplicate inverse helpers from appRest (keep applyInverseResult onward)
const invStart = appRest.indexOf("function eventErr(");
const applyStart = appRest.indexOf("function applyInverseResult(");
const appBody = invStart >= 0 && applyStart > invStart
  ? appRest.slice(0, invStart) + appRest.slice(applyStart)
  : appRest;

const survivalFooter = `

function eventErr(p){
  const e1=eventsAt(T1,p,110),e2=eventsAt(T2,p,110),e3=eventsAt(T3,p,110),e4=eventsAt(T4,p,110);
  const pm=medianOf(poolS,p);
  let err=Math.pow(e1-E1,2)+Math.pow(e2-E2,2)+Math.pow(e3-E3,2)+Math.max(0,e4-79.5)*400;
  if(pm!==null&&pm<13.5)err+=Math.pow(13.5-pm,2)*8;
  return err;
}
function bisectField(p,field,metric,target,lo,hi,steps){
  steps=steps||36;
  const test=v=>metric(Object.assign({},p,{[field]:v}));
  const mLo=test(lo),mHi=test(hi);
  if((mLo-target)*(mHi-target)>0)return null;
  let a=lo,b=hi;
  for(let i=0;i<steps;i++){const m=(a+b)/2;if(test(m)>target)a=m;else b=m;}
  return (a+b)/2;
}
function batcFor3yrCap(p,bat,target3yr){
  let lo=0,hi=0.35;
  for(let i=0;i<28;i++){const m=(lo+hi)/2,c=Object.assign({},p,{bat,batc:m});if(sBAT(36,c)*100>target3yr)hi=m;else lo=m;}
  return (lo+hi)/2;
}
function inverseSolve(base, cap3){
  const p=Object.assign({},base);
  const batcMax=batcFor3yrCap(p,p.bat||8,cap3);
  let best=null,bestErr=1e9;
  for(let bat=6;bat<=14.01;bat+=0.25){
    const batc=Math.min(batcMax,batcFor3yrCap(p,bat,cap3));
    const trial=Object.assign({},p,{bat,batc});
    const gpsu=bisectField(trial,"gpsu",q=>eventsAt(T2,q,100),E2,8,55);
    if(gpsu===null)continue;
    trial.gpsu=gpsu;
    const err=eventErr(trial);
    if(err<bestErr){bestErr=err;best=Object.assign({},trial);}
  }
  if(!best)return{sol:null,err:bestErr,reason:"No (BAT, GPS uncured) pair fits the anchored events with BAT 3-yr OS ≤ "+cap3+"%. Try raising the cap or lowering cure fraction."};
  return{sol:best,err:bestErr};
}

export {
  LN2, N_ARM, LMAX, T1, T2, T3, T4, E1, E2, E3, THRESH, IFLOOR,
  CURRENT_EVENT_ANCHOR, PR_SOURCES, HRMAX, ZFINAL, rmst, ZEFF, ZFUT, STRATF,
  Phi, phi, monthLabel, monthToDate, fmtCalMonth, fmtCalRange,
  lpois, pois, poisLE, rawC, enrollCDF, Stx, sBATbase, sGPSbase, txMix,
  sBAT, sGPS, poolS, armDeaths, eventsAt, eventsAtAnchored,
  T80PrPace, T80, t80Analysis, mcPathToT80,
  hazardRatio, analyzeLR, condPow, Tfor, medianOf, consistent, autofitCure,
  eventErr, bisectField, batcFor3yrCap, inverseSolve
};
`;

fs.mkdirSync(path.join(root, "js/math"), { recursive: true });
fs.writeFileSync(path.join(root, "js/math/survival.js"), mathClean + survivalFooter);

const importBlock = `import {
  LN2, N_ARM, LMAX, T1, T2, T3, T4, E1, E2, E3, THRESH, IFLOOR,
  CURRENT_EVENT_ANCHOR, PR_SOURCES, HRMAX, ZFINAL, rmst, ZEFF, ZFUT, STRATF,
  Phi, phi, monthLabel, monthToDate, fmtCalMonth, fmtCalRange,
  lpois, pois, poisLE, rawC, enrollCDF, Stx, sBATbase, sGPSbase, txMix,
  sBAT, sGPS, poolS, armDeaths, eventsAt, eventsAtAnchored,
  T80PrPace, T80, t80Analysis, mcPathToT80,
  hazardRatio, analyzeLR, condPow, Tfor, medianOf, consistent, autofitCure,
  eventErr, bisectField, batcFor3yrCap, inverseSolve
} from './math/survival.js';
`;

const plausibilityBlock = `
// ---------- plausibility gating (UI) ----------
function isPlausible(p){return consistent(p);}
let lastConsistentP=null;
function paramsFromPresetQ(q){
  if(!q)return null;
  return{bat:q.bat,batc:q.batc/100,batk:1,gpsc:q.gpsc/100,gpsu:q.gpsu,delay:q.delay,xtx:(q.xtx!=null?q.xtx:0)/100,cens:(q.cens!=null?q.cens:0)/100,osmode:"itt",mid:q.mid||25,k:q.k||0.15,fh:false,stratF:STRATF,zfut:ZFUT};
}
function presetFits(name,q){const pr=paramsFromPresetQ(q||P[name]);return pr?isPlausible(pr):false;}
const PRESET_EDGE_LABELS={noeffect:"ridge demo — fits anchors",fail:"fits anchors · HR>0.636"};
function auditPresetButtons(){
  document.querySelectorAll("button[data-preset]").forEach(btn=>{
    const name=btn.dataset.preset,q=P[name];
    const fit=presetFits(name,q);
    btn.classList.toggle("p-invalid",!fit);
    btn.disabled=!fit;
    const sub=btn.querySelector(".p-sub");
    if(sub&&PRESET_EDGE_LABELS[name]&&!sub.textContent.includes("fits anchors"))sub.textContent=PRESET_EDGE_LABELS[name];
    if(!fit){btn.title=(btn.title||"")+" [Does not fit 60/72/78 event anchors — disabled]";}
  });
}
function updatePlausibilityUI(p,plausible){
  const w=$("plausibilityWarn");
  if(w){w.hidden=!!plausible;if(!plausible)w.textContent="Current parameters do not fit blinded event counts (e46/e58/e63). Adjust sliders or enable auto-fit.";}
  const wrap=$("chartWrap"),msg=$("chartStaleMsg"),out=$("outputCard");
  if(wrap)wrap.classList.toggle("chart-stale",!plausible);
  if(msg)msg.hidden=!!plausible||!lastConsistentP;
  if(out)out.classList.toggle("output-stale",!plausible);
}
function solveInverse(base, capOverride){
  const cap3=capOverride!=null?capOverride:+$("batcap").value;
  return inverseSolve(base,cap3);
}
`;

let main = uiPrefix.replace(/^"use strict";\n?/, "");
main = main.replace(
  /function scheduleDraw\(p\)\{\s*pendingDrawP=p;[\s\S]*?pendingDrawRaf=requestAnimationFrame\(\(\)=>\{pendingDrawRaf=null;draw\(pendingDrawP\);\}\);\s*\}/,
  `function scheduleDraw(p){
  const plausible=isPlausible(p);
  if(plausible)lastConsistentP=Object.assign({},p);
  const drawP=plausible?p:(lastConsistentP||null);
  pendingDrawP=drawP;
  updatePlausibilityUI(p,plausible);
  if(pendingDrawRaf)return;
  pendingDrawRaf=requestAnimationFrame(()=>{pendingDrawRaf=null;if(pendingDrawP)draw(pendingDrawP);else drawEmptyChart();});
}
function drawEmptyChart(){
  const cv=$("chart");if(!cv)return;
  const dpr=window.devicePixelRatio||1,W=920,H=430;
  cv.width=W*dpr;cv.height=H*dpr;cv.style.height=H+"px";
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  ctx.fillStyle="#9aa1ac";ctx.font="13px sans-serif";ctx.textAlign="center";
  ctx.fillText("No consistent scenario yet — apply Best Available Guess or enable auto-fit",W/2,H/2);
  chartParams=null;
}`
);

main = '"use strict";\n\n' + importBlock + '\nconst $ = id => document.getElementById(id);\n' + plausibilityBlock + '\n' + main + '\n' + appBody + '\n';
main = main.replace(/\binverseSolve\(/g, (m, offset) => {
  const before = main.slice(Math.max(0, offset - 30), offset);
  if (before.includes("function solveInverse") || before.includes("return inverseSolve")) return m;
  return "solveInverse(";
});

fs.writeFileSync(path.join(root, "js/main.js"), main);

const analytics = html.match(/<script>\s*\(function\(\)\{[\s\S]*?\}\)\(\);\s*<\/script>/)[0];
const slim = html.slice(0, html.indexOf("<style>")) +
  '<link rel="stylesheet" href="css/main.css"/>\n' +
  html.slice(html.indexOf("</style>") + 8, html.indexOf('<script>\n"use strict";')) +
  '<script type="module" src="js/main.js"></script>\n' +
  analytics + "\n</body>\n</html>\n";
fs.writeFileSync(path.join(root, "index.html"), slim);
console.log("Built split assets from", src);
