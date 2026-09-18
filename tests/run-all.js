#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = [
  "math.test.js",
  "eln-model.test.js",
  "formulas.test.js",
  "mutation-critical.test.js",
  "presets.test.js",
  "share.test.js",
  "valuation.test.js",
  "smoke.test.js",
  "ui-logic.test.js",
  "dom-smoke.test.js",
  "smoke-ui.test.js",
  "audit-fixes.test.js",
  "market-quote.test.js"
].map((f) => path.join(dir, f));

function run(testFiles) {
  return spawnSync(process.execPath, ["--test", ...testFiles], {
    stdio: "inherit"
  });
}

// The DOM matrix intentionally exercises every preset and several fake-worker
// simulations. Run it after the parallel unit-test batch so CI CPU contention
// cannot starve its animation-frame readiness checks.
const unitResult = run(files);
if (unitResult.status !== 0) process.exit(unitResult.status === null ? 1 : unitResult.status);

const matrixResult = run([path.join(dir, "preset-dom-matrix.test.js")]);
process.exit(matrixResult.status === null ? 1 : matrixResult.status);
