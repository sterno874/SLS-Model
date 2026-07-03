import { STRATF, ZFUT, inverseSolve, passesVerdict } from "../math/survival.js";

export const VALID_TABS = ["gps", "sls009", "value", "explain"];
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

/** Detect embed mode from URL search string and optional hash fragment. */
export function parseEmbedMode(search = "", hash = "") {
  const q = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  if (q.get("embed") === "1") return true;
  if (hash && hash.startsWith("#s=")) {
    try {
      const s = JSON.parse(b64urlDecode(hash.slice(3)));
      if (s && s.embed) return true;
    } catch (_) {
      /* invalid share hash */
    }
  }
  return false;
}

export function buildShareHash(state) {
  return "#s=" + b64urlEncode(JSON.stringify(state));
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
  return passesVerdict(p);
}

/** DOM-free valuation metrics (values object mirrors slider fields). */
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
  const ps = EV / shares;
  return { gpool, gpsPeak, slsPeak, totPeak, EV, ps, riskAdjusted: ra };
}
