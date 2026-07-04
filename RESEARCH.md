# SELLAS Life Sciences ($SLS) — Due Diligence Memo

**As of:** 4 Jul 2026  
**Ticker:** **SLS** — SELLAS Life Sciences Group, Inc. (NASDAQ)  
**CIK:** [0001390478](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001390478)  
**Disclaimer:** Educational research for the SLS-Model app. Not investment, legal, or medical advice. Every material claim below is tagged **verified** / **partial** / **community** / **rejected** and linked where possible.

---

## Executive summary

SELLAS is a clinical-stage oncology company with two lead programs: **GPS (galinpepimut-S)**, a WT1-targeting immunotherapy in pivotal Phase 3 **REGAL** (AML CR2 maintenance), and **SLS-009 (tambiciclib)**, a selective CDK9 inhibitor in Phase 2 for AML (r/r + frontline expansion).

**Bull case (verified elements):** REGAL event pace (60 → 72 → 78 of 80) is slower than design assumptions; IDMC continued at interim; SLS-009 single-arm Ph2 shows large OS fold vs historical benchmarks; ~$107M cash (Mar 2026); WT1 is NCI #1-ranked cancer antigen.

**Bear case (verified elements):** Arm-level REGAL HR is **non-identifiable** from blinded pooled counts; Onureg (closest maintenance analog) had modest commercial uptake despite a positive trial; magrolimab $4.9B pre-approval deal failed Ph3; rapid dilution (basic shares ~90M → ~181.3M YoY); SLS-009 r/r evidence is single-arm.

**Model framing:** Header strip uses a **biology-first (bullish)** scenario (42% GPS cure, cw42 inverse → readout HR ~0.25) with **live risk-adj equity $/sh** at default P(GPS)≈65% / P(SLS)≈55%. Neutral-ridge HR fits (~0.45–0.64) remain plausible under identifiability. Not a price target.

---

## Company & capital structure

| Field | Value | Tag | Source |
|-------|-------|-----|--------|
| Legal name | SELLAS Life Sciences Group, Inc. | verified | SEC filings |
| Cash (Mar 31, 2026) | **$107.1M** (+ $7.5M warrant proceeds in Q2 to date) | verified | [Q1 2026 PR](https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html) |
| Q1 2026 net loss | ~$8.4M (~$9M/qtr opex) | verified | Q1 2026 PR |
| Runway | ≥12 months from Q1 2026 filing (going concern) | verified | [Q1 2026 10-Q](https://www.sec.gov/Archives/edgar/data/1390478/000139047826000008/sls-20260331.htm) |
| **Basic shares outstanding** | **~181.3M** (Mar 31, 2026) | verified | [Q1 2026 10-Q](https://www.sec.gov/Archives/edgar/data/1390478/000139047826000008/sls-20260331.htm) · [Q1 2026 PR](https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html) |
| **FD modeled (app default)** | **~222M** (basic + warrants/options/RSUs) | partial — model | Tab 3 valuation default |
| ATM facility | Up to $150M authorized; unused to date | verified | Q1 2026 PR |
| Dilution | Basic shares rose ~90M → ~181.3M in ~12 mo | verified | Q1 2026 PR |

**Share-count narrative (canonical):** Use **basic outstanding ~181.3M** (Q1 2026 10-Q/PR) vs **FD modeled ~222M**. Do **not** treat bare “~196M” as the model denominator.

**Equity $/sh identity (model):** `equity $/sh = (EV + cash) / FD shares` — cash default $107.1M.

---

## REGAL / GPS (Phase 3)

| Item | Detail | Tag |
|------|--------|-----|
| Trial | REGAL — GPS vs BAT in AML CR2, transplant-ineligible | verified |
| NCT | [NCT04229979](https://clinicaltrials.gov/study/NCT04229979) | verified |
| Design | Event-driven ITT OS, N=127, 1:1, win if HR &lt; 0.636 at 80 deaths (one-sided α=0.025) | verified — [Jamy & Cicic, *Future Oncol* 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/) |
| Interim | IDMC continued at 60 deaths (Jan 2025); OBF early-stop HR ≲ 0.55 | verified — [interim PR](https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html) |
| Event anchors | **60** @ ~m46; **72** @ ~m58; **78** @ ~m63 (11 May 2026) | verified — PRs |
| Final | 80 events — TBD | verified — protocol |
| Modality | WT1 peptide vaccine (MSK license); WT1 = NCI #1 antigen | verified — [Cheever 2009](https://pubmed.ncbi.nlm.nih.gov/19723653/) |

### Event anchors (locked)

| Events | Month | Source | Tag |
|--------|-------|--------|-----|
| 60 | ~46 | Jan 2025 interim PR | verified |
| 72 | ~58 | Dec 2025 PR | verified |
| 78 | ~63 (11 May 2026) | Q1 2026 PR | verified |
| 80 | TBD | protocol | verified |

### Biology-first vs neutral ridge

| Scenario | Readout HR (model) | Tag |
|----------|-------------------|-----|
| Biology-first (42% GPS cure, cw42 inverse) | ~**0.25** | model — structural prior |
| Neutral-anchor ridge fits | ~**0.45–0.64** | model — identifiability ridge |
| HR≈1 “null effect” ridge | Rejected on biology + event pace | rejected |

**Identifiability:** Public data are **pooled** death totals only. Arm-level HR is **non-identified** without the split or strong structural assumptions (**verified** as a statistical fact; any point HR imports priors).

**Control-arm priors:** Kurosawa *Haematologica* 2010 whole-cohort no-HCT 3-yr OS ~14% (not pure CR2; CR2 subgroups higher) — **verified**. Ven-era salvage mOS ~8–12 mo (Stahl 2021) — **verified**.

### Lead-time / left-truncation sensitivity (display only)

REGAL entry requires CR2→randomization **≤6 months** and **>6 months** life expectancy — a positively selected (left-truncated) cohort relative to from-CR2 literature clocks ([Suissa 2008](https://academic.oup.com/aje/article/167/4/492/233064); [CW IRM post](https://www.reddit.com/r/sellaslifesciences/comments/1tnh66g/why_the_randomization_window_leads_to_an/)).

| Clock | Role in app | Tag |
|-------|-------------|-----|
| **From randomization (IRM)** | Primary: `eventsAt`, `passesVerdict`, chart fit, HR gauges | model — locked to PR anchors |
| **Implied CR2-onset** | Display: ≈ max(0, IRM − lead), lead slider 0–6 mo (default **3**) | assumption — sensitivity |

**Does not change:** event engine, biology caps, IA non-stop interpretation, or valuation. Under proportional hazards a common lead-time shift leaves HR unchanged; it only reconciles absolute medians with Stahl/Kurosawa-style from-CR2 benchmarks. Event fit remains a **post-selection cohort** readout.

---

## SLS-009 (tambiciclib / CDK9)

| Item | Detail | Tag |
|------|--------|-----|
| NCT | [NCT04588922](https://clinicaltrials.gov/study/NCT04588922) | verified |
| Setting | Open-label single-arm Ph2 + Aza/Ven, post-Ven r/r AML-MR | verified |
| Key efficacy | ORR 46% (58% 1-prior-line); CR/CRi 29%; least-pretreated mOS **8.9 mo** vs ~2.5–2.6 historical | verified — ASH 2025 / [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1390478/000139047826000004/sls-202603198xkexhibit991.htm) |
| Historical bench | Zainaldin 2022 ~2.4–2.6 mo; Stahl-like salvage up to ~6 mo | verified / partial |
| Frontline | Randomized ~80-pt Ph2 enrolling (first patient Mar 2026); VIALE-A control anchor mOS 14.7, HR 0.66 | verified — [DiNardo NEJM 2020](https://pubmed.ncbi.nlm.nih.gov/32023337/) · [Mar 2026 PR](https://ir.sellaslifesciences.com/news/News-Details/2026/SELLAS-Life-Sciences-Announces-Enrollment-of-First-Patient-in-Newly-Diagnosed-First-Line-AML-Trial-of-SLS009/default.aspx) |
| Evidence grade | Single-arm vs historical — selection / immortal-time confounding | partial |

**Rejected:** Treating r/r single-arm OS fold as equivalent to a randomized registrational win.

---

## Valuation framework (model)

| Input | Default | Tag |
|-------|---------|-----|
| GPS starts (CR2 + CR1) | 2,800 + 5,500 /yr | community — CW / SEER funnel |
| GPS pen / price / years | 45% / $145K / 2.8 yr | assumption |
| SLS-009 pools | 9,000 FL + 3,500 r/r | community / estimate |
| SLS pen / price / years | 38% / $145K / 1.4 yr | assumption |
| Multiple | 5× peak | convention (oncology M&A ~4–8×) |
| WT1 platform lump | $2.5B | assumption |
| P(GPS) / P(SLS-009) | 65% / 55% | assumption — user priors |
| Cash | $107.1M | verified |
| FD shares | 222M | partial — model |

**Identities:**

- `Peak = starts × penetration × years × price`
- `EV = (Peak_GPS + Peak_SLS) × multiple + platform` (peaks optionally × P(approval))
- `Equity $/sh = (EV + cash) / FD shares`

**Base risk-adj equity $/sh (app defaults):** ≈ **$45.88** (biology-first valuation preset, P(GPS)=65%, P(SLS)=55%, cash $107.1M, 222M FD). Gross @100% success ≈ **$68**/sh.

### Comparables

| Comp | Figure | Tag | Lesson |
|------|--------|-----|--------|
| Venclexta (venetoclax) | ~$2.58B sales 2024 | verified — AbbVie SEC | AML blockbuster ceiling |
| Gilead–Forty Seven (magrolimab) | ~$4.9B pre-approval | verified — [SEC](https://www.sec.gov/Archives/edgar/data/1667633/000110465920043980/a20-14980_68k.htm) | Buyers pay big pre-Ph3; Ph3 ENHANCE discontinued 2023 |
| Onureg (QUAZAR) | mOS 24.7 vs 14.8; sales not broken out | verified / partial | Closest GPS analog — clinical win, modest uptake |
| Regor CDK deal | ~$850M on Ph1 ~28% CR | community | Early M&A ceiling for CDK-class — not clinical equivalence |

**Rejected community claims:** “$5–20B guaranteed buyout”; “SLS worth $50+/sh on REGAL alone” without disclosed talks.

---

## Epidemiology

| Fact | Value | Tag |
|------|-------|-----|
| US AML incidence | ~20,800/yr (SEER); ~22,720 (ACS 2026) | verified |
| Relapse after CR | &gt;60% | verified — ACS |
| CR2 / CR1-nontransplant pools | ~3K / ~6K new/yr | community — CW DD from SEER funnel |

---

## WT1 platform

| Fact | Tag | Source |
|------|-----|--------|
| WT1 #1-ranked cancer antigen (NCI working group) | verified | [Cheever 2009](https://pubmed.ncbi.nlm.nih.gov/19723653/) |
| GPS follow-ons: ovarian (Ph2 completed), mesothelioma, GPS-Plus, China license | verified | [Corp deck Feb 2026](https://s203.q4cdn.com/139585304/files/doc_presentations/2026/Feb/03/Sellas-Corporate-Overview-February-2026.pdf) |
| SLS-009 is CDK9, **not** WT1-targeted | verified | Company disclosures |

---

## Tag legend

| Tag | Meaning |
|-----|---------|
| **verified** | Primary source (SEC, PR, CT.gov, peer-reviewed) supports the claim as stated |
| **partial** | Directionally supported but incomplete, qualitative, or confounded |
| **community** | DD / Reddit synthesis — useful prior, not a filing fact |
| **rejected** | Contradicted by primary sources or statistically indefensible |
| **model** | App output / structural assumption — scenario, not a forecast |

---

## Primary references

1. [REGAL design — Jamy & Cicic, *Future Oncol* 2025 (PMC11760237)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/)
2. [REGAL CT.gov NCT04229979](https://clinicaltrials.gov/study/NCT04229979)
3. [SLS-009 CT.gov NCT04588922](https://clinicaltrials.gov/study/NCT04588922)
4. [Q1 2026 financials / 78-event update](https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html)
5. [Q1 2026 10-Q](https://www.sec.gov/Archives/edgar/data/1390478/000139047826000008/sls-20260331.htm)
6. [Cheever 2009 — WT1 antigen ranking](https://pubmed.ncbi.nlm.nih.gov/19723653/)
7. [Gilead–Forty Seven SEC EX-99.1](https://www.sec.gov/Archives/edgar/data/1667633/000110465920043980/a20-14980_68k.htm)
8. [QUAZAR / Onureg — Wei et al., NEJM 2020](https://www.nejm.org/doi/full/10.1056/NEJMoa2001094)
9. [VIALE-A — DiNardo et al., NEJM 2020](https://pubmed.ncbi.nlm.nih.gov/32023337/)
10. [Kurosawa et al., *Haematologica* 2010](https://haematologica.org/article/view/5781)
11. [SELLAS corp deck Feb 2026](https://s203.q4cdn.com/139585304/files/doc_presentations/2026/Feb/03/Sellas-Corporate-Overview-February-2026.pdf)
12. Community DD framing — [CW Part 1](https://www.reddit.com/r/ValueInvesting/comments/1ri8rrb/sls_deepest_due_diligence_for_regal_trial_from_a/)

Full clickable lists also live in each app tab’s **References** and the **Explain** tab (ELI5 → PhD).
