# NotebookLM Video Scripts — Bullet Outline

**Format:** 4–6 videos, ~2–4 minutes each. Each bullet ≈ one spoken beat. Cite primary sources when stating facts; label model numbers as "the open-source model estimates."

---

## Video 1: WT1 & GPS — Teaching the Immune System to Hunt Leukemia (~3 min)

**Hook:** "SELLAS isn't making a traditional chemo drug for its lead program — it's training your T cells."

- ✅ WT1 is a transcription factor overexpressed in most AML blasts ([Cheever 2009, PubMed 19723653](https://pubmed.ncbi.nlm.nih.gov/19723653/))
- ✅ NCI ranked WT1 **#1** of 75 cancer antigens for immunotherapy priority
- Even intracellular proteins get chopped into peptides displayed on MHC — T cells can "see" WT1 from outside
- GPS = **galinpepimut-S**: four WT1 peptides (two heteroclitic to break tolerance) + Montanide + GM-CSF
- ⚠️ Intended flow: APC priming → CD4 help + CD8 CTLs → lysis of WT1⁺ residual blasts
- **Visual:** `images/wt1-gps-ctl-mechanism.png`
- Why CR2 maintenance, not frontline debulking: vaccine clears minimal residual disease after remission
- ✅ Phase 2 CR2 (n=10): mOS 16.3 vs 5.4 mo — small, no plateau ([Brayer 2015](https://pubmed.ncbi.nlm.nih.gov/?term=Brayer+WT1+vaccination+AML+MDS+pilot+synthetic+analog+peptides))
- Honest close: REGAL Phase 3 is **blinded** — we don't know if this works at scale yet

---

## Video 2: CDK9, MCL-1, and SLS-009 (~3 min)

**Hook:** "When venetoclax stops working, leukemia cells often switch to a backup escape protein."

- ✅ CDK9 + cyclin T = P-TEFb → phosphorylates Pol II CTD Ser2 → transcription elongation ([PMC8143439](https://pmc.ncbi.nlm.nih.gov/articles/PMC8143439/))
- Short-lived transcripts: **MCL-1** and **MYC** — MCL-1 protein turns over in ~1 hour
- Block CDK9 → MCL-1 collapses fast → apoptosis
- **Visual:** `images/cdk9-mcl1-myc-apoptosis.png`
- Venetoclax blocks BCL-2; resistant cells upregulate MCL-1 ([PMC8858957](https://pmc.ncbi.nlm.nih.gov/articles/PMC8858957/))
- ⚠️ SLS-009 (tambiciclib) rationale: dual BCL-2 + MCL-1 blockade with AZA/VEN
- ✅ Phase 2 single-arm [NCT05309745](https://clinicaltrials.gov/study/NCT05309745): ORR 46%, mOS 8.9 mo ([ASH 2025](https://ir.sellaslifesciences.com/news/News-Details/2025/SELLAS-Life-Sciences-Presents-Positive-Phase-2-Data-of-SLS009-in-Combination-with-AZAVEN-in-RelapsedRefractory-AML-MR-at-ASH-2025/default.aspx))
- vs ~2.5 mo historical ([Zainaldin 2022](https://doi.org/10.1080/10428194.2022.2113530)) — **not** a randomized comparison
- Caveat: single-arm, selection bias, small n=35 at ASH cut

---

## Video 3: REGAL by the Numbers — 60, 72, 78 Events (~3 min)

**Hook:** "The trial ends when 80 patients die — and we're at 78. But which arm? Nobody outside the trial knows."

- ✅ [NCT04229979](https://clinicaltrials.gov/study/NCT04229979): 127 patients, 1:1 GPS vs BAT, OS primary
- Event anchors: **60 @ m46** (Jan 2025) → **72 @ m58** (Dec 2025) → **78 @ m63** (May 2026) — all **pooled**
- IDMC said continue at 60 events ([Jan 2025 PR](https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html))
- Win threshold: HR **< 0.636** at 80 events ([Jamy & Cicic 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11760237/))
- Interim efficacy floor (not crossed): HR **≤ 0.547** at 60 events
- Nov 2022: blinded pooled mOS ~2× longer than design expected
- **Visual:** `images/regal-mixture-cure-survival.png`
- 🔬 Best Available Guess model: readout HR ~**0.46**, interim HR @ m46 ~**0.44**
- Key honesty: event pace suggests pooled survival above historical CR2 — but magnitude is unidentifiable pre-unblind

---

## Video 4: Forward vs Inverse Modeling & P(win) (~3 min)

**Hook:** "Blinded event counts are a puzzle with missing pieces — here's how the model solves it two different ways."

- **Forward:** set survival parameters → check if 60/72/78 fit
- **Inverse:** lock events + GPS cure % → solver derives BAT/GPS medians
- **Visual:** `images/forward-vs-inverse-methodology.png`
- Mixture-cure GPS + Weibull BAT + transplant ITT tail
- Monte Carlo: sample priors → Poisson-weight by event increments → P(win)
- Binding interim: ~**50%** P(win) | Non-binding: ~**78%** — same survival, different IA assumption
- Preset tour: Bear HR ~0.55 (near-miss) | Best ~0.46 | Bull ~0.17 | No-effect ridge HR = 1.0
- Identifiability ridge: null-effect world **also fits** 60/72/78
- Close: P(win) is a **model output**, not a company forecast

---

## Video 5: SLS-009 — Bull, Base, Bear (~2.5 min)

**Hook:** "8.9 months sounds great — until you ask: compared to what, and was there a control group?"

- ✅ Facts: ORR 46%, CR/CRi 29%, mOS 8.9 mo, 30 mg BIW optimal dose
- Benchmark range: 2.4 mo (Zainaldin) to 6.1 mo (Stahl) depending on cohort
- 🔬 Model presets: Observed 3.6× fold (2.5 mo bench) | Best 3.2× (2.8 mo) | Bear 1.9× (3.5 mo)
- Frontline: VIALE-A anchor 14.7 mo ([NEJM 2020](https://www.nejm.org/doi/full/10.1056/NEJMoa2012971)); frontline Ph2 started Mar 2026
- Limitations: single-arm, immortal time, CDK9 competitors (voruciclib, QHRD107)
- FDA guidance to expand — not the same as approval

---

## Video 6: Valuation & Buyout Scenarios (~3 min)

**Hook:** "If both drugs work, what's the company worth? Here's the transparent math — and where it breaks."

- **Visual:** `images/valuation-ev-methodology.png`
- Formula: peak = starts × penetration × years × price; EV = peak × multiple + platform
- 🔬 Best Available Guess: ~$2.5B combined peak → ~$15B gross EV → ~**$67/share** (222M FD)
- Risk-adjusted (65% GPS, 55% SLS): ~**$45/share**
- Comps: Venclexta ~$2.6B sales (ceiling) | Gilead–Forty Seven $4.9B (**failed** Ph3 — cautionary)
- Onureg: great trial, modest commercial uptake — caps maintenance optimism
- Conservative preset: ~$15/share | Bull: ~$141/share
- Close: every slider is an assumption; REGAL binary resets the whole GPS thesis

---

## Production Notes

- Open with disclaimer: educational only, not investment advice
- Use tag language: "verified fact," "model estimate," "community theory"
- Link viewers to [sls-model.vercel.app](https://sls-model.vercel.app) for interactive exploration
- Upload `notebooklm-source.md` + all five images as NotebookLM sources
