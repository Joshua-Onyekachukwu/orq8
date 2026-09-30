#!/usr/bin/env node
/**
 * Proof that the release gate is a gate (docs/68 MVP-021, MVP-034).
 *
 * A gate nobody has watched fail is decoration. This runs the real
 * `scripts/release-gate.mjs` against a live stack and checks that its verdict is
 * the truth rather than a constant:
 *
 *   1. the gate's verdict is 0 exactly when /v1/readiness names no blocker, and
 *      the blockers it prints are the ones the API actually reports;
 *   2. /readyz's public count equals the number of names in /v1/readiness — the
 *      two surfaces cannot drift apart silently;
 *   3. without the internal token the gate refuses to guess and says why;
 *   4. `--require` raises the floor: a capability that is not ready fails the
 *      release even when it is not production-critical on its own;
 *   5. the gate fires the deployment's own mail check, and its verdict follows
 *      what that check actually reported — proving a configured provider
 *      delivers, or naming the keys that fix it when there is none.
 *
 * Point it at a stack (defaults match the review stack):
 *   node scripts/release-gate-proof.mjs
 *   REVIEW_API_PORT=3113 REVIEW_WEB_PORT=3114 node scripts/release-gate-proof.mjs
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getJson } from "./lib/http-json.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = `http://127.0.0.1:${process.env.REVIEW_API_PORT ?? 3111}`;
const WEB = `http://127.0.0.1:${process.env.REVIEW_WEB_PORT ?? 3112}`;
const TOKEN = process.env.REVIEW_INTERNAL_TOKEN ?? "review-stack-internal-token";

let failures = 0;
function assert(what, ok, detail) {
  console.log(`   ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Run the gate the way CI does, and hand back its exit code and JSON verdict. */
function runGate(extra = []) {
  const result = spawnSync(
    "node",
    [
      "scripts/release-gate.mjs",
      "--api-url",
      API,
      "--web-url",
      WEB,
      "--internal-token",
      TOKEN,
      "--json",
      ...extra,
    ],
    { cwd: repoRoot, encoding: "utf8", env: process.env },
  );
  let body = null;
  try {
    body = JSON.parse(result.stdout);
  } catch {
    /* the gate prints JSON on stdout; anything else is a failure to report */
  }
  return { code: result.status ?? 1, body, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

const probe = await getJson(`${API}/v1/readiness`, {
  headers: { "x-internal-token": TOKEN },
  timeoutMs: 5000,
});
if (!probe.ok) {
  console.error(`the stack at ${API} is not answering: ${probe.error}`);
  process.exit(2);
}
if (probe.status !== 200) {
  console.error(`/v1/readiness returned HTTP ${probe.status} — start the review stack with INTERNAL_TOKEN set`);
  process.exit(2);
}
const report = probe.body.data;

// /readyz is the deployment's own liveness claim. A 503 (dependency gone) or an
// unreadable body must fail an assertion rather than throw: a proof that dies
// with a stack trace says less than one that reports which claim did not hold.
const readyzRes = await getJson(`${API}/readyz`, { timeoutMs: 5000 });
const readyz = readyzRes.body;
if (readyzRes.status !== 200 || !readyz?.data?.activation) {
  console.error(
    `\n/readyz is not reporting an activation block (HTTP ${readyzRes.status}${readyzRes.error ? `: ${readyzRes.error}` : ""}).` +
      `\nThe API is up but its dependencies are not — a deployment in that state fails the gate, so this proof cannot run.` +
      `\nCheck the stack's database, then re-run.`,
  );
  process.exit(2);
}

console.log(`\n▶ the release gate, against the live stack at ${API}`);
console.log(`   deployment reports: ${report.ready} ready, blocking [${report.blocking.join(", ")}]`);

// ── 1. The verdict follows the truth ─────────────────────────────────────────
const gate = runGate();
const expectedCode = report.blocking.length === 0 ? 0 : 1;
assert(
  "the gate's exit code follows the deployment's real blocking state",
  gate.code === expectedCode,
  `blocking=[${report.blocking.join(", ")}] → exit ${gate.code} (expected ${expectedCode})`,
);
assert("the gate's reported blockers are the API's blockers", JSON.stringify(gate.body?.blocking) === JSON.stringify(report.blocking), JSON.stringify(gate.body?.blocking ?? null));
assert(
  "the gate checked the web app and the API",
  (gate.body?.checks ?? []).some((c) => c.name.startsWith("web ")) &&
    (gate.body?.checks ?? []).some((c) => c.name.startsWith("api ")),
);

// ── 2. The public count and the named report cannot drift ────────────────────
assert(
  "/readyz's public count equals the names in /v1/readiness",
  readyz.data.activation.blocking === report.blocking.length,
  `/readyz ${readyz.data.activation.blocking} vs /v1/readiness ${report.blocking.length}`,
);
assert(
  "the public route still leaks no capability names",
  !JSON.stringify(readyz).includes("OPENROUTER") && !JSON.stringify(readyz).includes("RESEND"),
);

// ── 3. No token, no verdict ──────────────────────────────────────────────────
const tokenless = spawnSync(
  "node",
  ["scripts/release-gate.mjs", "--api-url", API, "--web-url", WEB, "--internal-token", ""],
  { cwd: repoRoot, encoding: "utf8", env: { ...process.env, INTERNAL_TOKEN: "" } },
);
assert("the gate refuses to guess without the internal token", tokenless.status === 2, `exit ${tokenless.status}`);
assert(
  "and it says which secret to set",
  /INTERNAL_TOKEN/.test(`${tokenless.stdout}${tokenless.stderr}`),
);

// ── 4. --require raises the floor ────────────────────────────────────────────
// Prefer a capability this deployment genuinely has not activated (a real
// blocking claim). If every one of them is ready, an unknown id still proves the
// floor is enforced rather than ignored.
const unmet = (report.capabilities ?? []).find((c) => c.status !== "ready");
const floorId = unmet ? unmet.id : "not_a_real_capability";
const raised = runGate(["--require", floorId]);
assert(
  `--require ${floorId} fails the release`,
  raised.code === 1 && (raised.body?.checks ?? []).some((c) => c.name === `--require ${floorId}` && !c.ok),
  `exit ${raised.code}`,
);
// The floor case must fail for the *stated* reason, not because the run went
// wrong elsewhere: the reported detail names the capability's real status, or
// says the capability does not exist.
const floorRow = (raised.body?.checks ?? []).find((c) => c.name === `--require ${floorId}`);
assert(
  `--require ${floorId} fails for the reason it is given`,
  Boolean(floorRow) &&
    floorRow.ok === false &&
    floorRow.detail.includes(unmet ? unmet.status : "no such capability"),
  floorRow?.detail,
);
// And raising the floor must not invent blockers the deployment does not have.
assert(
  "raising the floor does not change the deployment's own blocking list",
  JSON.stringify(raised.body?.blocking) === JSON.stringify(report.blocking),
  JSON.stringify(raised.body?.blocking ?? null),
);

// ── 5. Mail is proven, not described ─────────────────────────────────────────
// A capability report saying `email` is configured is a claim about the
// environment. The gate's fifth step asks the network: the deployment sends one
// real message through its own transport. Either verdict is a pass here — what
// must hold is that the check RAN and that the release follows its answer.
const mailRow = (gate.body?.checks ?? []).find((c) => c.name === "mail delivers");
assert("the gate fired the deployment's own mail check", Boolean(mailRow), mailRow?.detail);
if (report.blocking.includes("email")) {
  assert(
    "with no mail provider the check fails and names the keys that fix it",
    mailRow?.ok === false && /RESEND_API_KEY|SMTP_HOST/.test(mailRow?.detail ?? ""),
    mailRow?.detail,
  );
  assert(
    "and the release is blocked by it, not merely warned",
    gate.code === 1,
    `exit ${gate.code}`,
  );
} else {
  assert(
    "with a provider configured the check passes by actually delivering",
    mailRow?.ok === true,
    mailRow?.detail,
  );
}

console.log(`\n=== release gate proof ===`);
if (failures === 0) {
  console.log(
    report.blocking.length === 0
      ? "pass — the gate clears an activated deployment and blocks an unactivated one"
      :    `pass — the gate blocked this deployment on [${report.blocking.join(", ")}] and named it`,
  );
} else {
  console.error(`FAIL — ${failures} assertion(s) failed`);
  process.exitCode = 1;
}
