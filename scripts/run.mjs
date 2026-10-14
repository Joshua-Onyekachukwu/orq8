#!/usr/bin/env node
/**
 * Single entry point for the ORQ8 verification suite.
 *
 *   node scripts/run.mjs              → runs every suite in order
 *   node scripts/run.mjs smoke        → one named suite
 *   node scripts/run.mjs --list       → list suites
 *
 * Each suite is a standalone script; the runner adds uniform reporting and a
 * non-zero exit when any suite fails, so this can be wired into CI or run
 * before a demo without remembering individual script names.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

// Each suite reads its credentials from a gitignored env file (see the
// nightly workflow's "Materialize rehearsal credentials" step, which writes
// these from the E2E_ENV_LOCAL / DEMO_ENV_LOCAL secrets). A suite whose file
// is absent cannot run at all — its script dies with ENOENT — so the runner
// partitions those suites out BEFORE running anything and reports them as
// NOT RUN (a credentials problem) rather than FAILED (a product regression).
// Reporting them as failures is how the nightly read "six features
// regressed" for weeks when the truth was "no credentials configured".
const SUITES = [
  { name: "smoke", script: "smoke-live.mjs", envFile: ".env.e2e.local", blurb: "authenticated browser smoke pass" },
  { name: "journey", script: "journey-loop.mjs", envFile: ".env.e2e.local", blurb: "org journey: templates → hire → council → outcome" },
  { name: "outcome", script: "journey-outcome.mjs", envFile: ".env.e2e.local", blurb: "decision-outcome feedback loop" },
  { name: "departments", script: "rehearse-departments.mjs", envFile: ".env.e2e.local", blurb: "six-department LLM+QA deep rehearsal (e2e org)" },
  { name: "departments-demo", script: "rehearse-departments.mjs", args: ["--env", ".env.demo.local"], envFile: ".env.demo.local", blurb: "six-department deep rehearsal against the demo org" },
  { name: "rehearsal-56", script: "rehearsal-56.mjs", envFile: ".env.demo.local", blurb: "§56 full-company journey" },
];

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const s of SUITES) console.log(`${s.name.padEnd(14)} ${s.blurb}`);
  process.exit(0);
}

const requested = args.filter((a) => !a.startsWith("--"));
const selected = requested.length > 0 ? SUITES.filter((s) => requested.includes(s.name)) : SUITES;

if (requested.length > 0) {
  const unknown = requested.filter((r) => !SUITES.some((s) => s.name === r));
  if (unknown.length) {
    console.error(`Unknown suite(s): ${unknown.join(", ")}. Try --list.`);
    process.exit(2);
  }
}

function runSuite(suite) {
  return new Promise((resolve) => {
    console.log(`\n▶ ${suite.name} — ${suite.blurb}`);
    const child = spawn(process.execPath, [path.join(here, suite.script), ...(suite.args ?? [])], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => resolve({ suite, code: code ?? 1 }));
    child.on("error", (err) => {
      console.error(`  runner error: ${err.message}`);
      resolve({ suite, code: 1 });
    });
  });
}

// Partition BEFORE running: a suite whose env file is missing is blocked,
// not failed. It never spawns, so the log shows one named cause instead of
// an ENOENT stack per suite.
const blocked = selected.filter((s) => s.envFile && !existsSync(path.join(here, s.envFile)));
const runnable = selected.filter((s) => !blocked.includes(s));

for (const s of blocked) {
  console.log(`\n⊘ ${s.name} — NOT RUN (missing scripts/${s.envFile})`);
}
if (blocked.length) {
  const missing = [...new Set(blocked.map((s) => s.envFile))];
  console.log(
    `\n  Rehearsal credentials missing: ${missing.join(", ")} not present under scripts/.\n` +
    `  In CI these are materialized from the E2E_ENV_LOCAL / DEMO_ENV_LOCAL secrets;\n` +
    `  locally, copy your working env file into place (never commit it).`,
  );
}

const results = [];
for (const suite of runnable) {
  results.push(await runSuite(suite));
}

const failed = results.filter((r) => r.code !== 0);
const passed = results.length - failed.length;
console.log(`\n===== verification suite: ${passed} passed, ${failed.length} failed, ${blocked.length} not run (${selected.length} selected) =====`);
if (failed.length) {
  console.log(`Failed: ${failed.map((f) => f.suite.name).join(", ")}`);
}
if (blocked.length) {
  console.log(`Not run (missing credentials): ${blocked.map((s) => s.name).join(", ")}`);
}
if (failed.length || blocked.length) {
  process.exit(1);
}
