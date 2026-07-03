/** Forward REGAL presets (percent sliders) — keep in sync with js/main.js `const P`. */
export const P = {
  best: { bat: 9.5, batc: 14, gpsc: 22, gpsu: 31.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 6, cens: 12, mcFloor: true },
  bind: { bat: 9.5, batc: 14, gpsc: 22, gpsu: 31.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 6, cens: 12, mcFloor: true },
  nonbind: { bat: 9.5, batc: 14, gpsc: 22, gpsu: 31.5, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 6, cens: 12, mcFloor: false },
  critique: { bat: 9, batc: 16, gpsc: 18, gpsu: 33, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 6, cens: 12, mcFloor: true },
  bull: { bat: 8, batc: 6, gpsc: 40, gpsu: 36, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false },
  bear: { bat: 11, batc: 22, gpsc: 5, gpsu: 36, delay: 2, mid: 25, k: 0.15, auto: false, xtx: 8, cens: 10, mcFloor: true },
  cw: { bat: 9, batc: 6, gpsc: 41, gpsu: 35.5, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: false },
  noeffect: { bat: 14, batc: 28, gpsc: 28, gpsu: 14, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true },
  fail: { bat: 10, batc: 28, gpsc: 28, gpsu: 18, delay: 0, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true },
  delay: { bat: 10, batc: 14, gpsc: 40, gpsu: 40, delay: 4, mid: 25, k: 0.15, auto: false, xtx: 0, cens: 0, mcFloor: true },
  backload: { bat: 7, batc: 10, gpsc: 26, gpsu: 40, delay: 0, mid: 30, k: 0.22, auto: false, xtx: 0, cens: 0, mcFloor: true }
};

export const FORWARD_PRESET_NAMES = Object.keys(P);

/** Presets expected to pass consistent() — bear is an HR edge case and may be UI-disabled. */
export const PLAUSIBLE_PRESET_NAMES = FORWARD_PRESET_NAMES.filter((n) => n !== "bear");
