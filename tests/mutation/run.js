#!/usr/bin/env node
/**
 * Lightweight mutation testing for survival.js and state.js.
 *
 * For each hand-crafted mutant: temporarily patch the source file, run the
 * formula-critical test suite, then restore. Reports mutation score (% killed).
 *
 * Usage: node tests/mutation/run.js [--json]
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MUTATION_TARGETS, MUTATION_TEST_FILES } from "./mutations.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const testsDir = path.join(root, "tests");
const jsonOut = process.argv.includes("--json");

const backups = new Map();

function backup(fileRel) {
  const abs = path.join(root, fileRel);
  if (!backups.has(fileRel)) backups.set(fileRel, readFileSync(abs, "utf8"));
}

function restoreAll() {
  for (const [fileRel, content] of backups) {
    writeFileSync(path.join(root, fileRel), content, "utf8");
  }
}

function applyMutation(mut) {
  backup(mut.file);
  const abs = path.join(root, mut.file);
  const original = backups.get(mut.file);
  writeFileSync(abs, mut.apply(original), "utf8");
}

function runTests() {
  const files = MUTATION_TEST_FILES.map((f) => path.join(testsDir, f));
  const result = spawnSync(process.execPath, ["--test", ...files], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

const killed = [];
const survived = [];
const errored = [];

process.on("exit", restoreAll);
process.on("SIGINT", () => {
  restoreAll();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restoreAll();
  process.exit(143);
});

// Baseline: all tests must pass on clean sources
const baseline = runTests();
if (!baseline.ok) {
  console.error("Mutation run aborted: baseline tests failed on clean sources.");
  console.error(baseline.stderr.slice(-2000));
  restoreAll();
  process.exit(1);
}

for (const mut of MUTATION_TARGETS) {
  applyMutation(mut);
  const result = runTests();
  restoreAll();

  if (!result.ok && result.status !== 0 && result.status !== 1) {
    errored.push({ mut, status: result.status });
  } else if (result.ok) {
    survived.push(mut);
  } else {
    killed.push(mut);
  }
}

const total = MUTATION_TARGETS.length;
const score = total ? Math.round((killed.length / total) * 1000) / 10 : 100;

const report = {
  total,
  killed: killed.length,
  survived: survived.length,
  errored: errored.length,
  scorePercent: score,
  killedIds: killed.map((m) => m.id),
  survivedIds: survived.map((m) => m.id),
  erroredIds: errored.map((m) => m.id)
};

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("\nMutation testing — SLS-Model formula modules\n");
  console.log(`  Mutants:  ${total}`);
  console.log(`  Killed:   ${killed.length}`);
  console.log(`  Survived: ${survived.length}`);
  if (errored.length) console.log(`  Errored:  ${errored.length}`);
  console.log(`  Score:    ${score}%\n`);

  if (survived.length) {
    console.log("Survived (tests did not catch):");
    for (const m of survived) console.log(`  • ${m.id}: ${m.description}`);
    console.log();
  }
  if (errored.length) {
    console.log("Errored (runner failure):");
    for (const { mut, status } of errored) console.log(`  • ${mut.id}: exit ${status}`);
    console.log();
  }
}

restoreAll();
process.exit(survived.length > 0 || errored.length > 0 ? 1 : 0);
