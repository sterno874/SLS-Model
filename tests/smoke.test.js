import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("index.html references split CSS and ES module entry", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /href="css\/main\.css"/);
  assert.match(html, /type="module" src="js\/main\.js"/);
});

test("main.js declares $ helper once and exports toggleMethod", () => {
  const js = readFileSync(path.join(root, "js/main.js"), "utf8");
  assert.equal((js.match(/^const \$ =/gm) || []).length, 1);
  assert.match(js, /window\.toggleMethod\s*=/);
  assert.match(js, /return inverseSolve\(base,cap3\)/);
});

test("survival.js exports core model functions", async () => {
  const mod = await import(pathToFileURL(path.join(root, "js/math/survival.js")).href);
  assert.equal(typeof mod.inverseSolve, "function");
  assert.equal(typeof mod.consistent, "function");
  assert.equal(typeof mod.eventsAt, "function");
});
