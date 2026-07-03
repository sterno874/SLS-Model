#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = [
  "math.test.js",
  "presets.test.js",
  "share.test.js",
  "valuation.test.js"
].map((f) => path.join(dir, f));

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit"
});

process.exit(result.status === null ? 1 : result.status);
