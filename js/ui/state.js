import { ZFUT, inverseSolve, passesVerdict, isBiologicallyPlausible, hrGaugeState } from "../math/survival.js";
import {
  REGAL_PRESETS,
  INVERSE_PRESETS,
  SLS_PRESETS,
  VALUATION_PRESETS,
  ELN_PRESETS,
  DEFAULT_ELN,
  FACTS
} from "../data/model-config.js";

export const VALID_TABS = ["gps", "sls009", "value", "explain", "statistics", "biology"];
export const EXPLAIN_LEVELS = ["eli5", "ms", "hs", "col", "pro", "phd"];
export const REQUIRED_PRESET_KEYS = ["bat", "batc", "gpsc", "gpsu", "delay", "mid", "k"];
export const REQUIRED_INV_KEYS = ["gpsc", "batcap"];

export function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin =
    typeof atob !== "undefined"
      ? atob(str)
      : Buffer.from(str, "base64").toString("binary");
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ===================== SHARE LINK ENCODING (v1 delta) =====================
// Share links encode ONLY the values that differ from a preset-aware baseline.
// Default / preset scenarios collapse to a tiny (often empty) payload, so the
// URL stays short enough to paste into a text/chat. Round-trips are exact
// because encode and decode derive the baseline from the same tables here.

/** Canonical default state — mirrors the initial slider `value=` attributes in
 *  index.html plus the module defaults in js/main.js. */
export const SHARE_SCHEMA_VERSION = 4;
export const DEFAULT_STATE = {
  v: SHARE_SCHEMA_VERSION,
  tab: "gps",
  regalMode: "forward",
  activeRegalPreset: "best",
  activeInvPreset: "cw42",
  activeSlsPreset: "best",
  activeValPreset: "best",
  embed: false,
  gps: {
    bat: 13, batc: 0, batk: 1, gpsc: 42, gpsu: 42.5, delay: 3, xtx: 0,
    cens: 10, mid: 28, k: 0.15, batcap: 14, autofit: false, fhTest: false,
    zfut: 0.4, mcFloor: true, assumeStatus: true, cutoff: 72,
    modelFamily: "eln", ...DEFAULT_ELN
  },
  sls: {
    sls_os: 8.9, sls_bench: 4.0, sls_orr: 46, fl_base: 14.7, fl_sls: 20,
    tp_base: 5.3, tp_sls: 13, sls_flev: 250
  },
  val: {
    v_cr2: 2800, v_cr1: 5500, v_gpen: 45, v_gprice: 145, v_gyears: 2.8,
    v_flpool: 9000, v_rrpool: 3500, v_spen: 38, v_sprice: 145, v_syears: 1.4,
    v_platform: 2.5, v_mult: 5, v_shares: 217.6, v_cash: 138.3, v_riskadj: true,
    v_pgps: 65, v_psls: 55
  },
  ui: { showUncertainty: false, irm_lead: 3, bf_e58: 72, bf_cure: 42, explainLvl: "eli5" }
};

// Preset tables — kept in sync with js/main.js (P/INV/SLSP/VALP). Used only to
// build the encode/decode baseline; drift only lengthens links, never corrupts
// them (both sides use these same tables).
export const SHARE_P = REGAL_PRESETS;
export const MASTER_SWEEP_EDGE = { bat: 10.2, batc: 20, gpsc: 12, gpsu: 25.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 17 };
export const MASTER_SWEEP_STOPS = [
  { at: 0, label: "Constrained bear", q: MASTER_SWEEP_EDGE },
  { at: 25, label: "Critique", preset: "critique" },
  { at: 50, label: "Moderate", preset: "moderate" },
  { at: 75, label: "Biology-first", preset: "best" },
  { at: 100, label: "Bull", preset: "bull" }
];
export function masterSweepScenario(value, presets = SHARE_P) {
  const v = Math.max(0, Math.min(100, Number(value)));
  const resolved = MASTER_SWEEP_STOPS.map((stop) => ({
    ...stop,
    q: stop.q || presets[stop.preset]
  }));
  let hi = resolved.findIndex((point) => point.at >= v);
  if (hi <= 0) return { ...resolved[0].q };
  if (hi < 0) hi = resolved.length - 1;
  const a = resolved[hi - 1], b = resolved[hi];
  const t = (v - a.at) / (b.at - a.at), q = {};
  for (const key of new Set([...Object.keys(a.q), ...Object.keys(b.q)])) {
    const av = a.q[key], bv = b.q[key];
    q[key] = typeof av === "number" && typeof bv === "number"
      ? av + (bv - av) * t
      : (t < 0.5 ? av : bv);
  }
  return q;
}

/**
 * Move the master sweep relative to the model that was active when dragging
 * began. This makes the control reversible (returning to anchorValue returns
 * the exact baseline) and avoids replacing custom ELN assumptions with preset
 * defaults.
 */
export function masterSweepFromBaseline(
  value,
  anchorValue,
  baseline,
  presets = SHARE_P,
  elnPresets = ELN_PRESETS
) {
  const at = Math.max(0, Math.min(100, Number(anchorValue)));
  const to = Math.max(0, Math.min(100, Number(value)));
  const q0 = masterSweepScenario(at, presets);
  const q1 = masterSweepScenario(to, presets);
  const out = {
    modelFamily: baseline.modelFamily,
    q: { ...baseline.q },
    eln: { ...baseline.eln }
  };
  for (const key of new Set([...Object.keys(q0), ...Object.keys(q1)])) {
    if (typeof q0[key] === "number" && typeof q1[key] === "number") {
      out.q[key] = (+baseline.q[key] || 0) + q1[key] - q0[key];
    }
  }
  if (baseline.modelFamily === "eln") {
    const e0 = masterSweepElnScenario(at, elnPresets);
    const e1 = masterSweepElnScenario(to, elnPresets);
    for (const key of new Set([...Object.keys(e0), ...Object.keys(e1)])) {
      if (typeof e0[key] === "number" && typeof e1[key] === "number") {
        out.eln[key] = (+baseline.eln[key] || 0) + e1[key] - e0[key];
      }
    }
    // Benefit-model selection is an explicit user choice, not a sweep axis.
    out.eln.benefitModel = baseline.eln.benefitModel;
  }
  return out;
}

export function masterSweepElnScenario(value, elnPresets = ELN_PRESETS) {
  const v = Math.max(0, Math.min(100, Number(value)));
  const stops = [
    { at: 0, e: elnPresets.bear },
    { at: 25, e: elnPresets.critique },
    { at: 50, e: elnPresets.moderate },
    { at: 75, e: elnPresets.best },
    { at: 100, e: elnPresets.bull }
  ];
  let hi = stops.findIndex((point) => point.at >= v);
  if (hi <= 0) return { ...stops[0].e };
  if (hi < 0) hi = stops.length - 1;
  const a = stops[hi - 1], b = stops[hi];
  const t = (v - a.at) / (b.at - a.at), out = {};
  for (const key of new Set([...Object.keys(a.e), ...Object.keys(b.e)])) {
    const av = a.e[key], bv = b.e[key];
    out[key] = typeof av === "number" && typeof bv === "number"
      ? av + (bv - av) * t
      : (t < 0.5 ? av : bv);
  }
  return out;
}
export const SHARE_INV = INVERSE_PRESETS;
export const SHARE_SLSP = SLS_PRESETS;
export const SHARE_VALP = VALUATION_PRESETS;

/** Q2 2026 cash & equivalents ($M) — Jun 30 2026 PR / 10-Q. */
export const DEFAULT_CASH_M = FACTS.cashM;
/** Basic shares outstanding (M) — Aug 10 2026 10-Q cover. */
export const BASIC_SHARES_M = FACTS.basicSharesM;
/** Fully diluted modeled (M): basic + outstanding warrants/options/RSUs. */
export const FD_SHARES_M = FACTS.fullyDilutedSharesM;
/** ATM stress (M): 217.6M FD + full $150M ATM at ~$6.25/sh. */
export const ATM_SHARES_M = FACTS.atmStressSharesM;

/** UX subtitle when share slider differs from FD anchor — EV unchanged, $/sh scales ÷ shares. */
export function formatShareDilutionSubtitle(sharesM, refSharesM = FD_SHARES_M, refLabel = "217.6M FD") {
  if (!Number.isFinite(sharesM) || !Number.isFinite(refSharesM) || refSharesM <= 0) return "";
  if (Math.abs(sharesM - refSharesM) < 0.05) return "";
  const sharePct = (sharesM / refSharesM - 1) * 100;
  const perShPct = (refSharesM / sharesM - 1) * 100;
  const shareSign = sharePct >= 0 ? "+" : "−";
  const psSign = perShPct >= 0 ? "+" : "−";
  return `${shareSign}${Math.abs(sharePct).toFixed(0)}% vs ${refLabel} · ${psSign}${Math.abs(perShPct).toFixed(0)}% $/sh · EV unchanged`;
}

// [shortCode, group("" = top-level marker), fieldName]
export const SHARE_FIELD_DEFS = [
  ["t", "", "tab"], ["m", "", "regalMode"], ["rp", "", "activeRegalPreset"],
  ["ip", "", "activeInvPreset"], ["sp", "", "activeSlsPreset"], ["vp", "", "activeValPreset"],
  ["e", "", "embed"],
  ["ba", "gps", "bat"], ["bc", "gps", "batc"], ["bk", "gps", "batk"], ["gc", "gps", "gpsc"],
  ["gu", "gps", "gpsu"], ["dl", "gps", "delay"], ["xt", "gps", "xtx"], ["ce", "gps", "cens"],
  ["md", "gps", "mid"], ["kk", "gps", "k"], ["bp", "gps", "batcap"], ["af", "gps", "autofit"],
  ["fh", "gps", "fhTest"], ["zf", "gps", "zfut"], ["mf", "gps", "mcFloor"], ["as", "gps", "assumeStatus"],
  ["co", "gps", "cutoff"], ["fm", "gps", "modelFamily"],
  ["ef", "gps", "mixFav"], ["ei", "gps", "mixInt"], ["ea", "gps", "mixAdv"],
  ["mfv", "gps", "batMosFav"], ["mit", "gps", "batMosInt"], ["mad", "gps", "batMosAdv"],
  ["s3f", "gps", "bat3Fav"], ["s3i", "gps", "bat3Int"], ["s3a", "gps", "bat3Adv"],
  ["gdf", "gps", "gpsDurFav"], ["gdi", "gps", "gpsDurInt"], ["gda", "gps", "gpsDurAdv"],
  ["gng", "gps", "gpsNonDurableGain"], ["gxt", "gps", "gpsXtx"], ["bxt", "gps", "batXtx"],
  ["gbm", "gps", "benefitModel"],
  ["so", "sls", "sls_os"], ["sb", "sls", "sls_bench"], ["sr", "sls", "sls_orr"], ["fb", "sls", "fl_base"],
  ["fs", "sls", "fl_sls"], ["tb", "sls", "tp_base"], ["ts", "sls", "tp_sls"], ["sl", "sls", "sls_flev"],
  ["c2", "val", "v_cr2"], ["c1", "val", "v_cr1"], ["vg", "val", "v_gpen"], ["vr", "val", "v_gprice"],
  ["vy", "val", "v_gyears"], ["fp", "val", "v_flpool"], ["rr", "val", "v_rrpool"], ["vs", "val", "v_spen"],
  ["vc", "val", "v_sprice"], ["vv", "val", "v_syears"], ["pf", "val", "v_platform"], ["ml", "val", "v_mult"],
  ["sh", "val", "v_shares"], ["ca", "val", "v_cash"], ["ra", "val", "v_riskadj"], ["pg", "val", "v_pgps"], ["ps", "val", "v_psls"],
  ["su", "ui", "showUncertainty"], ["il", "ui", "irm_lead"], ["be", "ui", "bf_e58"], ["bu", "ui", "bf_cure"],
  ["el", "ui", "explainLvl"]
];

const MARKER_FIELDS = ["tab", "regalMode", "activeRegalPreset", "activeInvPreset", "activeSlsPreset", "activeValPreset", "embed"];

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// Schema-v3 deltas were encoded against the former 26% censoring central state.
// Retain that baseline so omitted fields in old custom links do not silently
// inherit the v4 recalibration.
const LEGACY_V3_DEFAULT_STATE = clone(DEFAULT_STATE);
LEGACY_V3_DEFAULT_STATE.v = 3;
LEGACY_V3_DEFAULT_STATE.gps.cens = 26;
LEGACY_V3_DEFAULT_STATE.gps.gpsDurFav = 60;
LEGACY_V3_DEFAULT_STATE.gps.gpsDurInt = 37;
LEGACY_V3_DEFAULT_STATE.gps.gpsXtx = 13;

/** Strip float noise so sliders don't serialize as 12-decimal values. */
function roundVal(v) {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.round(v * 1e6) / 1e6
    : v;
}

function overlayForward(g, q) {
  g.bat = q.bat; g.batc = q.batc; g.batk = q.batk != null ? q.batk : 1; g.gpsc = q.gpsc; g.gpsu = q.gpsu;
  g.delay = q.delay; g.mid = q.mid; g.k = q.k; g.autofit = !!q.auto;
  g.xtx = q.xtx != null ? q.xtx : 0; g.cens = q.cens != null ? q.cens : 0;
  if (q.mcFloor != null) g.mcFloor = !!q.mcFloor;
}

function overlayInverse(g, q) {
  g.gpsc = q.gpsc; g.batcap = q.batcap; g.delay = q.delay; g.mid = q.mid; g.k = q.k;
  g.xtx = q.xtx != null ? q.xtx : 0; g.cens = q.cens != null ? q.cens : 0;
  if (q.mcFloor != null) g.mcFloor = !!q.mcFloor;
}

/** Baseline for the *value* diff: defaults with the active presets overlaid. */
function buildValueBaseline(markers, schemaVersion = SHARE_SCHEMA_VERSION) {
  const legacyV3 = schemaVersion === 3;
  const b = clone(legacyV3 ? LEGACY_V3_DEFAULT_STATE : DEFAULT_STATE);
  if ((markers.regalMode || "forward") === "inverse") {
    const q = SHARE_INV[markers.activeInvPreset];
    if (q) overlayInverse(b.gps, q);
  } else {
    const presetName = markers.activeRegalPreset;
    const currentQ = SHARE_P[presetName];
    const q = legacyV3 && currentQ && ["best", "bind", "nonbind"].includes(presetName)
      ? { ...currentQ, cens: 26 }
      : currentQ;
    if (q) {
      overlayForward(b.gps, q);
      const currentEln = ELN_PRESETS[presetName] || DEFAULT_ELN;
      const eln = legacyV3 && ["best", "bind", "nonbind"].includes(presetName)
        ? { ...currentEln, gpsDurFav: 60, gpsDurInt: 37, gpsXtx: 13 }
        : currentEln;
      Object.assign(b.gps, eln);
    }
  }
  const sq = SHARE_SLSP[markers.activeSlsPreset];
  if (sq) Object.assign(b.sls, sq);
  const vq = SHARE_VALP[markers.activeValPreset];
  if (vq) Object.assign(b.val, vq);
  return b;
}

function markersFrom(source) {
  const m = {};
  for (const f of MARKER_FIELDS) {
    m[f] = Object.prototype.hasOwnProperty.call(source, f) && source[f] !== undefined
      ? source[f]
      : DEFAULT_STATE[f];
  }
  return m;
}

/** Detect embed mode from URL search string and optional hash fragment. */
export function parseEmbedMode(search = "", hash = "") {
  const q = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  if (q.get("embed") === "1") return true;
  if (hash) {
    const s = decodeShareHash(hash);
    if (s && s.embed) return true;
  }
  return false;
}

/** Encode a full (or partial) state into a short delta hash: `#s1=<b64url>`. */
export function buildShareHash(state) {
  const src = state || {};
  const markers = markersFrom(src);
  const baseline = buildValueBaseline(markers, SHARE_SCHEMA_VERSION);
  const payload = {};
  for (const [code, group, field] of SHARE_FIELD_DEFS) {
    const base = group ? baseline[group][field] : DEFAULT_STATE[field];
    const container = group ? src[group] : src;
    const raw = container ? container[field] : undefined;
    if (raw === undefined) continue; // partial state: absent = unchanged
    const val = roundVal(raw);
    if (val !== roundVal(base)) payload[code] = val;
  }
  payload.sv = SHARE_SCHEMA_VERSION;
  return "#s1=" + b64urlEncode(JSON.stringify(payload));
}

/** Decode a share hash (v1 delta `#s1=` or legacy full `#s=`) to full state.
 *  Returns null for anything unrecognized or corrupt (caller falls back). */
export function decodeShareHash(hash) {
  if (!hash || typeof hash !== "string") return null;
  let h = hash.trim();
  const at = h.indexOf("#");
  if (at >= 0) h = h.slice(at);
  else h = "#" + h;
  if (h.startsWith("#s1=")) {
    try {
      const payload = JSON.parse(b64urlDecode(h.slice(4)));
      if (!payload || typeof payload !== "object") return null;
      return inflateDelta(payload);
    } catch (_) {
      return null;
    }
  }
  if (h.startsWith("#s=")) {
    try {
      const s = JSON.parse(b64urlDecode(h.slice(3)));
      return s && typeof s === "object" ? s : null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function inflateDelta(payload) {
  const schemaVersion = Number(payload.sv) || 1;
  const markers = {};
  const byCode = {};
  for (const d of SHARE_FIELD_DEFS) byCode[d[0]] = d;
  for (const f of MARKER_FIELDS) {
    const code = SHARE_FIELD_DEFS.find((d) => d[1] === "" && d[2] === f)[0];
    markers[f] = Object.prototype.hasOwnProperty.call(payload, code) ? payload[code] : DEFAULT_STATE[f];
  }
  const state = buildValueBaseline(markers, schemaVersion);
  state.v = schemaVersion >= 4 ? 4 : schemaVersion >= 3 ? 3 : 2;
  // Links written before model-family support represented the homogeneous model.
  // v2 ELN links remain compatible; their retired `sf` efficiency field is
  // intentionally ignored because the score no longer applies that artifact.
  state.gps.modelFamily = payload.sv >= 2 ? "eln" : "pooled";
  for (const f of MARKER_FIELDS) state[f] = markers[f];
  for (const code in payload) {
    const d = byCode[code];
    if (!d) continue;
    const [, group, field] = d;
    if (!group) continue; // markers already applied
    state[group][field] = payload[code];
  }
  return state;
}

export function isValidTab(t) {
  return VALID_TABS.includes(t);
}

export function tabVisibility(activeTab) {
  if (!isValidTab(activeTab)) {
    throw new Error(`invalid tab: ${activeTab}`);
  }
  return Object.fromEntries(VALID_TABS.map((id) => [id, id === activeTab]));
}

export function paramsFromPresetQ(q) {
  if (!q) return null;
  const elnPreset = Object.entries(SHARE_P).find(([, preset]) => preset === q)?.[0];
  const out={
    bat: q.bat,
    batc: q.batc / 100,
    batk: q.batk != null ? q.batk : 1,
    gpsc: q.gpsc / 100,
    gpsu: q.gpsu,
    delay: q.delay,
    xtx: (q.xtx != null ? q.xtx : 0) / 100,
    cens: (q.cens != null ? q.cens : 0) / 100,
    osmode: "itt",
    mid: q.mid || 25,
    k: q.k || 0.15,
    fh: false,
    assumeStatus: q.assumeStatus !== false,
    zfut: ZFUT,
    modelFamily: q.modelFamily || "eln"
  };
  return out.modelFamily==="pooled"?out:withElnRuntime(out,q.eln || ELN_PRESETS[elnPreset] || DEFAULT_ELN);
}

export function withElnRuntime(p, e = DEFAULT_ELN) {
  return Object.assign(p, {
    modelFamily: p.modelFamily || "eln",
    elnMix: normalizeElnMix(e.mixFav, e.mixInt, e.mixAdv),
    elnBatMos: { fav: +e.batMosFav, int: +e.batMosInt, adv: +e.batMosAdv },
    elnBat3: { fav: +e.bat3Fav / 100, int: +e.bat3Int / 100, adv: +e.bat3Adv / 100 },
    elnGpsDurable: { fav: +e.gpsDurFav / 100, int: +e.gpsDurInt / 100, adv: +e.gpsDurAdv / 100 },
    gpsNonDurableGain: Math.max(1, +e.gpsNonDurableGain || 1),
    gpsXtx: Math.max(0, +e.gpsXtx || 0) / 100,
    batXtx: Math.max(0, +e.batXtx || 0) / 100,
    benefitModel: e.benefitModel === "leaky" ? "leaky" : "durable"
  });
}

export function normalizeElnMix(fav, int, adv) {
  const raw = [Math.max(0, +fav || 0), Math.max(0, +int || 0), Math.max(0, +adv || 0)];
  const total = raw[0] + raw[1] + raw[2] || 1;
  return { fav: raw[0] / total, int: raw[1] / total, adv: raw[2] / total };
}

export function paramsFromPreset(name, q, mode, P, INV) {
  q = q || (mode === "inverse" ? INV[name] : P[name]);
  if (!q) return null;
  const base = { osmode: "itt", batk: q.batk != null ? q.batk : 1, fh: false, assumeStatus: q.assumeStatus !== false, zfut: ZFUT, modelFamily: mode === "inverse" ? "pooled" : (q.modelFamily || "eln") };
  if (mode === "inverse") {
    const ir = inverseSolve(
      Object.assign({}, base, {
        gpsc: q.gpsc / 100,
        delay: q.delay || 0,
        xtx: (q.xtx || 0) / 100,
        cens: (q.cens || 0) / 100,
        mid: q.mid || 25,
        k: q.k || 0.15,
        bat: 8
      }),
      q.batcap || 17
    );
    return ir.sol
      ? Object.assign({}, ir.sol, {
          batk: 1,
          fh: false,
          zfut: ZFUT
        })
      : null;
  }
  const out=Object.assign({}, base, {
    bat: q.bat,
    batc: q.batc / 100,
    gpsc: q.gpsc / 100,
    gpsu: q.gpsu,
    delay: q.delay,
    xtx: (q.xtx || 0) / 100,
    cens: (q.cens != null ? q.cens : 0) / 100,
    mid: q.mid || 25,
    k: q.k || 0.15
  });
  return out.modelFamily==="pooled"?out:withElnRuntime(out,q.eln || ELN_PRESETS[name] || DEFAULT_ELN);
}

export function isPlausible(p) {
  return passesVerdict(p) && isBiologicallyPlausible(p);
}

/**
 * Resolve forward survival params for a named preset.
 * Named presets always win over stale share-hash slider deltas (e.g. old gpsu
 * left in a bookmark after P.best was recalibrated).
 * `gpsBlock` is accepted for call-site symmetry with applyState but ignored when
 * a known preset name is active.
 */
export function resolveForwardPresetParams(activeRegalPreset, _gpsBlock) {
  const name = activeRegalPreset && SHARE_P[activeRegalPreset] ? activeRegalPreset : "best";
  const q = SHARE_P[name];
  return withElnRuntime(paramsFromPresetQ(q), ELN_PRESETS[name] || DEFAULT_ELN);
}

/** DOM-free valuation metrics (values object mirrors slider fields).
 *  EV is enterprise value ($M). Equity = EV + cash; equity $/sh = equity / shares. */
export function computeValuationMetrics(v) {
  const cr2 = v.cr2;
  const cr1 = v.cr1;
  const gpen = v.gpen / 100;
  const gprice = v.gprice;
  const gyears = v.gyears;
  const flpool = v.flpool;
  const rrpool = v.rrpool;
  const spen = v.spen / 100;
  const sprice = v.sprice;
  const syears = v.syears;
  const platform = v.platform;
  const mult = v.mult;
  const shares = v.shares;
  const cash = v.cash != null ? v.cash : DEFAULT_CASH_M;
  const ra = !!v.riskadj;
  const pG = (v.pgps != null ? v.pgps : 65) / 100;
  const pS = (v.psls != null ? v.psls : 55) / 100;
  const gpool = (cr2 + cr1) * gpen * gyears;
  let gpsPeak = (gpool * gprice) / 1000;
  let slsPeak = ((flpool + rrpool) * spen * syears * sprice) / 1000;
  if (ra) {
    gpsPeak *= pG;
    slsPeak *= pS;
  }
  const totPeak = gpsPeak + slsPeak;
  const EV = totPeak * mult + platform * 1000;
  const equity = EV + cash;
  const ps = equity / shares;
  const evPerShare = EV / shares;
  return {
    gpool,
    gpsPeak,
    slsPeak,
    totPeak,
    EV,
    equity,
    cash,
    ps,
    evPerShare,
    riskAdjusted: ra
  };
}

/** Biology-first header scenario — GPS/SLS clinical presets stay fixed; valuation may be live.
 *  Keep in sync with P / SLSP / VALP preset tables in js/main.js. */
export const FROZEN_BEST_EST = {
  label: "ELN-explicit central · 10% OS LTFU · risk-adj @ P(GPS)=65%",
  gpsPreset: SHARE_P.best,
  slsPreset: SHARE_SLSP.best,
  valPreset: SHARE_VALP.best,
  /** Neutral-anchor ridge HR band (identifiability, not biology-first). */
  neutralRidgeHrNote: "Legacy pooled ridge retained as sensitivity"
};

function valInputsFromPreset(v, overrides) {
  const o = overrides || {};
  return {
    cr2: o.cr2 != null ? o.cr2 : v.v_cr2,
    cr1: o.cr1 != null ? o.cr1 : v.v_cr1,
    gpen: o.gpen != null ? o.gpen : v.v_gpen,
    gprice: o.gprice != null ? o.gprice : v.v_gprice,
    gyears: o.gyears != null ? o.gyears : v.v_gyears,
    flpool: o.flpool != null ? o.flpool : v.v_flpool,
    rrpool: o.rrpool != null ? o.rrpool : v.v_rrpool,
    spen: o.spen != null ? o.spen : v.v_spen,
    sprice: o.sprice != null ? o.sprice : v.v_sprice,
    syears: o.syears != null ? o.syears : v.v_syears,
    platform: o.platform != null ? o.platform : v.v_platform,
    mult: o.mult != null ? o.mult : v.v_mult,
    shares: o.shares != null ? o.shares : v.v_shares,
    cash: o.cash != null ? o.cash : v.v_cash != null ? v.v_cash : DEFAULT_CASH_M,
    riskadj: o.riskadj != null ? o.riskadj : true,
    pgps: o.pgps != null ? o.pgps : 65,
    psls: o.psls != null ? o.psls : 55
  };
}

/** Header-strip metrics: biology-first GPS/SLS clinicals + risk-adj equity $/sh.
 *  Pass `valOverrides` (live slider fields) to refresh valuation when P(approval)/presets change. */
export function computeFrozenBestEst(valOverrides) {
  const p = paramsFromPresetQ(FROZEN_BEST_EST.gpsPreset);
  const gpsHr = hrGaugeState(p, 72).hrForFinal;
  const sls = FROZEN_BEST_EST.slsPreset;
  const slsOsRatio = sls.sls_bench / sls.sls_os;
  const v = FROZEN_BEST_EST.valPreset;
  const inputs = valInputsFromPreset(v, valOverrides);
  const live = computeValuationMetrics(inputs);
  const gross = computeValuationMetrics(
    valInputsFromPreset(v, Object.assign({}, valOverrides, { riskadj: false, pgps: 100, psls: 100 }))
  );
  const ra = live.riskAdjusted;
  return {
    label: ra
      ? "ELN-explicit central · 10% OS LTFU · risk-adj @ P(GPS)="+inputs.pgps+"%"
      : "ELN-explicit central · 10% OS LTFU · gross",
    gpsHr,
    slsOsRatio,
    EV: live.EV,
    equity: live.equity,
    ps: live.ps,
    psGross: gross.ps,
    EVGross: gross.EV,
    neutralRidgeHrNote: FROZEN_BEST_EST.neutralRidgeHrNote,
    riskAdjusted: ra,
    pgps: inputs.pgps
  };
}
