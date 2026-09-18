import test from "node:test";
import assert from "node:assert/strict";
import {
  elnRiskBase, sBAT, sGPS, eventsAt, analyzeLR, hazardRatio, T80, t80Analysis, ZFINAL
} from "../js/math/survival.js";
import {
  REGAL_PRESETS, LEGACY_REGAL_PRESETS, ELN_PRESETS, ELN_UNCERTAINTY, DEFAULT_ELN
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
