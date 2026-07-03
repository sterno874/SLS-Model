# Contributing

Thanks for helping. This project is meant to be **poked at** — the goal is an honest, well-sourced model, not a bullish or bearish one.

## Ground rules

1. **Cite primary sources** for any factual change (a paper, a trial registry, a company filing, a regulator document). Community posts can be *incorporated as scenarios* but must be labelled as such, not as fact.
2. **Separate facts from assumptions.** Verified, published numbers are locked. Anything not publicly disclosed must remain an adjustable input with its plausibility band.
3. **Show your math.** New calculations should be explained in the relevant tab's Methodology panel and be reproducible.
4. **No investment hype.** Keep the disclaimer intact. This is an analysis tool.

## Project structure

```
SLS-Model/
├── index.html          # Shell: markup, tab layout, OG meta, module bootstrap
├── css/
│   └── main.css        # All styles (design tokens, layout, components)
├── js/
│   ├── main.js         # UI, presets, charts, share URL, valuation, tab logic
│   └── math/
│       └── survival.js # Pure math: survival, events, HR, anchoring, inverse solver
├── tests/              # Node unit tests (no browser, no npm deps beyond Node 20+)
├── tools/
│   └── extract_assets.cjs  # One-time splitter: monolithic index → css/ + js/
├── verify_math.js      # Back-compat alias → npm test
└── package.json        # `"test": "node tests/run-all.js"`
```

| Location | What goes here |
|----------|----------------|
| `index.html` | Semantic HTML only — no inline `<style>` or app `<script>` blocks |
| `css/main.css` | Visual design, responsive layout, print styles |
| `js/math/survival.js` | Deterministic model math exported for reuse and testing |
| `js/main.js` | DOM wiring, presets (`P`, `INV`), Monte Carlo, share state, valuation UI |
| `tests/` | Regression tests mirroring critical math, presets, share URL, valuation |

After editing survival math, run the test suite. If you change the monolithic backup, re-run `node tools/extract_assets.cjs` to refresh the split files.

## Run locally

ES modules require HTTP — `file://` will not load `js/main.js`.

```bash
python3 -m http.server 8080
# open http://localhost:8080/
```

Or:

```bash
npx serve .
```

No build step. Vercel Web Analytics loads only on `*.vercel.app` deployments.

## Run tests

Requires **Node 20+** (built-in test runner).

```bash
npm test
# or
node tests/run-all.js
# or (back-compat)
node verify_math.js
```

Individual suites:

```bash
node --test tests/math.test.js
node --test tests/presets.test.js
node --test tests/share.test.js
node --test tests/valuation.test.js
```

CI runs `npm test` on every push/PR to `main` (`.github/workflows/verify-math.yml`).

## Contribution workflow

1. Fork the repo on GitHub.
2. Create a branch: `git checkout -b your-topic`.
3. Make focused changes; match existing code style (see below).
4. Run `npm test` — all tests must pass.
5. Open a pull request describing **what** changed and **why**, with primary sources for any factual updates.

## Validation standards

- **Primary source citations** are required for factual claims added to References, Methodology, or preset labels. Include URL or DOI and an **as-of date** where the source is time-sensitive (PRs, filings, trial snapshots).
- **Event anchoring policy:** confirmed REGAL PR milestones (60 @ ~m46, 72 @ ~m58, 78 @ m63) are locked for forward projection via `eventsAtAnchored`. Full details and the facts-vs-model-implied split are in the README — [Event anchoring policy (REGAL)](README.md#event-anchoring-policy-regal).
- **Plausibility gating:** forward REGAL presets must pass `consistent()` (fit blinded event counts within tolerance). Presets that fail are disabled in the UI; do not add forward presets that bypass this check without explicit rationale.

## Code style

- Match surrounding patterns — no unnecessary abstraction or new dependencies.
- Keep pure math in `js/math/survival.js`; keep DOM/UI in `js/main.js`.
- Prefer small, readable functions over clever one-liners.
- Comments only for non-obvious statistical or business logic.

## Adding a REGAL preset

1. Add an entry to `const P` in `js/main.js` (percent slider values: `batc`, `gpsc`, etc.).
2. Verify `consistent(paramsFromPresetQ(P.yourPreset))` returns `true` — or mark it as an edge-case preset (like `fail`) that intentionally violates HR thresholds.
3. Add/extend coverage in `tests/fixtures/presets.js` and run `npm test`.
4. Document the scenario in the preset button subtitle or Methodology if it introduces new assumptions.

## Adding facts

1. Tag claims in the UI (`verified`, `assumption`, `model output`, etc.) consistent with existing tags.
2. Add the primary source to the relevant tab **References** with a clickable link.
3. Note the **as-of date** for time-bound disclosures (PRs, SEC filings, trial registries).
4. Community DD may inform **scenarios** but must not be presented as established fact without primary corroboration.

## Good first contributions

- Add or correct a primary source; tighten a prior band; add a stress-test scenario.
- Improve a Methodology explanation; add a comparable; refine the valuation logic.
- Report a bug or a statistical flaw in an issue.

By contributing you agree your contributions are licensed under the project's AGPL-3.0-or-later.
