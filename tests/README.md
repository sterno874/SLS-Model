# SLS-Model test suite

## Commands

| Script | Purpose |
|--------|---------|
| `npm test` | Full regression suite (Node `node --test`) |
| `npm run test:mutation` | Lightweight mutation testing on formula modules |

## Layout

| File | Focus |
|------|--------|
| `math.test.js` | Survival math smoke + scenario checks |
| `formulas.test.js` | Golden-value and property tests for `survival.js` |
| `presets.test.js` | All forward/inverse presets vs anchors |
| `valuation.test.js` | `computeValuationMetrics` arithmetic |
| `share.test.js` | Share-link encode/decode round-trips |
| `ui-logic.test.js` | `state.js` helpers + preset wiring |
| `mutation/` | Hand-crafted mutants + runner |

## Mutation testing

We use a **custom lightweight runner** (`tests/mutation/run.js`) rather than Stryker:

- The project uses Node's built-in `node --test` with no bundler or Jest/Vitest adapter.
- Stryker would add heavy config and duplicate the test runner.
- Formula modules are small and pure — hand-crafted mutants target known failure modes (threshold constants, HR ratio inversion, anchor locks, valuation arithmetic).

### How it works

1. Baseline: run formula-critical tests on clean sources (must pass).
2. For each mutant in `mutations.js`: patch `survival.js` or `state.js`, run tests, restore.
3. Report **mutation score** = killed / total × 100%.

Mutants that **survive** indicate missing or weak assertions — add golden-value tests in `formulas.test.js` (or module-specific files) until they are killed.

### CI

GitHub Actions runs `npm test` on every push/PR. Mutation testing runs on pushes to `main` (see `.github/workflows/verify-math.yml`).

## Indicator audit log (Jul 2026)

| Issue | Status | Fix |
|-------|--------|-----|
| `batc` 1σ band conflated plateau with Kurosawa 3-yr OS | Fixed | Dynamic cap via `batcFor3yrCap`; tooltip/source copy |
| Frozen header / preset cmp used Pike HR @ m58 vs readout gauge | Fixed | `hrGaugeState().hrForFinal` / `readoutHr()` |
| Valuation peaks/EV unlabeled when risk-adjust toggled | Fixed | gross/risk-adj tags on peaks, EV head, $/sh suffix |
| `gpsc` band cited CR1 47% plateau as CR2 prior | Fixed | Source line + CFG tooltip distinguish CR1 vs CR2 |
| `gpsu` band vs Phase 2 CR2 whole-arm mOS | Fixed | Source line clarifies uncured-only vs whole-arm |
| Dead trial ID NCT05309745 (404 on ClinicalTrials.gov) | Fixed | Replaced with NCT04588922 throughout shipped UI |
| Milestone backtest bare "HR" label | Fixed | "HR @ mXX" + note vs readout gauge |
| Stress presets implied m58 HR in subtitles | Fixed | bear/capbreach use readout HR (~0.57 / ~0.67) |
| Inverse panel "Implied HR @ m58" | Deferred | Intentional anchor snapshot label |
| IRM table HR @ m58 | Deferred | CW reference table, not gauge readout |
| Milestone P(win) fast MC approximation | Deferred | Documented in card copy |
