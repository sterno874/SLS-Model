import { LEGACY_REGAL_PRESETS, INVERSE_PRESETS } from "../../js/data/model-config.js";

/** Canonical presets are imported by production and tests. */
export const P = LEGACY_REGAL_PRESETS;

/** Ridge/null presets fit anchors by design but are not biology-first anchor fits. */
export const RIDGE_PRESET_NAMES = ["noeffect"];
export const EXTERNAL_SENSITIVITY_PRESET_NAMES = ["vdm", "vdmfit"];

export const INV = INVERSE_PRESETS;

export const FORWARD_PRESET_NAMES = Object.keys(P);

/** Forward presets expected to pass event trajectory + biological BAT caps. */
export const PLAUSIBLE_PRESET_NAMES = FORWARD_PRESET_NAMES.filter(
  (n) => !RIDGE_PRESET_NAMES.includes(n) && !EXTERNAL_SENSITIVITY_PRESET_NAMES.includes(n) && n !== "capbreach"
);

export const INVERSE_PRESET_NAMES = Object.keys(INV);
