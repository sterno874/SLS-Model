#!/usr/bin/env node
"use strict";
/** Back-compat entry point — runs the full test suite in tests/. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runAll = path.join(path.dirname(fileURLToPath(import.meta.url)), "tests/run-all.js");
const result = spawnSync(process.execPath, [runAll], { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
