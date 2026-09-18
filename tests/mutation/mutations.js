/**
 * Hand-crafted mutants for formula-critical modules.
 * Each mutation applies a single semantic change that should break at least one test
 * when the suite has adequate assertions on survival.js / state.js math.
 */
export const MUTATION_TARGETS = [
  // --- survival.js constants ---
  {
    id: "surv-THRESH",
    file: "js/data/model-config.js",
    description: "THRESH 0.636 → 0.637 (final efficacy HR boundary)",
    apply: (s) => s.replace("designHr: 0.636", "designHr: 0.637")
  },
  {
    id: "surv-IFLOOR",
    file: "js/math/survival.js",
    description: "IFLOOR 0.547 → 0.548 (interim efficacy floor)",
    apply: (s) => s.replace("IFLOOR=0.547", "IFLOOR=0.548")
  },
  {
    id: "surv-E3",
    file: "js/data/model-config.js",
    description: "E3 anchor 78 → 79 (m63 event lock)",
    apply: (s) => s.replace("may2026: 78", "may2026: 79")
  },
  {
    id: "surv-N_ARM",
    file: "js/data/model-config.js",
    description: "N_ARM 63 → 64 (per-arm enrollment)",
    apply: (s) => s.replace("perArm: 63", "perArm: 64")
  },
  {
    id: "surv-ZFINAL",
    file: "js/math/survival.js",
    description: "ZFINAL 2.012 → 2.112 (final boundary Z)",
    apply: (s) => s.replace("ZFINAL=2.012", "ZFINAL=2.112")
  },

  // --- hazard ratio ---
  {
    id: "surv-HR-flip",
    file: "js/math/survival.js",
    description: "hazardRatio: invert (Og/Eg)/(Ob/Eb) ratio",
    apply: (s) =>
      s.replace(
        "const hr=(Eb<1e-9||Eg<1e-9)?NaN:(Og/Eg)/(Ob/Eb)",
        "const hr=(Eb<1e-9||Eg<1e-9)?NaN:(Ob/Eb)/(Og/Eg)"
      )
  },
  {
    id: "surv-HR-step",
    file: "js/math/survival.js",
    description: "hazardRatio integration step h=0.5 → 0.6",
    apply: (s) =>
      s.replace(
        "function hazardRatio(T,p){return scoreParts(T,p,0.5).hr;}",
        "function hazardRatio(T,p){return scoreParts(T,p,0.6).hr;}"
      )
  },

  // --- events ---
  {
    id: "surv-events-cens",
    file: "js/math/survival.js",
    description: "censoring reaches its stated loss fraction at month 35 instead of 36",
    apply: (s) => s.replace("Math.max(0,t)/36", "Math.max(0,t)/35")
  },
  {
    id: "surv-events-anchored",
    file: "js/math/survival.js",
    description: "eventsAtAnchored adds +1 to anchor offset",
    apply: (s) =>
      s.replace(
        "return E3+(eventsAt(T,p,bins)-modelAtAnchor);",
        "return E3+1+(eventsAt(T,p,bins)-modelAtAnchor);"
      )
  },
  {
    id: "surv-armDeaths-weight",
    file: "js/math/survival.js",
    description: "armDeaths uses w*2 enrollment weight",
    apply: (s) => s.replace("t,h,N_ARM).deaths;", "t,h,N_ARM*2).deaths;")
  },

  // --- survival curves ---
  {
    id: "surv-poolS-weight",
    file: "js/math/survival.js",
    description: "poolS arm weight 0.5 → 0.51",
    apply: (s) => s.replace("return 0.5*sBAT(t,p)+0.5*sGPS(t,p);", "return 0.51*sBAT(t,p)+0.49*sGPS(t,p);")
  },
  {
    id: "surv-sBATbase-cure",
    file: "js/math/survival.js",
    description: "sBATbase cure term uses batc+0.01 offset",
    apply: (s) =>
      s.replace(
        "return p.batc+(1-p.batc)*Math.exp(-Math.pow(t/lam,kk));",
        "return p.batc+0.01+(1-p.batc)*Math.exp(-Math.pow(t/lam,kk));"
      )
  },
  {
    id: "surv-sGPS-delay",
    file: "js/math/survival.js",
    description: "sGPSbase GPS uncured uses gpsu+1 in exponent",
    apply: (s) =>
      s.replace(
        "Math.exp(-LN2*(t-d)/p.gpsu);",
        "Math.exp(-LN2*(t-d)/(p.gpsu+1));"
      )
  },
  {
    id: "surv-txMix",
    file: "js/math/survival.js",
    description: "txMix uses xtx*1.1 transplant fraction",
    apply: (s) =>
      s.replace(
        "(1-p.xtx)*base+p.xtx*atTx*Stx(t-TX_MONTH)",
        "(1-p.xtx)*base+p.xtx*1.1*atTx*Stx(t-TX_MONTH)"
      )
  },

  // --- log-rank / conditional power ---
  {
    id: "surv-analyzeLR-hr",
    file: "js/math/survival.js",
    description: "analyzeLR HR formula inverted",
    apply: (s) =>
      s.replace(
        "const hr=(Eb<1e-9||Eg<1e-9)?NaN:(Og/Eg)/(Ob/Eb)",
        "const hr=(Eb<1e-9||Eg<1e-9)?NaN:(Ob/Eb)/(Og/Eg)"
      )
  },
  {
    id: "surv-analyzeLR-efficiency",
    file: "js/math/survival.js",
    description: "score applies unsupported 0.90 efficiency factor",
    apply: (s) =>
      s.replace(
        "z=(V<1e-9)?0:U/Math.sqrt(V)",
        "z=(V<1e-9)?0:U/Math.sqrt(V)*Math.sqrt(0.9)"
      )
  },
  {
    id: "surv-condPow-rho",
    file: "js/math/survival.js",
    description: "condPow correlation uses sqrt(61/Dan) not 60",
    apply: (s) => s.replace("const rho=Math.sqrt(60/finalInfo)", "const rho=Math.sqrt(61/finalInfo)")
  },
  {
    id: "surv-condPow-ZEFF",
    file: "js/math/survival.js",
    description: "condPow upper integration bound ZEFF+0.1",
    apply: (s) => s.replace("const M=24,lo=zf,hi=ZEFF", "const M=24,lo=zf,hi=ZEFF+0.1")
  },

  // --- T80 / verdict ---
  {
    id: "surv-T80PrPace",
    file: "js/math/survival.js",
    description: "T80PrPace uses E3-E2+1 in numerator",
    apply: (s) => s.replace("return T3+(80-E3)/rate;", "return T3+(80-E3-1)/rate;")
  },
  {
    id: "surv-consistent-e1",
    file: "js/math/survival.js",
    description: "consistent() e46 tolerance ±4 → ±0 (strict)",
    apply: (s) => s.replace("Math.abs(e1-E1)>4", "Math.abs(e1-E1)>0")
  },
  {
    id: "surv-passesVerdict-median",
    file: "js/math/survival.js",
    description: "passesVerdict median check inverted (pm>13.5 → pm<13.5)",
    apply: (s) => s.replace("return pm===null||pm>13.5;", "return pm===null||pm<13.5;")
  },
  {
    id: "surv-isBiologicallyPlausible-cap",
    file: "js/math/survival.js",
    description: "isBiologicallyPlausible BAT cap 15 → 25 (always passes ridge)",
    apply: (s) => s.replace("if(bm!==null&&bm>BAT_MED_CAP)return false;", "if(bm!==null&&bm>25)return false;")
  },
  {
    id: "surv-enrollCDF",
    file: "js/data/model-config.js",
    description: "enrollCDF LMAX 38 → 39",
    apply: (s) => s.replace("enrollmentEndMonth: 38", "enrollmentEndMonth: 39")
  },

  // --- Poisson / normal ---
  {
    id: "surv-lpois-zero",
    file: "js/math/survival.js",
    description: "lpois zero-lambda returns 0 instead of 0/-1e9 branch",
    apply: (s) => s.replace("if(lam<=1e-9)return k===0?0:-1e9;", "if(lam<=1e-9)return 0;")
  },
  {
    id: "surv-Phi",
    file: "js/math/survival.js",
    description: "Phi(0) biased high (+0.01)",
    apply: (s) => s.replace("return 0.5*(1+s*y);", "return 0.5*(1+s*y)+0.01;")
  },

  // --- state.js valuation ---
  {
    id: "state-EV-mult",
    file: "js/ui/state.js",
    description: "computeValuationMetrics EV uses mult+1",
    apply: (s) => s.replace("const EV = totPeak * mult + platform * 1000;", "const EV = totPeak * (mult+1) + platform * 1000;")
  },
  {
    id: "state-gpool",
    file: "js/ui/state.js",
    description: "gpool omits cr1 term",
    apply: (s) => s.replace("const gpool = (cr2 + cr1) * gpen * gyears;", "const gpool = cr2 * gpen * gyears;")
  },
  {
    id: "state-riskadj-gps",
    file: "js/ui/state.js",
    description: "risk-adjusted GPS uses pG*1.1",
    apply: (s) => s.replace("gpsPeak *= pG;", "gpsPeak *= pG*1.1;")
  },
  {
    id: "state-equity-no-cash",
    file: "js/ui/state.js",
    description: "equity $/sh omits cash (EV only)",
    apply: (s) => s.replace("const equity = EV + cash;", "const equity = EV;")
  },
  {
    id: "state-b64-pad",
    file: "js/ui/state.js",
    description: "b64urlEncode skips -/_ URL-safe substitution",
    apply: (s) =>
      s.replace(
        'return b64.replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");',
        'return b64.replace(/=+$/, "");'
      )
  }
];

/** Formula-critical test files (exclude DOM/smoke for speed). */
export const MUTATION_TEST_FILES = [
  "mutation-critical.test.js"
];
