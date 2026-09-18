/** Canonical model inputs. Keep this module DOM-free so the UI, worker, scripts,
 * and tests all consume exactly the same presets and evidence metadata. */

export const ASSET_VERSION = "20260918-ltfu-recalibration";

export const TRIAL = Object.freeze({
  randomized: 126,
  perArm: 63,
  enrolledReported2024: 127,
  enrollmentEndMonth: 38,
  eventMonths: Object.freeze({ interim: 46, december2025: 58, may2026: 63, august2026: 66 }),
  eventCounts: Object.freeze({ interim: 60, december2025: 72, may2026: 78 }),
  finalEvents: 80,
  finalAlphaOneSided: 0.025,
  designHr: 0.636
});

export const REGAL_PRESETS = Object.freeze({
  best: { bat: 13, batc: 0, gpsc: 42, gpsu: 42.5, delay: 3, mid: 28, k: 0.15, auto: false, xtx: 0, cens: 10, mcFloor: true, irm_lead: 3 },
  bind: { bat: 13, batc: 0, gpsc: 42, gpsu: 42.5, delay: 3, mid: 28, k: 0.15, auto: false, xtx: 0, cens: 10, mcFloor: true, irm_lead: 3 },
  nonbind: { bat: 13, batc: 0, gpsc: 42, gpsu: 42.5, delay: 3, mid: 28, k: 0.15, auto: false, xtx: 0, cens: 10, mcFloor: false, irm_lead: 3 },
  moderate: { bat: 11, batc: 13, gpsc: 28, gpsu: 34, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true, irm_lead: 3 },
  critique: { bat: 10.5, batc: 12, gpsc: 18, gpsu: 30.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 6, cens: 18, mcFloor: true, irm_lead: 3 },
  bull: { bat: 10, batc: 1, gpsc: 40, gpsu: 38, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false, irm_lead: 3 },
  bear: { bat: 10, batc: 16, gpsc: 14, gpsu: 29, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 18, mcFloor: true, irm_lead: 3 },
  cw: { bat: 10.5, batc: 1, gpsc: 41, gpsu: 35.5, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false, irm_lead: 3 },
  capbreach: { bat: 10.5, batc: 21, gpsc: 12, gpsu: 25.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 15, mcFloor: true, irm_lead: 3 },
  noeffect: { bat: 14, batc: 28, gpsc: 28, gpsu: 14, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true, irm_lead: 3 },
  vdm: { bat: 16.8, batc: 0, batk: 1.16, gpsc: 0, gpsu: 16.3, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true, irm_lead: 0 },
  vdmfit: { bat: 16.8, batc: 0, batk: 1.16, gpsc: 61, gpsu: 6.5, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true, irm_lead: 0 }
});

/** Frozen homogeneous family used only for legacy sensitivity/regression. */
export const LEGACY_REGAL_PRESETS = Object.freeze(Object.fromEntries(
  Object.entries(REGAL_PRESETS).filter(([name])=>name!=="bind"&&name!=="nonbind").map(([name,preset])=>[
    name,
    Object.freeze({
      ...preset,
      ...(name==="best"||name==="bind"||name==="nonbind"?{mid:25,cens:0}:{}),
      modelFamily:"pooled"
    })
  ])
));

export const INVERSE_PRESETS = Object.freeze({
  cw42: { gpsc: 42, batcap: 14, delay: 3, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: false },
  cw35: { gpsc: 35, batcap: 14, delay: 2, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: false },
  cw50: { gpsc: 50, batcap: 14, delay: 4, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: false },
  cwbind: { gpsc: 42, batcap: 14, delay: 3, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: true }
});

export const SLS_PRESETS = Object.freeze({
  best: { sls_os: 8.9, sls_bench: 4.0, sls_orr: 46, fl_base: 14.7, fl_sls: 20, tp_base: 5.3, tp_sls: 13 },
  obs: { sls_os: 8.9, sls_bench: 2.5, sls_orr: 46, fl_base: 14.7, fl_sls: 22, tp_base: 5.3, tp_sls: 15 },
  bear: { sls_os: 6.5, sls_bench: 6.0, sls_orr: 35, fl_base: 14.7, fl_sls: 17, tp_base: 5.3, tp_sls: 10 },
  bull: { sls_os: 11, sls_bench: 2.2, sls_orr: 55, fl_base: 14.7, fl_sls: 24, tp_base: 5.3, tp_sls: 16 }
});

export const VALUATION_PRESETS = Object.freeze({
  best: { v_cr2: 2800, v_cr1: 5500, v_gpen: 45, v_gprice: 145, v_gyears: 2.8, v_flpool: 9000, v_rrpool: 3500, v_spen: 38, v_sprice: 145, v_syears: 1.4, v_platform: 2.5, v_mult: 5, v_shares: 217.6, v_cash: 138.3 },
  cons: { v_cr2: 2000, v_cr1: 4000, v_gpen: 30, v_gprice: 125, v_gyears: 2.0, v_flpool: 7000, v_rrpool: 2800, v_spen: 22, v_sprice: 125, v_syears: 1.0, v_platform: 0.5, v_mult: 4, v_shares: 220, v_cash: 138.3 },
  bull: { v_cr2: 3800, v_cr1: 7500, v_gpen: 58, v_gprice: 185, v_gyears: 3.5, v_flpool: 11000, v_rrpool: 4500, v_spen: 50, v_sprice: 175, v_syears: 1.8, v_platform: 4, v_mult: 6.5, v_shares: 214, v_cash: 138.3 },
  cw: { v_cr2: 3000, v_cr1: 6000, v_gpen: 58, v_gprice: 165, v_gyears: 3.2, v_flpool: 11000, v_rrpool: 4500, v_spen: 45, v_sprice: 165, v_syears: 1.7, v_platform: 4, v_mult: 5.5, v_shares: 217.6, v_cash: 138.3 }
});

export const DEFAULT_ELN = Object.freeze({
  mixFav: 23, mixInt: 52, mixAdv: 25,
  batMosFav: 20, batMosInt: 16, batMosAdv: 12,
  bat3Fav: 33, bat3Int: 20, bat3Adv: 4,
  gpsDurFav: 74, gpsDurInt: 51, gpsDurAdv: 0,
  gpsNonDurableGain: 1,
  gpsXtx: 12, batXtx: 12,
  benefitModel: "durable"
});

const eln = (overrides) => Object.freeze({ ...DEFAULT_ELN, ...overrides });
export const ELN_PRESETS = Object.freeze({
  best: eln({}),
  bind: eln({}),
  nonbind: eln({}),
  moderate: eln({ gpsDurFav: 50, gpsDurInt: 30, gpsDurAdv: 0 }),
  critique: eln({ gpsDurFav: 38, gpsDurInt: 19, gpsDurAdv: 0 }),
  bull: eln({ gpsDurFav: 70, gpsDurInt: 52, gpsDurAdv: 2, gpsNonDurableGain: 1.15, benefitModel: "leaky" }),
  bear: eln({ bat3Fav: 30, bat3Int: 16.4, bat3Adv: 6.6, gpsDurFav: 25, gpsDurInt: 10, gpsDurAdv: 0 }),
  cw: eln({ gpsDurFav: 66, gpsDurInt: 44, gpsDurAdv: 0, benefitModel: "durable" }),
  capbreach: eln({ batMosFav: 22, batMosInt: 18, batMosAdv: 14, gpsDurFav: 25, gpsDurInt: 10 }),
  noeffect: eln({ gpsDurFav: 0, gpsDurInt: 0, gpsDurAdv: 0, gpsXtx: 12 }),
  vdm: eln({ batMosFav: 20.2, batMosInt: 16.8, batMosAdv: 14, gpsDurFav: 0, gpsDurInt: 0, gpsDurAdv: 0 }),
  vdmfit: eln({ batMosFav: 20.2, batMosInt: 16.8, batMosAdv: 14, gpsDurFav: 80, gpsDurInt: 55, gpsDurAdv: 8 })
});

/** These are model-input distributions, not confidence intervals. */
export const ELN_UNCERTAINTY = Object.freeze({
  mixFav: { kind: "assumption_range", lo: 15, hi: 32, sd: 4.5, source: "Community ELN-mix sensitivity" },
  mixInt: { kind: "assumption_range", lo: 42, hi: 62, sd: 5, source: "Community ELN-mix sensitivity" },
  mixAdv: { kind: "assumption_range", lo: 16, hi: 35, sd: 4.5, source: "Community ELN-mix sensitivity" },
  batMosFav: { kind: "assumption_range", lo: 16, hi: 25, sd: 2.3, source: "ELN-explicit model assumption" },
  batMosInt: { kind: "assumption_range", lo: 13.5, hi: 20.2, sd: 1.7, source: "VDM/community sensitivity; clock uncertain" },
  batMosAdv: { kind: "assumption_range", lo: 9, hi: 16, sd: 1.8, source: "VDM/community sensitivity; clock uncertain" },
  bat3Fav: { kind: "assumption_range", lo: 25, hi: 42, sd: 4.3, source: "Community/clinical sensitivity" },
  bat3Int: { kind: "assumption_range", lo: 14, hi: 25, sd: 2.8, source: "Community/clinical sensitivity" },
  bat3Adv: { kind: "assumption_range", lo: 1, hi: 9, sd: 2, source: "Community/clinical sensitivity" },
  gpsDurFav: { kind: "assumption_range", lo: 25, hi: 75, sd: 12.5, source: "GPS durable-response allocation assumption" },
  gpsDurInt: { kind: "assumption_range", lo: 8, hi: 55, sd: 11.8, source: "GPS durable-response allocation assumption" },
  gpsDurAdv: { kind: "assumption_range", lo: 0, hi: 8, sd: 2, source: "Conservative adverse-risk durable-response assumption" },
  gpsNonDurableGain: { kind: "assumption_range", lo: 1, hi: 1.5, sd: 0.12, source: "Non-durable GPS benefit sensitivity" }
});

export const REGAL_UNCERTAINTY = Object.freeze({
  bat: { kind:"assumption_range",lo:6,hi:20,sd:2,source:"Legacy pooled BAT sensitivity" },
  batc: { kind:"assumption_range",lo:0,hi:.30,sd:.025,source:"Legacy pooled BAT-tail sensitivity" },
  gpsc: { kind:"assumption_range",lo:0,hi:.75,sd:.15,source:"Legacy pooled GPS durable-fraction sensitivity" },
  gpsu: { kind:"assumption_range",lo:6,hi:55,sd:13.5,source:"Legacy pooled GPS residual-median sensitivity" },
  delay: { kind:"assumption_range",lo:0,hi:6,sd:1.5,source:"GPS onset sensitivity" },
  xtx: { kind:"assumption_range",lo:0,hi:.25,sd:.04,source:"Legacy common-HCT sensitivity" },
  cens: { kind:"assumption_range",lo:.02,hi:.15,sd:.03,source:"Independent OS WCLFU by month 36; conservative range around oncology final-analysis benchmarks, not administrative censoring or treatment discontinuation" },
  mid: { kind:"assumption_range",lo:15,hi:35,sd:3.5,source:"Aggregate enrollment-curve sensitivity" },
  k: { kind:"assumption_range",lo:.08,hi:.30,sd:.04,source:"Aggregate enrollment-shape sensitivity" }
});

export const MODEL_INTERVAL_LEVEL=0.90;

export const REPORTED_INTERVALS = Object.freeze({
  vdmBatMos: { kind: "published_ci", level: 0.95, point: 16.8, lo: 12.3, hi: 27.4, source: "Private correspondence reported by u/neo2551; unverified" },
  vdmBat3: { kind: "published_ci", level: 0.95, point: 18.6, lo: 10.7, hi: 32.2, source: "Private correspondence reported by u/neo2551; unverified" }
});

export const FACTS = Object.freeze({
  cashM: 138.3,
  basicSharesM: 201.9,
  fullyDilutedSharesM: 217.6,
  atmStressSharesM: 241.6
});
