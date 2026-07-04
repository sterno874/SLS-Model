/** Forward REGAL presets (percent sliders) — keep in sync with js/main.js `const P`.
 *  irm_lead is display-only sensitivity (not used by paramsFromPresetQ / event engine). */
export const P = {
  best: { bat: 13, batc: 0, gpsc: 42, gpsu: 47.5, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true, irm_lead: 3 },
  bind: { bat: 13, batc: 0, gpsc: 42, gpsu: 47.5, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true, irm_lead: 3 },
  nonbind: { bat: 13, batc: 0, gpsc: 42, gpsu: 47.5, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false, irm_lead: 3 },
  critique: { bat: 10.5, batc: 12, gpsc: 18, gpsu: 30.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 6, cens: 12, mcFloor: true, irm_lead: 3 },
  bull: { bat: 10, batc: 1, gpsc: 40, gpsu: 38, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false, irm_lead: 3 },
  bear: { bat: 10, batc: 16, gpsc: 14, gpsu: 29, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 10, mcFloor: true, irm_lead: 3 },
  cw: { bat: 10.5, batc: 1, gpsc: 41, gpsu: 35.5, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false, irm_lead: 3 },
  capbreach: { bat: 10.5, batc: 21, gpsc: 12, gpsu: 25.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 10, mcFloor: true, irm_lead: 3 },
  noeffect: { bat: 14, batc: 28, gpsc: 28, gpsu: 14, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true, irm_lead: 3 }
};

/** Ridge/null presets fit anchors by design but are not biology-first anchor fits. */
export const RIDGE_PRESET_NAMES = ["noeffect"];

export const INV = {
  cw42: { gpsc: 42, batcap: 14, delay: 3, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: false },
  cw35: { gpsc: 35, batcap: 14, delay: 2, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: false },
  cw50: { gpsc: 50, batcap: 14, delay: 4, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: false },
  cwbind: { gpsc: 42, batcap: 14, delay: 3, xtx: 0, cens: 0, mid: 25, k: 0.15, mcFloor: true }
};

export const FORWARD_PRESET_NAMES = Object.keys(P);

/** Forward presets expected to pass event trajectory + biological BAT caps. */
export const PLAUSIBLE_PRESET_NAMES = FORWARD_PRESET_NAMES.filter(
  (n) => !RIDGE_PRESET_NAMES.includes(n) && n !== "capbreach"
);

export const INVERSE_PRESET_NAMES = Object.keys(INV);
