import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { P, INV } from "./fixtures/presets.js";
import { EXPLAIN_LEVELS, VALID_TABS } from "../js/ui/state.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const css = readFileSync(path.join(root, "css", "main.css"), "utf8");
const js = readFileSync(path.join(root, "js/main.js"), "utf8");
const bioJs = readFileSync(path.join(root, "js/ui/bio-diagrams.js"), "utf8");

function matchAll(re, text) {
  const out = [];
  let m;
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = g.exec(text)) !== null) out.push(m);
  return out;
}

test("index.html links css/main.css", () => {
  assert.match(html, /href="css\/main\.css(?:\?[^"]*)?"/);
});

test("best estimate strip has mobile card layout", () => {
  const strip = matchAll(/<div id="bestEstStrip"[\s\S]*?<\/div>\s*<\/header>/g, html)[0][0];
  for (const id of ["bePresetLabel", "beGpsHr", "beSlsHr", "beBuyout", "beLivePrice", "beVsMkt"]) {
    assert.match(strip, new RegExp(`id="${id}"`));
  }
  assert.match(css, /@media\(max-width:640px\)\{[\s\S]*\.best-est-strip\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:640px\)\{[\s\S]*\.best-est-item\{[^}]*flex-direction:column/);
  assert.match(css, /@media\(max-width:380px\)\{[\s\S]*\.best-est-strip\{grid-template-columns:1fr\}/);
});

test("index.html loads js/main.js as ES module", () => {
  assert.match(html, /type="module" src="js\/main\.js"/);
});

test("all data-preset buttons map to forward P keys", () => {
  const presets = [
    ...new Set(matchAll(/data-preset="([^"]+)"/g, html).map((m) => m[1]))
  ];
  assert.ok(presets.length > 0);
  for (const name of presets) {
    assert.ok(name in P, `data-preset="${name}" missing from P fixture`);
  }
});

test("all data-inv buttons map to inverse INV keys", () => {
  const invPresets = [
    ...new Set(matchAll(/data-inv="([^"]+)"/g, html).map((m) => m[1]))
  ];
  assert.ok(invPresets.length > 0);
  for (const name of invPresets) {
    assert.ok(name in INV, `data-inv="${name}" missing from INV fixture`);
  }
});

test("inverse-only buttons are not duplicated as data-preset", () => {
  const invOnly = matchAll(/data-inv="([^"]+)"/g, html).map((m) => m[1]);
  const forward = matchAll(/data-preset="([^"]+)"/g, html).map((m) => m[1]);
  for (const name of invOnly) {
    assert.ok(
      !(name in P) || !forward.includes(name),
      `${name} should be inverse-only, not also a forward preset button`
    );
  }
});

test("top tab buttons exist with expected data-tab values", () => {
  const tabs = matchAll(/class="tabbtn[^"]*"[^>]*data-tab="([^"]+)"/g, html).map(
    (m) => m[1]
  );
  assert.equal(tabs.length, 6);
  assert.deepEqual(tabs, VALID_TABS);
});

test("mobile nav panel exposes all six tabs", () => {
  const navTabs = matchAll(
    /<div id="mobileNavPanel"[\s\S]*?<\/div>/g,
    html
  )[0][0].match(/data-tab="([^"]+)"/g).map((s) => s.slice(10, -1));
  assert.equal(navTabs.length, 6);
  assert.deepEqual(navTabs, VALID_TABS);
});

test("mobile nav selector is discoverable", () => {
  const selector = matchAll(/<div class="hdr-nav-mobile[\s\S]*?<\/div>/g, html)[0][0];
  assert.match(selector, /id="navToggle"/);
  assert.match(selector, /<span class="nav-toggle-label">Sections<\/span>/);
  assert.match(selector, /id="hdrActiveTab"/);
  assert.doesNotMatch(selector, /<\/button>\s*<span class="hdr-active-tab"/);
  assert.match(css, /\/\* mobile section selector \*\//);
  assert.match(css, /\.nav-toggle\{[^}]*width:100%/);
  assert.match(css, /\.nav-toggle-label\{[^}]*text-transform:uppercase/);
});

test("The Statistics tab is fully wired (page, header tab, mobile nav)", () => {
  assert.match(html, /id="tab-statistics"/);
  assert.match(html, /class="tabbtn"[^>]*data-tab="statistics"/);
  const nav = matchAll(/<div id="mobileNavPanel"[\s\S]*?<\/div>/g, html)[0][0];
  assert.match(nav, /data-tab="statistics"/);
  assert.match(js, /tabsRendered=\{[^}]*statistics/);
  assert.match(
    js,
    /\["gps","sls009","value","explain","statistics","biology"\]\.forEach\(id=>\{\$\("tab-"\+id\)/
  );
});

test("The Biology tab is fully wired (page, header tab, mobile nav)", () => {
  assert.match(html, /id="tab-biology"/);
  assert.match(html, /class="tabbtn"[^>]*data-tab="biology"/);
  const nav = matchAll(/<div id="mobileNavPanel"[\s\S]*?<\/div>/g, html)[0][0];
  assert.match(nav, /data-tab="biology"/);
  assert.match(js, /tabsRendered=\{[^}]*biology/);
  assert.match(
    js,
    /\["gps","sls009","value","explain","statistics","biology"\]\.forEach\(id=>\{\$\("tab-"\+id\)/
  );
});

test("The Statistics tab explains core math with SVG and selected image visuals", () => {
  const stats = matchAll(/<div id="tab-statistics"[\s\S]*?<!-- \/tab-statistics -->/g, html)[0][0];
  assert.match(stats, /Survival Function/);
  assert.match(stats, /CDF/);
  assert.match(stats, /hazard/i);
  assert.match(stats, /median OS/i);
  assert.match(stats, /Weibull/);
  assert.match(stats, /k=0\.7/);
  assert.match(stats, /mixture cure/i);
  assert.match(stats, /Enrollment Convolution/);
  assert.match(stats, /Inverse Solve/i);
  assert.match(stats, /Monte Carlo/);
  assert.match(stats, /log-rank/i);
  assert.match(stats, /O'Brien-Fleming/);
  assert.match(stats, /Conditional Power/i);
  assert.match(stats, /Pike-style HR/i);
  assert.match(stats, /stratF/);
  assert.match(stats, /risk-adjusted expected value/i);
  assert.match(stats, /Pooled Blinded Anchors/i);
  assert.ok(matchAll(/Math lesson/g, stats).length >= 8);
  assert.ok(matchAll(/REGAL application/g, stats).length >= 8);
  const svgs = matchAll(/<svg[^>]*class="stats-svg"/g, stats);
  assert.ok(svgs.length >= 6, `expected >=6 statistics diagrams, found ${svgs.length}`);
  const imgs = matchAll(/<img[^>]*src="assets\/statistics\/[^"]+\.jpg"[^>]*alt="[^"]+"/g, stats);
  assert.equal(imgs.length, 2);
  assert.match(stats, /assets\/statistics\/weibull-shape-timing\.jpg/);
  assert.match(stats, /assets\/statistics\/regal-pooled-event-anchors\.jpg/);
  assert.match(stats, /same median with k 0\.7 early risk and longer tail/i);
  assert.match(stats, /hidden GPS versus BAT arm split/i);
  assert.match(stats, /not patient-level REGAL data/i);
  assert.match(stats, /unblinding, not the pooled curve alone/i);
  for (const asset of [
    "weibull-shape-timing.jpg",
    "regal-pooled-event-anchors.jpg"
  ]) {
    assert.ok(statSync(path.join(root, "assets", "statistics", asset)).size < 300_000);
  }
});

test("The Statistics tab cites trial design and event-anchor sources", () => {
  const stats = matchAll(/<div id="tab-statistics"[\s\S]*?<!-- \/tab-statistics -->/g, html)[0][0];
  assert.match(stats, /pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC11760237/);
  assert.match(stats, /clinicaltrials\.gov\/study\/NCT04229979/);
  assert.match(stats, /3014244/);
  assert.match(stats, /3210926/);
  assert.match(stats, /3293399/);
  assert.match(stats, /README\.md/);
  assert.match(stats, /RESEARCH\.md/);
});

test("The Biology tab has labeled SVG diagrams and image explainers", () => {
  const bio = matchAll(/<div id="tab-biology"[\s\S]*?<!-- \/tab-biology -->/g, html)[0][0];
  const svgs = matchAll(/<svg[^>]*class="bio-svg"/g, bio);
  assert.ok(svgs.length >= 5, `expected >=5 diagrams, found ${svgs.length}`);
  const imgs = matchAll(/<img[^>]*src="assets\/biology\/[^"]+\.jpg"[^>]*alt="[^"]+"/g, bio);
  assert.ok(imgs.length >= 6, `expected >=6 biology images with alt text, found ${imgs.length}`);
  assert.match(bio, /assets\/biology\/wt1-cell-surface-presentation\.jpg/);
  assert.match(bio, /assets\/biology\/gps-heteroclitic-activation\.jpg/);
  assert.match(bio, /assets\/biology\/gps-mrd-battle-of-numbers\.jpg/);
  assert.match(bio, /assets\/biology\/gps-delivery-depot-alarm\.jpg/);
  assert.match(bio, /assets\/biology\/gps-hla-four-keys\.jpg/);
  assert.match(bio, /assets\/biology\/gps-cd4-cd8-t-cell-roles\.jpg/);
  assert.match(bio, /WT1 protein processed into peptides and displayed on MHC class I and II/);
  assert.match(bio, /native WT1 tolerance, GPS heteroclitic analog activation/);
  assert.match(bio, /active relapse with high tumor burden against CR2 remission/);
  assert.match(bio, /Montanide depot, GM-CSF alarm, dendritic cell pickup, and T cell training/);
  assert.match(bio, /different HLA locks across patients and four GPS peptide keys/);
  assert.match(bio, /CD8 killer T cell attacking a WT1 displaying leukemia cell/);
  assert.match(bio, /not a patient-level response prediction/);
  assert.match(bio, /not REGAL efficacy/);
  for (const asset of [
    "wt1-cell-surface-presentation.jpg",
    "gps-heteroclitic-activation.jpg",
    "gps-mrd-battle-of-numbers.jpg",
    "gps-delivery-depot-alarm.jpg",
    "gps-hla-four-keys.jpg",
    "gps-cd4-cd8-t-cell-roles.jpg"
  ]) {
    assert.ok(statSync(path.join(root, "assets", "biology", asset)).size < 300_000);
  }
  assert.match(bio, /<figcaption class="bio-figcaption"/);
  assert.match(bio, /<figcaption class="bio-image-caption"/);
  assert.match(bio, /<text /);
});

test("The Biology tab cites primary sources for each mechanism", () => {
  const bio = matchAll(/<div id="tab-biology"[\s\S]*?<!-- \/tab-biology -->/g, html)[0][0];
  assert.match(bio, /pubmed\.ncbi\.nlm\.nih\.gov\/19723653/); // Cheever 2009 WT1 #1
  assert.match(bio, /clinicaltrials\.gov\/study\/NCT04229979/); // REGAL/GPS
  assert.match(bio, /clinicaltrials\.gov\/study\/NCT04588922/); // SLS-009
  assert.match(bio, /pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC8143439/); // CDK9 review
  assert.match(bio, /haematologica\.org\/article\/view\/5781/); // Kurosawa
  const links = matchAll(/href="https?:\/\/[^"]+"/g, bio);
  assert.ok(links.length >= 15, `expected >=15 source links, found ${links.length}`);
});

test("The Biology tab has interactive diagram wiring", () => {
  assert.match(js, /initBioDiagrams/);
  assert.match(js, /bio-diagrams\.js/);
});

test("The Biology tab explains GPS peptide-HLA rationale without overclaiming", () => {
  const bio = matchAll(/<div id="tab-biology"[\s\S]*?<!-- \/tab-biology -->/g, html)[0][0];
  assert.match(bio, /GPS mechanism in plain English/);
  assert.match(bio, /T cells do not see the whole WT1 protein/);
  assert.match(bio, /Four keys, many HLA locks/);
  assert.match(bio, /Heteroclitic peptides try to break tolerance/);
  assert.match(bio, /CD8 killers plus CD4 help/);
  assert.match(bio, /Inside-out WT1 target system/);
  assert.match(bio, /CR2 maintenance is the right terrain/);
  assert.match(bio, /may give immune surveillance better odds/);
  assert.match(bio, /Short peptides can clear quickly/);
  assert.match(bio, /Montanide ISA 51/);
  assert.match(bio, /MHCflurry/);
  assert.match(bio, /MixMHC2pred/);
  assert.match(bio, /example computational screen/);
  assert.match(bio, /What this can support/);
  assert.match(bio, /What this does not prove/);
  assert.match(bio, /coherent mechanism/);
  assert.match(bio, /not clinical proof/i);
  assert.match(bio, /not clinical efficacy proof/i);
  assert.match(bio, /mechanism rationale, not clinical efficacy proof/i);
  assert.match(bio, /does not prove GPS clears residual disease/i);
  assert.doesNotMatch(bio, /destroyed exactly 99\.9/i);
  assert.doesNotMatch(bio, /steriliz/i);
  assert.match(bio, /schematic coverage logic/i);
  assert.match(bio, /not a patient-level response prediction/i);
});

test("The Biology tab labels evidence strength for key GPS claims", () => {
  const bio = matchAll(/<div id="tab-biology"[\s\S]*?<!-- \/tab-biology -->/g, html)[0][0];
  for (const label of [
    "Established biology",
    "Computational prediction",
    "Mechanistic rationale",
    "Small clinical studies",
    "REGAL hypothesis / Phase 3 unproven",
    "Class risk / failed elsewhere",
    "Not directly tested for GPS"
  ]) {
    assert.match(bio, new RegExp(label.replace(/[+]/g, "\\+"), "i"));
  }
  assert.match(bio, /How to read these claims/i);
  assert.match(bio, /Mechanism is not clinical proof/i);
  assert.match(bio, /REGAL survival benefit is unproven until unblinding/i);
  assert.match(bio, /immunogenicity .* documented in small GPS studies/i);
  assert.match(bio, /MHCflurry[\s\S]*Computational prediction/);
  assert.match(bio, /cancer peptide vaccines have a long history/i);
  assert.match(bio, /failures elsewhere are not direct evidence/i);
  assert.match(bio, /no human trial combines GPS \+ SLS-009/i);
  assert.ok(matchAll(/class="bio-status /g, bio).length >= 30);
});

test("The Biology tab orders GPS claims as a shareable reader journey", () => {
  const bio = matchAll(/<div id="tab-biology"[\s\S]*?<!-- \/tab-biology -->/g, html)[0][0];
  const ordered = [
    "How to read these claims",
    "WT1 — the leukemia antigen GPS goes after",
    "GPS / galinpepimut-S — a WT1 peptide vaccine",
    "Inside-out WT1 target system",
    "Heteroclitic peptides try to break tolerance",
    "CD8 killers plus CD4 help",
    "Four keys, many HLA locks",
    "CR2 maintenance is the right terrain",
    "Delivery depot and APC alarm",
    "What this can support",
    "What this does not prove"
  ];
  let lastIndex = -1;
  for (const phrase of ordered) {
    const idx = bio.indexOf(phrase);
    assert.ok(idx > lastIndex, `${phrase} should appear after the prior Biology checkpoint`);
    lastIndex = idx;
  }
});

test("The Biology tab preserves honesty flags (blinded / single-arm / no combo)", () => {
  const bio = matchAll(/<div id="tab-biology"[\s\S]*?<!-- \/tab-biology -->/g, html)[0][0];
  assert.match(bio, /blinded/i);
  assert.match(bio, /single-arm/i);
  assert.match(bio, /no human trial combin/i);
});

test("six Explain level buttons exist with expected data-lvl values", () => {
  const levels = matchAll(/class="lvlb[^"]*"[^>]*data-lvl="([^"]+)"/g, html).map(
    (m) => m[1]
  );
  assert.equal(levels.length, 6);
  assert.deepEqual(levels, EXPLAIN_LEVELS);
});

test("index.html has no duplicate element ids", () => {
  const ids = matchAll(/\bid="([^"]+)"/g, html).map((m) => m[1]);
  const seen = new Set();
  const dupes = [];
  for (const id of ids) {
    if (seen.has(id)) dupes.push(id);
    seen.add(id);
  }
  assert.deepEqual(dupes, [], `duplicate ids: ${dupes.join(", ")}`);
});

test("toggleMethod onclick hooks reference exported handler", () => {
  const hooks = matchAll(/onclick="toggleMethod\('([^']+)'\)"/g, html).map(
    (m) => m[1]
  );
  assert.ok(hooks.length >= 3);
  assert.match(js, /window\.toggleMethod\s*=/);
  for (const id of hooks) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("HR gauge markup includes interim IA status element", () => {
  assert.match(html, /class="hr-metrics"/);
  assert.match(html, /id="oIAstatus"/);
  assert.doesNotMatch(html, /id="hrMark"/);
});

test("data-regal-mode values are forward or inverse only", () => {
  const modes = matchAll(/data-regal-mode="([^"]+)"/g, html).map((m) => m[1]);
  assert.ok(modes.length > 0);
  for (const mode of modes) {
    assert.ok(
      mode === "forward" || mode === "inverse",
      `unexpected data-regal-mode="${mode}"`
    );
  }
});

test("main.js restores share hash via decodeShareHash (#s1= and legacy #s=)", () => {
  assert.match(js, /decodeShareHash/);
  assert.match(js, /hasShareHash/);
  assert.match(js, /#s1=/);
  assert.doesNotMatch(js, /location\.hash\.startsWith\("#s="\)/);
  assert.doesNotMatch(js, /if\(!h\.startsWith\("#s="\)\)return false/);
});

test("paramsFromShareHash accepts v1 delta hashes", () => {
  assert.match(js, /decodeShareHash\(hash\.trim\(\)\)/);
});

test("applyState restores all tab slider blocks before switching tabs", () => {
  assert.match(js, /SLS_SHARE_KEYS/);
  assert.match(js, /VAL_SHARE_KEYS/);
  assert.match(js, /applySliderValues\(SLS_SHARE_KEYS,s\.sls\)/);
  assert.match(js, /applySliderValues\(VAL_SHARE_KEYS,s\.val\)/);
  assert.match(js, /if\(s\.tab\)switchTab\(s\.tab\);[\s\S]*updateNow\(\)/);
  assert.match(js, /if\(s\.sls\)tabsDirty\.sls009=true/);
  assert.match(js, /if\(s\.val\)tabsDirty\.value=true/);
});

test("hamburger nav toggle is accessible", () => {
  assert.match(html, /id="navToggle"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="mobileNavPanel"/);
  assert.match(html, /aria-label="Open sections menu"/);
  assert.match(js, /function initMobileNav\(/);
  assert.match(js, /function closeMobileNav\(/);
});

test("embed-hide chrome is present for embed mode styling", () => {
  assert.match(html, /class="[^"]*embed-hide/);
  assert.match(html, /class="[^"]*no-embed/);
});

test("explain tab deep link target exists in header", () => {
  assert.match(html, /href="#explain"/);
  assert.match(html, /data-tab="explain"/);
});

test("SLS-009 tab includes GenFleet PTCL catalyst panel", () => {
  const sls = matchAll(/<div id="tab-sls009"[\s\S]*?<!-- \/tab-sls009 -->/g, html)[0][0];
  assert.match(sls, /id="panelSlsCatalysts"/);
  assert.match(sls, /NCT05934513/);
  assert.match(sls, /clinicaltrials\.gov\/study\/NCT05934513/);
});

test("valuation dilution stress presets mirror DRTS pattern", () => {
  const value = matchAll(/<div id="tab-value"[\s\S]*?<!-- \/tab-value -->/g, html)[0][0];
  assert.match(value, /data-dilution-stress="181\.3"/);
  assert.match(value, /data-dilution-stress="222"/);
  assert.match(value, /data-dilution-stress="240"/);
  assert.match(value, /ATM stress 240M/);
  assert.match(value, /does not auto-issue against ATM capacity/);
});

test("bind/nonbind are not separate forward preset buttons", () => {
  const forward = matchAll(/data-preset="([^"]+)"/g, html).map((m) => m[1]);
  assert.ok(!forward.includes("bind"));
  assert.ok(!forward.includes("nonbind"));
  assert.ok(forward.includes("moderate"));
  assert.match(html, /id="hdrHrCallout"/);
  assert.match(html, /Biology-first ~0\.26 · Moderate DD ~0\.40 · Neutral ridge ~0\.45–0\.64/);
  assert.match(html, /id="mcFloor"/);
  assert.match(html, /Binding interim IA/);
});

test("Use P(win) bridge requires explicit confirmation", () => {
  assert.match(js, /PWIN_VALUATION_CONFIRM_MSG/);
  assert.match(js, /confirm\(PWIN_VALUATION_CONFIRM_MSG\)/);
  assert.match(js, /FDA approval probability/);
  assert.match(js, /showToast\('P\(GPS\) set to '/);
});
