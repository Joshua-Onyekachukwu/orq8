#!/usr/bin/env node
/**
 * The proof gate.
 *
 * Five harnesses already exist in this repository and already pass locally.
 * What was missing is that nothing ran them on the way in, so a commit could
 * land that broke the engine, auth, tenant isolation or every page, and CI would
 * stay green — which is exactly how 24 commits of work reached production never
 * having run there (docs/62 §62.18).
 *
 * This runner exists so the gates run the same way on a developer's machine and
 * in CI, and so each one *says which requirement it protects*. A gate whose
 * purpose is a mystery gets deleted the first time it is inconvenient; a gate
 * that names its requirement gets fixed instead.
 *
 *   node scripts/proofs.mjs              every proof that needs no running stack
 *   node scripts/proofs.mjs --with-stack also boot one review stack and run the
 *                                        proofs that need it (routes, gate)
 *   node scripts/proofs.mjs --only rls   one proof, by id
 *   node scripts/proofs.mjs --list       print the manifest and exit
 *
 * Exit code is non-zero if any selected proof fails. Output is live (the child
 * inherits stdio) so a failing proof's own messages are what a developer reads.
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Requirement ids are the ones in docs/66.7. Keep them accurate: if a proof stops
 * covering a requirement, remove the id rather than letting the mapping flatter
 * it.
 */
const PROOFS = [
  {
    id: "vertical-slice",
    what: "founder command → EA intent → plan → task → execution → QA → credits → audit → realtime",
    protects: [
      "MVP-002 (live database under the production lineage)",
      "MVP-009 (Executive Agent: context, intent, plan, delegation)",
      "MVP-012 (work: create, delegate, execute, states, outcome)",
      "MVP-013 (authority enforced server-side, with the reason persisted)",
      "MVP-014 (founder attention aggregates real state)",
      "MVP-015 (credits measured, ledger agrees, exhausted balance blocks at zero cost)",
      "MVP-017 (hash-chained audit trail verifies)",
    ],
    command: "pnpm exec tsx scripts/vertical-slice-e2e.ts",
    needsStack: false,
  },
  {
    id: "auth",
    what: "register → verify → login → session → lockout → password reset (API journeys)",
    protects: [
      "MVP-006 (sign up, confirm email, log in, log out, recover password)",
      "MVP-028 (account-bearing routes require a session)",
    ],
    command: "pnpm exec tsx scripts/auth-e2e.ts",
    needsStack: false,
  },
  {
    id: "rls",
    what: "cross-tenant isolation and policy matrix against the real schema",
    protects: [
      "MVP-032 (no company can read or write another company's data)",
      "MVP-013 (authority cannot be bypassed by another execution path)",
    ],
    command: "pnpm exec tsx scripts/rls-security-e2e.ts",
    needsStack: false,
  },
  {
    id: "members",
    what: "invite → accept → switch org → change role → remove, and the refusals around them",
    protects: [
      "MVP-018 (member invites and roles)",
      "MVP-032 (no company can read or write another company's data)",
      "MVP-033 (a session can act in every organization its user belongs to)",
    ],
    command: "pnpm exec tsx scripts/integration-suite.ts members",
    needsStack: false,
  },
  {
    id: "routes",
    what: "every /app route renders real content on a live stack",
    protects: [
      "MVP-007 (create a company and reach the dashboard)",
      "MVP-021 (a smoke check gates a release)",
      "MVP-026 (the founder can operate without a developer)",
    ],
    command: `node scripts/route-sweep.mjs --base http://localhost:${process.env.REVIEW_WEB_PORT ?? 3112}`,
    needsStack: true,
  },
  {
    id: "gate",
    what: "the release gate blocks an unactivated deployment and clears an activated one",
    protects: [
      "MVP-021 (a smoke check gates a release)",
      "MVP-034 (capability readiness is reported and acted on)",
    ],
    command: "node scripts/release-gate-proof.mjs",
    needsStack: true,
  },
];

const args = process.argv.slice(2);
const wantAll = !args.includes("--only");
// `--only routes,gate` runs exactly those, which is how CI shares one booted
// stack between the proofs that need it instead of paying for a second one.
const only = args.includes("--only")
  ? (args[args.indexOf("--only") + 1] ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  : null;
const withStack = args.includes("--with-stack");
const listOnly = args.includes("--list");

if (listOnly) {
  for (const proof of PROOFS) {
    console.log(`${proof.id}${proof.needsStack ? " (needs stack)" : ""}: ${proof.what}`);
    for (const requirement of proof.protects) console.log(`    protects ${requirement}`);
  }
  process.exit(0);
}

const selected = PROOFS.filter((proof) =>
  wantAll ? !proof.needsStack || withStack : only.includes(proof.id),
);

if (selected.length === 0) {
  console.error(
    only
      ? `no proof with id "${only.join(",")}" — run with --list to see the ids`
      : "nothing selected: the stack-dependent proof needs --with-stack",
  );
  process.exit(2);
}

// Naming an id that does not exist is a typo, not a silent no-op: CI must not go
// green because a renamed proof left the selector pointing at nothing.
if (only) {
  const unknown = only.filter((id) => !PROOFS.some((proof) => proof.id === id));
  if (unknown.length) {
    console.error(`no proof with id "${unknown.join(",")}" — run with --list to see the ids`);
    process.exit(2);
  }
}

/** Run one command to completion, streaming its output. */
function run(command) {
  const result = spawnSync(command, { cwd: repoRoot, shell: true, stdio: "inherit", env: process.env });
  return result.status ?? 1;
}

/**
 * The review stack boots the API in-process and the built web app on 3112.
 * The ports are overridable so a proof can run beside a stack that is already
 * up (REVIEW_API_PORT / REVIEW_WEB_PORT).
 */
const apiPort = process.env.REVIEW_API_PORT ?? 3111;
const webPort = process.env.REVIEW_WEB_PORT ?? 3112;

/** Is a stack already healthy on the ports this run would use? */
async function stackIsUp() {
  try {
    const [api, web] = await Promise.all([
      fetch(`http://127.0.0.1:${apiPort}/healthz`, { signal: AbortSignal.timeout(3000) }),
      fetch(`http://localhost:${webPort}/healthz`, { signal: AbortSignal.timeout(3000) }),
    ]);
    return api.ok && web.ok;
  } catch {
    return false;
  }
}

async function startStack() {
  console.log(`booting the review stack (API ${apiPort}, web ${webPort})…`);
  const child = spawn("pnpm exec tsx scripts/review-stack.ts", {
    cwd: repoRoot,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`  [stack] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`  [stack] ${chunk}`));

  const deadline = Date.now() + 4 * 60_000;
  while (Date.now() < deadline) {
    try {
      const [api, web] = await Promise.all([
        fetch(`http://127.0.0.1:${apiPort}/healthz`, { signal: AbortSignal.timeout(3000) }),
        fetch(`http://localhost:${webPort}/healthz`, { signal: AbortSignal.timeout(3000) }),
      ]);
      if (api.ok && web.ok) {
        console.log("  stack is up\n");
        return child;
      }
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  child.kill("SIGTERM");
  console.error("the review stack did not become healthy within 4 minutes");
  process.exit(1);
}

let stack = null;
if (selected.some((proof) => proof.needsStack)) {
  // If a stack is already serving these ports, use it and do NOT spawn one on
  // top: the child would die with EADDRINUSE while the proofs ran happily
  // against somebody else's stack, and the `kill` at the end would then be
  // pointed at a process this run never started.
  if (await stackIsUp()) {
    console.log(`using the review stack already serving on ${apiPort}/${webPort}\n`);
  } else {
    stack = await startStack();
  }
}

const results = [];
for (const proof of selected) {
  console.log(`\n▶ ${proof.id} — ${proof.what}`);
  for (const requirement of proof.protects) console.log(`   protects ${requirement}`);
  const code = run(proof.command);
  results.push({ proof, code });
  console.log(`   ${code === 0 ? "PASS" : `FAIL (exit ${code})`}`);
}

if (stack) stack.kill("SIGTERM");

const failed = results.filter((result) => result.code !== 0);
console.log("\n=== proof gate ===");
for (const { proof, code } of results) {
  console.log(`  ${code === 0 ? "PASS" : "FAIL"}  ${proof.id}  (${proof.protects.length} requirement(s))`);
}

if (failed.length === 0) {
  console.log(`\npass — ${results.length}/${results.length} proofs held`);
  process.exit(0);
}

console.error(`\nFAIL — ${failed.length} of ${results.length} proofs failed:`);
for (const { proof } of failed) {
  for (const requirement of proof.protects) console.error(`  ${proof.id} broke ${requirement}`);
}
process.exit(1);
