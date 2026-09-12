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
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  { name: "smoke", script: "smoke-live.mjs", blurb: "authenticated browser smoke pass" },
  { name: "journey", script: "journey-loop.mjs", blurb: "org journey: templates → hire → council → outcome" },
  { name: "outcome", script: "journey-outcome.mjs", blurb: "decision-outcome feedback loop" },
  { name: "departments", script: "rehearse-departments.mjs", blurb: "Marketing/Product/Finance LLM+QA deep rehearsal" },
  { name: "rehearsal-56", script: "rehearsal-56.mjs", blurb: "§56 full-company journey" },
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
    const child = spawn(process.execPath, [path.join(here, suite.script)], {
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

const results = [];
for (const suite of selected) {
  results.push(await runSuite(suite));
}

const failed = results.filter((r) => r.code !== 0);
console.log(`\n===== verification suite: ${results.length - failed.length}/${results.length} passed =====`);
if (failed.length) {
  console.log(`Failed: ${failed.map((f) => f.suite.name).join(", ")}`);
  process.exit(1);
}
