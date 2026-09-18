#!/usr/bin/env node
import {
  REGAL_PRESETS, LEGACY_REGAL_PRESETS, ELN_PRESETS, ELN_UNCERTAINTY, REGAL_UNCERTAINTY
} from "../js/data/model-config.js";
import { paramsFromPreset, withElnRuntime } from "../js/ui/state.js";
import { truncatedNormal, weightedQuantile } from "../js/math/stats.js";
import {
  eventsAt, lpois, statusLogLikelihood, analyzeLR, hazardRatio, t80Quantile,
  interimContribution, consistent, fmtCalMonth, T4
} from "../js/math/survival.js";

function randomFactory(seed){
  let state=seed>>>0;
  const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
  const normal=()=>{let u=0,v=0;while(!u)u=random();while(!v)v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  return{random,normal};
}
function cliNumber(flag,fallback){
  const i=process.argv.indexOf(flag),value=i>=0?Number(process.argv[i+1]):NaN;
  return Number.isFinite(value)?value:fallback;
}
const REPORT_DRAWS=Math.max(50,Math.floor(cliNumber("--draws",350)));
const REPORT_SEED=Math.floor(cliNumber("--seed",0x51A5EED))>>>0;
const draw=(mu,u,r)=>truncatedNormal(mu,u.sd,u.lo,u.hi,r.normal,r.random);
function runtimeElnToInputs(p){
  return{
    mixFav:p.elnMix.fav*100,mixInt:p.elnMix.int*100,mixAdv:p.elnMix.adv*100,
    batMosFav:p.elnBatMos.fav,batMosInt:p.elnBatMos.int,batMosAdv:p.elnBatMos.adv,
    bat3Fav:p.elnBat3.fav*100,bat3Int:p.elnBat3.int*100,bat3Adv:p.elnBat3.adv*100,
    gpsDurFav:p.elnGpsDurable.fav*100,gpsDurInt:p.elnGpsDurable.int*100,gpsDurAdv:p.elnGpsDurable.adv*100,
    gpsNonDurableGain:p.gpsNonDurableGain,batXtx:p.batXtx*100,gpsXtx:p.gpsXtx*100,
    benefitModel:p.benefitModel
  };
}
function sampleParams(center,r){
  let p={...center};
  for(const field of ["delay","cens","mid","k"]){const u=REGAL_UNCERTAINTY[field];p[field]=draw(center[field],u,r);}
  if(center.modelFamily==="eln"){
    const e=runtimeElnToInputs(center);
    for(const [field,u] of Object.entries(ELN_UNCERTAINTY))e[field]=draw(e[field],u,r);
    p=withElnRuntime(p,e);
  }else{
    for(const field of ["bat","batc","gpsc","gpsu","xtx"]){const u=REGAL_UNCERTAINTY[field];p[field]=draw(center[field],u,r);}
  }
  return p;
}
function weightedFraction(rows,pred){let w=0,x=0;for(const row of rows){w+=row.w;if(pred(row))x+=row.w;}return w?x/w:NaN;}
function run(label,center,{draws=350,seed=0x51A5EED,binding=true}={}){
  const r=randomFactory(seed),rows=[];
  for(let i=0;i<draws;i++){
    const p=sampleParams(center,r);
    const e46=eventsAt(46,p,60),e58=eventsAt(58,p,60),e63=eventsAt(63,p,60);
    const logL=lpois(60,e46)+lpois(12,Math.max(0,e58-e46))+lpois(6,Math.max(0,e63-e58))+statusLogLikelihood(p,60);
    const likelihood=Math.exp(logL);if(!(likelihood>0))continue;
    const t80=t80Quantile(p,r.random(),T4,60,12),ia=analyzeLR(46,p),fin=analyzeLR(t80,p);
    if(!Number.isFinite(fin.hr))continue;
    const contribution=interimContribution(binding,likelihood,ia.z,fin.z,80,p.zfut);
    rows.push({hr:fin.hr,t80,w:contribution.w,pw:contribution.pw,fit:consistent(p,60)});
  }
  let W=0,WP=0;for(const row of rows){W+=row.w;WP+=row.w*row.pw;}
  rows.sort((a,b)=>a.hr-b.hr);
  const tRows=[...rows].sort((a,b)=>a.t80-b.t80);
  const pointT=t80Quantile(center,.5,T4,110,20),point=analyzeLR(pointT,center);
  const pointAnchors={m46:eventsAt(46,center,110),m58:eventsAt(58,center,110),m63:eventsAt(63,center,110)};
  return{
    label,model:center.modelFamily,pointHR:point.hr,pointZ:point.z,pointT80:pointT,
    pointAnchors,
    anchorFit:Math.abs(pointAnchors.m46-60)<=4&&Math.abs(pointAnchors.m58-72)<=3&&Math.abs(pointAnchors.m63-78)<=3,
    augustStatusCompatible:Math.exp(statusLogLikelihood(center,110))>=0.05,
    pSignificant:WP/W,pFailure:1-WP/W,
    hr:[weightedQuantile(rows,"hr",.05),weightedQuantile(rows,"hr",.5),weightedQuantile(rows,"hr",.95)],
    t80:[weightedQuantile(tRows,"t80",.05),weightedQuantile(tRows,"t80",.5),weightedQuantile(tRows,"t80",.95)],
    reachBy:{
      [fmtCalMonth(67)]:weightedFraction(rows,x=>x.t80<=67),
      [fmtCalMonth(68)]:weightedFraction(rows,x=>x.t80<=68),
      [fmtCalMonth(72)]:weightedFraction(rows,x=>x.t80<=72)
    },
    strictFitWeight:weightedFraction(rows,x=>x.fit),usable:rows.length,draws
  };
}

const best=paramsFromPreset("best",REGAL_PRESETS.best,"forward");
const leaky=withElnRuntime({...best}, {...ELN_PRESETS.best,benefitModel:"leaky",gpsNonDurableGain:1.25});
const moderate=paramsFromPreset("moderate",REGAL_PRESETS.moderate,"forward");
const critique=paramsFromPreset("critique",REGAL_PRESETS.critique,"forward");
const bear=paramsFromPreset("bear",REGAL_PRESETS.bear,"forward");
const legacy=paramsFromPreset("best",LEGACY_REGAL_PRESETS.best,"forward");
const results=[
  run("ELN central · durable-only",best,{draws:REPORT_DRAWS,seed:REPORT_SEED}),
  run("ELN central · 1.25× leaky non-durable benefit",leaky,{draws:REPORT_DRAWS,seed:REPORT_SEED+1}),
  run("ELN moderate",moderate,{draws:REPORT_DRAWS,seed:REPORT_SEED+2}),
  run("ELN critique",critique,{draws:REPORT_DRAWS,seed:REPORT_SEED+3}),
  run("ELN bear",bear,{draws:REPORT_DRAWS,seed:REPORT_SEED+4}),
  run("Legacy pooled best sensitivity",legacy,{draws:REPORT_DRAWS,seed:REPORT_SEED+5})
];
console.log(JSON.stringify({
  generated:new Date().toISOString(),
  method:`${REPORT_DRAWS} deterministic prior draws (seed ${REPORT_SEED}); Poisson pseudo-likelihood; 90% model intervals; continuation-conditioned`,
  results
},null,2));
