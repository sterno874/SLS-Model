import test from "node:test";
import assert from "node:assert/strict";
import {
  elnRiskBase, sBAT, sGPS, eventsAt, analyzeLR, hazardRatio, T80, t80Analysis, ZFINAL,
  armStatus
} from "../js/math/survival.js";
import {
  REGAL_PRESETS, LEGACY_REGAL_PRESETS, ELN_PRESETS, ELN_UNCERTAINTY, REGAL_UNCERTAINTY,
  DEFAULT_ELN
} from "../js/data/model-config.js";
import {
  paramsFromPreset, normalizeElnMix, buildShareHash, decodeShareHash, DEFAULT_STATE
} from "../js/ui/state.js";

test("ELN mixtures normalize continuously and remain bounded",()=>{
  const m=normalizeElnMix(23,52,25);
  assert.ok(Math.abs(m.fav+m.int+m.adv-1)<1e-12);
  assert.deepEqual(normalizeElnMix(-2,0,0),{fav:0,int:0,adv:0});
  const shifted=normalizeElnMix(24,52,25);
  assert.ok(shifted.fav>m.fav&&shifted.int<m.int);
});

test("ELN subgroup baseline honors median and 3-year inputs",()=>{
  assert.ok(Math.abs(elnRiskBase(20,20,.33)-.5)<1e-12);
  assert.ok(Math.abs(elnRiskBase(36,20,.33)-.33)<1e-12);
});

test("default ELN benefit is durable-only and leaky mode improves non-durable tail",()=>{
  const p=paramsFromPreset("best",REGAL_PRESETS.best,"forward");
  assert.equal(p.benefitModel,"durable");
  const leaky={...p,benefitModel:"leaky",gpsNonDurableGain:1.4};
  assert.ok(sGPS(24,leaky)>sGPS(24,p));
  assert.equal(sBAT(24,leaky),sBAT(24,p));
});

test("ELN no-effect case yields HR one with matched arm HCT",()=>{
  const p=paramsFromPreset("noeffect",REGAL_PRESETS.noeffect,"forward");
  assert.ok(Math.abs(hazardRatio(58,p)-1)<1e-10);
});

test("events and score share the same event kernel",()=>{
  const p=paramsFromPreset("best",REGAL_PRESETS.best,"forward");
  for(const t of [46,58,63])assert.ok(Math.abs(eventsAt(t,p)-analyzeLR(t,p).events)<1e-9);
});

test("golden: central ELN marginal-arm readout HR and Z",()=>{
  const p=paramsFromPreset("best",REGAL_PRESETS.best,"forward");
  const t=T80(p),a=analyzeLR(t,p);
  assert.ok(Math.abs(t-68.032976)<0.001);
  assert.ok(Math.abs(a.hr-0.503593)<0.0001);
  assert.ok(Math.abs(a.z-3.090388)<0.0001);
});

test("central WCLFU is evidence-bounded and distinct from survival status",()=>{
  assert.equal(REGAL_PRESETS.best.cens,10);
  assert.equal(DEFAULT_ELN.gpsDurFav,74);
  assert.equal(DEFAULT_ELN.gpsDurInt,51);
  assert.equal(DEFAULT_ELN.batXtx,DEFAULT_ELN.gpsXtx);
  assert.deepEqual(
    [REGAL_UNCERTAINTY.cens.lo,REGAL_UNCERTAINTY.cens.hi,REGAL_UNCERTAINTY.cens.sd],
    [.02,.15,.03]
  );
  const p=paramsFromPreset("best",REGAL_PRESETS.best,"forward");
  for(const fn of [sBAT,sGPS]){
    const status=armStatus(T80(p),p,fn);
    assert.ok(status.alive>status.administrativelyCensored);
    assert.ok(status.ltfuCensored>0);
    assert.ok(Math.abs(status.withoutObservedDeath-status.administrativelyCensored-status.ltfuCensored)<1e-9);
    assert.ok(Math.abs(status.enrolled-status.observedDeaths-status.withoutObservedDeath)<1e-9);
  }
});

test("ELN relabeling cannot change a fixed pair of marginal arm curves",()=>{
  const p=paramsFromPreset("best",REGAL_PRESETS.best,"forward");
  const swapFavInt=o=>({fav:o.int,int:o.fav,adv:o.adv});
  const relabeled={
    ...p,
    elnMix:swapFavInt(p.elnMix),
    elnBatMos:swapFavInt(p.elnBatMos),
    elnBat3:swapFavInt(p.elnBat3),
    elnGpsDurable:swapFavInt(p.elnGpsDurable)
  };
  for(const t of [6,12,24,36,58]){
    assert.ok(Math.abs(sBAT(t,p)-sBAT(t,relabeled))<1e-12);
    assert.ok(Math.abs(sGPS(t,p)-sGPS(t,relabeled))<1e-12);
  }
  const a=analyzeLR(68,p),b=analyzeLR(68,relabeled);
  assert.ok(Math.abs(a.hr-b.hr)<1e-12);
  assert.ok(Math.abs(a.z-b.z)<1e-12);
});

test("ELN mix affects the score only through changed marginal curves",()=>{
  const p=paramsFromPreset("best",REGAL_PRESETS.best,"forward");
  const shifted={...p,elnMix:{fav:.60,int:.25,adv:.15}};
  assert.notEqual(sBAT(36,p).toFixed(8),sBAT(36,shifted).toFixed(8));
  assert.notEqual(sGPS(36,p).toFixed(8),sGPS(36,shifted).toFixed(8));
  assert.notEqual(analyzeLR(68,p).hr.toFixed(8),analyzeLR(68,shifted).hr.toFixed(8));
});

test("final significance is eventual and endpoint reach remains separate",()=>{
  const p=paramsFromPreset("best",REGAL_PRESETS.best,"forward");
  const cutoff=66,a=t80Analysis(p,cutoff);
  assert.equal(a.Tan,a.t80);
  assert.equal(a.Dan,80);
  assert.equal(a.reached,a.t80<=cutoff);
  assert.equal(analyzeLR(a.Tan,p).z>ZFINAL,analyzeLR(T80(p),p).z>ZFINAL);
});

test("uncertain ELN fields are source-aware assumption ranges",()=>{
  for(const [field,u] of Object.entries(ELN_UNCERTAINTY)){
    assert.equal(u.kind,"assumption_range",field);
    assert.ok(u.lo<u.hi&&u.sd>0&&u.source);
  }
});

test("new shares restore ELN custom state while old links restore pooled",()=>{
  const state=structuredClone(DEFAULT_STATE);
  state.activeRegalPreset=null;
  state.gps={...state.gps,...DEFAULT_ELN,mixFav:31,mixInt:44,mixAdv:25,modelFamily:"eln"};
  const restored=decodeShareHash(buildShareHash(state));
  assert.equal(restored.activeRegalPreset,null);
  assert.equal(restored.gps.modelFamily,"eln");
  assert.equal(restored.gps.mixFav,31);
  const old=decodeShareHash("#s1=e30"); // {}
  assert.equal(old.gps.modelFamily,"pooled");
});

test("legacy family remains explicit and separate",()=>{
  const legacy=paramsFromPreset("best",LEGACY_REGAL_PRESETS.best,"forward");
  const eln=paramsFromPreset("best",REGAL_PRESETS.best,"forward");
  assert.equal(legacy.modelFamily,"pooled");
  assert.equal(eln.modelFamily,"eln");
  assert.notEqual(sGPS(36,legacy).toFixed(5),sGPS(36,eln).toFixed(5));
  assert.deepEqual(Object.keys(ELN_PRESETS),Object.keys(REGAL_PRESETS));
});
