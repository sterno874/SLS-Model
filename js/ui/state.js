import { STRATF, ZFUT, inverseSolve, passesVerdict, isBiologicallyPlausible, hrGaugeState } from "../math/survival.js";

export const VALID_TABS = ["gps", "sls009", "value", "explain", "biology"];
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
export const DEFAULT_STATE = {
  v: 1,
  tab: "gps",
  regalMode: "forward",
  activeRegalPreset: "best",
  activeInvPreset: "cw42",
  activeSlsPreset: "best",
  activeValPreset: "best",
  embed: false,
  gps: {
    bat: 13, batc: 0, batk: 1, gpsc: 42, gpsu: 47.5, delay: 3, xtx: 0,
    cens: 0, mid: 25, k: 0.15, batcap: 14, autofit: false, fhTest: false,
    stratF: 0.9, zfut: 0.4, mcFloor: true, cutoff: 72
  },
  sls: {
    sls_os: 8.9, sls_bench: 2.8, sls_orr: 46, fl_base: 14.7, fl_sls: 20,
    tp_base: 5.3, tp_sls: 13, sls_flev: 250
  },
  val: {
    v_cr2: 2800, v_cr1: 5500, v_gpen: 45, v_gprice: 145, v_gyears: 2.8,
    v_flpool: 9000, v_rrpool: 3500, v_spen: 38, v_sprice: 145, v_syears: 1.4,
    v_platform: 2.5, v_mult: 5, v_shares: 222, v_cash: 107.1, v_riskadj: true,
    v_pgps: 65, v_psls: 55
  },
  ui: { showUncertainty: false, irm_lead: 3, bf_e58: 72, bf_cure: 42, explainLvl: "eli5" }
};

// Preset tables — kept in sync with js/main.js (P/INV/SLSP/VALP). Used only to
// build the encode/decode baseline; drift only lengthens links, never corrupts
// them (both sides use these same tables).
export const SHARE_P = {
  best:    { bat: 13, batc: 0, gpsc: 42, gpsu: 47.5, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true },
  bind:    { bat: 13, batc: 0, gpsc: 42, gpsu: 47.5, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true },
  nonbind: { bat: 13, batc: 0, gpsc: 42, gpsu: 47.5, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false },
  critique:{ bat: 10.5, batc: 12, gpsc: 18, gpsu: 30.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 6, cens: 12, mcFloor: true },
  bull:    { bat: 10,  batc: 1,  gpsc: 40, gpsu: 38,   delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0,  mcFloor: false },
  bear:    { bat: 10,  batc: 16, gpsc: 14, gpsu: 29,   delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 10, mcFloor: true },
  cw:      { bat: 10.5,batc: 1,  gpsc: 41, gpsu: 35.5, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0,  mcFloor: false },
  capbreach:{ bat: 10.5, batc: 21, gpsc: 12, gpsu: 25.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 10, mcFloor: true },
  noeffect:{ bat: 14,  batc: 28, gpsc: 28, gpsu: 14,   delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0,  mcFloor: true }
};
export const SHARE_INV = {
  cw42:   { gpsc: 42, batcap: 14, delay: 3, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: false },
  cw35:   { gpsc: 35, batcap: 14, delay: 2, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: false },
  cw50:   { gpsc: 50, batcap: 14, delay: 4, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: false },
  cwbind: { gpsc: 42, batcap: 14, delay: 3, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: true }
};
export const SHARE_SLSP = {
  best: { sls_os: 8.9, sls_bench: 2.8, sls_orr: 46, fl_base: 14.7, fl_sls: 20, tp_base: 5.3, tp_sls: 13 },
  obs:  { sls_os: 8.9, sls_bench: 2.5, sls_orr: 46, fl_base: 14.7, fl_sls: 22, tp_base: 5.3, tp_sls: 15 },
  bear: { sls_os: 6.5, sls_bench: 3.5, sls_orr: 35, fl_base: 14.7, fl_sls: 17, tp_base: 5.3, tp_sls: 10 },
  bull: { sls_os: 11,  sls_bench: 2.2, sls_orr: 55, fl_base: 14.7, fl_sls: 24, tp_base: 5.3, tp_sls: 16 }
};
export const SHARE_VALP = {
  best: { v_cr2: 2800, v_cr1: 5500, v_gpen: 45, v_gprice: 145, v_gyears: 2.8, v_flpool: 9000,  v_rrpool: 3500, v_spen: 38, v_sprice: 145, v_syears: 1.4, v_platform: 2.5, v_mult: 5,   v_shares: 222, v_cash: 107.1 },
  cons: { v_cr2: 2000, v_cr1: 4000, v_gpen: 30, v_gprice: 125, v_gyears: 2.0, v_flpool: 7000,  v_rrpool: 2800, v_spen: 22, v_sprice: 125, v_syears: 1.0, v_platform: 0.5, v_mult: 4,   v_shares: 225, v_cash: 107.1 },
  bull: { v_cr2: 3800, v_cr1: 7500, v_gpen: 58, v_gprice: 185, v_gyears: 3.5, v_flpool: 11000, v_rrpool: 4500, v_spen: 50, v_sprice: 175, v_syears: 1.8, v_platform: 4,   v_mult: 6.5, v_shares: 218, v_cash: 107.1 },
  cw:   { v_cr2: 3000, v_cr1: 6000, v_gpen: 58, v_gprice: 165, v_gyears: 3.2, v_flpool: 11000, v_rrpool: 4500, v_spen: 45, v_sprice: 165, v_syears: 1.7, v_platform: 4,   v_mult: 5.5, v_shares: 220, v_cash: 107.1 }
};

/** Q1 2026 cash & equivalents ($M) — Mar 31 2026 PR / 10-Q. */
export const DEFAULT_CASH_M = 107.1;
/** Basic shares outstanding (M) — Mar 31 2026 10-Q / Q1 PR. */
export const BASIC_SHARES_M = 181.3;
/** Fully-diluted shares modeled (M) — warrants/options on top of basic. */
export const FD_SHARES_M = 222;

// [shortCode, group("" = top-level marker), fieldName]
export const SHARE_FIELD_DEFS = [
  ["t", "", "tab"], ["m", "", "regalMode"], ["rp", "", "activeRegalPreset"],
  ["ip", "", "activeInvPreset"], ["sp", "", "activeSlsPreset"], ["vp", "", "activeValPreset"],
  ["e", "", "embed"],
  ["ba", "gps", "bat"], ["bc", "gps", "batc"], ["bk", "gps", "batk"], ["gc", "gps", "gpsc"],
  ["gu", "gps", "gpsu"], ["dl", "gps", "delay"], ["xt", "gps", "xtx"], ["ce", "gps", "cens"],
  ["md", "gps", "mid"], ["kk", "gps", "k"], ["bp", "gps", "batcap"], ["af", "gps", "autofit"],
  ["fh", "gps", "fhTest"], ["sf", "gps", "stratF"], ["zf", "gps", "zfut"], ["mf", "gps", "mcFloor"],
  ["co", "gps", "cutoff"],
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

/** Strip float noise so sliders don't serialize as 12-decimal values. */
function roundVal(v) {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.round(v * 1e6) / 1e6
    : v;
}

function overlayForward(g, q) {
  g.bat = q.bat; g.batc = q.batc; g.gpsc = q.gpsc; g.gpsu = q.gpsu;
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
function buildValueBaseline(markers) {
  const b = clone(DEFAULT_STATE);
  if ((markers.regalMode || "forward") === "inverse") {
    const q = SHARE_INV[markers.activeInvPreset];
    if (q) overlayInverse(b.gps, q);
  } else {
    const q = SHARE_P[markers.activeRegalPreset];
    if (q) overlayForward(b.gps, q);
  }
  const sq = SHARE_SLSP[markers.activeSlsPreset];
  if (sq) Object.assign(b.sls, sq);
  const vq = SHARE_VALP[markers.activeValPreset];
  if (vq) Object.assign(b.val, vq);
  return b;
}

function markersFrom(source) {
  const m = {};
  for (const f of MARKER_FIELDS) m[f] = source[f] != null ? source[f] : DEFAULT_STATE[f];
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
  const baseline = buildValueBaseline(markers);
  const payload = {};
  for (const [code, group, field] of SHARE_FIELD_DEFS) {
    const base = group ? baseline[group][field] : DEFAULT_STATE[field];
    const container = group ? src[group] : src;
    const raw = container ? container[field] : undefined;
    if (raw === undefined) continue; // partial state: absent = unchanged
    const val = roundVal(raw);
    if (val !== roundVal(base)) payload[code] = val;
  }
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
  const markers = {};
  const byCode = {};
  for (const d of SHARE_FIELD_DEFS) byCode[d[0]] = d;
  for (const f of MARKER_FIELDS) {
    const code = SHARE_FIELD_DEFS.find((d) => d[1] === "" && d[2] === f)[0];
    markers[f] = payload[code] != null ? payload[code] : DEFAULT_STATE[f];
  }
  const state = buildValueBaseline(markers);
  state.v = 1;
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
  return {
    bat: q.bat,
    batc: q.batc / 100,
    batk: 1,
    gpsc: q.gpsc / 100,
    gpsu: q.gpsu,
    delay: q.delay,
    xtx: (q.xtx != null ? q.xtx : 0) / 100,
    cens: (q.cens != null ? q.cens : 0) / 100,
    osmode: "itt",
    mid: q.mid || 25,
    k: q.k || 0.15,
    fh: false,
    stratF: STRATF,
    zfut: ZFUT
  };
}

export function paramsFromPreset(name, q, mode, P, INV) {
  const base = { osmode: "itt", batk: 1, fh: false, stratF: STRATF, zfut: ZFUT };
  q = q || (mode === "inverse" ? INV[name] : P[name]);
  if (!q) return null;
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
          stratF: STRATF,
          zfut: ZFUT
        })
      : null;
  }
  return Object.assign({}, base, {
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
  const q =
    (activeRegalPreset && SHARE_P[activeRegalPreset]) ||
    SHARE_P.best;
  return paramsFromPresetQ(q);
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
  label: "Biology-first (bullish) · risk-adj @ P(GPS)=65%",
  gpsPreset: SHARE_P.best,
  slsPreset: SHARE_SLSP.best,
  valPreset: SHARE_VALP.best,
  /** Neutral-anchor ridge HR band (identifiability, not biology-first). */
  neutralRidgeHrNote: "Neutral-ridge HR ~0.45–0.64"
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
      ? "Biology-first (bullish) · risk-adj @ P(GPS)="+inputs.pgps+"%"
      : "Biology-first (bullish) · gross",
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
