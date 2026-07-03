"use strict";

import {
  LN2,
  N_ARM,
  LMAX,
  T1,
  T2,
  T3,
  T4,
  E1,
  E2,
  E3,
  THRESH,
  IFLOOR,
  CURRENT_EVENT_ANCHOR,
  PR_SOURCES,
  HRMAX,
  ZFINAL,
  rmst,
  ZEFF,
  ZFUT,
  STRATF,
  Phi,
  phi,
  monthLabel,
  monthToDate,
  fmtCalMonth,
  fmtCalRange,
  lpois,
  pois,
  poisLE,
  rawC,
  enrollCDF,
  Stx,
  sBATbase,
  sGPSbase,
  txMix,
  sBAT,
  sGPS,
  poolS,
  armDeaths,
  eventsAt,
  eventsAtAnchored,
  T80PrPace,
  T80,
  t80Analysis,
  mcPathToT80,
  hazardRatio,
  analyzeLR,
  hrGaugeState,
  condPow,
  Tfor,
  medianOf,
  consistent,
  passesVerdict,
  autofitCure,
  eventErr,
  bisectField,
  batcFor3yrCap,
  inverseSolve
} from './math/survival.js';

const $ = id => document.getElementById(id);

// ---------- plausibility gating (UI) ----------
function isPlausible(p){return passesVerdict(p);}
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
function updatePlausibilityUI(p,plausible,approxFit){
  const w=$("plausibilityWarn");
  if(w){
    if(plausible)w.hidden=true;
    else if(approxFit){
      w.hidden=false;
      const e3=eventsAt(T3,p,110);
      w.textContent="Approximate fit — model e63 "+e3.toFixed(1)+" is outside ±3 of confirmed 78. Chart requires full trajectory match; adjust sliders or enable auto-fit.";
    }else{
      w.hidden=false;
      w.textContent="Current parameters do not fit blinded event counts (e60/e58/e63). Adjust sliders or enable auto-fit.";
    }
  }
  const wrap=$("chartWrap"),msg=$("chartStaleMsg"),out=$("outputCard");
  if(wrap)wrap.classList.toggle("chart-stale",!plausible);
  if(msg)msg.hidden=!!plausible||!lastConsistentP;
  if(out)out.classList.toggle("output-stale",!plausible);
}

// ---------- loading overlay ----------
let loadCount = 0;
function showLoading(msg){
  loadCount++;
  const ov=$("loadOverlay"),msgEl=$("loadMsg");
  if(msgEl&&msg)msgEl.textContent=msg;
  if(ov){ov.classList.add("visible");ov.setAttribute("aria-busy","true");}
}
function hideLoading(){
  loadCount=Math.max(0,loadCount-1);
  if(loadCount===0){
    const ov=$("loadOverlay");
    if(ov){ov.classList.remove("visible");ov.setAttribute("aria-busy","false");}
  }
}
function forceHideLoading(){
  loadCount=0;
  clearTimeout(updateSpinnerTimer);updateSpinnerTimer=null;
  const ov=$("loadOverlay");
  if(ov){ov.classList.remove("visible");ov.setAttribute("aria-busy","false");}
}
function deferWithLoading(fn,msg){
  showLoading(msg||"Computing…");
  requestAnimationFrame(()=>{
    setTimeout(()=>{
      try{fn();}finally{hideLoading();}
    },0);
  });
}
// ---------- perf: debounce, lazy tabs, deferred panels ----------
function debounce(fn,ms){
  let t;return function(){clearTimeout(t);const a=arguments,s=this;t=setTimeout(()=>fn.apply(s,a),ms);};
}
let updateTimer=null,updateSpinnerTimer=null,pendingDrawRaf=null,pendingDrawP=null,lastBandsKey="";
const tabsRendered={gps:false,sls009:false,value:false,explain:false};
const tabsDirty={sls009:true,value:true,explain:true};
function panelOpen(id){const el=$(id);return!!(el&&el.open);}
function scheduleDraw(p){
  const plausible=isPlausible(p);
  const approxFit=!plausible&&consistent(p);
  if(plausible||approxFit)lastConsistentP=Object.assign({},p);
  const drawP=plausible?p:(lastConsistentP||null);
  pendingDrawP=drawP;
  updatePlausibilityUI(p,plausible,approxFit);
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
}
function scheduleUpdate(){
  if(restoringState){updateNow();return;}
  clearTimeout(updateTimer);
  updateTimer=setTimeout(()=>{
    updateTimer=null;clearTimeout(updateSpinnerTimer);updateSpinnerTimer=null;hideLoading();updateNow();
  },75);
}
function refreshOpenPanels(){
  if(panelOpen("panelIRM"))renderIRM();
  if(panelOpen("panelBayes"))updateBayes();
  if(panelOpen("panelBacktest"))renderBacktest();
}

// ---------- anchor-constrained inversion (mixture-cure inverse fit to event anchors) ----------
// Community DD by u/Confident-Web-7118 popularized this framing — see References [14]
let regalMode="forward";
let activeRegalPreset="best",activeInvPreset="cw42",activeSlsPreset="best",activeValPreset="best";
let activeTab="gps",restoringState=false;
let readoutTimer=null;
function highlightPresets(sel,attr,id){document.querySelectorAll(sel).forEach(b=>b.classList.toggle("p-def",b.dataset[attr]===id));}
function refreshRegalPresetHighlight(){
  if(regalMode==="inverse"){highlightPresets("button[data-inv]","inv",activeInvPreset);document.querySelectorAll("button[data-preset]").forEach(b=>b.classList.remove("p-def"));}
  else{highlightPresets("button[data-preset]","preset",activeRegalPreset);document.querySelectorAll("button[data-inv]").forEach(b=>b.classList.remove("p-def"));}
}
function solveInverse(base, capOverride){
  const cap3=capOverride!=null?capOverride:+$("batcap").value;
  return inverseSolve(base,cap3);
}
function applyInverseResult(r){
  if(!r||!r.sol){$("invStatus").textContent=r&&r.reason?r.reason:"";return false;}
  const s=r.sol;
  $("bat").value=s.bat;$("batc").value=Math.round(s.batc*100);$("gpsu").value=s.gpsu.toFixed(1);
  $("invBat").textContent=s.bat.toFixed(1)+" m";$("invBatc").textContent=(s.batc*100).toFixed(0)+"%";
  $("invGpsu").textContent=s.gpsu.toFixed(1)+" m";
  const pm=medianOf(poolS,s),hr=hazardRatio(T2,s);
  $("invPool").textContent=pm===null?">240 m":pm.toFixed(1)+" m";
  $("invHR").textContent=isNaN(hr)?"—":hr.toFixed(2);
  $("invErr").textContent=r.err<1?"exact":r.err.toFixed(1);
  $("invStatus").textContent="Anchored to 60/72/78 + <80; GPS cure "+(s.gpsc*100).toFixed(0)+"% fixed; BAT 3-yr OS "+(sBAT(36,s)*100).toFixed(0)+"% (≤"+$("batcap").value+"% cap). Structural tail→GPS assignment — not arm-level proof.";
  return true;
}
function setRegalMode(mode){
  regalMode=mode;
  $("modeForward").classList.toggle("active",mode==="forward");
  $("modeInverse").classList.toggle("active",mode==="inverse");
  document.querySelectorAll("[data-regal-mode]").forEach(el=>{
    const m=el.dataset.regalMode;
    el.hidden=!(m==="both"||m===mode);
  });
  ["bat","batc","gpsu"].forEach(id=>{const e=$(id);if(e){e.disabled=mode==="inverse";const wrap=e.closest(".ctrl");if(wrap)wrap.classList.toggle("disabled",mode==="inverse");}});
  $("gpscWrap").classList.toggle("disabled",mode==="forward"&&$("autofit").checked);
  ["batDerivedTag","batcDerivedTag","gpsuDerivedTag"].forEach(id=>{const e=$(id);if(e)e.hidden=mode!=="inverse";});
  $("mcPanelTitle").textContent=mode==="inverse"?"Monte Carlo — implied HR distribution (anchor-constrained inversion)":"Monte Carlo — final-HR distribution";
  $("mcPanelHint").innerHTML=mode==="inverse"
    ?'Varies <b>GPS cure fraction</b> (±1σ around slider) and BAT 3-yr cap, re-runs the inverse solver each draw, and histograms the <b>implied HR</b> that falls out. Shows how sensitive derived efficacy is to the cure-fraction assumption — not a direct-parameterization posterior. Non-binding interim unless preset says otherwise. <span class="cite">CW framing: <a href="https://www.reddit.com/r/sellaslifesciences/comments/1tnh66g/why_the_randomization_window_leads_to_an/" target="_blank" rel="noopener">IRM post</a></span>'
    :'Samples the priors — <b>each slider = the prior CENTER, its blue 1σ band = the spread</b> — and <b>weights each draw by a Poisson likelihood</b> of the observed event increments (<a href="https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html" target="_blank" rel="noopener">60 @ m46</a>, <a href="https://www.globenewswire.com/news-release/2025/12/29/3210926/0/en/SELLAS-Life-Sciences-Provides-Update-on-Pivotal-Phase-3-REGAL-Trial-of-Galinpepimut-S-GPS-in-Acute-Myeloid-Leukemia-AML.html" target="_blank" rel="noopener">+12</a>, <a href="https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html" target="_blank" rel="noopener">+6</a>, still &lt;80), so every scenario is anchored <em>in proportion to how well it explains the exact numbers, with counting noise modeled</em> — not accepted/rejected by an arbitrary window. "Win" is a <b>stratified log-rank significance test</b> (NPH-aware). Win threshold HR &lt; 0.636 from the <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank" rel="noopener">design paper</a>. Binding interim: soft-weight P(continue) via OBF Z=2.34 (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank" rel="noopener">source</a>). <span class="tag m">Model output</span> — only as good as the priors.';
  refreshRegalPresetHighlight();
  update();
}
$("modeForward").onclick=()=>setRegalMode("forward");
$("modeInverse").onclick=()=>setRegalMode("inverse");

// ---------- slider config ----------
const DATA_WHY="GREEN = values that still reproduce the announced pooled events — 60 @ m46, 72 @ m58, 78 @ m63, still <80 @ m65 — holding your OTHER sliders fixed. Move another slider and this window shifts: that coupling is the identification problem. Sources: SELLAS PRs [3][4][5].";
const CFG=[
 {id:"bat", field:"bat", min:6,max:20,step:0.5,sc:1,   sig:{b3:[6,16],b2:[7,14],b1:[8.5,12.5],mu:10.5}, imp:[15,20],
   why:"PRIOR (blue): median of the non-tail BAT component — a FROM-RANDOMIZATION quantity. REGAL design assumes 8.0m [1]; ven-era CR2/R-R salvage ~8–12m by mutation [10]; Kurosawa CR2 transplant-INELIGIBLE supports the low end [9]. NOTE: the ≤6-mo CR2→randomization window + &gt;6-mo life-expectancy entry criterion positively select the cohort, lifting this ~1–3mo above from-CR2 literature (left-truncation / lead-time) — this shifts the ABSOLUTE median, NOT the HR. 1σ 8.5–12.5m, 3σ to 16m.",
   impwhy:"IMPLAUSIBLE (>15m): exceeds QUAZAR's CR1-placebo median of 14.8m [6] — CR2 is a worse-prognosis state than CR1, so its median must be lower. No CR2 transplant-ineligible dataset supports a median this high [8][9]. Implausible, not impossible."},
 {id:"batc",field:"batc",min:0,max:30,step:1,  sc:0.01,sig:{b3:[0,22],b2:[0,17],b1:[4,13],mu:9}, imp:[20,30],
   why:"PRIOR (blue): long-survivor fraction, FROM RANDOMIZATION. Kurosawa (158 CR2 transplant-INELIGIBLE, from CR2) [9]: 3-yr OS 14% overall (19% intermediate, higher favorable-CBF, lower poor-risk). Left-truncation lifts the from-randomization tail a few points above the from-CR2 figure. 1σ 4–13%. NOTE: fitting the events while respecting the no-halt tends to FORCE this ≥18–24% — an unresolved tension (see impwhy).",
   impwhy:"IMPLAUSIBLE (>20% plateau ⇒ >~26% 3-yr OS): exceeds even intermediate-risk CR2 (~19% [9]) plus lead-time lift; needs heavy favorable-CBF enrichment or transplant crossover. The puzzle: data + no-halt fits push into this zone anyway — which is mild evidence the interim was NON-binding (letting a lower BAT tail / lower HR back in) OR the arm is unusually favorable. Use the transplant slider for a legitimate tail."},
 {id:"gpsc",field:"gpsc",min:0,max:75,step:1,  sc:0.01,sig:{b3:[0,70],b2:[0,55],b1:[10,40],mu:25},
   why:"PRIOR (blue): GPS cure/plateau fraction — highly uncertain. Phase 2 CR1 showed a ~47% 3-yr plateau [1] (but selection-biased); Phase 2 CR2 (the closest analog) showed NO plateau [7]; T-cell immune-response rate ~64% [1]. Wide band on purpose."},
 {id:"gpsu",field:"gpsu",min:6,max:40,step:0.5,sc:1,   sig:{b3:[6,40],b2:[8,34],b1:[13,27],mu:20},
   why:"PRIOR (blue): median OS of non-cured GPS patients. Phase 2 CR2 GPS median OS 16.3m [7]; Phase 2 CR1 median DFS 16.9m [1]. 1σ 13–27m. The m63 event point pulls fits toward the high end."},
 {id:"delay",field:"delay",min:0,max:6,step:0.5,sc:1,  sig:{b3:[0,6],b2:[0,5],b1:[0.5,3.5],mu:2},
   why:"PRIOR (blue): months before GPS separates from BAT. GPS primes over ~3 months (6 q2-weekly doses) [1]; CR2 patients have prior WT1 exposure so an anamnestic recall could be faster. 1σ 0.5–3.5m."},
 {id:"xtx", field:"xtx",min:0,max:25,step:1,   sc:0.01,sig:{b3:[0,20],b2:[0,15],b1:[2,10],mu:6}, imp:[18,25],
   why:"PRIOR (blue): % of each arm transplanted AFTER enrollment. Eligibility is judged only at entry [2], so later transplant is allowed; OS counts their survival (ITT) [2]. Historically <20% of relapsed AML reach transplant even when eligible [8]; transplanted CR2 ~40–50% cured [8].",
   impwhy:"IMPLAUSIBLE (>18%): this is a transplant-INELIGIBLE-at-entry cohort [2]; even in transplant-eligible relapsed AML, <20% actually reach transplant [8]."},
 {id:"cens",field:"cens",min:0,max:30,step:1,  sc:0.01,sig:{b3:[0,25],b2:[0,20],b1:[5,15],mu:12},
   why:"PRIOR (blue): lost-to-follow-up before an EVENT (death). Phase 2 GPS censoring ~15% [7]; trials commonly 10–20%. Higher censoring ⇒ true survival is worse than raw event counts imply. NOTE: SELLAS's '66 discontinued' figure (Mar 2024) [11] is TREATMENT discontinuation — mostly relapse-driven, NOT OS censoring (OS follow-up continues). Do not plug 52% here."},
 {id:"mid", field:"mid",min:15,max:32,step:1,  sc:1,   sig:{b3:[17.5,32],b2:[20,30],b1:[22.5,27.5],mu:25},
   why:"PRIOR (blue): enrollment S-curve midpoint. Real milestones [11]: first patient 8 Feb 2021; 105 pts (ex-China) by Nov 2023 (~m33); full N=127 by ~Apr 2024 (~m38) — back-loaded, so late enrollees have short follow-up. Default midpoint ~m25 reproduces ~85% enrolled by m33."},
 {id:"k",   field:"k",min:0.08,max:0.30,step:0.01,sc:1,sig:{b3:[0.08,0.27],b2:[0.08,0.23],b1:[0.11,0.19],mu:0.15},
   why:"PRIOR (blue): steepness of the enrollment S-curve. Enrollment accelerated after the Nov 2022 protocol amendment; ~21 of 127 patients enrolled in the final ~5 months [1][11]."}
];
function pct(v,mn,mx){return Math.min(100,Math.max(0,(v-mn)/(mx-mn)*100));}

// build static sigma strips once
function buildBands(){
  CFG.forEach(c=>{
    const host=$("band-"+c.id);if(!host)return;
    const sig=document.createElement("div");sig.className="strip sigma";sig.title=c.why||"Prior plausibility band (1σ/2σ/3σ).";
    const mk=(lohi,op)=>{const s=document.createElement("div");s.className="seg";
      s.style.left=pct(lohi[0],c.min,c.max)+"%";s.style.width=(pct(lohi[1],c.min,c.max)-pct(lohi[0],c.min,c.max))+"%";
      s.style.background="rgba(47,111,237,"+op+")";return s;};
    sig.appendChild(mk(c.sig.b3,0.14));sig.appendChild(mk(c.sig.b2,0.28));sig.appendChild(mk(c.sig.b1,0.5));
    if(c.imp){const im=document.createElement("div");im.className="seg imp";im.title=c.impwhy||"Biologically implausible (no supporting dataset).";
      im.style.left=pct(c.imp[0],c.min,c.max)+"%";im.style.width=(pct(c.imp[1],c.min,c.max)-pct(c.imp[0],c.min,c.max))+"%";sig.appendChild(im);}
    const data=document.createElement("div");data.className="strip data";data.id="data-"+c.id;data.title=DATA_WHY;
    const mark=document.createElement("div");mark.className="marker";mark.id="mark-"+c.id;
    host.appendChild(sig);host.appendChild(data);host.appendChild(mark);
  });
}
// update dynamic data-consistent strips + markers
function renderBands(p){
  CFG.forEach(c=>{
    const strip=$("data-"+c.id);if(!strip)return;strip.innerHTML="";
    const M=44;let runs=[],inRun=false,start=0;
    for(let i=0;i<=M;i++){
      const v=c.min+(c.max-c.min)*i/M;
      const q=Object.assign({},p);q[c.field]=v*c.sc;
      const ok=consistent(q);
      if(ok&&!inRun){inRun=true;start=v;}
      if((!ok||i===M)&&inRun){inRun=false;runs.push([start, ok?v:(c.min+(c.max-c.min)*(i-1)/M)]);}
    }
    runs.forEach(r=>{const s=document.createElement("div");s.className="seg";
      s.style.left=pct(r[0],c.min,c.max)+"%";s.style.width=Math.max(0.8,pct(r[1],c.min,c.max)-pct(r[0],c.min,c.max))+"%";
      s.style.background="var(--data)";s.style.opacity="0.75";strip.appendChild(s);});
    const cur=+$(c.id).value;$("mark-"+c.id).style.left="calc("+pct(cur,c.min,c.max)+"% - 1px)";
  });
}

// ---------- chart ----------
let showUncertainty=false;
let lastMcPwin=null,lastPointPwin=null;
let chartLayout=null,chartPinMonth=null,chartParams=null;
function fmtAsOf(iso){if(!iso)return'';const d=new Date(iso+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',year:'numeric',day:'numeric'});}
function initFactsAsOf(){
  document.querySelectorAll('.facts .fgrid > div').forEach(el=>{
    if(el.dataset.asOf)return;
    const h=el.innerHTML;
    if(h.includes('3293399')||h.includes("Q1'26")||h.includes('Q1 2026')){el.dataset.asOf='2026-05-11';if(h.includes('78')||h.includes('Event timeline'))el.dataset.eventAnchor='78';}
    else if(h.includes('3210926')||h.includes("Dec'25")){el.dataset.asOf='2025-12-29';if(h.match(/\b72\b/)&&h.includes('event'))el.dataset.eventAnchor='72';}
    else if(h.includes('3014244')||h.includes("Jan'25")||h.includes('Interim (60')){el.dataset.asOf='2025-01-23';if(h.includes('60')||h.includes('Interim'))el.dataset.eventAnchor='60';}
    else if(h.includes('2871141')||h.includes('Apr 2024'))el.dataset.asOf='2024-04-29';
    else if(h.includes('PMC11760237')||h.includes('[design]')||h.includes('[NCT]'))el.dataset.asOf='2025-01-01';
    else if(h.includes('ASH 2025')||h.includes('3423/552036'))el.dataset.asOf='2025-12-01';
    else if(h.includes('3115485')||h.includes('Jul 2025'))el.dataset.asOf='2025-07-15';
    else if(h.includes('20260331')||h.includes('Mar 31, 2026'))el.dataset.asOf='2026-03-31';
    else if(h.includes('Mar 2026')&&h.includes('frontline'))el.dataset.asOf='2026-03-01';
    else if(h.includes('SEER')||h.includes('Cheever'))el.dataset.asOf='2024-01-01';
    else el.dataset.asOf='2026-05-11';
    const sp=document.createElement('span');sp.className='as-of';sp.textContent='[as of '+fmtAsOf(el.dataset.asOf)+']';
    el.appendChild(sp);
    const ec=+(el.dataset.eventAnchor||0);
    if(ec>0&&ec<CURRENT_EVENT_ANCHOR.count){
      const ns=PR_SOURCES[CURRENT_EVENT_ANCHOR.count];
      const badge=document.createElement('span');badge.className='stale-badge';
      badge.innerHTML='⚠️ stale · <a href="'+ns.src+'" target="_blank" rel="noopener">'+CURRENT_EVENT_ANCHOR.count+' @ '+ns.label+'</a>';
      el.appendChild(badge);
    }
  });
}
function getEmbedMode(){
  const q=new URLSearchParams(location.search);
  if(q.get('embed')==='1')return true;
  try{const h=location.hash;if(h.startsWith('#s=')){const s=JSON.parse(b64urlDecode(h.slice(3)));if(s&&s.embed)return true;}}catch(e){}
  return false;
}
let embedMode=getEmbedMode();
function applyEmbedMode(){
  embedMode=getEmbedMode();
  document.body.classList.toggle('embed-mode',embedMode);
}
applyEmbedMode();
function getCurrentPwin(){
  if(lastMcPwin!=null&&!isNaN(lastMcPwin))return{pw:lastMcPwin,src:'Monte Carlo posterior (binding interim if checked)'};
  const p=readParams(),binding=$("mcFloor").checked,cutoff=+$("cutoff").value;
  const{t80,Tan,Dan}=t80Analysis(p,cutoff);
  const thIA=analyzeLR(46,p).z,th80=analyzeLR(Tan,p).z;
  const pw=binding?condPow(thIA,th80,Dan,p.zfut).cp:Phi(th80-ZFINAL);
  lastPointPwin=pw;
  return{pw:pw,src:'Point-estimate P(win) from current sliders (analyzeLR @ cutoff m'+cutoff+')'};
}
function usePwinInValuation(){
  const{pw,src}=getCurrentPwin();
  const pct=Math.round(Math.max(30,Math.min(95,pw*100)));
  $("v_pgps").value=pct;$("v_vpgps").textContent=pct+'%';
  tabsDirty.value=true;
  switchTab('value');
  const lbl=$("v_pgps").closest('label');
  if(lbl){lbl.classList.add('val-highlight');setTimeout(()=>lbl.classList.remove('val-highlight'),2500);}
  showToast('P(GPS) set to '+pct+'% — '+src);
  if(activeTab==='value')renderVal();
}
function scheduleReadoutUpdate(){clearTimeout(readoutTimer);readoutTimer=setTimeout(updateReadoutTracker,400);}
function updateReadoutVisibility(){
  const el=$("readoutEstimate");
  if(el)el.hidden=(activeTab!=='gps'||embedMode);
}
function updateReadoutTracker(){
  updateReadoutVisibility();
  const p=readParams(),t80=T80(p),tPace=T80PrPace(),moFromAnchor=t80-T3;
  if($("reDate"))$("reDate").textContent=fmtCalMonth(t80);
  if($("reEvents"))$("reEvents").textContent=CURRENT_EVENT_ANCHOR.count+'/80';
  const times=[];for(let i=0;i<2000;i++){const q=Object.assign({},p);q.bat+=rn()*0.4;times.push(mcPathToT80(q,110));}
  times.sort((a,b)=>a-b);
  const qf=q=>times[Math.min(times.length-1,Math.floor(q*times.length))];
  const p10=qf(0.05),p90=qf(0.95);
  if($("reCI"))$("reCI").textContent='90% CI: '+fmtCalRange(p10,p90)+' (+'+(p10-T3).toFixed(1)+'–'+(p90-T3).toFixed(1)+' mo from anchor)';
  const paceEl=$("rePace");
  if(paceEl){
    if(t80>tPace+0.4){
      paceEl.hidden=false;
      paceEl.innerHTML='PR pace est.: <b>'+fmtCalMonth(tPace)+'</b> (+'+(tPace-T3).toFixed(1)+' mo · linear 72→78) <span class="tag f">PR pace</span>';
    }else paceEl.hidden=true;
  }
}
function scenarioMetrics(p,binding){
  if(!p)return null;
  const b=binding!=null?binding:!!$("mcFloor").checked;
  return{hr:hazardRatio(T2,p),e46:eventsAt(T1,p),e58:eventsAt(T2,p),e63:eventsAt(T3,p),
    pw:fastPwin(p,b,+$("cutoff").value,2500),bat3:sBAT(36,p)*100,gpsc:p.gpsc*100,
    batMed:medianOf(sBAT,p),gpsCure:p.gpsc*100};
}
function paramsFromShareHash(hash){
  if(!hash||!hash.trim())return null;
  let h=hash.trim();if(!h.startsWith('#'))h='#'+h;if(!h.startsWith('#s='))return null;
  try{const s=JSON.parse(b64urlDecode(h.slice(3)));if(!s||!s.gps)return null;
    return{osmode:'itt',bat:s.gps.bat,batc:s.gps.batc/100,batk:s.gps.batk||1,gpsc:s.gps.gpsc/100,gpsu:s.gps.gpsu,
      delay:s.gps.delay,xtx:s.gps.xtx/100,cens:s.gps.cens/100,mid:s.gps.mid,k:s.gps.k,fh:!!s.gps.fhTest,
      stratF:s.gps.stratF!=null?s.gps.stratF:STRATF,zfut:s.gps.zfut!=null?s.gps.zfut:ZFUT,binding:!!s.gps.mcFloor};
  }catch(e){return null;}
}
function initScmpSelects(){
  const opts=[{v:'',l:'— pick preset —'}];
  for(const n in P)opts.push({v:'f:'+n,l:PRESET_NAMES[n]||n});
  for(const n in INV)opts.push({v:'i:'+n,l:(PRESET_NAMES[n]||n)+' (inv)'});
  ['scmpA','scmpB'].forEach(id=>{const sel=$(id);if(!sel)return;
    sel.innerHTML=opts.map(o=>'<option value="'+o.v+'">'+o.l+'</option>').join('');
    if(id==='scmpA')sel.value='f:best';if(id==='scmpB')sel.value='f:bull';});
}
function resolveScmpScenario(selId,hashId){
  const hash=$(hashId).value.trim();
  if(hash){const pr=paramsFromShareHash(hash);if(pr)return{params:pr,binding:pr.binding,label:'Share URL'};}
  const v=$(selId).value;if(!v)return null;
  const mode=v.startsWith('i:')?'inverse':'forward',name=v.slice(2);
  const q=mode==='inverse'?INV[name]:P[name];
  const pr=paramsFromPreset(name,q,mode);
  return pr?{params:pr,binding:q&&q.mcFloor!=null?q.mcFloor:true,label:PRESET_NAMES[name]||name}:null;
}
function runScenarioDiff(){
  $("scmpStatus").textContent='computing…';
  const a=resolveScmpScenario('scmpA','scmpHashA'),b=resolveScmpScenario('scmpB','scmpHashB');
  if(!a||!b||!a.params||!b.params){$("scmpStatus").textContent='Could not resolve both scenarios';return;}
  const ma=scenarioMetrics(a.params,a.binding),mb=scenarioMetrics(b.params,b.binding);
  $("scmpHdrA").textContent=a.label;$("scmpHdrB").textContent=b.label;
  const rows=[
    ['HR @ m58',ma.hr,mb.hr,false],    ['Events @ m46 (model)',ma.e46,mb.e46,null],['Events @ m58 (model)',ma.e58,mb.e58,null],
    ['Events @ m63 (model; PR=78)',ma.e63,mb.e63,null],['P(win)',ma.pw*100,mb.pw*100,true],['BAT 3-yr OS %',ma.bat3,mb.bat3,true],
    ['GPS cure %',ma.gpsc,mb.gpsc,true],['BAT median mOS',ma.batMed,mb.batMed,true]
  ];
  $("scmpBody").innerHTML=rows.map(r=>{
    const fmt=v=>isNaN(v)?'—':(r[0].includes('%')||r[0]==='P(win)'?v.toFixed(0)+(r[0]==='P(win)'?'%':'%'):v.toFixed(2));
    const d=r[1]!=null&&r[2]!=null&&!isNaN(r[1])&&!isNaN(r[2])?r[2]-r[1]:NaN;
    let dcls='',ds='—';
    if(!isNaN(d)){const good=r[3]===null?null:(r[0]==='HR @ m58'?d<0:d>0);
      dcls=good===null?'':(good?'scmp-delta-pos':'scmp-delta-neg');
      ds=(d>0?'+':'')+(r[0]==='P(win)'?d.toFixed(0)+'pp':d.toFixed(2));}
    return '<tr><td>'+r[0]+'</td><td>'+fmt(r[1])+'</td><td>'+fmt(r[2])+'</td><td class="'+dcls+'">'+ds+'</td></tr>';
  }).join('');
  $("scmpStatus").textContent='done';
}
function updateEventSensitivity(){
  const m79=+$("ev79").value,m80=+$("ev80").value;
  $("vEv79").textContent='m'+m79+' ('+fmtCalMonth(m79)+')';$("vEv80").textContent='m'+m80+' ('+fmtCalMonth(m80)+')';
  if(m79<T3){$("evSensOut").innerHTML='<span style="color:var(--bad)">79th event must be at or after confirmed anchor m'+T3+' (78 events).</span>';return;}
  if(m80<=m79){$("evSensOut").innerHTML='<span style="color:var(--bad)">80th event month must be after 79th.</span>';return;}
  const p=readParams(),binding=$("mcFloor").checked,cutoff=Math.max(m80,+$("cutoff").value);
  const baseHr=hazardRatio(T2,p),basePw=fastPwin(p,binding,cutoff,2500);
  const pace79=m79-T3,pace80=m80-m79;
  const prDec='Company PR pace after 72 @ m58: ~12 deaths in 12 mo (<a href="https://www.globenewswire.com/news-release/2025/12/29/3210926/0/en/SELLAS-Life-Sciences-Provides-Update-on-Pivotal-Phase-3-REGAL-Trial-of-Galinpepimut-S-GPS-in-Acute-Myeloid-Leukemia-AML.html" target="_blank" rel="noopener">Dec 2025</a>); +6 in ~5 mo to 78 (<a href="https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html" target="_blank" rel="noopener">May 2026</a>) ≈ slower.';
  const slowFactor=pace80>pace79?1.05:0.98;
  const adj=Object.assign({},p,{gpsc:Math.min(0.75,p.gpsc*slowFactor),batc:Math.max(0,p.batc*(2-slowFactor))});
  const adjHr=hazardRatio(T2,adj),adjPw=fastPwin(adj,binding,cutoff,2000);
  const t80=T80(p),tPace=T80PrPace();
  const aAt80=analyzeLR(m80,p),thIA=analyzeLR(46,p).z;
  const pwAt80=binding?condPow(thIA,aAt80.z,80,p.zfut).cp:Phi(aAt80.z-ZFINAL);
  $("evSensOut").innerHTML='<b>Scenario (78 locked @ m'+T3+'):</b> 79th @ m'+m79+' ('+fmtCalMonth(m79)+', +'+pace79.toFixed(0)+' mo) · 80th @ m'+m80+' ('+fmtCalMonth(m80)+', +'+pace80.toFixed(0)+' mo after 79th)<br>'+
    prDec+'<br><b>Baseline</b> (anchored projection): HR '+baseHr.toFixed(2)+' · P(win) '+(100*basePw).toFixed(0)+'% · model 80th ~m'+t80.toFixed(0)+' ('+fmtCalMonth(t80)+') · PR pace m'+tPace.toFixed(1)+'<br>'+
    '<b>If 80th @ m'+m80+'</b> (80 events, anchored): readout HR '+aAt80.hr.toFixed(2)+' · P(win) '+(100*pwAt80).toFixed(0)+'% · vs baseline '+( (pwAt80-basePw)*100).toFixed(0)+'pp<br>'+
    '<b>Deceleration-adjusted curves</b> (±GPS cure / BAT tail heuristic): HR '+adjHr.toFixed(2)+' ('+(adjHr-baseHr>0?'+':'')+(adjHr-baseHr).toFixed(2)+') · P(win) '+(100*adjPw).toFixed(0)+'% · fit quality '+(consistent(adj)?'<span style="color:var(--good)">OK</span>':'<span style="color:var(--warn)">relaxed</span>');
}
function chartMonthFromEvent(cx,cy){
  if(!chartLayout)return null;
  const L=chartLayout.L,R=chartLayout.R,Tp=chartLayout.Tp,B=chartLayout.B,W=chartLayout.W,H=chartLayout.H,tmax=chartLayout.tmax;
  const rect=$("chart").getBoundingClientRect();
  const x=cx-rect.left,y=cy-rect.top;
  if(x<L||x>W-R||y<Tp||y>H-B)return null;
  const t=(x-L)/(W-L-R)*tmax;
  return Math.max(0,Math.min(tmax,t));
}
function showChartTip(t,p,pinned){
  const tip=$("chartTip"),pin=$("chartPinPanel");
  if(t==null){tip.classList.remove('show');if(!pinned)pin.classList.remove('show');return;}
  const sb=sBAT(t,p),sg=sGPS(t,p),sp=poolS(t,p);
  tip.innerHTML='<b>m'+t.toFixed(1)+'</b><br>BAT S(t)='+(100*sb).toFixed(1)+'%<br>GPS S(t)='+(100*sg).toFixed(1)+'%<br>Pooled S(t)='+(100*sp).toFixed(1)+'%';
  tip.classList.add('show');
  if(pinned){
    const med=medianOf(poolS,p);
    pin.innerHTML='<b>Pinned @ m'+t.toFixed(1)+'</b> · Pooled S='+(100*sp).toFixed(1)+'% · RMST to m'+t.toFixed(0)+': BAT '+rmst(sBAT,p,t).toFixed(1)+' mo, GPS '+rmst(sGPS,p,t).toFixed(1)+' mo, pooled '+rmst(poolS,p,t).toFixed(1)+' mo'+(med!=null?' · Pooled median OS ~'+med.toFixed(1)+' m':'');
    pin.classList.add('show');
  }
}
function positionChartTip(cx,cy){
  const wrap=$("chartWrap"),tip=$("chartTip"),r=wrap.getBoundingClientRect();
  tip.style.left=Math.min(Math.max(4,cx-r.left+12),r.width-200)+'px';
  tip.style.top=Math.min(Math.max(4,cy-r.top-8),r.height-100)+'px';
}
function initChartInteraction(){
  const cv=$("chart");if(!cv)return;
  cv.style.cursor='crosshair';
  cv.addEventListener('mousemove',e=>{
    if(chartPinMonth!=null)return;
    const t=chartMonthFromEvent(e.clientX,e.clientY);
    if(t==null||!chartParams){showChartTip(null);return;}
    showChartTip(t,chartParams,false);positionChartTip(e.clientX,e.clientY);
  });
  cv.addEventListener('mouseleave',()=>{if(chartPinMonth==null)showChartTip(null);});
  cv.addEventListener('click',e=>{
    const t=chartMonthFromEvent(e.clientX,e.clientY);
    if(t==null||!chartParams)return;
    chartPinMonth=t;showChartTip(t,chartParams,true);positionChartTip(e.clientX,e.clientY);
    $("chartTip").classList.add('pinned');
  });
  cv.addEventListener('touchend',e=>{
    e.preventDefault();
    const touch=e.changedTouches[0];
    const t=chartMonthFromEvent(touch.clientX,touch.clientY);
    if(t==null||!chartParams)return;
    chartPinMonth=chartPinMonth===t?null:t;
    if(chartPinMonth!=null){showChartTip(t,chartParams,true);positionChartTip(touch.clientX,touch.clientY);$("chartTip").classList.add('pinned');}
    else{showChartTip(null);$("chartTip").classList.remove('pinned');$("chartPinPanel").classList.remove('show');}
  },{passive:false});
}
function mcEnvelope(p,nDraws){
  nDraws=nDraws||400;const tmax=60,pts=[];const ctr=Object.assign({},p);
  for(let t=0;t<=tmax;t+=1)pts.push({t,bat:[],gps:[],pool:[]});
  for(let i=0;i<nDraws;i++){
    const q={osmode:"itt",batk:ctr.batk,fh:ctr.fh,stratF:ctr.stratF,zfut:ctr.zfut};
    for(const f of MCFIELDS) q[f]=clampf(f,ctr[f]+SD[f]*rn()*0.5);
    for(let j=0;j<pts.length;j++){const t=pts[j].t;pts[j].bat.push(sBAT(t,q));pts[j].gps.push(sGPS(t,q));pts[j].pool.push(poolS(t,q));}
  }
  function qtl(a,q){const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*s.length))];}
  return pts.map(pt=>({t:pt.t,bLo:qtl(pt.bat,.05),bHi:qtl(pt.bat,.95),gLo:qtl(pt.gps,.05),gHi:qtl(pt.gps,.95),pLo:qtl(pt.pool,.05),pHi:qtl(pt.pool,.95)}));
}
function getCSS(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function draw(p){
  chartParams=p;
  const cv=$("chart"),dpr=window.devicePixelRatio||1,W=920,H=430;
  cv.width=W*dpr;cv.height=H*dpr;cv.style.height=H+"px";
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const L=54,R=16,Tp=12,B=38,tmax=60;
  chartLayout={L,R,Tp,B,W,H,tmax};
  const X=t=>L+(W-L-R)*t/tmax,Y=s=>Tp+(H-Tp-B)*(1-s);
  ctx.strokeStyle="#eef0f3";ctx.fillStyle="#9aa1ac";ctx.font="11px sans-serif";ctx.lineWidth=1;
  for(let s=0;s<=1.0001;s+=0.25){ctx.beginPath();ctx.moveTo(L,Y(s));ctx.lineTo(W-R,Y(s));ctx.stroke();ctx.textAlign="right";ctx.fillText((s*100).toFixed(0)+"%",L-6,Y(s)+3);}
  for(let t=0;t<=tmax;t+=12){ctx.strokeStyle="#f3f4f6";ctx.beginPath();ctx.moveTo(X(t),Tp);ctx.lineTo(X(t),H-B);ctx.stroke();ctx.fillStyle="#9aa1ac";ctx.textAlign="center";ctx.fillText(t+"m",X(t),H-B+16);}
  ctx.textAlign="center";ctx.fillStyle="#6b7280";ctx.fillText("Months from randomization",(L+W-R)/2,H-4);
  ctx.save();ctx.translate(14,(Tp+H-B)/2);ctx.rotate(-Math.PI/2);ctx.fillText("Overall survival",0,0);ctx.restore();
  ctx.strokeStyle="#c9ccd2";ctx.setLineDash([5,4]);
  ctx.beginPath();ctx.moveTo(L,Y(0.5));ctx.lineTo(W-R,Y(0.5));ctx.stroke();
  ctx.beginPath();ctx.moveTo(X(36),Tp);ctx.lineTo(X(36),H-B);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle="#9aa1ac";ctx.textAlign="left";ctx.fillText("36 mo",X(36)+4,Tp+10);
  if(showUncertainty){
    const env=mcEnvelope(p,300);
    function fillBand(loFn,hiFn,color){ctx.fillStyle=color;ctx.beginPath();let started=false;
      for(let i=0;i<env.length;i++){const x=X(env[i].t),y=Y(hiFn(env[i]));if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}
      for(let i=env.length-1;i>=0;i--){ctx.lineTo(X(env[i].t),Y(loFn(env[i])));}
      ctx.closePath();ctx.fill();}
    fillBand(e=>e.gLo,e=>e.gHi,"rgba(47,111,237,.12)");
    fillBand(e=>e.bLo,e=>e.bHi,"rgba(214,69,69,.12)");
    fillBand(e=>e.pLo,e=>e.pHi,"rgba(138,143,153,.08)");
  }
  function curve(fn,color,w,dash){ctx.strokeStyle=color;ctx.lineWidth=w;ctx.setLineDash(dash||[]);ctx.beginPath();for(let t=0;t<=tmax;t+=0.5){const x=X(t),y=Y(fn(t,p));t===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();ctx.setLineDash([]);}
  curve(poolS,"rgba(138,143,153,.75)",2,[6,4]);
  curve(sBAT,getCSS('--bat'),2.6);
  curve(sGPS,getCSS('--gps'),2.6);
  ctx.font="12px sans-serif";ctx.textAlign="left";
  const lx=X(38),ly=Tp+8;
  ctx.fillStyle=getCSS('--gps');ctx.fillRect(lx,ly,14,3);ctx.fillStyle="#333";ctx.fillText("GPS"+(showUncertainty?" ±5–95%":""),lx+18,ly+4);
  ctx.fillStyle=getCSS('--bat');ctx.fillRect(lx,ly+16,14,3);ctx.fillStyle="#333";ctx.fillText("BAT"+(showUncertainty?" ±5–95%":""),lx+18,ly+20);
  ctx.fillStyle="rgba(138,143,153,.75)";ctx.fillRect(lx,ly+32,14,3);ctx.fillStyle="#333";ctx.fillText("Pooled",lx+18,ly+36);
}

// ---------- render ----------
function fmtM(x){return x===null?'<small>Not reached</small>':x.toFixed(1)+' <small>m</small>';}
function badge(el,ok,mid){el.textContent=ok?'OK':(mid?'close':'off');el.className='badge '+(ok?'b-good':(mid?'b-warn':'b-bad'));}

function hrMarkLeft(hr){return "calc("+Math.min(100,Math.max(0,hr/HRMAX*100))+"% - 1.5px)";}

function readParams(){return{bat:+$("bat").value,batc:+$("batc").value/100,batk:+$("batk").value,gpsc:+$("gpsc").value/100,gpsu:+$("gpsu").value,delay:+$("delay").value,xtx:+$("xtx").value/100,cens:+$("cens").value/100,osmode:"itt",mid:+$("mid").value,k:+$("k").value,fh:$("fhTest").checked,stratF:+$("stratF").value,zfut:+$("zfut").value};}

function update(){
  let p=readParams();
  let noSol=null;
  if(regalMode==="inverse"){
    $("vBatCap").textContent=$("batcap").value+"%";
    const ir=solveInverse(p);
    if(!applyInverseResult(ir)){noSol=ir.reason||"inverse solve failed";}
    else p=readParams();
  } else {
    const auto=$("autofit").checked;$("gpscWrap").classList.toggle("disabled",auto);
    if(auto){const r=autofitCure(p);if(r.sol===null)noSol=r.reason;else{p.gpsc=r.sol;$("gpsc").value=Math.round(r.sol*100);}}
  }
  $("vBat").textContent=p.bat.toFixed(1)+" m";$("vBatc").textContent=(p.batc*100).toFixed(0)+"%";
  $("vGpsc").textContent=(p.gpsc*100).toFixed(0)+"%";$("vGpsu").textContent=p.gpsu.toFixed(1)+" m";
  $("vDelay").textContent=p.delay.toFixed(1)+" m";$("vMid").textContent=p.mid+" m";$("vK").textContent=p.k.toFixed(2);
  $("vXtx").textContent=(p.xtx*100).toFixed(0)+"%";$("vCens").textContent=(p.cens*100).toFixed(0)+"%";
  $("vBatk").textContent=p.batk.toFixed(2);$("vStratF").textContent=p.stratF.toFixed(2);$("vZfut").textContent=p.zfut.toFixed(2);

  scheduleDraw(p);
  const bk=JSON.stringify(p)+regalMode;
  if(bk!==lastBandsKey){lastBandsKey=bk;renderBands(p);}

  if(noSol){
    $("oHRnum").textContent="—";$("oIAstatus").textContent="—";
    $("hrInterimMark").style.left="-99px";$("hrReadoutMark").style.left="-99px";
    $("oHRreadoutCtx").textContent="";$("oHRfootnote").textContent="";
    $("verdict").className="verdict v-none";
    $("verdict").textContent="NO SOLUTION: "+noSol+". (Same dead-end the DD hit with a 4-month delay — the assumed shape can't fit the data.)";
    ["oBatMed","oGpsMed","oBat3","oGps3","oRmst","o80","e1","e2","e3","e4","pm"].forEach(i=>$(i).textContent="—");$("oPower").textContent="";
    $("note").innerHTML=noteText();return;
  }

  const bm=medianOf(sBAT,p),gm=medianOf(sGPS,p),pmv=medianOf(poolS,p);
  $("oBatMed").innerHTML=fmtM(bm);$("oGpsMed").innerHTML=fmtM(gm);
  $("oBat3").innerHTML=(sBAT(36,p)*100).toFixed(0)+' <small>%</small>';
  $("oGps3").innerHTML=(sGPS(36,p)*100).toFixed(0)+' <small>%</small>';

  // RMST (48-mo horizon) + projected 80th event + significance/power check
  const dR=rmst(sGPS,p,48)-rmst(sBAT,p,48);
  $("oRmst").innerHTML=(dR>=0?'+':'')+dR.toFixed(1)+' <small>mo</small>';
  const cutoff=+$("cutoff").value; $("vCut").textContent=cutoff;
  const{t80,Tan,Dan}=t80Analysis(p,cutoff);
  $("o80").innerHTML=(t80<=84?('~m'+t80.toFixed(0)):'&gt;m84')+' <small>'+monthLabel(t80)+'</small> <span class="tag m" style="font-size:9px;vertical-align:1px">from 78@m63</span>';
  const aFin=analyzeLR(Tan,p), thIA=analyzeLR(46,p).z, th80=aFin.z;
  const binding=$("mcFloor").checked;
  const pStop=1-Phi(ZEFF-thIA);
  const pWin= binding? condPow(thIA,th80,Dan,p.zfut).cp : Phi(th80-ZFINAL);
  lastPointPwin=pWin;
  $("oPower").innerHTML="<b>Readout power check</b> (cutoff m"+cutoff+"): "+(t80<=cutoff?("reaches 80 events ~m"+t80.toFixed(0)):("<b style='color:var(--bad)'>80th not reached</b> — reads at m"+cutoff+", "+Dan.toFixed(0)+" events"))+" · readout HR "+aFin.hr.toFixed(2)+" · log-rank Z="+th80.toFixed(2)+" · interim Z="+thIA.toFixed(2)+" (would stop early "+(100*pStop).toFixed(0)+"% of the time) · <b style='color:"+(pWin>0.5?'var(--good)':'var(--bad)')+"'>P(significant win) = "+(100*pWin).toFixed(0)+"%</b> "+(binding?"<small>(given no early stop)</small>":"<small>(non-binding)</small>");
  if(chartPinMonth!=null)showChartTip(chartPinMonth,p,true);
  scheduleReadoutUpdate();

  const hr=hazardRatio(T2,p);
  const gs=hrGaugeState(p,cutoff);
  const hrFin=gs.hrForFinal;
  // interim IA row (@ m46) — red hatch only here
  const hrIA=gs.hrInterim;
  $("oIAstatus").innerHTML=isNaN(hrIA)
    ?"—"
    :("HR <b>"+hrIA.toFixed(2)+"</b> @ m46 — "+(gs.interimClearsFloor
      ?'<span class="ia-pass">cleared early-stop floor (≈0.55)</span> · consistent with IDMC continue'
      :'<span class="ia-warn">below early-stop floor (≈0.55)</span> · would have triggered efficacy stop'));
  $("hrInterim").style.left="0%";$("hrInterim").style.width=(IFLOOR/HRMAX*100)+"%";
  $("hrInterim").style.background="repeating-linear-gradient(45deg,rgba(214,69,69,.28),rgba(214,69,69,.28) 4px,rgba(214,69,69,.1) 4px,rgba(214,69,69,.1) 8px)";
  $("hrInterimMark").style.left=isNaN(hrIA)?"-99px":hrMarkLeft(hrIA);
  // final readout row — 0.636 threshold only, no red hatch
  $("oHRreadoutCtx").textContent="@ m"+gs.Tan.toFixed(0)+" (~"+gs.Dan.toFixed(0)+" events)";
  $("oHRnum").innerHTML=isNaN(hrFin)
    ?"—"
    :("HR <b>"+hrFin.toFixed(2)+"</b> — "+(gs.finalClears
      ?'<span class="ia-pass">clears final 0.636</span>'
      :'<span class="ia-fail">misses final 0.636</span>'));
  $("hrThresh").style.left=(THRESH/HRMAX*100)+"%";
  $("hrReadoutMark").style.left=isNaN(hrFin)?"-99px":hrMarkLeft(hrFin);
  const foot=$("oHRfootnote");
  if(foot){
    let ft="Final win threshold 0.636 @ 80 events (Z=2.01; <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/\" target=\"_blank\" rel=\"noopener\">Jamy &amp; Cicic 2025</a>). <span class=\"tag m\">Model output</span>";
    if(!isNaN(gs.hrM58)&&!gs.readoutSameAsM58){
      ft+=" For context: HR @ m58 was <b>"+gs.hrM58.toFixed(2)+"</b> — effect can strengthen after the interim.";
    }
    foot.innerHTML=ft;
  }
  const gn=$("hrGaugeNote");
  if(gn){
    gn.style.display="block";
    gn.innerHTML="<b>Two different bars:</b> interim early-stop ≈0.55 (@ 60 events) vs final win 0.636 (@ 80 events). "
      +(binding
        ?"Monte Carlo below uses <b>binding</b> interim — weights scenarios by P(IDMC continues)."
        :"Monte Carlo below uses <b>non-binding</b> interim — IA is informational only.");
  }

  const ev1=eventsAt(T1,p),ev2=eventsAt(T2,p),ev3=eventsAt(T3,p),ev4=eventsAt(T4,p);
  $("e1").textContent=ev1.toFixed(1);$("e2").textContent=ev2.toFixed(1);
  $("e3").innerHTML=ev3.toFixed(1)+' <span class="tag m" style="font-size:9px">model</span> · confirmed <b>78</b>';
  $("e4").textContent=ev4.toFixed(1);
  const ok1=Math.abs(ev1-E1)<=4,mid1=Math.abs(ev1-E1)<=8;
  const ok2=Math.abs(ev2-E2)<=3,mid2=Math.abs(ev2-E2)<=7;
  const ok3=Math.abs(ev3-E3)<=3,mid3=Math.abs(ev3-E3)<=7;
  const ok4=ev4<80&&ev4>=77,mid4=ev4<80.5;
  badge($("b1"),ok1,mid1);badge($("b2"),ok2,mid2);badge($("b3"),ok3,mid3);badge($("b4"),ok4,mid4);
  const pmOK=pmv===null||pmv>13.5;$("pm").innerHTML=fmtM(pmv);badge($("bpm"),pmOK,false);
  $("fu36").textContent=(enrollCDF(T3-36,p.mid,p.k)*100).toFixed(0)+"%";

  const cons=ok1&&ok2&&ok3&&ok4&&pmOK; // verdict now requires ALL badges green (no loose loophole)
  const v=$("verdict");
  if(!cons){v.className="verdict v-none";v.textContent=regalMode==="inverse"?"Implied scenario does NOT match the full announced trajectory — adjust cure fraction or BAT cap.":"Does NOT match the full announced trajectory (60/72/78 events + still <80 today). Not a live possibility — check which badge is off. Common misses: over-flatlining under-shoots 78@m63; arms-too-close pushes past 80 before today.";}
  else if(hr<THRESH){v.className="verdict v-win";v.textContent=regalMode==="inverse"?"Anchor-constrained inversion: implied HR "+hr.toFixed(2)+" < 0.636 → derived mOS/tails consistent with a win, given your cure-fraction assumption. (Other cure fractions also fit — see inversion MC.)":"Consistent with all announced numbers AND HR "+hr.toFixed(2)+" < 0.636 → this world clears the threshold. (Other green worlds below also fit — that's the identification problem.)";}
  else{v.className="verdict v-lose";v.textContent=regalMode==="inverse"?"Anchor-constrained inversion: fits the event anchors but implied HR "+hr.toFixed(2)+" > 0.636 → derived parameters predict a miss. Try lower cure fraction or check BAT cap.":"Consistent with the announced numbers but HR "+hr.toFixed(2)+" > 0.636 → this world MISSES. Note what it took: check the BAT median / long-survivor sliders — failure needs near-unprecedented BAT.";}
  $("note").innerHTML=noteText();
}

function noteText(){
  return "Reading the strips: the <b>green lower strip</b> is the answer to ‘where does the timeline limit this input?’ — it's the set of values for this slider that still fit 60/72/78 events (<a href=\"https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html\" target=\"_blank\" rel=\"noopener\">60</a>, <a href=\"https://www.globenewswire.com/news-release/2025/12/29/3210926/0/en/SELLAS-Life-Sciences-Provides-Update-on-Pivotal-Phase-3-REGAL-Trial-of-Galinpepimut-S-GPS-in-Acute-Myeloid-Leukemia-AML.html\" target=\"_blank\" rel=\"noopener\">72</a>, <a href=\"https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html\" target=\"_blank\" rel=\"noopener\">78</a>), holding your other sliders fixed. Move one slider and watch the others' green windows shift: that coupling <em>is</em> the identification problem. The <b>blue upper strip</b> is the prior (1σ/2σ/3σ) from published data. "+
  "What the trajectory pins down: to yield only ~72–78 deaths of 126 by now, pooled survival runs well above historical CR2 (~8–11m, <a href=\"https://pubmed.ncbi.nlm.nih.gov/33661271/\" target=\"_blank\" rel=\"noopener\">Stahl 2021</a>). What it does NOT pin down: a no-effect world STILL fits if BOTH arms share a ~25–30% long-survivor tail (true median ~23m, 3-yr OS ~40%) — try the ‘No effect (fits too!)’ preset, HR=1.00 and green. That tail is high vs historical (~5–15% 3-yr OS, <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC3011608/\" target=\"_blank\" rel=\"noopener\">Kurosawa 2010</a>) but not impossible for a fit trial population, so efficacy is *more likely than not* — not established. The data span runs from HR 1.0 (no effect) to 0.15 (big effect); the arm split is unidentifiable (drag BAT with auto-fit on, watch HR swing). "+
  "Transplant &amp; censoring: eligibility is judged only at entry (<a href=\"https://clinicaltrials.gov/study/NCT04229979\" target=\"_blank\" rel=\"noopener\">NCT04229979</a>), so patients can be transplanted afterward. ‘Transplant after enrollment’ (ITT mode) adds a ~45%-cure tail to BOTH arms (<a href=\"https://pubmed.ncbi.nlm.nih.gov/?term=Forman+Rowe+myth+second+remission+acute+leukemia+adult\" target=\"_blank\" rel=\"noopener\">Forman &amp; Rowe 2013</a>) — it lifts BAT's 3-yr OS and pulls the HR toward 1.0. ‘Censoring/dropout’ lowers observed events, so true survival is worse than the raw counts imply (~15% in Ph2 GPS, <a href=\"https://www.onclive.com/view/maintenance-galinpepimut-s-appears-effective-and-safe-in-aml-in-second-cr\" target=\"_blank\" rel=\"noopener\">Brayer/OncLive</a>). "+
  "Red hatched zones = biologically IMPLAUSIBLE BAT profiles: median &gt;15m (above QUAZAR's CR1 placebo of 14.8m, <a href=\"https://www.nejm.org/doi/full/10.1056/NEJMoa2001094\" target=\"_blank\" rel=\"noopener\">QUAZAR NEJM</a>) or chemo-only tail &gt;18% (vs ~5–15% historical, <a href=\"https://pmc.ncbi.nlm.nih.gov/articles/PMC3011608/\" target=\"_blank\" rel=\"noopener\">Kurosawa</a>). Implausible, not impossible — transplant crossover can legitimately create a BAT tail. "+
  "Caveats: HR is an approximate log-rank/Pike estimate, not the stratified Cox; 3-yr OS is <span class=\"tag m\">model output</span> but only ~40% of patients have 36-mo follow-up; transplant-censoring's HR effect and differential dropout are not fully modeled.";
}

// ---------- Monte Carlo (posterior over final HR) ----------
function rn(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
const SD={};CFG.forEach(c=>SD[c.field]=(c.sig.b1[1]-c.sig.b1[0])/2*c.sc);
function clampf(f,v){const c=CFG.find(x=>x.field===f);return Math.max(c.min*c.sc,Math.min(c.max*c.sc,v));}
const MCFIELDS=["bat","batc","gpsc","gpsu","delay","xtx","cens","mid","k"];
function runMC(){
  if(regalMode==="inverse"){runMCInverse();return;}
  const ctr=readParams(),binding=$("mcFloor").checked,cutoff=+$("cutoff").value,acc=[];let tried=0;const MAX=220000,t0=performance.now();
  for(let i=0;i<MAX;i++){ if(performance.now()-t0>3600)break; tried++;
    const p={osmode:"itt",batk:ctr.batk,fh:ctr.fh,stratF:ctr.stratF,zfut:ctr.zfut}; // method/structure assumptions fixed from controls
    for(const f of MCFIELDS) p[f]=clampf(f,ctr[f]+SD[f]*rn());
    const e58=eventsAt(58,p,80); if(Math.abs(e58-72)>15)continue;   // loose cull; Poisson likelihood does the real work
    const e46=eventsAt(46,p,80), e63=eventsAt(63,p,80), e65=eventsAt(65,p,80);
    const pm=medianOf(poolS,p); if(pm!==null&&pm<13)continue;
    // likelihood of observed increments: 60 by m46, +12 to m58, +6 to m63, still <80 (≤1 more) by m65
    const l1=e46,l2=Math.max(0,e58-e46),l3=Math.max(0,e63-e58),l4=Math.max(0,e65-e63);
    const logL=lpois(60,l1)+lpois(12,l2)+lpois(6,l3)+Math.log(Math.max(1e-12,poisLE(1,l4)));
    const Lev=Math.exp(logL); if(Lev<1e-11)continue;
    const thIA=analyzeLR(46,p).z;                                   // proper interim log-rank z (~60 events @ m46)
    const{t80,Tan,Dan}=t80Analysis(p,cutoff,80);
    const aFin=analyzeLR(Tan,p); if(isNaN(aFin.hr))continue; const th80=aFin.z;
    let w,pw;
    if(binding){ const r=condPow(thIA,th80,Dan,p.zfut); w=Lev*r.Pc; pw=r.cp; }   // weight by P(continue); win = conditional power (banks early wins, power-neutral)
    else { w=Lev*Phi(thIA-p.zfut); pw=Phi(th80-ZFINAL); }                        // non-binding: futility-pass weight; marginal significance
    acc.push({hr:aFin.hr, w:w, pw:pw, reached:t80<=cutoff});
  }
  renderMC(acc,tried);
}
function runMCInverse(){
  const ctr=readParams(),binding=$("mcFloor").checked,cutoff=+$("cutoff").value,acc=[];let tried=0;const MAX=80000,t0=performance.now();
  const sdG=SD.gpsc||0.08,sdCap=1.5,baseCap=+$("batcap").value;
  for(let i=0;i<MAX;i++){if(performance.now()-t0>4000)break;tried++;
    const cap=Math.round(Math.max(12,Math.min(22,baseCap+sdCap*rn())));
    const p={osmode:"itt",batk:ctr.batk,fh:ctr.fh,stratF:ctr.stratF,zfut:ctr.zfut,delay:ctr.delay,xtx:ctr.xtx,cens:ctr.cens,mid:ctr.mid,k:ctr.k,
      gpsc:Math.max(0.05,Math.min(0.75,ctr.gpsc+sdG*rn())),bat:8};
    const ir=solveInverse(p,cap);
    if(!ir.sol||ir.err>25)continue;
    const s=ir.sol;
    const{t80,Tan,Dan}=t80Analysis(s,cutoff,80);
    const aFin=analyzeLR(Tan,s);if(isNaN(aFin.hr))continue;
    const thIA=analyzeLR(46,s).z,th80=aFin.z;
    let pw;
    if(binding){const r=condPow(thIA,th80,Dan,ctr.zfut);pw=r.cp*Math.exp(-ir.err*0.05);}else{pw=Phi(th80-ZFINAL);}
    acc.push({hr:aFin.hr,w:Math.exp(-ir.err*0.08),pw:pw,reached:t80<=cutoff,gpsu:s.gpsu,bat:s.bat});
  }
  renderMC(acc,tried);
  if(acc.length>=80){
    const gpsu=acc.map(x=>x.gpsu).sort((a,b)=>a-b);
    const qf=(a,q)=>a[Math.min(a.length-1,Math.floor(q*a.length))];
    $("mcStats").innerHTML+=' &nbsp;·&nbsp; implied GPS uncured mOS median '+qf(gpsu,0.5).toFixed(1)+'m ['+qf(gpsu,0.05).toFixed(1)+', '+qf(gpsu,0.95).toFixed(1)+']';
  }
}
function renderMC(acc,tried){
  acc.sort((a,b)=>a.hr-b.hr);const n=acc.length;
  if(n<80){$("mcStatus").textContent=n+" usable draws — widen priors or loosen the floor";$("mcStats").textContent="";$("mcHist").innerHTML="";return;}
  let W=0,W2=0,WP=0,W35=0,Wreach=0;
  for(const x of acc){W+=x.w;W2+=x.w*x.w;WP+=x.w*x.pw;if(x.hr<0.35)W35+=x.w;if(x.reached)Wreach+=x.w;}
  const ESS=W*W/W2, win=WP/W;
  function wq(q){let c=0;const t=q*W;for(let i=0;i<n;i++){c+=acc[i].w;if(c>=t)return acc[i].hr;}return acc[n-1].hr;}
  const med=wq(0.5),lo=wq(0.05),hi=wq(0.95);
  lastMcPwin=win;
  $("mcStatus").textContent=tried.toLocaleString()+" draws · effective N ≈ "+Math.round(ESS).toLocaleString()+" · "+(100*Wreach/W).toFixed(0)+"% reach 80th event by cutoff";
  $("mcStats").innerHTML="P(win — significant log-rank) = <span style='color:"+(win>0.5?"var(--good)":"var(--bad)")+"'>"+(100*win).toFixed(0)+"%</span> &nbsp;·&nbsp; median HR "+med.toFixed(2)+" &nbsp;·&nbsp; 90% CrI ["+lo.toFixed(2)+", "+hi.toFixed(2)+"] &nbsp;·&nbsp; P(HR&lt;0.35)="+(100*W35/W).toFixed(1)+"% &nbsp;<span style='color:var(--muted);font-weight:400'>(likelihood-weighted; NPH-aware significance)</span>";
  const bins=[];for(let b=0.30;b<1.05-1e-9;b+=0.05){let c=0;for(const x of acc)if(x.hr>=b&&x.hr<b+0.05)c+=x.w;bins.push([b,100*c/W]);}
  const maxp=Math.max.apply(null,bins.map(x=>x[1]).concat([1]));
  let h='<div class="mc-hist-wrap"><div class="mc-hist-bars">';
  bins.forEach(function(bp){const b=bp[0],pc=bp[1],col=(b+0.025)<THRESH?"var(--good)":"var(--bad)";
    h+='<div title="HR '+b.toFixed(2)+'–'+(b+0.05).toFixed(2)+': '+pc.toFixed(1)+'%" style="flex:1;height:'+(pc/maxp*100).toFixed(1)+'%;background:'+col+';border-radius:2px 2px 0 0;min-height:'+(pc>0?2:0)+'px"></div>';});
  h+='</div><div class="mc-hist-markers">';
  h+='<div class="mc-hist-marker lo" style="left:'+(lo-0.30)/0.75*100+'%" title="5th pct"></div>';
  h+='<div class="mc-hist-marker med" style="left:'+(med-0.30)/0.75*100+'%" title="median"></div>';
  h+='<div class="mc-hist-marker hi" style="left:'+(hi-0.30)/0.75*100+'%" title="95th pct"></div>';
  h+='</div></div><div class="mc-hist-axis">';
  bins.forEach(function(bp){h+='<div>'+((Math.round(bp[0]*100))%10===0?bp[0].toFixed(1):"")+'</div>';});
  h+='</div><div class="mc-hist-caption">Green = HR below the 0.636 win threshold · red = miss. X-axis = final HR at 80 deaths. Bar height = % of fitting draws. <b>Markers:</b> 5th '+lo.toFixed(2)+' · median '+med.toFixed(2)+' · 95th '+hi.toFixed(2)+'</div>';
  $("mcHist").innerHTML=h;
}

// ---------- presets (every slider set) ----------
const P={
 best:    {bat:9.5,batc:14,gpsc:22,gpsu:31.5,delay:2,mid:25,k:0.15,auto:false,xtx:6,cens:12,mcFloor:true},
 bind:    {bat:9.5,batc:14,gpsc:22,gpsu:31.5,delay:2,mid:25,k:0.15,auto:false,xtx:6,cens:12,mcFloor:true},
 nonbind: {bat:9.5,batc:14,gpsc:22,gpsu:31.5,delay:2,mid:25,k:0.15,auto:false,xtx:6,cens:12,mcFloor:false},
 critique:{bat:9,  batc:16,gpsc:18,gpsu:33,delay:2,  mid:25,k:0.15,auto:false,xtx:6,cens:12,mcFloor:true},
 bull:    {bat:8,  batc:6, gpsc:40,gpsu:36,delay:0,  mid:25,k:0.15,auto:false,xtx:0,cens:0, mcFloor:false},
 bear:    {bat:11, batc:22,gpsc:5, gpsu:36,delay:2,  mid:25,k:0.15,auto:false,xtx:8,cens:10,mcFloor:true},
 cw:      {bat:9,  batc:6, gpsc:41,gpsu:35.5,delay:0,  mid:25,k:0.15,auto:false,xtx:0,cens:0, mcFloor:false},
 noeffect:{bat:14,batc:28,gpsc:28,gpsu:14,delay:0,  mid:25,k:0.15,auto:false,xtx:0,cens:0, mcFloor:true},
 fail:    {bat:10,batc:28,gpsc:28,gpsu:18,delay:0,  mid:25,k:0.15,auto:false,xtx:0,cens:0, mcFloor:true},
 delay:   {bat:10,batc:14,gpsc:40,gpsu:40,delay:4,  mid:25,k:0.15,auto:false,xtx:0,cens:0, mcFloor:true},
 backload:{bat:7,  batc:10,gpsc:26,gpsu:40,delay:0,  mid:30,k:0.22,auto:false,xtx:0,cens:0, mcFloor:true}
};
const INV={
 cw42:   {gpsc:42,batcap:17,delay:0,xtx:0,cens:0,mid:25,k:0.15,mcFloor:false},
 cw35:   {gpsc:35,batcap:17,delay:0,xtx:0,cens:0,mid:25,k:0.15,mcFloor:false},
 cw50:   {gpsc:50,batcap:18,delay:0,xtx:0,cens:0,mid:25,k:0.15,mcFloor:false},
 cwbind: {gpsc:42,batcap:17,delay:0,xtx:0,cens:0,mid:25,k:0.15,mcFloor:true}
};
function applyRegalPreset(name,q){
  q=q||P[name];activeRegalPreset=name;
  $("bat").value=q.bat;$("batc").value=q.batc;$("gpsc").value=q.gpsc;$("gpsu").value=q.gpsu;
  $("delay").value=q.delay;$("mid").value=q.mid;$("k").value=q.k;$("autofit").checked=!!q.auto;
  $("xtx").value=(q.xtx!=null)?q.xtx:0;$("cens").value=(q.cens!=null)?q.cens:0;
  if(q.mcFloor!=null)$("mcFloor").checked=!!q.mcFloor;
  if(regalMode==="inverse")setRegalMode("forward");
  else{refreshRegalPresetHighlight();update();}
}
function applyInversePreset(name,q){
  q=q||INV[name];activeInvPreset=name;
  $("gpsc").value=q.gpsc;$("batcap").value=q.batcap;
  $("delay").value=q.delay;$("mid").value=q.mid;$("k").value=q.k;
  $("xtx").value=q.xtx!=null?q.xtx:0;$("cens").value=q.cens!=null?q.cens:0;
  if(q.mcFloor!=null)$("mcFloor").checked=!!q.mcFloor;
  setRegalMode("inverse");
}
document.querySelectorAll("button[data-preset]").forEach(b=>b.onclick=()=>applyRegalPreset(b.dataset.preset));
document.querySelectorAll("button[data-inv]").forEach(b=>b.onclick=()=>applyInversePreset(b.dataset.inv));

["bat","batc","gpsc","gpsu","delay","xtx","cens","mid","k","cutoff","batk","stratF","zfut","fhTest","autofit","batcap"].forEach(id=>{const el=$(id);if(el)el.addEventListener("input",scheduleUpdate)});
$("mcRun").addEventListener("click",function(){
  $("mcRun").disabled=true;$("mcStatus").textContent="running…";
  deferWithLoading(function(){try{runMC();}finally{$("mcRun").disabled=false;}},"Running Monte Carlo…");
});
$("mcNeutral").addEventListener("click",function(){applyRegalPreset("best");$("mcStatus").textContent="Best Available Guess priors set — click Run";});

// ================= SHAREABLE URL STATE (#1) =================
function b64urlEncode(str){return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function b64urlDecode(str){str=str.replace(/-/g,"+").replace(/_/g,"/");while(str.length%4)str+="=";return decodeURIComponent(escape(atob(str)));}
function captureState(){
  return{v:1,tab:activeTab,regalMode,activeRegalPreset,activeInvPreset,activeSlsPreset,activeValPreset,
    gps:{bat:+$("bat").value,batc:+$("batc").value,batk:+$("batk").value,gpsc:+$("gpsc").value,gpsu:+$("gpsu").value,delay:+$("delay").value,xtx:+$("xtx").value,cens:+$("cens").value,mid:+$("mid").value,k:+$("k").value,batcap:+$("batcap").value,autofit:$("autofit").checked,fhTest:$("fhTest").checked,stratF:+$("stratF").value,zfut:+$("zfut").value,mcFloor:$("mcFloor").checked,cutoff:+$("cutoff").value},
    sls:{sls_os:+$("sls_os").value,sls_bench:+$("sls_bench").value,sls_orr:+$("sls_orr").value,fl_base:+$("fl_base").value,fl_sls:+$("fl_sls").value,tp_base:+$("tp_base").value,tp_sls:+$("tp_sls").value,sls_flev:+$("sls_flev").value},
    val:{v_cr2:+$("v_cr2").value,v_cr1:+$("v_cr1").value,v_gpen:+$("v_gpen").value,v_gprice:+$("v_gprice").value,v_gyears:+$("v_gyears").value,v_flpool:+$("v_flpool").value,v_rrpool:+$("v_rrpool").value,v_spen:+$("v_spen").value,v_sprice:+$("v_sprice").value,v_syears:+$("v_syears").value,v_platform:+$("v_platform").value,v_mult:+$("v_mult").value,v_shares:+$("v_shares").value,v_riskadj:$("v_riskadj").checked,v_pgps:+$("v_pgps").value,v_psls:+$("v_psls").value},
    ui:{showUncertainty,irm_lead:+$("irm_lead").value,bf_e58:+$("bf_e58").value,bf_cure:+$("bf_cure").value,explainLvl:curLvl}};
}
function encodeStateToHash(){return "#s="+b64urlEncode(JSON.stringify(captureState()));}
function applyState(s){
  if(!s||s.v!==1)return false;restoringState=true;
  if(s.gps){const g=s.gps;for(const k of ["bat","batc","batk","gpsc","gpsu","delay","xtx","cens","mid","k","batcap","stratF","zfut","cutoff"])if(g[k]!=null&&$(k))$(k).value=g[k];if(g.autofit!=null)$("autofit").checked=g.autofit;if(g.fhTest!=null)$("fhTest").checked=g.fhTest;if(g.mcFloor!=null)$("mcFloor").checked=g.mcFloor;}
  if(s.sls){for(const k in s.sls)if($(k))$(k).value=s.sls[k];}
  if(s.val){for(const k in s.val){if(k==="v_riskadj"&&$("v_riskadj"))$("v_riskadj").checked=!!s.val[k];else if($(k))$(k).value=s.val[k];}}
  if(s.ui){if(s.ui.showUncertainty!=null){showUncertainty=s.ui.showUncertainty;$("showUncertainty").checked=showUncertainty;}if(s.ui.irm_lead!=null)$("irm_lead").value=s.ui.irm_lead;if(s.ui.bf_e58!=null)$("bf_e58").value=s.ui.bf_e58;if(s.ui.bf_cure!=null)$("bf_cure").value=s.ui.bf_cure;if(s.ui.explainLvl)curLvl=s.ui.explainLvl;}
  activeRegalPreset=s.activeRegalPreset||activeRegalPreset;activeInvPreset=s.activeInvPreset||activeInvPreset;
  activeSlsPreset=s.activeSlsPreset||activeSlsPreset;activeValPreset=s.activeValPreset||activeValPreset;
  if(s.regalMode)setRegalMode(s.regalMode);
  refreshRegalPresetHighlight();highlightPresets("button[data-sls]","sls",activeSlsPreset);highlightPresets("button[data-val]","val",activeValPreset);
  tabsRendered.gps=true;
  updateNow();
  if(s.tab)switchTab(s.tab);
  else if(s.ui&&s.ui.explainLvl){curLvl=s.ui.explainLvl;renderTab("explain",true);}
  restoringState=false;return true;
}
function restoreFromHash(){const h=location.hash;if(!h.startsWith("#s="))return false;try{return applyState(JSON.parse(b64urlDecode(h.slice(3))));}catch(e){console.warn("Could not restore state from URL",e);showToast("Share link hash invalid — using defaults");history.replaceState(null,"",location.pathname+location.search);return false;}}
function showToast(msg){let t=document.querySelector(".toast");if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t);}t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200);}
function updateHashQuiet(){if(restoringState)return;const nh=encodeStateToHash();if(location.hash!==nh)history.replaceState(null,"",location.pathname+location.search+nh);}
$("btnShare").onclick=()=>{const url=location.origin+location.pathname+encodeStateToHash();navigator.clipboard.writeText(url).then(()=>showToast("Link copied — fully client-side, no server storage")).catch(()=>{prompt("Copy this link:",url);});updateHashQuiet();};
$("btnPrint").onclick=()=>{updatePrintSummary();window.print();};
$("showUncertainty").onchange=function(){showUncertainty=this.checked;deferWithLoading(updateNow,"Computing uncertainty bands…");};

// ================= FAST P(WIN) APPROX =================
function poisLogLThrough(p,throughMonth){
  const e46v=eventsAt(46,p,100),e58v=eventsAt(58,p,100),e63v=eventsAt(63,p,100),e65v=eventsAt(65,p,100);
  let ll=0;
  if(throughMonth>=46)ll+=lpois(60,e46v);
  if(throughMonth>=58)ll+=lpois(12,Math.max(0,e58v-e46v));
  if(throughMonth>=63)ll+=lpois(6,Math.max(0,e63v-e58v));
  if(throughMonth>=65)ll+=Math.log(Math.max(1e-12,poisLE(1,Math.max(0,e65v-e63v))));
  return ll;
}
function fastPwin(p,binding,cutoff,nDraws,dataThrough){
  nDraws=nDraws||3000;const ctr=Object.assign({},p);const thru=dataThrough!=null?dataThrough:65;let W=0,WP=0;
  for(let i=0;i<nDraws;i++){const q={osmode:"itt",batk:ctr.batk,fh:ctr.fh,stratF:ctr.stratF,zfut:ctr.zfut};
    for(const f of MCFIELDS) q[f]=clampf(f,ctr[f]+SD[f]*rn());
    if(thru>=58){const e58=eventsAt(58,q,80);if(Math.abs(e58-72)>15)continue;}
    const Lev=Math.exp(poisLogLThrough(q,thru));
    if(Lev<1e-11)continue;
    const thIA=analyzeLR(46,q).z;const{t80,Tan,Dan}=t80Analysis(q,cutoff,80);
    const aFin=analyzeLR(Tan,q);if(isNaN(aFin.hr))continue;
    let w,pw;if(binding){const r=condPow(thIA,aFin.z,Dan,q.zfut);w=Lev*r.Pc;pw=r.cp;}else{w=Lev*Phi(thIA-q.zfut);pw=Phi(aFin.z-ZFINAL);}
    W+=w;WP+=w*pw;}
  return W>0?WP/W:NaN;
}
function paramsFromPreset(name,q,mode){
  const base={osmode:"itt",batk:1,fh:false,stratF:STRATF,zfut:ZFUT};
  q=q||(mode==="inverse"?INV[name]:P[name]);if(!q)return null;
  if(mode==="inverse"){const ir=solveInverse(Object.assign({},base,{gpsc:q.gpsc/100,delay:q.delay||0,xtx:(q.xtx||0)/100,cens:(q.cens||0)/100,mid:q.mid||25,k:q.k||0.15,bat:8}),q.batcap||17);return ir.sol?Object.assign({},ir.sol,{batk:1,fh:false,stratF:STRATF,zfut:ZFUT}):null;}
  return Object.assign({},base,{bat:q.bat,batc:q.batc/100,gpsc:q.gpsc/100,gpsu:q.gpsu,delay:q.delay,xtx:(q.xtx||0)/100,cens:(q.cens||0)/100,mid:q.mid||25,k:q.k||0.15});
}

// ================= TORNADO (#2) =================
function runTornado(){
  $("tornadoStatus").textContent="computing…";$("tornadoRun").disabled=true;
  deferWithLoading(function(){
    const base=readParams(),binding=$("mcFloor").checked,cutoff=+$("cutoff").value;
    const basePw=fastPwin(base,binding,cutoff,5000);
    const baseHr=hazardRatio(T2,base);
    const specs=[
      {lbl:"GPS cure",field:"gpsc",pct:0.20,good:"up"},
      {lbl:"BAT tail",field:"batc",pct:0.20,good:"down"},
      {lbl:"BAT median",field:"bat",pct:0.20,good:"up"},
      {lbl:"GPS uncured",field:"gpsu",pct:0.20,good:"up"},
      {lbl:"Censoring",field:"cens",pct:0.20,good:"down"},
      {lbl:"Binding IA",field:"_bind",toggle:true}
    ];
    const results=[];
    for(const sp of specs){
      if(sp.toggle){
        const pwLo=fastPwin(base,false,cutoff,3000),pwHi=fastPwin(base,true,cutoff,3000);
        results.push({lbl:sp.lbl,lo:pwLo-basePw,hi:pwHi-basePw});
      }else{
        const c=CFG.find(x=>x.field===sp.field),ctr=base[sp.field];
        const dLo=ctr*(1-sp.pct),dHi=ctr*(1+sp.pct);
        const pLo=Object.assign({},base,{[sp.field]:Math.max(c.min*c.sc,dLo)});
        const pHi=Object.assign({},base,{[sp.field]:Math.min(c.max*c.sc,dHi)});
        const pwLo=fastPwin(pLo,binding,cutoff,3000),pwHi=fastPwin(pHi,binding,cutoff,3000);
        results.push({lbl:sp.lbl,lo:pwLo-basePw,hi:pwHi-basePw});
      }
    }
    results.sort((a,b)=>Math.max(Math.abs(a.lo),Math.abs(a.hi))-Math.max(Math.abs(b.lo),Math.abs(b.hi))).reverse();
    const maxD=Math.max(0.01,...results.flatMap(r=>[Math.abs(r.lo),Math.abs(r.hi)]));
    let h='<div style="font-size:12px;margin-bottom:6px">Baseline P(win)='+(100*basePw).toFixed(0)+'%, HR='+baseHr.toFixed(2)+'</div>';
    results.forEach(r=>{
      const loW=Math.abs(r.lo)/maxD*45,hiW=Math.abs(r.hi)/maxD*45;
      h+='<div class="tornado-row"><div class="tornado-lbl">'+r.lbl+'</div><div class="tornado-bar">';
      if(r.lo<0)h+='<div class="neg" style="width:'+loW+'%"></div>';
      if(r.hi>0)h+='<div class="pos" style="width:'+hiW+'%"></div>';
      h+='</div><div class="tornado-val">'+(r.lo*100).toFixed(0)+' / +'+(r.hi*100).toFixed(0)+'pp</div></div>';
    });
    $("tornadoChart").innerHTML=h;$("tornadoStatus").textContent="done";$("tornadoRun").disabled=false;
  },"Computing tornado…");
}
$("tornadoRun").onclick=runTornado;

// ================= BAYES FACTOR (#3) =================
function nullStrawman(){return{bat:8,batc:0,batk:1,gpsc:0,gpsu:8,delay:0,xtx:0,cens:0,osmode:"itt",mid:25,k:0.15,fh:false,stratF:STRATF,zfut:ZFUT};}
function nullHetero(){return{bat:10,batc:0.18,batk:0.85,gpsc:0.05,gpsu:14,delay:0,xtx:0,cens:0,osmode:"itt",mid:25,k:0.15,fh:false,stratF:STRATF,zfut:ZFUT};}
function altHyp(curePct){return{bat:10,batc:0.14,batk:1,gpsc:curePct/100,gpsu:32,delay:1.5,xtx:0.06,cens:0.12,osmode:"itt",mid:25,k:0.15,fh:false,stratF:STRATF,zfut:ZFUT};}
function poisLogL(p,e46,e58,e63){
  const e58v=eventsAt(58,p,100),e46v=eventsAt(46,p,100),e63v=eventsAt(63,p,100);
  const l2=Math.max(0,e58v-e46v),l3=Math.max(0,e63v-e58v);
  return lpois(e46,e46v)+lpois(e58-e46,l2)+lpois(e63-e58,l3);
}
function updateBayes(){
  const e58=+$("bf_e58").value,cure=+$("bf_cure").value;
  $("bfE58").textContent=e58;$("bfCure").textContent=cure+"%";
  const alt=altHyp(cure),ns=nullStrawman(),nh=nullHetero();
  const e46=60,e63=78;
  const lAlt=poisLogL(alt,e46,e58,e63),lStraw=poisLogL(ns,e46,e58,e63),lHet=poisLogL(nh,e46,e58,e63);
  const bfStraw=Math.exp(lAlt-lStraw),bfHet=Math.exp(lAlt-lHet);
  const bfMarg=Math.exp(lAlt-Math.log(Math.exp(lStraw)+Math.exp(lHet)));
  $("bfResult").innerHTML="BF (alt vs strawman null): <b>"+bfStraw.toFixed(1)+"×</b> — CW's ~62× claim uses this comparison<br>"+
    "BF (alt vs heterogeneous BAT null): <b>"+bfHet.toFixed(2)+"×</b> — collapses toward 1 under realistic competing null<br>"+
    "Marginal BF (alt vs both nulls): <b>"+bfMarg.toFixed(2)+"×</b><br>"+
    '<span style="font-weight:400;font-size:12px;color:var(--muted)">Approximate Poisson likelihood ratio on pooled event increments — not a full Bayesian model. Sources: <a href="https://www.reddit.com/r/ValueInvesting/comments/1ri8rrb/sls_deepest_due_diligence_for_regal_trial_from_a/" target="_blank">CW Part 1</a> · <a href="https://www.reddit.com/r/pennystocks/comments/1h8v0zv/critique_of_confident_webs_sls_dd/" target="_blank">uhdisj41 critique</a></span>';
}
["bf_e58","bf_cure"].forEach(id=>$(id).addEventListener("input",updateBayes));

// ================= INTERACTIVE IRM (#4) =================
const CW_REF={irm:12.61,hr:0.37,bat3:19.6,batAlive:11.3,gpsAlive:34.7,pool:18.7};
function armAlive(T,p,fn){let a=0;for(let i=0;i<180;i++){const e0=LMAX*i/180,e1=LMAX*(i+1)/180,em=(e0+e1)/2,w=enrollCDF(e1,p.mid,p.k)-enrollCDF(e0,p.mid,p.k);if(em>=T)continue;a+=N_ARM*w*fn(T-em,p);}return a*(1-p.cens*0.5);}
function renderIRM(){
  const lead=+$("irm_lead").value;$("irmLead").textContent=lead.toFixed(1)+" m";
  const p=readParams();const irmBat=medianOf(sBAT,p),irmGps=medianOf(sGPS,p),irmPool=medianOf(poolS,p);
  const hr=hazardRatio(T2,p),bat3=sBAT(36,p)*100;
  const batA=armAlive(63,p,sBAT),gpsA=armAlive(63,p,sGPS);
  const trueBat=irmBat!=null?Math.max(1,irmBat-lead):null;
  const rows=[
    ["BAT IRM (from rand)",irmBat!=null?irmBat.toFixed(1)+" m":"—",'10 mo (<a href="https://www.reddit.com/r/ValueInvesting/comments/1ri8rrb/sls_deepest_due_diligence_for_regal_trial_from_a/" target="_blank" rel="noopener">CW anchor</a>)',irmBat!=null?(irmBat-10).toFixed(1)+" m":""],
    ["TRUE CR2-onset BAT mOS",trueBat!=null?trueBat.toFixed(1)+" m":"—",'~8–11 mo (<a href="https://pubmed.ncbi.nlm.nih.gov/33661271/" target="_blank" rel="noopener">Stahl 2021</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3011608/" target="_blank" rel="noopener">Kurosawa 2010</a>)',""],
    ["Pooled IRM",irmPool!=null?irmPool.toFixed(1)+" m":"—",CW_REF.pool+" mo",irmPool!=null?(irmPool-CW_REF.pool).toFixed(1)+" m":""],
    ["HR @ m58",isNaN(hr)?"—":hr.toFixed(2),CW_REF.hr.toFixed(2),isNaN(hr)?"":(hr-CW_REF.hr).toFixed(2)],
    ["BAT 3-yr OS",bat3.toFixed(0)+"%",CW_REF.bat3+"%",(bat3-CW_REF.bat3).toFixed(0)+"pp"],
    ["BAT alive @ m63",batA.toFixed(1),CW_REF.batAlive,(batA-CW_REF.batAlive).toFixed(1)],
    ["GPS alive @ m63",gpsA.toFixed(1),CW_REF.gpsAlive,(gpsA-CW_REF.gpsAlive).toFixed(1)]
  ];
  $("irmBody").innerHTML=rows.map(r=>{const d=r[3];const cls=d&&parseFloat(d)>0?"pos":(d&&parseFloat(d)<0?"neg":"");
    return "<tr><td>"+r[0]+"</td><td><b>"+r[1]+"</b></td><td>"+r[2]+"</td><td class='irm-delta "+cls+"'>"+(d||"—")+"</td></tr>";}).join("");
}
$("irm_lead").addEventListener("input",()=>{if(panelOpen("panelIRM"))renderIRM();});

// ================= T80 SIMULATOR (#5) =================
function runT80Sim(){
  $("t80Status").textContent="simulating…";$("t80Run").disabled=true;
  deferWithLoading(function(){
    const p=readParams(),N=10000,times=[];
    for(let i=0;i<N;i++){
      const q=Object.assign({},p);q.bat+=rn()*0.5;q.gpsc=Math.max(0,Math.min(0.75,q.gpsc+rn()*0.03));
      times.push(mcPathToT80(q,110));
    }
    times.sort((a,b)=>a-b);
    const qf=q=>times[Math.min(times.length-1,Math.floor(q*times.length))];
    const med=qf(0.5),p90=qf(0.9),p10=qf(0.1),tPace=T80PrPace();
    $("t80Stats").innerHTML="Median <b>m"+med.toFixed(1)+"</b> ("+fmtCalMonth(med)+", +"+(med-T3).toFixed(1)+" mo from anchor) · 90th <b>m"+p90.toFixed(1)+"</b> · 10th <b>m"+p10.toFixed(1)+"</b> · PR pace <b>m"+tPace.toFixed(1)+"</b> ("+fmtCalMonth(tPace)+")";
    const bins=[];for(let b=63;b<90;b+=1){let c=0;for(const t of times)if(t>=b&&t<b+1)c++;bins.push([b,100*c/N]);}
    const mx=Math.max(...bins.map(x=>x[1]),1);
    $("t80Hist").innerHTML=bins.map(bp=>'<div title="m'+bp[0]+': '+bp[1].toFixed(1)+'%" style="height:'+(bp[1]/mx*100).toFixed(1)+'%"></div>').join("");
    $("t80Status").textContent="10k paths";$("t80Run").disabled=false;
  },"Simulating paths…");
}
$("t80Run").onclick=runT80Sim;

// ================= PRESET COMPARISON (#6) =================
const PRESET_NAMES={best:"Best Available Guess",bear:"Bear (near-miss)",bull:"Bull / DD cure",critique:"Critique (~⅔)",bind:"Binding interim",nonbind:"Non-binding",cw:"Optimistic cure (~85%)",noeffect:"No effect",fail:"What failure needs",delay:"Vaccine delay 4m",backload:"Backloaded enroll",cw42:"Default (~42%)",cw35:"Moderate cure (35%)",cw50:"High cure (50%)",cwbind:"Binding interim (inv)"};
function runPresetCmp(){
  $("presetCmpStatus").textContent="computing…";$("presetCmpRun").disabled=true;
  deferWithLoading(function(){
    const rows=[];
    for(const name in P){const pr=paramsFromPreset(name,P[name],"forward");if(!pr)continue;
      const binding=P[name].mcFloor!=null?P[name].mcFloor:true;
      rows.push({name,mode:"forward",hr:hazardRatio(T2,pr),e46:eventsAt(T1,pr),e58:eventsAt(T2,pr),e63:eventsAt(T3,pr),pw:fastPwin(pr,binding,72,3000),bat3:sBAT(36,pr)*100,gpsc:pr.gpsc*100});}
    for(const name in INV){const pr=paramsFromPreset(name,INV[name],"inverse");if(!pr)continue;
      rows.push({name,mode:"inverse",hr:hazardRatio(T2,pr),e46:eventsAt(T1,pr),e58:eventsAt(T2,pr),e63:eventsAt(T3,pr),pw:fastPwin(pr,!!INV[name].mcFloor,72,3000),bat3:sBAT(36,pr)*100,gpsc:pr.gpsc*100});}
    $("presetCmpBody").innerHTML=rows.map(r=>{
      const win=r.hr<THRESH?"win":"lose";
      return "<tr><td>"+(PRESET_NAMES[r.name]||r.name)+"</td><td>"+r.mode+"</td><td class='"+win+"'>"+(isNaN(r.hr)?"—":r.hr.toFixed(2))+"</td><td>"+r.e46.toFixed(0)+"</td><td>"+r.e58.toFixed(0)+"</td><td>"+r.e63.toFixed(0)+"</td><td>"+(isNaN(r.pw)?"—":(100*r.pw).toFixed(0)+"%")+"</td><td>"+r.bat3.toFixed(0)+"%</td><td>"+r.gpsc.toFixed(0)+"%</td></tr>";
    }).join("");
    $("presetCmpStatus").textContent=rows.length+" presets";$("presetCmpRun").disabled=false;
  },"Computing all presets…");
}
$("presetCmpRun").onclick=runPresetCmp;

// ================= MILESTONE BACKTEST (#7) =================
const MILESTONES=[
  {label:"Interim",month:46,events:60,dataThrough:46,src:'<a href="https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html" target="_blank" rel="noopener">Jan 2025 PR</a>'},
  {label:"72-event update",month:58,events:72,dataThrough:58,src:'<a href="https://www.globenewswire.com/news-release/2025/12/29/3210926/0/en/SELLAS-Life-Sciences-Provides-Update-on-Pivotal-Phase-3-REGAL-Trial-of-Galinpepimut-S-GPS-in-Acute-Myeloid-Leukemia-AML.html" target="_blank" rel="noopener">Dec 2025 PR</a>'},
  {label:"78-event update",month:63,events:78,dataThrough:65,src:'<a href="https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html" target="_blank" rel="noopener">May 2026 PR</a> (78 @ m63, still &lt;80 @ m65)'}
];
function renderBacktest(){
  const p=readParams(),binding=$("mcFloor").checked;
  $("backtestCards").innerHTML=MILESTONES.map(m=>{
    const hr=hazardRatio(m.month,p),pw=fastPwin(p,binding,Math.max(72,m.month+6),3000,m.dataThrough);
    return '<div class="mcard"><div class="mt">'+m.label+' — '+m.events+' @ m'+m.month+'</div><div class="mv">'+(isNaN(hr)?"—":hr.toFixed(2))+' HR</div><div style="font-size:13px">P(win|data then) ≈ <b>'+(isNaN(pw)?"—":(100*pw).toFixed(0)+"%")+'</b></div><div style="font-size:10px;color:var(--muted);margin-top:4px">'+m.src+' · Poisson likelihood truncated to milestones then known · same survival sliders as now (not re-fit)</div></div>';
  }).join("");
}

// ================= PRINT SUMMARY (#9) =================
function updatePrintSummary(){
  const p=readParams(),hr=hazardRatio(T2,p);
  const ps=$("printSummary");
  ps.replaceChildren();

  const heading=document.createElement("b");
  heading.textContent="Scenario summary (printed "+new Date().toLocaleDateString()+")";
  ps.appendChild(heading);
  ps.appendChild(document.createElement("br"));

  ps.appendChild(document.createTextNode(
    "Preset: "+(regalMode==="inverse"?PRESET_NAMES[activeInvPreset]:PRESET_NAMES[activeRegalPreset])+" · Mode: "+regalMode
  ));
  ps.appendChild(document.createElement("br"));

  ps.appendChild(document.createTextNode(
    "BAT mOS "+($("oBatMed").textContent||"—")+" · GPS mOS "+($("oGpsMed").textContent||"—")+" · HR "+(isNaN(hr)?"—":hr.toFixed(2))
  ));
  ps.appendChild(document.createElement("br"));

  ps.appendChild(document.createTextNode(
    "Events: "+eventsAt(T1,p).toFixed(0)+"/"+E1+" @ m46 · "+eventsAt(T2,p).toFixed(0)+"/"+E2+" @ m58 · "+eventsAt(T3,p).toFixed(0)+"/"+E3+" @ m63"
  ));
}

// ================= COMMUNITY DD (lazy) =================
let communityDDLoaded=false;
function communityDDHtml(){
  return '<p class="cw-note">Synthesis of high-signal r/sellaslifesciences (and cross-post) DD from named contributors. Every factual bullet below was checked against primary sources (ClinicalTrials.gov, SELLAS IR/GlobeNewswire, SEC, Jamy/Cicic design paper, Kurosawa 2010, peer-reviewed critiques). Reddit posts supply <em>framing and models</em>, not trial outcomes.</p>'+
  '<p class="cw-note"><span class="val-ok">✅ verified</span> matches primary source · <span class="val-part">⚠️ partial</span> directionally right, numbers differ · <span class="val-no">❌</span> do not state as fact · <span class="val-model">🔬</span> model output / opinion</p>'+
  '<div class="contrib"><h4>u/Confident-Web-7118 <span class="tag v">integrated above</span></h4>'+
  '<p><b>Who:</b> Long-form REGAL mixture-cure modeler; large WSB/ValueInvesting DD threads. <span class="cite"><a href="https://www.reddit.com/r/ValueInvesting/comments/1ri8rrb/sls_deepest_due_diligence_for_regal_trial_from_a/" target="_blank">Part 1</a> · <a href="https://www.reddit.com/r/pennystocks/comments/1r8rb45/sls_part_2_and_final_deepest_due_diligence_for/" target="_blank">Part 2</a> · <a href="https://www.reddit.com/r/sellaslifesciences/comments/1tnh66g/why_the_randomization_window_leads_to_an/" target="_blank">IRM</a></span></p>'+
  '<p><b>Core thesis:</b> Blinded event deceleration (72 @ m58, 78 @ m63) fits a GPS cure-fraction better than a homogeneous BAT null; anchor-constrained inversion yields BAT mOS ~11 mo after biology caps.</p>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> Event anchors 60 / 72 / 78 and final trigger 80 — <a href="https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html" target="_blank">SELLAS PRs</a></li>'+
  '<li><span class="val-ok">✅</span> Win bar HR &lt; 0.636 (~BAT 8.0 vs GPS 12.6 mo design) — <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank">Jamy/Cicic 2025</a></li>'+
  '<li><span class="val-ok">✅</span> IRM / lead-time inflation logic (Suissa left-truncation) — <a href="https://academic.oup.com/aje/article/167/4/492/233064" target="_blank">Suissa 2008</a></li>'+
  '<li><span class="val-part">⚠️</span> BAT 3-yr OS cap ~15–18% — Kurosawa CR2 ineligible 14% <span class="val-ok">✅</span>; exact REGAL BAT tail unknown</li>'+
  '<li><span class="val-model">🔬</span> Bayes ~62× vs no-cure null — <span class="val-no">❌</span> not robust if BAT has long tail (<a href="https://www.reddit.com/r/pennystocks/comments/1h8v0zv/critique_of_confident_webs_sls_dd/" target="_blank">uhdisj41</a>)</li>'+
  '<li><span class="val-model">🔬</span> Part 2 P(success) 99.9%, BAT mOS 11.4 mo — model outputs; not disclosed trial data</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>u/Thetamancer</h4>'+
  '<p><b>Who:</b> Quantitative Monte Carlo modeler (R); independent stress-test parallel to CW. Best post: <a href="https://www.reddit.com/r/sellaslifesciences/comments/1tnqqp3/memorial_day_dd_200_monte_carlo_simulations/" target="_blank">Memorial Day DD (200M+ sims)</a> (score ~91).</p>'+
  '<p><b>Core thesis:</b> Reverse-fit synthetic REGAL trials to public event milestones; under wide BAT stress (mOS 8–25 mo, Weibull k, up to 30% BAT durable tail), scenarios matching 60/72/78 events usually yield HR &lt; 0.636 at the 80th death. Biological + procedural caps make high-BAT failure scenarios implausible.</p>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> N≈126, enrollment milestones, 13.5 mo median follow-up @ interim — <a href="https://ir.sellaslifesciences.com/news/News-Details/2025/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia/default.aspx" target="_blank">Jan 2025 IR</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank">design</a></li>'+
  '<li><span class="val-ok">✅</span> 80% GPS-specific T-cell response in blinded random sample — <a href="https://ir.sellaslifesciences.com/news/News-Details/2025/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia/default.aspx" target="_blank">Jan 2025 IR</a> (immunogenicity ≠ OS — see uhdisj41)</li>'+
  '<li><span class="val-model">🔬</span> Three-subgroup GPS (non-responder / responder / durable tail up to 70%) — structural assumption; Phase 2 CR2 n=10 (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank">Brayer via design paper</a>) shows ~20–30% durable, not 70%</li>'+
  '<li><span class="val-model">🔬</span> Back-loaded enrollment most plausible; uniform enrollment stress-test — <span class="val-part">⚠️</span> company confirms back-loaded completion (<a href="https://www.globenewswire.com/news-release/2024/04/29/2871141/0/en/SELLAS-Life-Sciences-Announces-Positive-Recommendation-of-Independent-Data-Monitoring-Committee-Following-Completion-of-Enrollment-in-REGAL-Phase-3-Study.html" target="_blank">Apr 2024 PR</a>)</li>'+
  '<li><span class="val-part">⚠️</span> “No oncology trial had control overperformance &gt;~90%” — Nalin 2026 (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12882696/" target="_blank">PMC12882696</a>) reports median overperformance 35% (IQR 20–48%) among overperformers, not a published 90% max; REGAL needing ~140% vs 8 mo protocol is 🔬 arithmetic, not a direct trial precedent</li>'+
  '<li><span class="val-model">🔬</span> Durable-subgroup overlap / BAT tail cap — REGAL stratifies long-CR1, MRD, cyto (<a href="https://clinicaltrials.gov/study/NCT04229979" target="_blank">NCT</a>); prognostic factors correlate — treating them as independent stacks overstates BAT. Debated with bears in <a href="https://www.reddit.com/r/sellaslifesciences/comments/1tqb3wa/a_bearish_take/" target="_blank">bear thread</a></li>'+
  '<li><span class="val-model">🔬</span> Model 4 (drop interim HR &gt;0.5 floor): IDMC may continue despite low interim HR — <span class="val-ok">✅</span> IDMC recommended continue without modification (<a href="https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html" target="_blank">PR</a>); OBF early-stop HR≲0.55 is <span class="val-part">⚠️ derived</span>, not published arm-level HR</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>u/uhguy85</h4>'+
  '<p><b>Who:</b> Community explainer focused on interpreting ML outputs and enrollment timing. <a href="https://www.reddit.com/r/sellaslifesciences/comments/1t6uts2/9999_regal_trial_success_rate_what_does_this_mean/" target="_blank">99.99% explainer</a> · <a href="https://www.reddit.com/r/sellaslifesciences/comments/1td14uq/enrollment_cadence_impact_on_bat_mos_calculation/" target="_blank">Enrollment cadence</a></p>'+
  '<p><b>Core thesis:</b> “99.99%” is the fraction of <em>simulated</em> parameter draws that reproduce public milestones <em>and</em> HR &lt; 0.636 — not stock certainty or fraud-free guarantee.</p>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> HR &lt; 0.636 is the pre-specified win threshold — <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank">design</a></li>'+
  '<li><span class="val-ok">✅</span> Jan 2025 PR: &lt;50% deceased ~10 mo post-enrollment; median follow-up 13.5 mo — <a href="https://ir.sellaslifesciences.com/news/News-Details/2025/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia/default.aspx" target="_blank">IR</a></li>'+
  '<li><span class="val-part">⚠️</span> Median enrollment ≈ Nov 2023 from follow-up arithmetic — reasonable derivation, not company-reported</li>'+
  '<li><span class="val-model">🔬</span> Late enrollment ⇒ BAT mOS 9–11 mo, higher implied GPS cure — model opinion; conflicts with slower event pace if BAT were <em>too</em> short</li>'+
  '<li><span class="val-model">🔬</span> Dissent on interim HR floor: trial may continue even if unblinded interim HR is very low (non-binding efficacy stop) — aligns with Thetamancer Model 4; arm-level interim HR <span class="val-no">❌</span> unknown</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>u/Remarkable-Big-9849</h4>'+
  '<p><b>Who:</b> Biology-focused debater (PhD-level citations in threads). <a href="https://www.reddit.com/r/sellaslifesciences/comments/1u4hw6o/could_covid_have_improved_outcomes_in_aml_trials/" target="_blank">COVID frailty post</a> · top comments on <a href="https://www.reddit.com/r/sellaslifesciences/comments/1tqb3wa/a_bearish_take/" target="_blank">bear thread</a>.</p>'+
  '<p><b>Core thesis:</b> Statistical fits must respect BAT biology — ven+HMA BAT, transplant-bridge tails, and academic-center selection can lift pooled survival without GPS efficacy; cure fractions &gt;~65% are imprudent vs interim death counts.</p>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> BAT includes venetoclax / HMA / LDAC per investigator choice — <a href="https://clinicaltrials.gov/study/NCT04229979" target="_blank">NCT</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank">design</a></li>'+
  '<li><span class="val-ok">✅</span> OS ITT: allo-transplant after randomization <em>not</em> censored — <a href="https://clinicaltrials.gov/study/NCT04229979" target="_blank">NCT</a> (transplant-ineligible at entry ≠ no downstream transplant)</li>'+
  '<li><span class="val-part">⚠️</span> “Up to ~⅓ of BAT bridging to HSCT with 30–70% 3-yr OS” — mechanistic argument; fraction <span class="val-no">❌</span> not disclosed blinded</li>'+
  '<li><span class="val-no">❌</span> COVID selectively removed frail CR2 patients — explicit hypothesis only; no epidemiologic proof in post</li>'+
  '<li><span class="val-model">🔬</span> GPS cure &gt;65% inconsistent with ~30 BAT deaths @ interim — arithmetic plausibility check, not primary data</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>u/neo2551</h4>'+
  '<p><b>Who:</b> Quant/data-science background; community-process meta-DD; built early webapp precursor. <a href="https://www.reddit.com/r/sellaslifesciences/comments/1ucz8ra/dd_scientific_process_and_nerds_for_the_win/" target="_blank">Scientific process</a> · <a href="https://www.reddit.com/r/sellaslifesciences/comments/1tnond9/webapp_to_understand_cws_dd/" target="_blank">Webapp post</a></p>'+
  '<p><b>Core thesis:</b> Bull case strengthened by falsifiable community debate; trial success tied to BAT 3-yr OS staying below ~25% (otherwise event math still allows win but with thinner margin).</p>'+
  '<ul>'+
  '<li><span class="val-model">🔬</span> “&gt;90% success if BAT 3-yr OS &lt;25%” — community model synthesis, not SELLAS disclosure</li>'+
  '<li><span class="val-ok">✅</span> Kurosawa CR2 ineligible 3-yr OS ~14% anchor — <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3011608/" target="_blank">Haematologica 2010</a></li>'+
  '<li><span class="val-model">🔬</span> Community rigor as investment factor — opinion; useful for process, not clinical proof</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>Cross-check: u/uhdisj41 (critique)</h4>'+
  '<p><a href="https://www.reddit.com/r/pennystocks/comments/1h8v0zv/critique_of_confident_webs_sls_dd/" target="_blank">Original critique</a> · <a href="https://www.reddit.com/r/sellaslifesciences/comments/1tocmlg/dd_questions_for_cw_and_thetamancer/" target="_blank">Questions for CW &amp; Thetamancer</a></p>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> Blinded pooled counts sit on GPS-cure ↔ BAT-heterogeneity ridge — identifiability acknowledged in-app</li>'+
  '<li><span class="val-ok">✅</span> Brayer CR2 GPS mOS 16.3 mo (n=10) vs 5.4 mo control — <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank">design paper Table</a></li>'+
  '<li><span class="val-part">⚠️</span> Immune response ≠ OS benefit — Maslak CR1 immune–survival correlation p≈0.08–0.11 (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank">design cites Maslak 2018</a>); 80% REGAL immunogenicity still <span class="val-no">❌</span> does not cap durable GPS fraction</li>'+
  '<li><span class="val-model">🔬</span> Cap durable GPS at 25–30% (Phase 2-consistent) before claiming success — stress test implemented via Critique preset / biology caps</li>'+
  '</ul></div>'+
  '<table class="valtbl"><thead><tr><th>Claim (selected)</th><th>Primary source</th><th>Status</th></tr></thead><tbody>'+
  '<tr><td>80 events trigger final OS analysis</td><td><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank">Jamy/Cicic 2025</a></td><td><span class="val-ok">✅</span></td></tr>'+
  '<tr><td>78 events @ 11 May 2026 (blinded)</td><td><a href="https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html" target="_blank">Q1 2026 PR</a></td><td><span class="val-ok">✅</span></td></tr>'+
  '<tr><td>IDMC continue w/o modification @ 60 events</td><td><a href="https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html" target="_blank">Jan 2025 PR</a></td><td><span class="val-ok">✅</span></td></tr>'+
  '<tr><td>80% GPS immune response (sample)</td><td><a href="https://ir.sellaslifesciences.com/news/News-Details/2025/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia/default.aspx" target="_blank">Jan 2025 IR</a></td><td><span class="val-ok">✅</span></td></tr>'+
  '<tr><td>BAT design mOS 8.0 mo</td><td><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/" target="_blank">Design paper</a></td><td><span class="val-ok">✅</span></td></tr>'+
  '<tr><td>CW / TM “99.99%” or “99.9%” success</td><td>Community MC models</td><td><span class="val-model">🔬</span> not trial data</td></tr>'+
  '<tr><td>BAT mOS 19+ required for failure (TM back-loaded)</td><td>Thetamancer MC</td><td><span class="val-model">🔬</span></td></tr>'+
  '<tr><td>No trial ever &gt;90% control overperformance</td><td><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12882696/" target="_blank">Nalin 2026</a></td><td><span class="val-no">❌</span> as stated</td></tr>'+
  '<tr><td>~⅓ BAT transplant bridge</td><td>Remarkable-Big estimate</td><td><span class="val-no">❌</span> unverified</td></tr>'+
  '<tr><td>COVID frailty selection in CR2</td><td>Hypothesis only</td><td><span class="val-no">❌</span></td></tr>'+
  '</tbody></table>'+
  '<p class="cw-note" style="margin-top:10px"><b>Excluded from factual display:</b> CW Bayes 62× and P(success) 99.9% without strawman label; literal “99.99% stock win”; Thetamancer 90% max overperformance claim; Remarkable-Big HSCT bridge fraction; COVID frailty mechanism — all retained only as tagged 🔬/❌ above.</p>';
}
function loadCommunityDD(){
  if(communityDDLoaded)return;
  communityDDLoaded=true;
  const host=$("communityDDHost");
  if(host)host.innerHTML=communityDDHtml();
}

// ================= SLS-009 COMMUNITY DD (lazy) =================
let slsCommunityDDLoaded=false;
function slsCommunityDDHtml(){
  return '<p class="cw-note">Synthesis of high-signal r/sellaslifesciences threads on SLS-009 / tambiciclib. Reddit supplies framing and sentiment; clinical numbers checked against SELLAS IR, ASH abstracts, SEC, and peer-reviewed benchmarks.</p>'+
  '<div class="contrib"><h4>Community bull thesis</h4>'+
  '<p>Recurring themes: post-Ven r/r AML is a graveyard (~2.5 mo mOS); SLS-009+AZA/VEN shows ~3–4× OS vs historical and strong ORR in AML-MR / ASXL1+ subsets; frontline optionality (80-pt Ph2) adds commercial upside alongside GPS.</p>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> ORR 46%, mOS 8.9 mo, 58% ORR in 1-prior-line — <a href="https://ir.sellaslifesciences.com/news/News-Details/2025/SELLAS-Life-Sciences-Presents-Positive-Phase-2-Data-of-SLS009-in-Combination-with-AZAVEN-in-RelapsedRefractory-AML-MR-at-ASH-2025/default.aspx" target="_blank">ASH 2025</a></li>'+
  '<li><span class="val-part">⚠️</span> "3×+ OS vs 2.5 mo life expectancy" — arithmetic ~3.6× at 8.9/2.5; benchmark choice matters (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1j2vjc1/the_promise_of_sls009/" target="_blank">Promise post</a> · <a href="https://www.reddit.com/r/sellaslifesciences/comments/1haptk2/300_overall_survival_compared_to_historical/" target="_blank">300% OS post</a>)</li>'+
  '<li><span class="val-part">⚠️</span> Compares r/r SLS-009 OS to frontline Vyxeos 9.6 mo — different line of therapy (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1j2vjc1/the_promise_of_sls009/" target="_blank">Promise post</a>)</li>'+
  '<li><span class="val-model">🔬</span> "$5–20B TAM / bidding war" if both GPS and SLS-009 succeed (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1kq581k/bull_case_a_quite_evident_one/" target="_blank">Bull case</a> · <a href="https://www.reddit.com/r/sellaslifesciences/comments/1k796w4/potential_buyers_for_sls/" target="_blank">Potential buyers</a>)</li>'+
  '<li><span class="val-no">❌</span> "100% CR ASXL1+" / "guaranteed FDA approval" — early ASH 2024 subset hype; Jul/Dec 2025 data show 44–50% ORR at optimal dose (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1hfnphz/009_p2a_data_updated_at_ash_is_a_grand_slam_home/" target="_blank">Grand slam post</a>)</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>Community bear / skeptic points</h4>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> Single-arm vs historical — no concurrent control; selection and immortal-time bias real (<a href="https://clinicaltrials.gov/study/NCT05309745" target="_blank">NCT</a>)</li>'+
  '<li><span class="val-part">⚠️</span> r/sellaslifesciences bear thread focuses on GPS/CEO, not SLS-009 science (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1koxaq8/bear_cases/" target="_blank">Bear cases</a>)</li>'+
  '<li><span class="val-model">🔬</span> CDK9 class competition (voruciclib, QHRD107) — mechanism not unique (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1h5j4zc/voruciclib_cdk9_inhibitor_in_rr_aml_at_ash_2024/" target="_blank">Voruciclib</a> · <a href="https://www.reddit.com/r/sellaslifesciences/comments/1h18o1n/another_cdk9_inhibitor_in_rr_aml_qhrd107_at_ash/" target="_blank">QHRD107</a>)</li>'+
  '<li><span class="val-model">🔬</span> Regor CDK deal ($850M on Ph1 CR ~28%) cited as M&amp;A comp — not efficacy equivalence (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1h7ftri/regor_cdk_inhibitor_asset_bought_for_850m_in_cash/" target="_blank">Regor post</a>)</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>Regulatory / frontline path (community + primary)</h4>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> FDA recommended frontline trial incl. biomarker-negative and early ven-resistant cohorts (<a href="https://www.globenewswire.com/news-release/2025/07/15/3115485/0/en/SELLAS-Meets-All-Primary-Endpoints-in-Phase-2-Trial-of-SLS009-in-r-r-AML-and-Receives-FDA-Guidance-to-Advance-into-First-Line-Therapy-Study.html" target="_blank">Jul 2025 PR</a>)</li>'+
  '<li><span class="val-ok">✅</span> First frontline patient enrolled Mar 2026; IMPACT-AML EU ~40 pts (<a href="https://ir.sellaslifesciences.com/news/News-Details/2026/SELLAS-Life-Sciences-Announces-Enrollment-of-First-Patient-in-Newly-Diagnosed-First-Line-AML-Trial-of-SLS009/default.aspx" target="_blank">Mar 2026</a>)</li>'+
  '<li><span class="val-part">⚠️</span> Community expected Q1 2026 enrollment — largely confirmed; topline timing still <span class="val-no">❌</span> undisclosed</li>'+
  '</ul></div>'+
  '<table class="valtbl"><thead><tr><th>Reddit claim</th><th>Validation</th><th>Thread</th></tr></thead><tbody>'+
  '<tr><td>8.9 mo mOS in post-Ven r/r</td><td><span class="val-ok">✅</span> ASH 2025</td><td><a href="https://www.reddit.com/r/sellaslifesciences/comments/1haptk2/300_overall_survival_compared_to_historical/" target="_blank">300% OS</a></td></tr>'+
  '<tr><td>~2.5 mo historical control</td><td><span class="val-ok">✅</span> Zainaldin 2022 / ASH PR</td><td><a href="https://www.reddit.com/r/sellaslifesciences/comments/1j2vjc1/the_promise_of_sls009/" target="_blank">Promise</a></td></tr>'+
  '<tr><td>No serious side effects</td><td><span class="val-part">⚠️</span> no DLTs/deaths; not zero AEs</td><td><a href="https://www.reddit.com/r/sellaslifesciences/comments/1hfnphz/009_p2a_data_updated_at_ash_is_a_grand_slam_home/" target="_blank">Grand slam</a></td></tr>'+
  '<tr><td>SLS-009 alone worth 15–20× mcap</td><td><span class="val-model">🔬</span> valuation opinion</td><td><a href="https://www.reddit.com/r/sellaslifesciences/comments/1haptk2/300_overall_survival_compared_to_historical/" target="_blank">300% OS</a></td></tr>'+
  '</tbody></table>'+
  '<p class="cw-note" style="margin-top:10px"><b>Excluded as fact:</b> 100% ORR/CR claims from ASH 2024-era posts; "guaranteed FDA approval"; precise frontline topline dates — retained only as tagged 🔬/❌ above.</p>';
}
function loadSlsCommunityDD(){
  if(slsCommunityDDLoaded)return;
  slsCommunityDDLoaded=true;
  const host=$("slsCommunityDDHost");
  if(host)host.innerHTML=slsCommunityDDHtml();
}

// ================= VALUATION COMMUNITY DD (lazy) =================
let valCommunityDDLoaded=false;
function valCommunityDDHtml(){
  return '<p class="cw-note">Synthesis of r/sellaslifesciences valuation and buyout threads. Reddit supplies framing; financial/clinical numbers checked against SEC, SELLAS IR, and peer comps.</p>'+
  '<div class="contrib"><h4>u/Confident-Web-7118 — TAM &amp; peak sales</h4>'+
  '<p>Part 2 DD models GPS peak ~$1.5–2B (CR2+CR1 maintenance) plus SLS-009 upside; uses ~3K CR2 and ~6K CR1 pools from SEER funnel. Platform value for WT1 follow-ons treated separately.</p>'+
  '<ul>'+
  '<li><span class="val-part">⚠️</span> CR2 ~3K / CR1 ~6K new/yr — reasonable SEER-derived estimates, not epidemiology study (<a href="https://www.reddit.com/r/ValueInvesting/comments/1ri8rrb/sls_deepest_due_diligence_for_regal_trial_from_a/" target="_blank">Part 1</a> · <a href="https://www.reddit.com/r/pennystocks/comments/1r8rb45/sls_part_2_and_final_deepest_due_diligence_for/" target="_blank">Part 2</a>)</li>'+
  '<li><span class="val-model">🔬</span> Combined GPS+SLS peak $3–5B+ at bull assumptions — model output, not SEC forecast</li>'+
  '<li><span class="val-ok">✅</span> Onureg as maintenance caution — QUAZAR positive but commercial headwinds (<a href="https://www.nejm.org/doi/full/10.1056/NEJMoa2001094" target="_blank">NEJM 2020</a>)</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>Buyout / M&amp;A thesis (community)</h4>'+
  '<ul>'+
  '<li><span class="val-model">🔬</span> Potential acquirers: Gilead, BMS, AbbVie, J&amp;J, Pfizer — logical AML strategics (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1k796w4/potential_buyers_for_sls/" target="_blank">Potential buyers</a>)</li>'+
  '<li><span class="val-no">❌</span> No disclosed acquisition talks — severance CIC amendments (May 2026) fuel speculation only (<a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001390478&amp;type=8-K" target="_blank">8-K</a>)</li>'+
  '<li><span class="val-model">🔬</span> "$5–20B TAM / bidding war if REGAL wins + SLS-009 frontline succeeds" (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1kq581k/bull_case_a_quite_evident_one/" target="_blank">Bull case</a>)</li>'+
  '<li><span class="val-part">⚠️</span> Gilead–Forty Seven ~$4.9B comp cited — <span class="val-ok">✅</span> deal price verified (<a href="https://www.sec.gov/Archives/edgar/data/882095/000110465920027988/a20-11253_1ex99d1.htm" target="_blank">SEC</a>); asset later failed (<a href="https://investors.gilead.com/news/news-details/2023/Gilead-To-Discontinue-Phase-3-ENHANCE-Study-of-Magrolimab-Plus-Azacitidine-in-Higher-Risk-MDS/default.aspx" target="_blank">Gilead 2023</a>)</li>'+
  '<li><span class="val-model">🔬</span> Regor ~$850M CDK deal as early-stage M&amp;A anchor (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1h7ftri/regor_cdk_inhibitor_asset_bought_for_850m_in_cash/" target="_blank">Regor post</a>)</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>u/Thetamancer — REGAL success vs valuation</h4>'+
  '<p>Focuses on trial statistics, not peak sales — but bull valuation threads cite his MC as supporting high P(REGAL success), which feeds P(GPS) in this tab.</p>'+
  '<ul>'+
  '<li><span class="val-model">🔬</span> Wide BAT stress tests still yield HR &lt; 0.636 at 80 events in most draws (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1tnqqp3/memorial_day_dd_200_monte_carlo_simulations/" target="_blank">Memorial Day DD</a>)</li>'+
  '<li><span class="val-part">⚠️</span> Valuation upside from TM work is indirect — trial stats ≠ peak penetration</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>u/Remarkable-Big-9849 — platform biology caution</h4>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> WT1 antigen validated; GPS mechanism plausible (<a href="https://pubmed.ncbi.nlm.nih.gov/19723653/" target="_blank">Cheever</a>)</li>'+
  '<li><span class="val-part">⚠️</span> Platform $B hard to defend pre-REGAL — solid-tumor programs early (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1tqb3wa/a_bearish_take/" target="_blank">bear thread</a>)</li>'+
  '</ul></div>'+
  '<div class="contrib"><h4>Bear / skeptic valuation points</h4>'+
  '<ul>'+
  '<li><span class="val-ok">✅</span> Binary REGAL — GPS engine worthless if trial fails (<a href="https://www.reddit.com/r/sellaslifesciences/comments/1koxaq8/bear_cases/" target="_blank">Bear cases</a>)</li>'+
  '<li><span class="val-ok">✅</span> Dilution: share count rose ~90M → 181M+ in 12 mo (<a href="https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html" target="_blank">Q1 2026</a>)</li>'+
  '<li><span class="val-part">⚠️</span> Platform value hard to justify pre-REGAL — WT1 antigen validated (<a href="https://pubmed.ncbi.nlm.nih.gov/19723653/" target="_blank">Cheever</a>) but GPS registrational proof pending</li>'+
  '<li><span class="val-model">🔬</span> Bear case: mcap justified only by REGAL lottery ticket; SLS-009 too early — opinion, not primary data</li>'+
  '</ul></div>'+
  '<table class="valtbl"><thead><tr><th>Reddit claim</th><th>Validation</th><th>Thread</th></tr></thead><tbody>'+
  '<tr><td>~3K CR2 + ~6K CR1 addressable/yr</td><td><span class="val-part">⚠️</span> SEER-derived est.</td><td><a href="https://www.reddit.com/r/ValueInvesting/comments/1ri8rrb/sls_deepest_due_diligence_for_regal_trial_from_a/" target="_blank">CW Part 1</a></td></tr>'+
  '<tr><td>4–8× peak sales buyout multiple</td><td><span class="val-part">⚠️</span> market convention</td><td><a href="https://www.reddit.com/r/sellaslifesciences/comments/1kq581k/bull_case_a_quite_evident_one/" target="_blank">Bull case</a></td></tr>'+
  '<tr><td>Gilead/BMS likely buyers</td><td><span class="val-model">🔬</span> strategic fit only</td><td><a href="https://www.reddit.com/r/sellaslifesciences/comments/1k796w4/potential_buyers_for_sls/" target="_blank">Buyers</a></td></tr>'+
  '<tr><td>CIC severance = imminent sale</td><td><span class="val-part">⚠️</span> 8-K verified; causation <span class="val-no">❌</span></td><td><a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001390478&amp;type=8-K" target="_blank">SEC</a></td></tr>'+
  '<tr><td>Onureg proves maintenance TAM is small</td><td><span class="val-part">⚠️</span> no Onureg peak disclosed</td><td><a href="https://www.sec.gov/Archives/edgar/data/14272/000001427225000039/R34.htm" target="_blank">BMS SEC</a></td></tr>'+
  '</tbody></table>'+
  '<p class="cw-note" style="margin-top:10px"><b>Excluded as fact:</b> guaranteed buyout prices; disclosed M&amp;A negotiations; precise Onureg peak sales — retained only as tagged 🔬/❌ above.</p>';
}
function loadValCommunityDD(){
  if(valCommunityDDLoaded)return;
  valCommunityDDLoaded=true;
  const host=$("valCommunityDDHost");
  if(host)host.innerHTML=valCommunityDDHtml();
}

// ================= MOBILE COLLAPSE (#9) =================
function initMobileCollapse(){
  if(window.innerWidth>768)return;
  ["howworks","panelTornado","panelBayes","panelIRM","panelT80","panelScmp","panelEvtSens","panelPresetCmp","panelBacktest","panelCW","panelCommunity","panelSlsBench","panelSlsBear","panelSlsComp","panelSlsCommunity","panelValWt1","panelValTam","panelValComp","panelValBear","panelValPresets","panelValCommunity"].forEach(id=>{
    const el=$(id);if(el&&el.tagName==="DETAILS")el.open=false;
  });
}
window.addEventListener("resize",initMobileCollapse);

// patch update: debounced sliders call scheduleUpdate; presets/modes call updateNow directly
const _updateOrig=update;
function updateNow(){
  _updateOrig();
  updateBestEstStrip();
  if(!restoringState){refreshOpenPanels();updateHashQuiet();}
}
update=updateNow;

function initApp(){
  buildBands();
  applyEmbedMode();
  initFactsAsOf();
  initScmpSelects();
  initChartInteraction();
  auditPresetButtons();
  if(!location.hash.startsWith("#s=")){
    setRegalMode("forward");
    applyRegalPreset("best");
  }else{
    restoreFromHash()||null;
    refreshRegalPresetHighlight();
    updateNow();
  }
  updateReadoutTracker();
  initMobileCollapse();
  buildBands2();
  tabsRendered.gps=true;
  if(activeTab!=="gps")renderTab(activeTab,true);
  if($("btnUsePwin"))$("btnUsePwin").onclick=usePwinInValuation;
  if($("scmpRun"))$("scmpRun").onclick=runScenarioDiff;
  ["ev79","ev80"].forEach(id=>{const el=$(id);if(el)el.addEventListener("input",updateEventSensitivity);});
  ["panelScmp","panelEvtSens"].forEach(id=>{const el=$(id);if(el)el.addEventListener("toggle",()=>{if(el.open&&id==="panelEvtSens")updateEventSensitivity();});});
}
["panelIRM","panelBayes","panelBacktest","panelCommunity","panelSlsCommunity","panelValCommunity"].forEach(id=>{const el=$(id);if(el)el.addEventListener("toggle",()=>{if(el.open){if(id==="panelCommunity")loadCommunityDD();else if(id==="panelSlsCommunity")loadSlsCommunityDD();else if(id==="panelValCommunity")loadValCommunityDD();else refreshOpenPanels();}});});
requestAnimationFrame(()=>{
  setTimeout(()=>{
    try{initApp();}finally{forceHideLoading();}
  },0);
});

// ================= TABS & METHODOLOGY =================
function toggleMethod(id){const e=$(id);e.hidden=!e.hidden;}
window.toggleMethod=toggleMethod;
function renderTab(t,force){
  if(t==="sls009"&&(force||tabsDirty.sls009||!tabsRendered.sls009)){renderSLS();tabsRendered.sls009=true;tabsDirty.sls009=false;}
  if(t==="value"&&(force||tabsDirty.value||!tabsRendered.value)){renderVal();tabsRendered.value=true;tabsDirty.value=false;}
  if(t==="explain"&&(force||!tabsRendered.explain)){showLevel(curLvl);tabsRendered.explain=true;}
}
function switchTab(t){
  activeTab=t;
  document.querySelectorAll(".tabbtn").forEach(x=>{const on=x.dataset.tab===t;x.classList.toggle("active",on);x.setAttribute("aria-selected",on?"true":"false");});
  document.querySelectorAll("#bottomNav button").forEach(x=>{const on=x.dataset.tab===t;x.classList.toggle("active",on);x.setAttribute("aria-current",on?"page":"false");});
  ["gps","sls009","value","explain"].forEach(id=>{$("tab-"+id).hidden=(id!==t);});
  updateReadoutVisibility();
  renderTab(t);
  if(!restoringState)updateHashQuiet();
}
document.querySelectorAll(".tabbtn").forEach(b=>b.onclick=()=>{switchTab(b.dataset.tab);if(!restoringState)window.scrollTo(0,0);});
document.querySelectorAll("#bottomNav button").forEach(b=>b.onclick=()=>{switchTab(b.dataset.tab);if(!restoringState)window.scrollTo(0,0);});
function drawExp(id,arms,tmax){
  const cv=$(id),dpr=window.devicePixelRatio||1,W=920,H=360;cv.width=W*dpr;cv.height=H*dpr;cv.style.height=H+"px";
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const L=48,R=16,Tp=12,B=34,X=t=>L+(W-L-R)*t/tmax,Y=s=>Tp+(H-Tp-B)*(1-s);
  ctx.font="11px sans-serif";
  for(let s=0;s<=1.001;s+=0.25){ctx.strokeStyle="#eef0f3";ctx.beginPath();ctx.moveTo(L,Y(s));ctx.lineTo(W-R,Y(s));ctx.stroke();ctx.fillStyle="#9aa1ac";ctx.textAlign="right";ctx.fillText((s*100).toFixed(0)+"%",L-6,Y(s)+3);}
  for(let t=0;t<=tmax;t+=6){ctx.strokeStyle="#f3f4f6";ctx.beginPath();ctx.moveTo(X(t),Tp);ctx.lineTo(X(t),H-B);ctx.stroke();ctx.fillStyle="#9aa1ac";ctx.textAlign="center";ctx.fillText(t+"m",X(t),H-B+15);}
  ctx.strokeStyle="#c9ccd2";ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(L,Y(0.5));ctx.lineTo(W-R,Y(0.5));ctx.stroke();ctx.setLineDash([]);
  let ly=Tp+6;arms.forEach(a=>{ctx.strokeStyle=a.c;ctx.lineWidth=2.6;ctx.beginPath();for(let t=0;t<=tmax;t+=0.5){const s=Math.exp(-LN2*t/a.med),x=X(t),y=Y(s);t===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();ctx.fillStyle=a.c;ctx.fillRect(X(tmax*0.5),ly,12,3);ctx.fillStyle="#333";ctx.font="12px sans-serif";ctx.textAlign="left";ctx.fillText(a.lbl+" (med "+a.med.toFixed(1)+"m)",X(tmax*0.5)+16,ly+4);ly+=16;});
}

// ================= TAB 2 : SLS-009 =================
function computeValuationMetrics(){
  const cr2=+$("v_cr2").value,cr1=+$("v_cr1").value,gpen=+$("v_gpen").value/100,gprice=+$("v_gprice").value,gyears=+$("v_gyears").value;
  const flpool=+$("v_flpool").value,rrpool=+$("v_rrpool").value,spen=+$("v_spen").value/100,sprice=+$("v_sprice").value,syears=+$("v_syears").value;
  const platform=+$("v_platform").value,mult=+$("v_mult").value,shares=+$("v_shares").value;
  const ra=$("v_riskadj")&&$("v_riskadj").checked,pG=+$("v_pgps").value/100,pS=+$("v_psls").value/100;
  const gpool=(cr2+cr1)*gpen*gyears;
  let gpsPeak=gpool*gprice/1000;
  let slsPeak=(flpool+rrpool)*spen*syears*sprice/1000;
  if(ra){gpsPeak*=pG;slsPeak*=pS;}
  const totPeak=gpsPeak+slsPeak;
  const EV=totPeak*mult+platform*1000;
  const ps=EV/shares;
  return{gpool,gpsPeak,slsPeak,totPeak,EV,ps,riskAdjusted:!!ra};
}
function updateBestEstStrip(){
  if(embedMode||!$("bestEstStrip"))return;
  const p=readParams();
  const hr=hazardRatio(T2,p);
  const gpsEl=$("beGpsHr");
  if(gpsEl)gpsEl.textContent=isNaN(hr)?"—":hr.toFixed(2);
  const os=+$("sls_os").value,bench=+$("sls_bench").value;
  const slsEl=$("beSlsHr");
  if(slsEl)slsEl.textContent=(bench>0&&os>0)?(bench/os).toFixed(2):"—";
  const{EV,ps,riskAdjusted}=computeValuationMetrics();
  const buyEl=$("beBuyout");
  if(buyEl)buyEl.textContent=(EV>=1000?"EV $"+(EV/1000).toFixed(1)+"B · ":"")+"$"+ps.toFixed(0)+"/sh"+(riskAdjusted?" (risk-adj)":"");
}
function renderSLS(){
  const os=+$("sls_os").value,bench=+$("sls_bench").value,orr=+$("sls_orr").value;
  const flb=+$("fl_base").value,fls=+$("fl_sls").value,tpb=+$("tp_base").value,tps=+$("tp_sls").value;
  $("v_slsos").textContent=os.toFixed(1)+" m";$("v_slsbench").textContent=bench.toFixed(1)+" m";$("v_slsorr").textContent=orr+" %";
  $("v_flbase").textContent=flb.toFixed(1)+" m";$("v_flsls").textContent=fls.toFixed(1)+" m";$("v_tpbase").textContent=tpb.toFixed(1)+" m";$("v_tpsls").textContent=tps.toFixed(1)+" m";
  const fold=os/bench,osRatio=bench/os,gain=os-bench;
  $("oFold").innerHTML=fold.toFixed(1)+'×';$("oHReq").innerHTML=osRatio.toFixed(2);$("oGain").innerHTML='+'+gain.toFixed(1)+' <small>m</small>';$("oORR").innerHTML=orr+' <small>%</small>';
  const ap=Math.min(100,100*(1-Math.exp(-(fold-1)/2))*0.6 + orr/70*40);
  const good=ap>=60;$("oApprov").className="verdict "+(good?"v-win":(ap>=40?"v-none":"v-lose"));
  $("oApprov").innerHTML="<b>Accelerated-approval readiness (heuristic): "+ap.toFixed(0)+"/100.</b> "+(good?"Strong single-arm case — large OS fold-improvement over a dismal benchmark plus solid ORR.":(ap>=40?"Plausible but benchmark-dependent; a randomized confirmatory trial likely needed.":"Weak — needs a bigger effect or higher ORR."));
  $("oFront").innerHTML="<b>Frontline (bigger market):</b> +SLS-009 lifts Aza/Ven mOS by <b>"+(fls-flb).toFixed(1)+" mo</b> ("+flb.toFixed(1)+"→"+fls.toFixed(1)+", control per <a href=\"https://www.nejm.org/doi/full/10.1056/NEJMoa2012971\" target=\"_blank\" rel=\"noopener\">VIALE-A</a>); in TP53-mut by <b>"+(tps-tpb).toFixed(1)+" mo</b> ("+tpb.toFixed(1)+"→"+tps.toFixed(1)+"). <span class=\"tag a\">Projections</span> — a randomized Phase 3 would test them.";
  drawExp("slsChart",[{med:os,c:getCSS('--gps'),lbl:"SLS-009 + AZA/VEN"},{med:bench,c:getCSS('--bat'),lbl:"historical benchmark"}],36);
  if(typeof renderBands2==="function")renderBands2();
  updateBestEstStrip();
}
const debouncedRenderSLS=debounce(renderSLS,75);
const debouncedBestEst=debounce(updateBestEstStrip,75);
function onSlsInput(){tabsDirty.sls009=true;debouncedBestEst();if(activeTab==="sls009")debouncedRenderSLS();}
["sls_os","sls_bench","sls_orr","fl_base","fl_sls","tp_base","tp_sls"].forEach(id=>$(id).addEventListener("input",onSlsInput));

// ================= TAB 3 : VALUATION =================
function fmtB(x){return x>=1000?'$'+(x/1000).toFixed(2)+'B':'$'+x.toFixed(0)+'M';}
function renderVal(){
  const cr2=+$("v_cr2").value,cr1=+$("v_cr1").value,gpen=+$("v_gpen").value/100,gprice=+$("v_gprice").value,gyears=+$("v_gyears").value;
  const flpool=+$("v_flpool").value,rrpool=+$("v_rrpool").value,spen=+$("v_spen").value/100,sprice=+$("v_sprice").value,syears=+$("v_syears").value;
  const platform=+$("v_platform").value,mult=+$("v_mult").value,shares=+$("v_shares").value;
  $("vv_cr2").textContent=cr2.toLocaleString();$("vv_cr1").textContent=cr1.toLocaleString();$("vv_gpen").textContent=(gpen*100).toFixed(0)+" %";$("vv_gprice").textContent="$"+gprice+" K";$("vv_gyears").textContent=gyears.toFixed(1)+" yr";
  $("vv_flpool").textContent=flpool.toLocaleString();$("vv_rrpool").textContent=rrpool.toLocaleString();$("vv_spen").textContent=(spen*100).toFixed(0)+" %";$("vv_sprice").textContent="$"+sprice+" K";$("vv_syears").textContent=syears.toFixed(1)+" yr";
  $("vv_platform").textContent="$"+platform.toFixed(1)+" B";$("vv_mult").textContent=mult.toFixed(1)+"×";$("vv_shares").textContent=shares+" M";
  const{gpool,gpsPeak,slsPeak,totPeak,EV,ps}=computeValuationMetrics();
  $("oGpsPeak").innerHTML=fmtB(gpsPeak);$("oSlsPeak").innerHTML=fmtB(slsPeak);$("oTotPeak").innerHTML=fmtB(totPeak);
  $("oPool").innerHTML=Math.round(gpool).toLocaleString();
  $("oEV").textContent=fmtB(EV);$("oPS").textContent="$"+ps.toFixed(2);
  const buyLo=(totPeak*Math.max(1,mult-1.5)+platform*1000)/shares, buyHi=(totPeak*(mult+1.5)+platform*1000)/shares;
  $("oBuy").textContent="$"+buyLo.toFixed(0)+"–$"+buyHi.toFixed(0)+"/sh";
  $("oValNote").innerHTML="Peak sales = new-starts × penetration × avg-years-on-therapy × price (<span class=\"tag m\">model output</span>). Longer survival ⇒ larger prevalent pool (see <b>TAM math</b> panel). EV = peak × "+mult.toFixed(1)+"× + $"+platform.toFixed(1)+"B WT1 platform. Multiple ~4–8× (<a href=\"https://www.sec.gov/Archives/edgar/data/882095/000110465920027988/a20-11253_1ex99d1.htm\" target=\"_blank\" rel=\"noopener\">Gilead–Forty Seven</a>; <a href=\"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=0001551152&amp;type=10-K\" target=\"_blank\" rel=\"noopener\">Venclexta ~$2.6B</a>). Onureg caution (<a href=\"https://www.nejm.org/doi/full/10.1056/NEJMoa2001094\" target=\"_blank\" rel=\"noopener\">QUAZAR</a>). Every input is an <span class=\"tag a\">assumption</span>; not a DCF or investment advice.";
  if(typeof renderBands2==="function")renderBands2();
  updateBestEstStrip();
}
const debouncedRenderVal=debounce(renderVal,75);
function onValInput(){tabsDirty.value=true;debouncedBestEst();if(activeTab==="value")debouncedRenderVal();}
["v_cr2","v_cr1","v_gpen","v_gprice","v_gyears","v_flpool","v_rrpool","v_spen","v_sprice","v_syears","v_platform","v_mult","v_shares"].forEach(id=>$(id).addEventListener("input",onValInput));
if($("v_riskadj"))$("v_riskadj").addEventListener("change",onValInput);
// ---- generic prior/implausible/anchor bands for Tab 2 & 3 sliders ----
const CFG2=[
 {id:"sls_os",min:4,max:16,sig:{b1:[7,11],b2:[5.5,13],b3:[4,15]},anchor:8.9,src:"SELLAS Dec-2024 PR / ASH 2025"},
 {id:"sls_bench",min:1.5,max:6,sig:{b1:[2,3.5],b2:[1.8,4.5],b3:[1.5,5.5]},imp:[4.5,6],anchor:2.5,src:"Zainaldin 2022 (~2.4m); Maiti 2021; Stahl 2021 upper bound ~6m"},
 {id:"sls_orr",min:20,max:70,sig:{b1:[40,58],b2:[30,65],b3:[20,70]},anchor:46,src:"SELLAS ASH 2024/2025 (46% all, 58% 1-prior)"},
 {id:"fl_base",min:10,max:20,sig:{b1:[13,16],b2:[12,17],b3:[10,20]},anchor:14.7,src:"VIALE-A, DiNardo NEJM 2020 (14.7m)"},
 {id:"fl_sls",min:14,max:30,sig:{b1:[18,24],b2:[15,27],b3:[14,30]},imp:[28,30],anchor:22,src:"SELLAS / Confident Web projection"},
 {id:"tp_base",min:3,max:8,sig:{b1:[4.5,6],b2:[3.5,7],b3:[3,8]},anchor:5.3,src:"VIALE-A TP53 subgroup (~5.3m)"},
 {id:"tp_sls",min:8,max:20,sig:{b1:[12,17],b2:[9,19],b3:[8,20]},anchor:15,src:"SELLAS / Confident Web projection"},
 {id:"v_cr2",min:1000,max:6000,sig:{b1:[2000,4000],b2:[1500,5000],b3:[1000,6000]},anchor:3000,src:"Confident Web est.; SEER AML incidence ~20.8K/yr"},
 {id:"v_cr1",min:2000,max:12000,sig:{b1:[4000,8000],b2:[3000,10000],b3:[2000,12000]},anchor:6000,src:"Confident Web est.; SEER/ACS; >60% relapse"},
 {id:"v_gpen",min:10,max:80,sig:{b1:[35,65],b2:[25,75],b3:[10,80]},imp:[70,80],src:"assumption (first-in-class maintenance)"},
 {id:"v_gprice",min:100,max:300,sig:{b1:[130,200],b2:[110,250],b3:[100,300]},imp:[250,300],src:"US orphan-oncology pricing comps"},
 {id:"v_gyears",min:1,max:5,sig:{b1:[2,4],b2:[1.5,4.5],b3:[1,5]},src:"derived from GPS survival (Tab 1)"},
 {id:"v_flpool",min:5000,max:15000,sig:{b1:[7000,12000],b2:[5000,14000],b3:[5000,15000]},src:"SEER-derived (unfit newly-dx AML)"},
 {id:"v_rrpool",min:2000,max:8000,sig:{b1:[3000,6000],b2:[2000,7000],b3:[2000,8000]},src:"SEER-derived; >60% relapse"},
 {id:"v_spen",min:10,max:70,sig:{b1:[25,55],b2:[15,65],b3:[10,70]},imp:[60,70],src:"assumption (add-on to SoC)"},
 {id:"v_sprice",min:100,max:300,sig:{b1:[130,200],b2:[110,250],b3:[100,300]},imp:[250,300],src:"US oncology pricing comps"},
 {id:"v_syears",min:0.7,max:3,sig:{b1:[1,2],b2:[0.8,2.5],b3:[0.7,3]},src:"derived (active-disease, shorter)"},
 {id:"v_platform",min:0,max:15,sig:{b1:[1,5],b2:[0,8],b3:[0,15]},imp:[10,15],src:"WT1 breadth — Cheever 2009 (NCI #1 antigen); early-stage"},
 {id:"v_mult",min:2,max:10,sig:{b1:[4,7],b2:[3,8],b3:[2,10]},imp:[8,10],src:"biotech oncology M&A convention (~4–8× peak sales)"},
 {id:"v_shares",min:200,max:260,sig:{b1:[215,228],b2:[210,235],b3:[200,260]},anchor:220,src:"SELLAS SEC filings (fully diluted ~217–225M)"}
];
function pctB(v,mn,mx){return Math.min(100,Math.max(0,(v-mn)/(mx-mn)*100));}
function buildBands2(){CFG2.forEach(c=>{const host=$("band2-"+c.id);if(!host)return;host.style.position="relative";host.style.height="12px";host.innerHTML="";
  const strip=document.createElement("div");strip.className="strip sigma";strip.style.top="1px";strip.title=c.src||"";
  const seg=(lohi,op)=>{const s=document.createElement("div");s.className="seg";s.style.left=pctB(lohi[0],c.min,c.max)+"%";s.style.width=(pctB(lohi[1],c.min,c.max)-pctB(lohi[0],c.min,c.max))+"%";s.style.background="rgba(47,111,237,"+op+")";return s;};
  strip.appendChild(seg(c.sig.b3,0.14));strip.appendChild(seg(c.sig.b2,0.28));strip.appendChild(seg(c.sig.b1,0.5));
  if(c.imp){const im=document.createElement("div");im.className="seg imp";im.title="Aggressive / hard to defend — "+(c.src||"");im.style.left=pctB(c.imp[0],c.min,c.max)+"%";im.style.width=(pctB(c.imp[1],c.min,c.max)-pctB(c.imp[0],c.min,c.max))+"%";strip.appendChild(im);}
  host.appendChild(strip);
  if(c.anchor!=null){const a=document.createElement("div");a.style.position="absolute";a.style.top="-3px";a.style.left="calc("+pctB(c.anchor,c.min,c.max)+"% - 4px)";a.style.fontSize="9px";a.style.color="#111";a.textContent="◆";a.title="reported/anchor value: "+c.anchor;host.appendChild(a);}
  const mk=document.createElement("div");mk.className="marker";mk.id="mk2-"+c.id;mk.style.height="12px";host.appendChild(mk);
});}
function renderBands2(){CFG2.forEach(c=>{const m=$("mk2-"+c.id);if(m)m.style.left="calc("+pctB(+$(c.id).value,c.min,c.max)+"% - 1px)";});}

// ---- Tab 2 / Tab 3 preset scenarios ----
const SLSP={
 best:{sls_os:8.9,sls_bench:2.8,sls_orr:46,fl_base:14.7,fl_sls:20,tp_base:5.3,tp_sls:13},
 obs: {sls_os:8.9,sls_bench:2.5,sls_orr:46,fl_base:14.7,fl_sls:22,tp_base:5.3,tp_sls:15},
 bear:{sls_os:6.5,sls_bench:3.5,sls_orr:35,fl_base:14.7,fl_sls:17,tp_base:5.3,tp_sls:10},
 bull:{sls_os:11, sls_bench:2.2,sls_orr:55,fl_base:14.7,fl_sls:24,tp_base:5.3,tp_sls:16}
};
document.querySelectorAll("button[data-sls]").forEach(b=>b.onclick=()=>{const name=b.dataset.sls;activeSlsPreset=name;const q=SLSP[name];for(const k in q)$(k).value=q[k];highlightPresets("button[data-sls]","sls",name);renderSLS();});
const VALP={
 best:{v_cr2:2800,v_cr1:5500,v_gpen:45,v_gprice:145,v_gyears:2.8,v_flpool:9000,v_rrpool:3500,v_spen:38,v_sprice:145,v_syears:1.4,v_platform:2.5,v_mult:5,v_shares:222},
 cons:{v_cr2:2000,v_cr1:4000,v_gpen:30,v_gprice:125,v_gyears:2.0,v_flpool:7000,v_rrpool:2800,v_spen:22,v_sprice:125,v_syears:1.0,v_platform:0.5,v_mult:4,v_shares:225},
 bull:{v_cr2:3800,v_cr1:7500,v_gpen:58,v_gprice:185,v_gyears:3.5,v_flpool:11000,v_rrpool:4500,v_spen:50,v_sprice:175,v_syears:1.8,v_platform:4,v_mult:6.5,v_shares:218},
 cw:  {v_cr2:3000,v_cr1:6000,v_gpen:58,v_gprice:165,v_gyears:3.2,v_flpool:11000,v_rrpool:4500,v_spen:45,v_sprice:165,v_syears:1.7,v_platform:4,v_mult:5.5,v_shares:220}
};
document.querySelectorAll("button[data-val]").forEach(b=>b.onclick=()=>{const name=b.dataset.val;activeValPreset=name;const q=VALP[name];for(const k in q)$(k).value=q[k];highlightPresets("button[data-val]","val",name);renderVal();});

// ---- generic histogram + samplers for Tab 2/3 Monte Carlo ----
function drawHist(hostId,vals,lo,hi,bin,thr,greenBelow){
  const n=vals.length;if(!n){$(hostId).innerHTML="";return;}
  const bins=[];for(let b=lo;b<hi-1e-9;b+=bin){let c=0;for(const v of vals)if(v>=b&&v<b+bin)c++;bins.push([b,100*c/n]);}
  const mx=Math.max.apply(null,bins.map(x=>x[1]).concat([1]));
  const s=vals.slice().sort((a,b)=>a-b);
  const qf=q=>s[Math.min(s.length-1,Math.floor(q*s.length))];
  const p5=qf(0.05),p50=qf(0.5),p95=qf(0.95);
  const span=hi-lo,mk=v=>Math.min(99,Math.max(0,(v-lo)/span*100));
  let h='<div class="mc-hist-wrap"><div class="mc-hist-bars" style="height:120px">';
  bins.forEach(bp=>{const b=bp[0],pc=bp[1];let col="var(--accent)";if(thr!=null)col=(((b+bin/2)<thr)===greenBelow)?"var(--good)":"var(--bad)";h+='<div title="'+b.toFixed(bin<1?2:0)+'–'+(b+bin).toFixed(bin<1?2:0)+': '+pc.toFixed(1)+'%" style="flex:1;height:'+(pc/mx*100).toFixed(1)+'%;background:'+col+';border-radius:2px 2px 0 0;min-height:'+(pc>0?2:0)+'px"></div>';});
  h+='</div>';
  if(n>10){
    h+='<div class="mc-hist-markers" style="height:120px">';
    h+='<div class="mc-hist-marker lo" style="left:'+mk(p5)+'%;height:120px" title="5th pct"></div>';
    h+='<div class="mc-hist-marker med" style="left:'+mk(p50)+'%;height:120px" title="median"></div>';
    h+='<div class="mc-hist-marker hi" style="left:'+mk(p95)+'%;height:120px" title="95th pct"></div>';
    h+='</div></div>';
  }else h+='</div>';
  const step=Math.max(1,Math.ceil(bins.length/8));
  h+='<div class="mc-hist-axis">';
  bins.forEach((bp,i)=>{h+='<div>'+((i%step===0)?bp[0].toFixed(bin<1?2:0):"")+'</div>';});
  h+='</div><div class="mc-hist-caption">5th '+p5.toFixed(bin<1?2:1)+' · median '+p50.toFixed(bin<1?2:1)+' · 95th '+p95.toFixed(bin<1?2:1)+'</div>';
  $(hostId).innerHTML=h;
}
function sd2(id){const c=CFG2.find(x=>x.id===id);return (c.sig.b1[1]-c.sig.b1[0])/2;}
function samp2(id){const c=CFG2.find(x=>x.id===id);return Math.max(c.min,Math.min(c.max,(+$(id).value)+sd2(id)*rn()));}
function qtl(a,q){const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*s.length))];}

function mcSLS(){
  const N=20000,flev=+$("sls_flev").value;$("v_slsflev").textContent=flev;
  let folds=[],flhrs=[],pwSum=0,big=0;
  for(let i=0;i<N;i++){
    const os=samp2("sls_os"),bench=samp2("sls_bench"),flb=samp2("fl_base"),fls=samp2("fl_sls");
    const fold=os/Math.max(0.5,bench);folds.push(fold);if(fold>=2)big++;
    const flhr=flb/Math.max(1,fls);flhrs.push(flhr);
    const z=-Math.log(flhr)*Math.sqrt(flev)/2;pwSum+=Phi(z-1.96);
  }
  const pFL=100*pwSum/N;
  $("mcSlsStatus").textContent=N.toLocaleString()+" draws";
  $("mcSlsStats").innerHTML="r/r: median OS fold <b>"+qtl(folds,.5).toFixed(1)+"×</b> (90% CrI "+qtl(folds,.05).toFixed(1)+"–"+qtl(folds,.95).toFixed(1)+"×), P(≥2× vs benchmark) <b>"+(100*big/N).toFixed(0)+"%</b> &nbsp;·&nbsp; frontline: median OS ratio <b>"+qtl(flhrs,.5).toFixed(2)+"</b>, <b style='color:"+(pFL>50?'var(--good)':'var(--bad)')+"'>P(Phase-3 significant) "+pFL.toFixed(0)+"%</b> <span style='color:var(--muted);font-size:11px'>(proxy from median ratio, not SAP log-rank)</span>";
  drawHist("mcSlsHist",flhrs,0.4,1.0,0.05,0.75,true);
}
$("mcSlsRun").addEventListener("click",function(){
  $("mcSlsStatus").textContent="running…";
  deferWithLoading(mcSLS,"Running Monte Carlo…");
});
$("sls_flev").addEventListener("input",function(){$("v_slsflev").textContent=$("sls_flev").value;});

function mcVal(){
  const N=20000,ra=$("v_riskadj").checked,pG=+$("v_pgps").value/100,pS=+$("v_psls").value/100;
  let evs=[],pss=[];
  for(let i=0;i<N;i++){
    const cr2=samp2("v_cr2"),cr1=samp2("v_cr1"),gpen=samp2("v_gpen")/100,gprice=samp2("v_gprice"),gyears=samp2("v_gyears");
    const flpool=samp2("v_flpool"),rrpool=samp2("v_rrpool"),spen=samp2("v_spen")/100,sprice=samp2("v_sprice"),syears=samp2("v_syears");
    const platform=samp2("v_platform"),mult=samp2("v_mult"),shares=samp2("v_shares");
    let gp=(cr2+cr1)*gpen*gyears*gprice/1000, sp=(flpool+rrpool)*spen*syears*sprice/1000;
    if(ra){gp*=pG;sp*=pS;}
    const EV=(gp+sp)*mult+platform*1000; evs.push(EV/1000); pss.push(EV/shares);
  }
  const over10=100*evs.filter(v=>v>10).length/N;
  $("mcValStatus").textContent=N.toLocaleString()+" draws"+(ra?" (risk-adjusted)":" (unadjusted)");
  $("mcValStats").innerHTML="median EV <b>$"+qtl(evs,.5).toFixed(1)+"B</b> (90% CrI $"+qtl(evs,.05).toFixed(1)+"–$"+qtl(evs,.95).toFixed(1)+"B) &nbsp;·&nbsp; median <b>$"+qtl(pss,.5).toFixed(0)+"/share</b> ($"+qtl(pss,.05).toFixed(0)+"–$"+qtl(pss,.95).toFixed(0)+") &nbsp;·&nbsp; P(EV &gt; $10B) <b>"+over10.toFixed(0)+"%</b>";
  const hi=Math.max(10,Math.min(70,Math.ceil(qtl(evs,.97)/5)*5));
  drawHist("mcValHist",evs,0,hi,hi/24,null,true);
}
$("mcValRun").addEventListener("click",function(){
  $("mcValStatus").textContent="running…";
  deferWithLoading(mcVal,"Running Monte Carlo…");
});
["v_pgps","v_psls"].forEach(id=>$(id).addEventListener("input",function(){$("v_vpgps").textContent=$("v_pgps").value+"%";$("v_vpsls").textContent=$("v_psls").value+"%";onValInput();}));

// ================= TAB 4 : EXPLAIN =================
var curLvl="eli5";
const EXPL={
 eli5:"<h3>The super-simple version</h3>"+
  "<p><b>GPS (the vaccine) — REGAL trial.</b> AML is a blood cancer that often comes back after treatment. GPS (galinpepimut-S) is like a training video for your body's immune soldiers, teaching them to spot a protein called WT1 on cancer cells. In the REGAL trial (<a href='https://clinicaltrials.gov/study/NCT04229979' target='_blank'>NCT04229979</a>), 127 patients were randomly split: half got GPS, half got the doctor's best usual care (watch-and-wait, chemo, or venetoclax). The trial ends when 80 patients have died — 78 so far (<a href='https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html' target='_blank'>May 2026 update</a>). SELLAS tells us the <i>total</i> deaths at three checkpoints (60, 72, 78) but keeps secret which group each person was in. That secrecy (blinding) keeps the test fair — but it also means we can only guess a <b>range</b> of how well GPS works, not one exact answer. What we <i>don't</i> know: how many deaths were in the GPS group vs the control group.</p>"+
  "<p><b>SLS-009 (the helper pill).</b> Sometimes cancer stops listening to venetoclax, a common AML drug. SLS-009 (tambiciclib) blocks CDK9 and is given with azacitidine + venetoclax in a small Phase 2 test (<a href='https://clinicaltrials.gov/study/NCT05309745' target='_blank'>NCT05309745</a>). At ASH 2025, the least-pretreated patients lived about <b>8.9 months</b> vs about <b>2.5–2.6 months</b> expected from old charts (<a href='https://doi.org/10.1080/10428194.2022.2113530' target='_blank'>Zainaldin 2022</a>). Response rate was 46%. But everyone got the drug — no random coin flip — so we compare to history, not a live control group. A bigger randomized frontline trial started enrolling in March 2026 (<a href='https://ir.sellaslifesciences.com/news/News-Details/2026/SELLAS-Life-Sciences-Announces-Enrollment-of-First-Patient-in-Newly-Diagnosed-First-Line-AML-Trial-of-SLS009/default.aspx' target='_blank'>SELLAS PR</a>).</p>"+
  "<p><b>How much is the company worth?</b> When a medicine helps people live longer, more patients are on it at the same time, so sales can grow. We estimate peak yearly sales and multiply by ~4–8× (what buyers often pay for cancer drugs) plus extra for the WT1 platform (GPS follow-on trials in ovarian cancer, mesothelioma — <a href='https://s203.q4cdn.com/139585304/files/doc_presentations/2026/Feb/03/Sellas-Corporate-Overview-February-2026.pdf' target='_blank'>SELLAS deck</a>). WT1 was ranked the #1 cancer antigen by NCI (<a href='https://pubmed.ncbi.nlm.nih.gov/19723653/' target='_blank'>Cheever 2009</a>). Venetoclax sold ~$2.6B in 2024 — proof an AML drug can be huge. Gilead paid ~$4.9B for Forty Seven's AML drug in 2020 (<a href='https://www.sec.gov/Archives/edgar/data/882095/000110465920027988/a20-11253_1ex99d1.htm' target='_blank'>SEC</a>), though that drug later failed. Onureg (maintenance AML like GPS) won its trial but didn't become a blockbuster. SELLAS had ~$107M cash in March 2026. Our numbers are guesses with big error bars, not a price target.</p>"+
  "<p><b>What we honestly don't know:</b> the arm-by-arm death split, the real hazard ratio, whether SLS-009 works in a randomized trial, and what a buyer would actually pay. Sources: SELLAS press releases, <a href='https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/' target='_blank'>trial design paper</a>, and doctor research — nothing invented here.</p>",
 ms:"<h3>A bit more detail (middle school)</h3>"+
  "<p><b>The GPS trial (REGAL).</b> 127 patients with AML in second remission (CR2) were randomly split 1:1 — one group gets GPS (a WT1 cancer vaccine), one gets 'best available therapy' (observation, azacitidine, venetoclax, or low-dose cytarabine). It's a fair coin flip, and doctors track overall survival from randomization. The trial is <b>event-driven</b>: it ends after 80 deaths (78 recorded as of May 2026). SELLAS shares the running total (<a href='https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html' target='_blank'>60 at interim</a>; <a href='https://www.globenewswire.com/news-release/2025/12/29/3210926/0/en/sellas-life-sciences-provides-update-on-pivotal-phase-3-regal-trial-of-galinpepimut-s-gps-in-acute-myeloid-leukemia-aml.html' target='_blank'>72 in Dec 2025</a>) but keeps <i>which group</i> each death belongs to secret. That blinding keeps the test honest. Because the split is hidden, our model tries thousands of possibilities and keeps only those matching 60 → 72 → 78.</p>"+
  "<p><b>The key number — hazard ratio (HR).</b> HR compares death rates between groups. HR 0.5 means GPS patients die at half the rate. REGAL 'wins' if HR &lt; 0.636 at 80 deaths (<a href='https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/' target='_blank'>design paper</a>). At 60 deaths, a safety committee (IDMC) looked at unblinded data and said 'keep going' — they did <i>not</i> stop early for success, which means GPS wasn't spectacularly better at that point (HR was above ~0.55).</p>"+
  "<p><b>SLS-009.</b> Selective CDK9 inhibitor (tambiciclib) for post-venetoclax r/r AML-MR. Open-label single-arm Phase 2 + Aza/Ven (<a href='https://clinicaltrials.gov/study/NCT05309745' target='_blank'>NCT05309745</a>): ORR 46% (58% with 1 prior line), CR/CRi 29%, mOS 8.9 mo vs ~2.5 mo historical (<a href='https://ir.sellaslifesciences.com/news/News-Details/2025/SELLAS-Life-Sciences-Presents-Positive-Phase-2-Data-of-SLS009-in-Combination-with-AZAVEN-in-RelapsedRefractory-AML-MR-at-ASH-2025/default.aspx' target='_blank'>ASH 2025</a>; benchmark <a href='https://doi.org/10.1080/10428194.2022.2113530' target='_blank'>Zainaldin 2022</a>). FDA guided a frontline expansion; first patient enrolled Mar 2026. No randomized control in r/r — promising but not proven like REGAL.</p>"+
  "<p><b>Money / valuation.</b> Company value ≈ peak yearly drug sales × a multiple (about 4–8× for oncology) + extra for the WT1 platform (GPS in AML plus follow-on trials in ovarian cancer and mesothelioma — <a href='https://s203.q4cdn.com/139585304/files/doc_presentations/2026/Feb/03/Sellas-Corporate-Overview-February-2026.pdf' target='_blank'>corp deck</a>). WT1 is the #1-ranked cancer antigen (<a href='https://pubmed.ncbi.nlm.nih.gov/19723653/' target='_blank'>Cheever 2009</a>). Venetoclax (Venclexta) sold ~$2.6B in 2024 — proof an AML combo can be huge. But Onureg (oral azacitidine maintenance, a similar setting) had modest uptake despite winning QUAZAR (mOS 24.7 vs 14.8 mo) — a cautionary tale. Comparables like Gilead–Forty Seven (~$4.9B, <a href='https://www.gilead.com/news/news-details/2020/gilead-to-acquire-forty-seven-for-49-billion' target='_blank'>2020</a>) show buyers pay big for pre-approval AML assets — and sometimes lose it all when Ph3 fails. SELLAS had ~$107M cash (Mar 2026) and ~196M shares. Community DD uses ~3K CR2 + ~6K CR1 new patients/yr from SEER — estimates, not gospel.</p>"+
  "<p><b>Honest limits:</b> we cannot know the arm-level death split, the true HR, or peak sales until the trial unblinds and (for SLS-009) a Phase 3 runs. Sources linked in Tabs 1–3.</p>",
 hs:"<h3>High-school level</h3>"+
  "<p><b>Survival curves &amp; the hazard ratio.</b> Doctors plot survival curves — the fraction of each group still alive over time. <b>Median</b> OS is when half have died. The <b>hazard ratio (HR)</b> compares instantaneous death rates: HR 0.5 means GPS patients die at half the control rate. REGAL's primary endpoint is ITT overall survival; the trial wins if stratified log-rank HR &lt; 0.636 at 80 events (one-sided α=0.025). Design: <a href='https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/' target='_blank'>Jamy &amp; Cicic, Future Oncol 2025</a>; registry: <a href='https://clinicaltrials.gov/study/NCT04229979' target='_blank'>NCT04229979</a>.</p>"+
  "<p><b>The identifiability catch.</b> SELLAS reports <i>pooled</i> death totals (60 at month ~46, 72 at ~58, 78 at ~63) but not the arm split. A pooled count tells you about the <i>average</i> of both groups — many different GPS-vs-control scenarios produce the same totals. Example: strong GPS benefit and a unusually healthy control arm both fit 78 pooled deaths. That's why we report a <b>distribution</b>, not a point HR, using Monte Carlo simulation weighted by how well each scenario matches the announced counts.</p>"+
  "<p><b>Direct parameterization vs anchor-constrained inversion.</b> <b>Direct parameterization</b> (default): you set BAT/GPS survival parameters and the model checks whether they reproduce the blinded counts. <b>Anchor-constrained inversion</b>: flip the direction — anchor the event counts and set GPS cure fraction as the main assumption; the inverse solver <i>derives</i> implied BAT median, GPS uncured mOS, and HR. Cure fraction drives; medians fall out. Same identifiability limits apply — assigning the long tail to GPS is structural, not proven. (<a href='https://www.reddit.com/r/ValueInvesting/comments/1ri8rrb/sls_deepest_due_diligence_for_regal_trial_from_a/' target='_blank' rel='noopener'>CW Part 1</a> · <a href='https://www.reddit.com/r/sellaslifesciences/comments/1tnh66g/why_the_randomization_window_leads_to_an/' target='_blank' rel='noopener'>IRM tables</a> · <a href='https://www.reddit.com/r/pennystocks/comments/1h8v0zv/critique_of_confident_webs_sls_dd/' target='_blank' rel='noopener'>critique</a>.)</p>"+
  "<p><b>Interim analysis &amp; what it implies.</b> At 60 deaths (Jan 2025), the IDMC reviewed unblinded data and recommended continuation (<a href='https://ir.sellaslifesciences.com/news/News-Details/2025/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia/default.aspx' target='_blank'>SELLAS PR</a>). Under O'Brien-Fleming spending, early efficacy stop required HR ≲ 0.55 — they didn't stop, capping how low the interim HR could have been. They also passed futility (GPS wasn't hopeless). Neither proves final success: 0.636 at 80 events is only ~50% power per Schoenfeld — the bar to <i>detect</i> a benefit, not the expected effect size (~0.48 for 90% power).</p>"+
  "<p><b>Historical context for control (BAT).</b> CR2 transplant-ineligible patients historically had poor outcomes: Kurosawa et al. (<a href='https://haematologica.org/article/view/5781' target='_blank'>Haematologica 2010</a>) found 3-year OS ~14% without transplant. Venetoclax-era salvage medians are ~8–12 months (<a href='https://pubmed.ncbi.nlm.nih.gov/33661271/' target='_blank'>Stahl, Blood Adv 2021</a>). REGAL's blinded pooled survival looks much better than design assumed (~10 months), per SELLAS's Nov 2022 update — but that doesn't tell us GPS beat control.</p>"+
  "<p><b>SLS-009.</b> Tambiciclib (CDK9i) in open-label single-arm Ph2 + Aza/Ven, post-Ven r/r AML-MR (<a href='https://ashpublications.org/blood/article/146/Supplement%201/3423/552036/' target='_blank'>ASH 2025</a>; <a href='https://www.sec.gov/Archives/edgar/data/1390478/000139047826000004/sls-202603198xkexhibit991.htm' target='_blank'>SEC 8-K</a>): n=35 evaluable, ORR 46% (58% 1-prior-line, mOS NR), mOS 8.9 vs ~2.5–2.6 historical (<a href='https://doi.org/10.1080/10428194.2022.2113530' target='_blank'>Zainaldin 2022</a>). ASXL1/TP53 ORR 48%/57% — subset, not validated. Frontline: randomized ~80-pt Ph2 vs VIALE-A anchor (mOS 14.7, HR 0.66, <a href='https://pubmed.ncbi.nlm.nih.gov/32023337/' target='_blank'>DiNardo 2020</a>). Single-arm vs historical confounded by selection/immortal time; literature benchmark spans 1.7–6.1 mo (<a href='https://pubmed.ncbi.nlm.nih.gov/33661271/' target='_blank'>Stahl 2021</a>).</p>"+
  "<p><b>Valuation.</b> Peak revenue ≈ (new patients/yr × market share × years on therapy) × price. AML incidence ~20,800/yr (<a href='https://seer.cancer.gov/statfacts/html/amyl.html' target='_blank'>SEER</a>). GPS pools ~3K CR2 + ~6K CR1/yr are community estimates from SEER funnel math. EV ≈ peak sales × 4–8× + WT1 platform value (Cheever 2009: WT1 #1 antigen), risk-adjusted by P(approval). Venclexta (~$2.6B) is the upside comp; Onureg (QUAZAR: mOS 24.7 vs 14.8 mo, <a href='https://www.onuregpro.com/efficacy' target='_blank'>QUAZAR AML-001</a>) had modest uptake — BMS doesn't break out sales. Gilead–Forty Seven ~$4.9B pre-approval comp later failed Ph3. Cash ~$107M (Mar 2026); shares ~196M.</p>"+
  "<p><b>What remains unknown:</b> arm-level event counts, censoring rates, in-trial BAT median, final HR/p-value, SLS-009 randomized effect, and acquirer willingness-to-pay.</p>",
 col:"<h3>College level</h3>"+
  "<p><b>REGAL design &amp; estimand.</b> Phase 3, open-label, 1:1 randomized, event-driven OS trial (N=127 actual; ~63/arm), AML CR2/CRp2, transplant-ineligible at entry (<a href='https://clinicaltrials.gov/study/NCT04229979' target='_blank'>NCT04229979</a>). Primary: ITT OS, stratified unweighted Cox/log-rank at 80 deaths; win if HR &lt; 0.636 (one-sided α=0.025). One interim at 60 deaths under Lan-DeMets O'Brien-Fleming α-spending (<a href='https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/' target='_blank'>Jamy &amp; Cicic 2025</a>). BAT options: observation, HMA, venetoclax, LDAC — physician's choice. GPS: up to 15 injections over ~18 months.</p>"+
  "<p><b>Non-identifiability from blinded pooled counts.</b> Public data: N_D(t) at t ∈ {m46, m58, m63, m65} plus interim continuation. N_D = f(½(S_GPS + S_BAT)) — the map (S_GPS, S_BAT) ↦ N_D is many-to-one. Arm-level HR is not identifiable without the split or strong structural assumptions. Ridge pathology: mixture-cure GPS (Boag 1949) vs heterogeneous BAT long-tail (Weibull + plateau) can fit identical pooled event trajectories — Bayes factors collapse toward 1 because the data lack discriminating power along that ridge. Any point HR estimate imports priors; we report an approximate-Bayesian posterior (ABC: Beaumont et al. 2002). Tab 1 offers two directions: <b>direct parameterization</b> (set curves → check events) and <b>anchor-constrained inversion</b> (anchor events + GPS cure fraction → derive implied mOS/HR).</p>"+
  "<p><b>Monte Carlo / likelihood.</b> Sample survival priors (GPS: delayed mixture-cure; BAT: Weibull + long-survivor fraction; ITT transplant crossover ~6% per arm; censoring ~12%), simulate enrollment (back-loaded S-curve: 105 pts by Nov 2023, N=127 by Apr 2024), weight each draw by Poisson likelihood on event increments (60, +12, +6, P(Δ≤1 at m65)). Soft-weight interim continuation: P(continue) = Φ(z_eff − θ_IA) − Φ(z_fut − θ_IA); score win via conditional power with Brownian correlation ρ = √(60/80) (Jennison &amp; Turnbull 2000).</p>"+
  "<p><b>Interim inference &amp; power arithmetic.</b> OBF interim Z ≈ 2.34 ⇒ early-stop HR ≲ 0.55; IDMC continued (Jan 2025, <a href='https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html' target='_blank'>PR</a>). Schoenfeld: D = (z_α + z_β)² / [r(1−r)(ln HR)²] — 90% power at HR 0.636 needs ~205 events; at 80 events, 0.636 is the ~50%-power MDE, not the design alternative (~HR 0.48 for 90%). Lead-time bias: ≤6-mo CR2→randomization + &gt;6-mo life-expectancy entry inflates from-randomization medians ~1–3 mo vs from-CR2 literature (Suissa 2008, immortal time) — shifts absolute medians, not HR under proportional hazards.</p>"+
  "<p><b>Control-arm priors &amp; tension.</b> Kurosawa (<a href='https://pmc.ncbi.nlm.nih.gov/articles/PMC3011608/' target='_blank'>Haematologica 2010</a>): 158 CR2 transplant-ineligible, 3-yr OS 14% (19% intermediate). QUAZAR placebo mOS 14.8 mo (<a href='https://www.onuregpro.com/efficacy' target='_blank'>CR1, healthier population</a>) caps implausible BAT medians. Fitting 60/72/78 while respecting no early stop tends to push BAT long-tail fraction upward — tension with biology unless interim was non-binding or enrolled cohort is favorable. Nov 2022 blinded update: pooled mOS ~2× design assumption (<a href='https://www.globenewswire.com/news-release/2022/11/14/2554907/0/en/SELLAS-Life-Sciences-Announces-Update-on-Phase-3-REGAL-Clinical-Trial-Evaluating-Lead-Asset-Galinpepimut-S-in-Acute-Myeloid-Leukemia.html' target='_blank'>PR</a>) — corroborates high pooled survival, not GPS efficacy.</p>"+
  "<p><b>SLS-009.</b> Tambiciclib (GFH009), selective CDK9i licensed from GenFleet. Single-arm Ph2 + Aza/Ven, post-Ven r/r AML-MR (<a href='https://www.sec.gov/Archives/edgar/data/1390478/000139047826000004/sls-202603198xkexhibit991.htm' target='_blank'>SEC 8-K</a>): n=35 evaluable, ORR 46% (CR/CRi/MLFS), 29% CR/CRi; 1-prior-line ORR 58%, mOS NR; least-pretreated mOS 8.9 vs ~2.6 expected. ASXL1/TP53 responses 48%/57%. Frontline expansion dosed (80-pt trial). Model includes hypothetical Ph3 vs Aza/Ven (VIALE-A: mOS 14.7 mo, HR 0.66). Single-arm historical comparison lacks randomization — selection bias and temporal confounding are real limits.</p>"+
  "<p><b>Valuation framework.</b> Steady-state treated prevalence = annual starts × penetration × mean duration on therapy; peak revenue = prevalence × net price. EV = Σ(peak × multiple) + risk-adjusted WT1 platform (GPS follow-ons in ovarian/mesothelioma per <a href='https://s203.q4cdn.com/139585304/files/doc_presentations/2026/Feb/03/Sellas-Corporate-Overview-February-2026.pdf' target='_blank'>corp deck</a>); multiples 4–8× peak (oncology convention). Risk-adjust by P(approval) from Tabs 1–2 (default P(GPS)≈65%, P(SLS)≈55% — user priors). Comps: Venclexta ~$2.6B ('24); Gilead–Forty Seven ~$4.9B for magrolimab pre-approval (<a href='https://www.sec.gov/Archives/edgar/data/1667633/000110465920043980/a20-14980_68k.htm' target='_blank'>SEC</a>, Ph3 discontinued 2023); Onureg modest uptake despite QUAZAR win (sales bundled in BMS SEC). TAM pools (CR2 ~3K, CR1 ~6K/yr) are CW community estimates. SELLAS: $107.1M cash Mar 2026, ~181M shares, ATM $150M unused. Buyout EV ≠ realized peak.</p>"+
  "<p><b>Known unknowns:</b> % censored, differential dropout, actual in-trial BAT mix (Ven uptake post-2020), binding vs non-binding interim test, arm-level 78-death split, final p-value. Model outputs are scenarios, not forecasts.</p>",
 pro:"<h3>Professional (biotech / buy-side)</h3>"+
  "<p><b>REGAL — trial architecture.</b> Event-driven ITT OS, N=127, 1:1, 80-death final (78 as of 11 May 2026 per <a href='https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html' target='_blank'>Q1 2026 PR</a>), one IA at 60 deaths under Lan-DeMets OBF (<a href='https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/' target='_blank'>Jamy &amp; Cicic 2025</a>: <i>'A Lan-DeMets alpha spending function of O'Brien-Fleming type will be used…'</i>). Primary: stratified unweighted Cox/log-rank, α=0.025 one-sided, HR&lt;0.636 to win (final Z≈2.01). Schoenfeld check: 0.636 is ~50%-power MDE at 80 events; ~90%-power alternative ≈ HR 0.48. Open-label BAT (observation/HMA/Ven/LDAC) — physician's choice confounds cross-arm BAT homogeneity but is ITT-consistent.</p>"+
  "<p><b>Why posterior, not point estimate.</b> 60/72/78 are blinded pooled events ⇒ arm split non-identifiable. ABC posterior: sample priors on GPS (delayed mixture-cure, Phase 2 CR2 mOS 16.3 mo [<a href='https://pubmed.ncbi.nlm.nih.gov/?term=Brayer+WT1+vaccination+AML+MDS+pilot+synthetic+analog+peptides' target='_blank'>Brayer 2015</a>, n=10, no plateau] vs CR1 ~47% 3-yr plateau), BAT (Weibull k + long-tail; Kurosawa 3-yr OS 14% [<a href='https://pmc.ncbi.nlm.nih.gov/articles/PMC3011608/' target='_blank'>Haematologica 2010</a>]; ven-era salvage 8–12m [<a href='https://pubmed.ncbi.nlm.nih.gov/33661271/' target='_blank'>Stahl 2021</a>]), ITT transplant tail (~6%/arm), censoring (~12%). Weight by Poisson likelihood on increments (60, +12, +6, P(Δ≤1)). Interim: soft-weight P(continue); score via conditional power with ρ=√(t_IA/t_F) — power-neutral, banks early wins vs crude hard cliff. Significance: stratified log-rank U/√V with optional FH(0,1) late-effect weighting (penalizes delayed GPS separation under NPH).</p>"+
  "<p><b>Posterior &amp; sensitivity.</b> Neutral priors → median HR ~0.57, P(win) ~50% (binding interim) to ~78% (non-binding). Biological BAT-tail ceiling (Kurosawa) nudges toward win, but event-fit + lead-time selection push BAT tail up — strong-favorite coin, not lock. Independent pooled-survival corroboration: Nov 2022 PR (<i>'approximately two-fold longer than originally anticipated'</i>). Critique thread (uhdisj41): BF inflated vs no-cure null; along GPS-cure ↔ BAT-heterogeneity ridge, BF→1 — honest. Interim non-crossing (OBF Z_eff≈2.34) truncates ultra-low-HR mass. 66 treatment discontinuations (Mar 2024) are relapse-driven, not OS censoring (<a href='https://www.globenewswire.com/news-release/2024/04/29/2871141/0/en/SELLAS-Life-Sciences-Announces-Positive-Recommendation-of-Independent-Data-Monitoring-Committee-Following-Completion-of-Enrollment-in-REGAL-Phase-3-Study.html' target='_blank'>enrollment PR</a>).</p>"+
  "<p><b>SLS-009 — clinical &amp; commercial.</b> Selective CDK9i (tambiciclib/GFH009, GenFleet license). Single-arm Ph2 + Aza/Ven, post-Ven r/r AML-MR (<a href='https://ir.sellaslifesciences.com/news/News-Details/2025/SELLAS-Life-Sciences-Presents-Positive-Phase-2-Data-of-SLS009-in-Combination-with-AZAVEN-in-RelapsedRefractory-AML-MR-at-ASH-2025/default.aspx' target='_blank'>ASH 2025</a>; <a href='https://www.sec.gov/Archives/edgar/data/1390478/000139047826000004/sls-202603198xkexhibit991.htm' target='_blank'>SEC 8-K</a>): ORR 46–58% by line, mOS 8.9 vs ~2.6 historical (least pretreated), ASXL1/TP53 activity. Frontline 80-pt Ph2 initiated. Value driver: hypothetical Ph3 vs Aza/Ven (VIALE-A mOS 14.7, HR 0.66 [<a href='https://pubmed.ncbi.nlm.nih.gov/32023337/' target='_blank'>DiNardo, NEJM 2020</a>]). r/r signal ≠ randomized win — model it separately. P(approval) and peak-sales assumptions are user-adjustable priors.</p>"+
  "<p><b>Valuation — comps &amp; caveats.</b> Prevalence model: starts × penetration × duration → peak × price. EV = Σ peak × multiple (4–8× onc convention) + risk-adjusted WT1 platform (Cheever 2009 [<a href='https://pubmed.ncbi.nlm.nih.gov/19723653/' target='_blank'>PubMed</a>]; GPS ovarian/meso follow-ons per <a href='https://s203.q4cdn.com/139585304/files/doc_presentations/2026/Feb/03/Sellas-Corporate-Overview-February-2026.pdf' target='_blank'>corp deck</a>). Comps: Venclexta ~$2.6B '24; Gilead–Forty Seven ~$4.9B magrolimab (<a href='https://www.sec.gov/Archives/edgar/data/882095/000110465920027988/a20-11253_1ex99d1.htm' target='_blank'>SEC</a>, Ph3 discontinued 2023); Onureg QUAZAR-positive but BMS bundles revenue (~$1.6B Other Growth group, no Onureg breakout). Regor ~$850M CDK deal cited in community as early M&amp;A anchor. P(GPS)/P(SLS) MC defaults are user priors from Tabs 1–2. Cash $107M Mar 2026; dilution 90M→181M shares YoY. TAM splits are DD estimates — stress-test in Tab 3 panels.</p>"+
  "<p><b>Positioning summary.</b> REGAL: real benefit more likely than not on event pace, but magnitude unidentifiable pre-unblind; near-threshold HR (~0.45–0.64) most plausible, not 0.13–0.35. SLS-009: compelling single-arm signal, needs Ph3. Valuation: wide CrI by design — not a price target.</p>",
 phd:"<h3>PhD — no sugar</h3>"+
  "<p><b>Estimand &amp; identifiability.</b> Target: arm-specific S_j(t), j∈{GPS,BAT}, and stratified-Cox HR at the 80-event analysis (ITT OS from randomization, death from any cause). Public sufficient statistics: pooled event counts N_D(t), t∈{m46,m58,m63,m65}, plus IA continuation at D_IA=60. N_D(t)=Σ_j π_j ∫ h_j(u)S_j(u)du — a functional of ½(S_GPS+S_BAT) under 1:1 randomization. The map (S_GPS,S_BAT)↦{N_D(t_k)} is many-to-one: identical pooled trajectories arise from (i) true GPS benefit + standard BAT, (ii) null effect + inflated BAT heterogeneity/long-tail, (iii) GPS cure fraction + delayed separation + favorable BAT mix. Arm-level HR is <b>non-identified</b> without the split or binding structural constraints. Any scalar HR report imports priors; we emit a posterior over HR under declared generative models.</p>"+
  "<p><b>Likelihood, ABC, &amp; interim.</b> Event increments modeled Poisson: ΔD_k ~ Pois(λ_k), λ_k = E[ΔN_D] from simulated enrollment × arm-specific survival; m65 term uses P(ΔD≤1) for the &lt;80 constraint. Weight ∝ ∏_k Pois(ΔD_k|λ_k) — approximate Bayesian computation (Beaumont et al., <i>Genetics</i> 2002). IA continuation factor: w_cont = Φ(z_eff−θ_IA)−Φ(z_fut−θ_IA) with z_eff≈2.34 (OBF, Lan-DeMets 1983), z_fut≈0.4 (mild futility). Conditional power for 'win': CP = ∫_{z_fut}^{z_eff} φ(z−θ_IA) Φ((θ_80+ρ(z−θ_IA)−z_final)/√(1−ρ²)) dz / P(continue), ρ=√(D_IA/D_F) — canonical GS Brownian correlation of sequential log-rank scores (Jennison-Turnbull 2000; Proschan-Hunsberger 1995). Log-rank drift θ = (Σw(O−E))/√(Σw²V) · √η_strat; w=1 (LR) or (1−Ŝ_pool) for FH(0,1) (Fleming-Harrington 1991) — NPH-aware.</p>"+
  "<p><b>Bayes-factor / ridge critique — correct and important.</b> Large BFs require a discriminating alternative. Against a no-cure null, cure-structured GPS models inflate BF — but blinded pooled counts cannot discriminate GPS mixture-cure from BAT Weibull+plateau along the <b>identifiability ridge</b>: both reproduce 60/72/78 with comparable Poisson weights ⇒ marginal BF→1. Assigning the durable stratum to GPS is a modeling choice, not an empirical identification. Schoenfeld power: 90% at HR 0.636 requires ~205 events; at 80 events, HR 0.636 is the ~50%-power detection threshold — interpreting 0.636 as the 'expected effect' is a category error. IA non-crossing (θ_IA below z_eff) truncates ultra-low-HR posterior mass (observed IA HR ≳ 0.55 under PH). Whether the IA efficacy boundary was <b>binding</b> (hypothesis test at IA) vs <b>non-binding</b> (informational only) materially shifts P(win): ~50% vs ~78% under our priors — the SAP binding status is not fully public.</p>"+
  "<p><b>Generative-model tensions.</b> (1) Lead-time/left-truncation: ≤6-mo CR2→rand + &gt;6-mo life-expectancy entry (Suissa 2008, AJE) inflates from-randomization medians ~1–3 mo vs from-CR2 literature — HR-invariant under PH but shifts absolute BAT/GPS medians and event timing. (2) BAT-tail biology: Kurosawa (<a href='https://pmc.ncbi.nlm.nih.gov/articles/PMC3011608/' target='_blank'>Haematologica 2010</a>) 3-yr OS 14% (CR2 transplant-ineligible) vs event-fit pushing fitted BAT plateau ≥18–24% — unresolved tension unless IA non-binding, favorable enrollment, or transplant crossover (~6%/arm, ITT). (3) Censoring: model assumes ~12% LTFU; actual % not disclosed — optimistic bias if censoring is informative or differential. (4) Open-label BAT: post-2020 Ven availability in control arm may improve BAT relative to Kurosawa-era priors — confounds external benchmarks, not internal HR if ITT maintained.</p>"+
  "<p><b>Posterior summary &amp; calibration.</b> Neutral priors: median HR≈0.57, P(win)≈0.50 (binding IA) / ≈0.78 (non-binding). ~⅔ of posterior mass folds biological BAT-tail ceiling — consistent with independent critique (~P(win)≈0.66), below bullish DD (≥0.9). Topline HR most plausibly ~0.45–0.64 (near final OBF threshold), not 0.13–0.35 — IA cap + event pace + BAT-tail ridge. RMST (Uno 2014) would be more robust than HR under NPH/delayed GPS effect; we offer FH weighting as partial mitigation.</p>"+
  "<p><b>SLS-009 — evidence grade.</b> Open-label single-arm Ph2 + Aza/Ven, post-Ven r/r AML-MR (<a href='https://www.sec.gov/Archives/edgar/data/1390478/000139047826000004/sls-202603198xkexhibit991.htm' target='_blank'>SEC 8-K</a>; <a href='https://ashpublications.org/blood/article/146/Supplement%201/3423/552036/' target='_blank'>ASH 2025</a>): ORR 46%, CR/CRi 29%, mOS 8.9 mo (least pretreated) vs external benchmark ~2.4–2.6 mo (<a href='https://doi.org/10.1080/10428194.2022.2113530' target='_blank'>Zainaldin 2022</a>) — large apparent effect but confounded by selection, immortal time, and historical-control drift (Stahl-like salvage cohorts ~6 mo mOS). ASXL1/TP53 subset ORRs hypothesis-generating. Frontline randomized Ph2 (~80 pts US + IMPACT-AML EU) enrolling (<a href='https://ir.sellaslifesciences.com/news/News-Details/2026/SELLAS-Life-Sciences-Announces-Enrollment-of-First-Patient-in-Newly-Diagnosed-First-Line-AML-Trial-of-SLS009/default.aspx' target='_blank'>Mar 2026</a>); commercial option value modeled vs VIALE-A (mOS 14.7, HR 0.66). Tab 2 MC frontline power uses Schoenfeld Z at user-set event count — not a disclosed SAP. r/r single-arm signal ≠ P(registrational success).</p>"+
  "<p><b>Valuation — epistemic limits.</b> EV = Σ risk-adjusted(peak_j × multiple_j) + WT1 platform lump. Peak = (incidence × penetration × duration) × price — each input is a prior. WT1 platform slider captures GPS follow-on optionality (ovarian Ph2 completed, mesothelioma, GPS-Plus, China license per <a href='https://s203.q4cdn.com/139585304/files/doc_presentations/2026/Feb/03/Sellas-Corporate-Overview-February-2026.pdf' target='_blank'>corp deck</a>) beyond modeled AML peaks; SLS-009 is CDK9, not WT1. Multiples 4–8× are convention. Comps: Venclexta ~$2.6B (realized); Gilead–Forty Seven ~$4.9B pre-approval magrolimab — failed Ph3 (ENHANCE 2023); Onureg/QUAZAR (HR 0.69, mOS 24.7 vs 14.8) with undisclosed peak sales bounds maintenance TAM optimism. MC P(approval) defaults (65%/55%) import REGAL posterior + Ph2 stage — not NPV-discounted DCF. TAM (CR2 ~3K/yr) is community DD. Cash $107.1M Mar 2026; fully diluted ~222M modeled; ATM $150M unused. CIC severance amendments ≠ disclosed M&amp;A.</p>"+
  "<p><b>Primary refs:</b> Cox 1972; Schoenfeld 1981/83; O'Brien &amp; Fleming 1979; Lan &amp; DeMets 1983; Fleming-Harrington 1991; Jennison-Turnbull 2000; Uno 2014 (RMST); Boag 1949 (cure); Suissa 2008 (lead-time); Kurosawa 2010; DiNardo 2020 (VIALE-A); Beaumont 2002 (ABC). Full citation lists in Tabs 1–3 References.</p>"
};
function showLevel(l){curLvl=l;tabsRendered.explain=true;document.querySelectorAll(".lvlb").forEach(b=>b.classList.toggle("active",b.dataset.lvl===l));$("explbody").innerHTML=EXPL[l]||"";}
document.querySelectorAll(".lvlb").forEach(b=>b.onclick=()=>showLevel(b.dataset.lvl));
