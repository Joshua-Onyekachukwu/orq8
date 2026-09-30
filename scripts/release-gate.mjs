#!/usr/bin/env node
/**
 * The release gate.
 *
 * A deploy used to be "good" when a human looked at it. Nothing asked the
 * running production whether the product was switched on, so a release could go
 * out with no model key and no mail provider — booting, serving 401s and healthy
 * 200s on `/healthz`, silently unable to do the one thing it exists for. The
 * activation model already answers that question (`capabilityReadiness`, docs/69)
 * and `/readyz` and `/v1/readiness` already publish it. Nothing *acted* on it.
 *
 * This is the actor. It is deliberately a script rather than a workflow step so
 * the same gate runs on a laptop, in CI, and against production:
 *
 *   node scripts/release-gate.mjs --api-url https://api.example.com \
 *     --web-url https://example.com --internal-token "$INTERNAL_TOKEN"
 *
 *   node scripts/release-gate.mjs --api-url http://127.0.0.1:3113 \
 *     --web-url http://127.0.0.1:3114 --internal-token review-stack-internal-token
 *
 * What it checks, in order:
 *   1. the web app answers /healthz                     (the product is serving)
 *   2. the API answers /healthz                         (the process is alive)
 *   3. the API answers /readyz with status ready        (its dependencies are)
 *   4. /v1/readiness names no blocking capability       (the product is on)
 *   5. the deployment sends one real message            (mail actually delivers)
 *
 * Step 5 exists because step 4 is a claim about the *environment*: it proves
 * `SMTP_HOST` or `RESEND_API_KEY` is present, not that the provider accepts it.
 * A correct-looking key the provider rejects passes every capability check while
 * nobody in the company can receive a confirmation email. So the gate fires the
 * same three-verdict mail check the settings page shows — over the machine path,
 * `/v1/readiness/mail-check` — and fails the release on the broken step.
 *
 * It reads /readyz publicly (counts, no names) and /v1/readiness with the
 * internal token, because a red deploy that cannot name its blocker is a red
 * deploy nobody can act on. `--require` raises the floor for a stage that needs
 * more than the default set (a paid launch needs billing live, for example).
 *
 * Exit 0 only when every check passed. Exit 2 for a usage error or an
 * unreachable host; exit 1 when the deployment is reachable and not good.
 */

import { getJson, postJson } from "./lib/http-json.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};

const API_URL = (flag("api-url") ?? process.env.ORQ8_API_URL ?? process.env.API_URL ?? "").replace(/\/$/, "");
const WEB_URL = (flag("web-url") ?? process.env.ORQ8_WEB_URL ?? process.env.WEB_URL ?? "").replace(/\/$/, "");
const INTERNAL_TOKEN = flag("internal-token") ?? process.env.INTERNAL_TOKEN ?? "";
const JSON_OUT = args.includes("--json");
const NO_WEB = args.includes("--no-web");
// Generous on purpose. This probes a deployment once, with no retry, and a
// production first byte can be slow (cold serverless start, IPv4/IPv6 happy
// eyes) — a gate that reports "unreachable" because it was impatient is a gate
// that gets switched off.
const TIMEOUT_MS = Number(flag("timeout-ms", "30000"));
const REQUIRED = (flag("require", "") ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
// Where the mail check sends its one message. Optional: with nothing here the
// deployment falls back to the address in its own `EMAIL_FROM`, which is a
// mailbox the operator already controls.
const MAIL_TO = flag("mail-to") ?? process.env.ORQ8_MAIL_PROBE_TO ?? "";
// Escape hatch for a stage that must not send mail (a demo environment with a
// real provider configured, say). Skipping is loud, never silent.
const NO_MAIL = args.includes("--no-mail");

/**
 * "why this is not a release" is printed once, however many checks failed.
 * Two headings over the same idea read like two separate problems, and the fix
 * for a broken capability and the fix for a broken transport are the same
 * conversation: what to set, and what it costs to leave unset.
 */
let saidWhyNot = false;
function whyNot(...lines) {
  if (JSON_OUT) return;
  if (!saidWhyNot) {
    console.log("\nwhy this is not a release:");
    saidWhyNot = true;
  }
  for (const line of lines) console.log(line);
}

/** The line the gate prints for a human, and the object it prints for a machine. */
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!JSON_OUT) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const get = (url, headers = {}) => getJson(url, { headers, timeoutMs: TIMEOUT_MS });
const post = (url, body, headers = {}) => postJson(url, body, { headers, timeoutMs: TIMEOUT_MS });

/**
 * Stop with a verdict.
 *
 * `process.exit()` while an undici socket or an `AbortSignal.timeout` timer is
 * still closing aborts inside libuv on Windows (`Assertion failed:
 * !(handle->flags & UV_HANDLE_CLOSING)`, exit 127) — which on a *passing*
 * deployment would turn a green release into a red one for no reason. Setting
 * `exitCode` and letting the loop drain is what makes the exit code mean what it
 * says.
 */
function finish(code) {
  process.exitCode = code;
}

/** A verdict the gate reached: printed once, then the run stops. */
class GateError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function fail(message, code = 2) {
  if (JSON_OUT) console.log(JSON.stringify({ verdict: "error", message, checks }, null, 2));
  else {
    console.error(`\nrelease gate: ${message}`);
    if (checks.length) console.error("  (checks completed before the error are above)");
  }
  throw new GateError(message, code);
}

try {
if (!API_URL && (!WEB_URL || NO_WEB)) {
  fail("nothing to check: pass --api-url (and --web-url) or set ORQ8_API_URL / ORQ8_WEB_URL");
}

if (!JSON_OUT) {
  console.log(`release gate`);
  console.log(`  api  ${API_URL || "(not given)"}`);
  console.log(`  web  ${NO_WEB ? "(skipped)" : WEB_URL || "(not given)"}`);
  console.log(`  floor  production-critical capabilities${REQUIRED.length ? ` + ${REQUIRED.join(", ")}` : ""}\n`);
}

// ── 1. The web app is serving ────────────────────────────────────────────────
if (WEB_URL && !NO_WEB) {
  const res = await get(`${WEB_URL}/healthz`);
  if (!res.ok) fail(`the web app at ${WEB_URL} is unreachable: ${res.error}`);
  check("web /healthz", res.status === 200, `HTTP ${res.status}`);
}

// ── 2. The API is alive ──────────────────────────────────────────────────────
if (API_URL) {
  const live = await get(`${API_URL}/healthz`);
  if (!live.ok) fail(`the API at ${API_URL} is unreachable: ${live.error}`);
  check("api /healthz", live.status === 200 && live.body?.data?.status === "ok", `HTTP ${live.status}`);
}

// ── 3. Its dependencies are reachable ────────────────────────────────────────
let activation = null;
if (API_URL) {
  const ready = await get(`${API_URL}/readyz`);
  // A 503 here is the API saying "my database is gone". That is the strongest
  // possible blocker, and naming it beats a generic failure.
  check(
    "api /readyz",
    ready.status === 200 && ready.body?.data?.status === "ready",
    ready.status === 200 ? undefined : `HTTP ${ready.status}${ready.body?.error?.message ? ` — ${ready.body.error.message}` : ""}`,
  );
  activation = ready.body?.data?.activation ?? null;
}

// ── 4. The product is switched on ────────────────────────────────────────────
let report = null;
if (API_URL) {
  const res = await get(`${API_URL}/v1/readiness`, { "x-internal-token": INTERNAL_TOKEN });
  if (res.status === 401 || res.status === 403) {
    fail(
      INTERNAL_TOKEN
        ? "the API rejected the internal token — the gate's INTERNAL_TOKEN must be the same value the API runs with"
        : "the gate has no INTERNAL_TOKEN, so the API would not name the blockers; set INTERNAL_TOKEN on the API and pass the same value here (--internal-token)",
    );
  }
  if (!res.ok) fail(`could not read /v1/readiness: ${res.error}`);
  if (res.status !== 200) fail(`/v1/readiness returned HTTP ${res.status}`);

  report = res.body?.data ?? null;
  if (!report || !Array.isArray(report.blocking)) fail("/v1/readiness returned no readiness report");

  const blocking = report.blocking;
  check(
    "no blocking capability",
    blocking.length === 0,
    blocking.length === 0 ? `${report.ready} capabilities ready` : `blocking: ${blocking.join(", ")}`,
  );

  // The public counts and the named report must agree, or one of them is lying
  // and the gate cannot be trusted to pick the right one.
  if (activation) {
    check(
      "public and named views agree",
      activation.blocking === blocking.length,
      `/readyz says ${activation.blocking}, /v1/readiness names ${blocking.length}`,
    );
  }

  // `--require` raises the floor: a stage that needs billing live says so, and a
  // capability that is merely degraded (not production-critical) can still be a
  // release blocker for that stage.
  for (const id of REQUIRED) {
    const capability = report.capabilities?.find((c) => c.id === id);
    if (!capability) {
      check(`--require ${id}`, false, "no such capability in the activation model");
      continue;
    }
    check(`--require ${id}`, capability.status === "ready", `${capability.label}: ${capability.status}`);
  }

  // What to do about it. A gate that says "no" without saying "set these keys"
  // is a gate someone will start ignoring.
  const unmet = [...new Set([...blocking, ...REQUIRED])]
    .map((id) => report.capabilities?.find((c) => c.id === id))
    .filter((c) => c && c.status !== "ready");
  for (const c of unmet) {
    whyNot(
      `  ${c.id} (${c.label}) — missing ${c.missing.join(", ") || "configuration"}`,
      `      impact: ${c.impact}`,
      `      docs:   ${c.docs}`,
    );
  }
}

// ── 5. Mail is not merely configured, it delivers ────────────────────────────
if (API_URL) {
  if (NO_MAIL) {
    console.log("\n  SKIP  mail delivers — --no-mail was passed, so nothing was sent");
  } else {
    const res = await post(
      `${API_URL}/v1/readiness/mail-check`,
      MAIL_TO ? { to: MAIL_TO } : {},
      { "x-internal-token": INTERNAL_TOKEN },
    );

    if (!res.ok) {
      check("mail delivers", false, `could not run the mail check: ${res.error}`);
    } else if (res.status === 403) {
      check(
        "mail delivers",
        false,
        "the API refused the internal token — the same value the gate uses must be set on the API",
      );
    } else if (res.status === 404) {
      // A deployment older than this endpoint. Still a failed release: the
      // thing being asked about was not proven, and a green tick for a check
      // that did not run is how "verified" stops meaning anything.
      check(
        "mail delivers",
        false,
        "this API build has no /v1/readiness/mail-check, so mail delivery could not be proven — deploy the current API",
      );
    } else if (res.status !== 200) {
      check(
        "mail delivers",
        false,
        `HTTP ${res.status}${res.body?.error?.message ? ` — ${res.body.error.message}` : ""}`,
      );
    } else {
      const diagnosis = res.body?.data ?? null;
      const failedStep = diagnosis?.steps?.find((s) => !s.ok) ?? null;
      // The fix rides in the check's own detail, not in prose printed after it:
      // the JSON verdict is what a pipeline reads, and "mail is broken" without
      // the one setting that fixes it is another red build nobody can act on.
      const why =
        failedStep?.detail ?? diagnosis?.failure?.message ?? "the deployment did not prove delivery";
      const fix = diagnosis?.failure?.fix;
      check(
        "mail delivers",
        diagnosis?.delivered === true,
        diagnosis?.delivered === true
          ? `${diagnosis.provider} accepted a message for ${diagnosis.to}`
          : `${why}${fix ? ` — ${fix}` : ""}`,
      );
    }
  }
}

const failed = checks.filter((c) => !c.ok);
const verdict = failed.length === 0 ? "pass" : "blocked";

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        verdict,
        api: API_URL || null,
        web: NO_WEB ? null : WEB_URL || null,
        environment: report?.environment ?? null,
        blocking: report?.blocking ?? null,
        required: REQUIRED,
        checks,
      },
      null,
      2,
    ),
  );
} else {
  console.log("");
  if (verdict === "pass") {
    console.log(`pass — this deployment is switched on${REQUIRED.length ? ` (floor: ${REQUIRED.join(", ")})` : ""}`);
  } else {
    console.error(`BLOCKED — ${failed.length} of ${checks.length} checks failed: ${failed.map((c) => c.name).join(", ")}`);
  }
}

finish(verdict === "pass" ? 0 : 1);
} catch (err) {
  // A thrown GateError has already said its piece; anything else is a bug in
  // this script and must not be mistaken for a passed release.
  if (!(err instanceof GateError)) {
    console.error(`\nrelease gate: unexpected failure: ${err?.stack ?? err}`);
  }
  finish(err instanceof GateError ? err.code : 2);
}
