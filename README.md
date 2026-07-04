# SELLAS Life Sciences ($SLS) — Interactive Model

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
&nbsp;**Live:** https://sls-model.vercel.app

A primary-sourced, open-source interactive model of SELLAS's pipeline and valuation — split into HTML, CSS, and ES-module JavaScript for maintainability. Everything is transparent and hackable: **every adjustable input is an undisclosed assumption**, every verified number is locked with its source, and the exact math behind each tab is one click away.

> ⚠️ **Educational / analytical only — not investment, medical, legal, or financial advice.** The trial is blinded; nothing here predicts the outcome. It shows the *space of possibilities* and how sensitive it is to assumptions.

## Tabs

1. **REGAL / GPS (Phase 3)** — survival & HR explorer with sensitivity tornado, Bayes-factor panel, interactive IRM table, time-to-80th-event simulator, preset comparison dashboard, milestone backtest, uncertainty bands on KM curves, and shareable scenario URLs. Checked against every announced blinded event count (60/72/78, still <80).
2. **SLS-009 (Phase 2)** — single-arm-vs-historical model for the CDK9 inhibitor (r/r + frontline AML), with a Monte-Carlo of the r/r effect and a hypothetical frontline Phase-3 power calc.
3. **Valuation & WT1 platform** — a transparent peak-sales × multiple model with a **survival-driven prevalence pool** (longer survival ⇒ more years on therapy ⇒ bigger pool), risk-adjusted by probability of approval, plus a Monte-Carlo over the enterprise value.
4. **Explain (ELI5 → PhD)** — the same three models explained at six depths, sources named/linked.

## Methodology

Click the **📐 Methodology** button on each tab. The statistical toolkit (all standard, primary-sourced in-app):
- Stratified log-rank score test (Mantel 1966; Peto & Peto 1972); Cox PH (Cox 1972)
- Schoenfeld events-for-power (1981/83) — verifies 0.636 is the ~50%-power *bar*, not the ~0.48 design alternative
- Lan-DeMets O'Brien-Fleming α-spending (1979/1983); group-sequential conditional power with √(t₁/t₂) correlation (Jennison & Turnbull 2000; Proschan & Hunsberger 1995)
- RMST (Uno 2014); Fleming-Harrington weighted log-rank (1991) for late-effect penalty
- Mixture-cure models (Boag 1949); left-truncation / immortal-time bias (Suissa 2008)
- Approximate Bayesian Computation likelihood-weighting (Beaumont 2002)

## Research memo

Tagged due-diligence notes (verified / partial / community / rejected) live in **[RESEARCH.md](RESEARCH.md)** — cash, shares (basic ~181.3M vs FD modeled ~222M), REGAL anchors, SLS-009 NCT04588922, valuation comps, and model framing.

## Key sources

Clinical: REGAL design paper (Jamy & Cicic, *Future Oncol* 2025, PMC11760237); ClinicalTrials.gov NCT04229979; SELLAS PRs (60/72/78-event updates, Nov-2022 "~2× pooled mOS"); QUAZAR AML-001; Kurosawa *Haematologica* 2010; VIALE-A (DiNardo *NEJM* 2020); AVALON (Todisco *Cancer* 2023); Brayer 2015; Maslak 2018; Forman & Rowe *Blood* 2013. Market: SEER/ACS AML incidence; Venclexta sales; Cheever 2009 (WT1 = NCI #1 antigen). Full clickable lists live in each tab's **References**.

Community due-diligence framing (the lead-time/IRM argument, fitted-scenario tables, binding-vs-weighted-test discussion) is attributed to **"Confident Web" (u/Confident-Web-7118)** and incorporated as *adjustable scenarios, not established fact*.

### Event anchoring policy (REGAL)

Confirmed PR milestones are **locked** where forward projection applies:

| Events | Month | Source |
|--------|-------|--------|
| 60 | ~46 | Jan 2025 interim PR |
| 72 | ~58 | Dec 2025 PR |
| 78 | ~63 (11 May 2026) | Q1 2026 PR |
| 80 | TBD | protocol |

- **Forward projection** (80th-event timing, readout power when cutoff &gt; m63, MC conditional power): `eventsAtAnchored` locks 78 @ m63; only model increments beyond the anchor count.
- **Consistency scoring** (`consistent`, `eventErr`, inverse solver, Poisson likelihood, preset e46/e58/e63 columns): full trajectory from t=0 via `eventsAt` — intentionally tests whether parameters reproduce announced counts; UI labels these as **model-implied** vs **confirmed PR** anchors.
- **Milestone backtest**: truncated Poisson likelihood through each historical `dataThrough` month — does not re-fit with hindsight.

Regression checks for anchoring live in `tests/math.test.js` (`T80`, `t80Analysis`, `Tfor`, `eventsAtAnchored`).

### Community DD validation (REGAL tab)

A **Community perspectives (validated)** panel (lazy-loaded on expand) synthesizes high-signal posts from **u/Thetamancer**, **u/uhguy85**, **u/Remarkable-Big-9849**, **u/neo2551**, and cross-checks **u/uhdisj41** against primary sources (ClinicalTrials.gov, SELLAS IR/GlobeNewswire, SEC, Jamy/Cicic design paper, Kurosawa 2010, Nalin et al. 2026 control-arm meta-analysis). Each claim is tagged ✅ verified / ⚠️ partial / ❌ not as fact / 🔬 model output. Reddit URLs are linked; model-only numbers (e.g. 99.99% MC success, Bayes 62× strawman, unverified BAT HSCT fractions) are excluded from factual display or explicitly caveated.

## Run locally
Serve the repo root as static files (ES modules require HTTP — `file://` will not load `js/main.js`):

```bash
python3 -m http.server 8080
# open http://localhost:8080/
```

Or open via any static host. No build step, no npm dependencies, no server-side storage. Vercel Web Analytics loads only on `*.vercel.app` deployments (not local file open).

Math regression: `npm test` (or `node verify_math.js`) — loads `js/math/survival.js` via the test suite in `tests/`. Also runs in GitHub Actions on push/PR to `main` (see `.github/workflows/verify-math.yml`).

## File structure

```
SLS-Model/
├── index.html          # HTML shell, meta/OG tags, analytics snippet, AGPL footer
├── RESEARCH.md         # Tagged DD memo (verified / partial / community / rejected)
├── css/
│   └── main.css        # All styles (~340 lines)
├── js/
│   ├── main.js         # App init, tabs, REGAL/SLS-009/valuation/explain UI, MC, share URL
│   ├── ui/state.js     # Share encoding, valuation metrics, header-strip helpers
│   └── math/
│       └── survival.js # Pure survival/HR/event math (CI-tested via verify_math.js)
├── tests/              # Node test runner (math, presets, share URL, valuation)
├── verify_math.js      # Back-compat alias → npm test
├── package.json        # `"type": "module"`; npm test only (no build)
├── vercel.json         # Static deploy config
└── tools/
    └── finalize_split.cjs  # Re-split from monolithic index.html (maintenance)
```

## Shareable scenario links
Every slider, tab, preset, and mode can be encoded in the URL hash — **fully client-side, zero server storage**:

```
https://sls-model.vercel.app/#s=eyJ2IjoxLCJ0YWIiOiJncHMiLCJyZWdhbE1vZGUiOiJmb3J3YXJkIi...
```

Click **Copy share link** in the header to copy the current scenario. On load, if `#s=...` is present, the app decodes base64url JSON and restores state before the first render. No backend, database, or localStorage required.

## Embed mode
Strip chrome for iframe embeds — active tab content, sliders, charts, and core functionality only:

```
https://sls-model.vercel.app/?embed=1#s=eyJ2IjoxLCJ0YWIiOiJncHMi...
```

Hides header branding excess, footer, bottom nav, share/print toolbar, methodology/how-it-works panels, and readout tracker. White background, minimal padding. Mobile bottom nav is also hidden in embed mode.

## Deploy (Vercel)
This is a zero-config static site. Import the GitHub repo at [vercel.com/new](https://vercel.com/new); Vercel serves `index.html` automatically. Assign the domain `sls-model.vercel.app` in the project's Domains settings. Enable **Web Analytics** in the Vercel project settings → **Analytics** tab (required for visitor counts to flow).

## Contributing
PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The whole point is to **poke holes**: challenge an assumption, tighten a prior, fix a method, add a source. Please cite primary sources for any factual change.

## License
**GNU AGPL-3.0-or-later** — free for everyone to use, run, study, share, and improve. If you modify it and run it on a server, you must offer users your modified source too (the AGPL network clause). This keeps it open and free for all; it cannot be taken private. See [LICENSE](LICENSE).

Copyright © 2026 sterno874 and contributors.
