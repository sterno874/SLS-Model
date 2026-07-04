import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { P, INV } from "./fixtures/presets.js";
import { EXPLAIN_LEVELS, VALID_TABS } from "../js/ui/state.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const js = readFileSync(path.join(root, "js/main.js"), "utf8");

function matchAll(re, text) {
  const out = [];
  let m;
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = g.exec(text)) !== null) out.push(m);
  return out;
}

test("index.html links css/main.css", () => {
  assert.match(html, /href="css\/main\.css"/);
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
  assert.equal(tabs.length, 5);
  assert.deepEqual(tabs, VALID_TABS);
});

test("mobile nav panel exposes all five tabs", () => {
  const navTabs = matchAll(
    /<div id="mobileNavPanel"[\s\S]*?<\/div>/g,
    html
  )[0][0].match(/data-tab="([^"]+)"/g).map((s) => s.slice(10, -1));
  assert.equal(navTabs.length, 5);
  assert.deepEqual(navTabs, VALID_TABS);
});

test("The Biology tab is fully wired (page, header tab, mobile nav)", () => {
  assert.match(html, /id="tab-biology"/);
  assert.match(html, /class="tabbtn"[^>]*data-tab="biology"/);
  const nav = matchAll(/<div id="mobileNavPanel"[\s\S]*?<\/div>/g, html)[0][0];
  assert.match(nav, /data-tab="biology"/);
  assert.match(js, /tabsRendered=\{[^}]*biology/);
  assert.match(
    js,
    /\["gps","sls009","value","explain","biology"\]\.forEach\(id=>\{\$\("tab-"\+id\)/
  );
});

test("The Biology tab has labeled inline SVG diagrams (no raster)", () => {
  const bio = matchAll(/<div id="tab-biology"[\s\S]*?<!-- \/tab-biology -->/g, html)[0][0];
  const svgs = matchAll(/<svg[^>]*class="bio-svg"/g, bio);
  assert.ok(svgs.length >= 5, `expected >=5 diagrams, found ${svgs.length}`);
  assert.match(bio, /<figcaption class="bio-figcaption"/);
  assert.match(bio, /<text /);
  assert.doesNotMatch(bio, /<img/);
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
  assert.match(html, /aria-label="Open navigation menu"/);
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
  assert.match(html, /id="mcFloor"/);
  assert.match(html, /Binding interim IA/);
});

test("Use P(win) bridge requires explicit confirmation", () => {
  assert.match(js, /PWIN_VALUATION_CONFIRM_MSG/);
  assert.match(js, /confirm\(PWIN_VALUATION_CONFIRM_MSG\)/);
  assert.match(js, /FDA approval probability/);
  assert.match(js, /showToast\('P\(GPS\) set to '/);
});
