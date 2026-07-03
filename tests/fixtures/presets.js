/** Forward REGAL presets (percent sliders) — keep in sync with js/main.js `const P`. */
export const P = {
  best: { bat: 13, batc: 0, gpsc: 42, gpsu: 54.1, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true },
  bind: { bat: 13, batc: 0, gpsc: 42, gpsu: 54.1, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true },
  nonbind: { bat: 13, batc: 0, gpsc: 42, gpsu: 54.1, delay: 3, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false },
  critique: { bat: 9, batc: 16, gpsc: 18, gpsu: 33, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 6, cens: 12, mcFloor: true },
  bull: { bat: 8, batc: 6, gpsc: 40, gpsu: 36, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false },
  bear: { bat: 10.5, batc: 16, gpsc: 14, gpsu: 30, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 10, mcFloor: true },
  cw: { bat: 9, batc: 6, gpsc: 41, gpsu: 35.5, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false },
  capbreach: { bat: 11, batc: 20, gpsc: 12, gpsu: 28, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 10, mcFloor: true },
  noeffect: { bat: 14, batc: 28, gpsc: 28, gpsu: 14, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true }
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
