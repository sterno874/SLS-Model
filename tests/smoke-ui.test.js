import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VALID_TABS, EXPLAIN_LEVELS } from "../js/ui/state.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const js = readFileSync(path.join(root, "js/main.js"), "utf8");

test("main.js exports toggleMethod for inline onclick hooks", () => {
  assert.match(js, /window\.toggleMethod\s*=/);
  const hooks = [...html.matchAll(/onclick="toggleMethod\('([^']+)'\)"/g)].map((m) => m[1]);
  assert.ok(hooks.length >= 3);
  for (const id of hooks) assert.match(html, new RegExp(`id="${id}"`));
});

test("main.js uses guarded UI binding helpers", () => {
  assert.match(js, /function onClick\(/);
  assert.match(js, /function on\(/);
  assert.match(js, /function onChange\(/);
  assert.match(js, /onClick\("btnShare"/);
  assert.match(js, /onClick\("modeInverse"/);
  assert.match(js, /on\("mcRun","click"/);
});

test("tab and explain handlers are wired in main.js", () => {
  assert.match(js, /document\.querySelectorAll\("\.tabbtn"\)/);
  assert.match(js, /document\.querySelectorAll\("#bottomNav button"\)/);
  assert.match(js, /document\.querySelectorAll\("\.lvlb"\)/);
  assert.match(js, /function switchTab\(/);
  assert.match(js, /function showLevel\(/);
  assert.match(js, /if\(!restoringState\)updateHashQuiet\(\)/);
});

test("preset and mode handlers are wired", () => {
  assert.match(js, /button\[data-preset\]/);
  assert.match(js, /button\[data-inv\]/);
  assert.match(js, /button\[data-sls\]/);
  assert.match(js, /button\[data-val\]/);
  assert.match(js, /function applyRegalPreset\(/);
  assert.match(js, /function applyInversePreset\(/);
  assert.match(js, /function setRegalMode\(/);
});

test("collapsible panel action buttons exist in HTML", () => {
  for (const id of [
    "tornadoRun",
    "t80Run",
    "presetCmpRun",
    "scmpRun",
    "mcRun",
    "mcSlsRun",
    "mcValRun",
    "btnUsePwin"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("tab pages and nav cover all VALID_TABS", () => {
  for (const tab of VALID_TABS) {
    assert.match(html, new RegExp(`id="tab-${tab}"`));
    assert.match(html, new RegExp(`data-tab="${tab}"`));
  }
});

test("explain level buttons match EXPLAIN_LEVELS", () => {
  const levels = [...html.matchAll(/class="lvlb[^"]*"[^>]*data-lvl="([^"]+)"/g)].map(
    (m) => m[1]
  );
  assert.deepEqual(levels, EXPLAIN_LEVELS);
});
