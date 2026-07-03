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

test("four top tab buttons exist with expected data-tab values", () => {
  const tabs = matchAll(/class="tabbtn[^"]*"[^>]*data-tab="([^"]+)"/g, html).map(
    (m) => m[1]
  );
  assert.equal(tabs.length, 4);
  assert.deepEqual(tabs, VALID_TABS);
});

test("bottom nav exposes all four tabs", () => {
  const navTabs = matchAll(
    /<nav id="bottomNav"[\s\S]*?<\/nav>/g,
    html
  )[0][0].match(/data-tab="([^"]+)"/g).map((s) => s.slice(10, -1));
  assert.deepEqual(navTabs, VALID_TABS);
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

test("main.js preset tables stay aligned with test fixtures", () => {
  for (const name of Object.keys(P)) {
    assert.match(js, new RegExp(`\\b${name}:\\s*\\{`));
  }
  for (const name of Object.keys(INV)) {
    assert.match(js, new RegExp(`\\b${name}:\\s*\\{`));
  }
});

test("embed-hide chrome is present for embed mode styling", () => {
  assert.match(html, /class="[^"]*embed-hide/);
  assert.match(html, /class="[^"]*no-embed/);
});

test("explain tab deep link target exists in header", () => {
  assert.match(html, /href="#explain"/);
  assert.match(html, /data-tab="explain"/);
});
