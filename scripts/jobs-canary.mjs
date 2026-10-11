#!/usr/bin/env node
/**
 * Scheduled-jobs canary (docs/87 §5 item 12, MVP-005).
 *
 * WHY THIS EXISTS
 * Every scheduled workflow in this repository (`orq8-jobs`, `waitlist-drip`,
 * `nightly-rehearsal`) curls `$API_URL/...` with `x-internal-token`. When the
 * Railway application those secrets pointed at was deleted, all of them started
 * answering `404 {"code":404,"message":"Application not found"}` — and because
 * each job failed on its own, six workflows went red for days and the failure
 * read like six unrelated product bugs rather than one stale secret. Nothing was
 * checking the thing they all depend on.
 *
 * This is that check. It asks the one question none of the jobs ask — is the
 * configured host still an ORQ8 API that accepts our internal token? — and when
 * the answer is no it names the secret to change instead of the endpoint that
 * failed.
 *
 * THE THREE VERDICTS (they are distinct on purpose)
 *   0  PASS       the host identifies as `orq8-api` and accepted the token.
 *   1  FAIL       configured, but broken — a deleted host, a wrong app, a
 *                 refused token. This is the load-bearing failure: a scheduled
 *                 workflow must go red on it, and the message names the secret.
 *   2  NOT ARMED  the secret is absent, so the jobs cannot run at all. The
 *                 scheduled workflows treat this as a failure too (a cron that
 *                 silently does nothing is the bug this canary was written to
 *                 kill), while CI reports it as a visible notice so a fork pull
 *                 request — where secrets are never exposed — is not failed for
 *                 a repository secret its author cannot see.
 *
 * IDENTITY IS READ FROM `service`, NOT FROM `status`
 * The API answers `/healthz` with `{"data":{"status":"ok","service":"orq8-api"}}`
 * and the web app answers `/healthz` with `{"status":"ok","service":"orq8-web"}`.
 * An earlier version of this file keyed on the presence of a top-level `status`
 * and so accepted the web app and rejected the API — the exact inversion of its
 * job, caught by running it against a live stack. Both envelopes now have to
 * name `orq8-api`, and `/v1/readiness` with the internal token is the confirming
 * half: only the API serves that route.
 *
 * Usage:
 *   node scripts/jobs-canary.mjs [--api-url URL] [--token TOKEN] [--timeout SECONDS]
 *   node scripts/jobs-canary.mjs --self-test
 *
 * Environment fallbacks: ORQ8_API_URL, then API_URL; INTERNAL_TOKEN.
 * No dependencies, deliberately: it must run even when the install fails.
 */

import { createServer } from "node:http";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};

/** The service id the API reports. The web app reports `orq8-web`. */
const API_SERVICE = "orq8-api";

/** Verdict → process exit code. Kept in one place so the self-test can pin it. */
export const EXIT = { pass: 0, fail: 1, unarmed: 2 };

/**
 * Build a non-pass verdict. `code` travels with the verdict — the CLI sets
 * `process.exitCode` from it, and a verdict that forgets its code exits 0, which
 * is a canary that reports a stale host and still goes green.
 */
function fail(code, secret, detail, fix) {
  return { verdict: code === EXIT.unarmed ? "unarmed" : "fail", code, secret, detail, fix };
}

/**
 * Ask the configured host whether it is still the ORQ8 API, and whether it
 * still accepts the internal token. Pure network + string work: no printing, no
 * `process.exit`, so the self-test can drive every branch in-process.
 *
 * Returns `{ verdict, code, secret, detail, fix, facts }`.
 */
export async function checkScheduledJobsHost({ apiUrl, token, timeoutMs = 20_000, fetchImpl = fetch } = {}) {
  const rawUrl = (apiUrl ?? "").trim();
  const rawToken = (token ?? "").trim();

  const get = async (url, headers = {}) => {
    try {
      const res = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON kept as text so the message can quote what came back */
      }
      return { ok: true, status: res.status, json, text };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  /* ── 1. Is there a host to check? (NOT ARMED if not) ──────────────────── */
  if (!rawUrl) {
    return {
      ...fail(
        EXIT.unarmed,
        "API_URL",
        "No API URL is configured, so the scheduled jobs have nothing to call.",
        "Set the repository secret `API_URL` to the deployed API origin, e.g. `https://<service>.up.railway.app` (no trailing slash, no path).",
      ),
      facts: {},
    };
  }

  const base = rawUrl.replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    return {
      ...fail(
        EXIT.fail,
        "API_URL",
        `\`API_URL\` is not a valid absolute URL: \`${rawUrl}\``,
        "Use the full origin including scheme, e.g. `https://<service>.up.railway.app`.",
      ),
      facts: { url: base },
    };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return {
      ...fail(
        EXIT.fail,
        "API_URL",
        `\`API_URL\` uses the wrong scheme (\`${parsed.protocol}\`).`,
        "Use `https://` (or `http://` only for a local stack).",
      ),
      facts: { url: base },
    };
  }

  /* ── 2. Is there a token to present? (NOT ARMED if not) ───────────────── */
  // Checked before the network so the message is about the missing secret
  // rather than about a request that was always going to be refused.
  if (!rawToken) {
    return {
      ...fail(
        EXIT.unarmed,
        "INTERNAL_TOKEN",
        "`INTERNAL_TOKEN` is not set, so every authenticated scheduled call would be refused (401).",
        "Set the repository secret `INTERNAL_TOKEN` to the same value as the API service's `INTERNAL_TOKEN`.",
      ),
      facts: { url: base },
    };
  }

  /* ── 3. Does the host answer, and is it this API? ─────────────────────── */
  const health = await get(`${base}/healthz`);
  const facts = { url: base };

  if (!health.ok) {
    return {
      ...fail(
        EXIT.fail,
        "API_URL",
        `The host in \`API_URL\` does not answer: ${health.error}\n  URL: ${base}`,
        "This is the stale-host condition: the deployed API moved or was deleted. Point `API_URL` at the live Railway service, or restore the host.",
      ),
      facts,
    };
  }

  const healthBody = health.json && typeof health.json === "object" ? health.json : null;
  // Tolerate either envelope (`{data:{…}}` today, a flat body in older builds);
  // anything else — HTML, a proxy's JSON, an empty body — is not this API.
  const healthPayload = healthBody?.data && typeof healthBody.data === "object" ? healthBody.data : healthBody;
  const service = typeof healthPayload?.service === "string" ? healthPayload.service : null;
  const quoted = (health.text ?? "").replace(/\s+/g, " ").slice(0, 200);
  facts.healthStatus = health.status;
  facts.service = service;

  const wrongApp = health.status === 200 && service !== null && service !== API_SERVICE;
  const notFoundBySomeoneElse = /Application not found/i.test(health.text ?? "");

  if (wrongApp || health.status !== 200) {
    return {
      ...fail(
        EXIT.fail,
        "API_URL",
        `\`API_URL\` does not point at the ORQ8 API.\n  URL:     ${base}\n  HTTP:    ${health.status}\n  Service: ${service ?? "(none)"}\n  Answer:  ${quoted || "(empty body)"}`,
        wrongApp
          ? `That host is the \`${service}\`, not the API. Scheduled jobs need the API origin — the web app cannot process webhook events, consolidate memory or send briefings.`
          : notFoundBySomeoneElse
            ? "That host was deleted. Point `API_URL` at the live Railway API service (Settings → Variables shows its public domain)."
            : "Point `API_URL` at the API origin, not a web app or a proxy that prefixes the path.",
      ),
      facts,
    };
  }

  if (!healthPayload) {
    return {
      ...fail(
        EXIT.fail,
        "API_URL",
        `\`API_URL\` answered 200 but not with JSON, so it is not the ORQ8 API.\n  URL:    ${base}\n  Answer: ${quoted || "(empty body)"}`,
        "Point `API_URL` at the API origin (its `/healthz` returns `{\"data\":{\"status\":\"ok\",\"service\":\"orq8-api\"}}`).",
      ),
      facts,
    };
  }

  if (service !== API_SERVICE) {
    // A 200 with the right shape but no `service` field: an older build. Do not
    // pass on shape alone — the token check below is what actually confirms it.
    facts.identityFrom = "readiness (healthz carried no service id)";
  } else {
    facts.identityFrom = "healthz";
  }

  /* ── 4. Does it accept the token? ─────────────────────────────────────── */
  const readiness = await get(`${base}/v1/readiness`, { "x-internal-token": rawToken });
  if (!readiness.ok) {
    return {
      ...fail(
        EXIT.fail,
        "API_URL",
        `The API answered /healthz but /v1/readiness could not be reached: ${readiness.error}`,
        "Check the deployment's health, then re-run this canary.",
      ),
      facts,
    };
  }
  if (readiness.status === 401 || readiness.status === 403) {
    return {
      ...fail(
        EXIT.fail,
        "INTERNAL_TOKEN",
        `The API is up but refused the internal token (HTTP ${readiness.status}).\n  URL: ${base}`,
        "The scheduled jobs would fail with 401 instead of running. Set `INTERNAL_TOKEN` to the value the API service is deployed with.",
      ),
      facts,
    };
  }
  if (readiness.status !== 200 || !readiness.json?.data) {
    const readinessQuoted = (readiness.text ?? "").replace(/\s+/g, " ").slice(0, 200);
    return {
      ...fail(
        EXIT.fail,
        "API_URL",
        `/v1/readiness answered HTTP ${readiness.status} without a report.\n  Answer: ${readinessQuoted || "(empty body)"}`,
        "Only the API serves `/v1/readiness`; a web app or proxy in front of it does not. Point `API_URL` at the API origin, and deploy the current build there.",
      ),
      facts,
    };
  }

  /* ── 5. Pass — and report what was actually checked ───────────────────── */
  const report = readiness.json.data;
  facts.ready = typeof report.ready === "number" ? report.ready : null;
  facts.configurationRequired =
    typeof report.configurationRequired === "number" ? report.configurationRequired : null;
  facts.blocking = Array.isArray(report.blocking) ? report.blocking.length : null;

  return { verdict: "pass", code: EXIT.pass, secret: null, detail: null, fix: null, facts };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

/** The block a human reads under a red workflow run. Names the secret to fix. */
function render(secret, detail, fix) {
  const lines = [
    "",
    `✗ SCHEDULED-JOBS CANARY FAILED — fix the \`${secret}\` secret`,
    "",
    ...String(detail).split("\n").map((line) => `  ${line}`),
    "",
    `  ${fix}`,
    "",
    "  Until this passes, every scheduled job (webhook processing, memory",
    "  consolidation, briefings, waitlist drip, anomaly scan) fails inside its",
    "  own workflow, which is how one stale host reads as a pile of unrelated",
    "  bugs.",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const result = await checkScheduledJobsHost({
    apiUrl: flag("api-url") ?? process.env.ORQ8_API_URL ?? process.env.API_URL,
    token: flag("token") ?? process.env.INTERNAL_TOKEN,
    timeoutMs: (Number(flag("timeout")) || 20) * 1000,
  });

  if (result.verdict === "pass") {
    const { facts } = result;
    const summary =
      facts.ready !== null
        ? `${facts.ready} ready, ${facts.configurationRequired} configuration-required, ${facts.blocking} blocking`
        : "readiness reported (no counts)";
    console.log(`jobs-canary: probing ${facts.url}`);
    console.log("");
    console.log("✓ SCHEDULED-JOBS CANARY PASSED");
    console.log("");
    console.log(`  API_URL         ${facts.url} — /healthz ${facts.healthStatus} (\`${API_SERVICE}\`), /v1/readiness accepted the token`);
    console.log(`  INTERNAL_TOKEN  accepted`);
    console.log(`  identity from   ${facts.identityFrom}`);
    console.log(`  capabilities    ${summary}`);
    console.log("");
    console.log("  Readiness is reported, not gated here — blocking capabilities are");
    console.log("  the release gate's call, not this canary's.");
    console.log("");
    process.exitCode = EXIT.pass;
    return;
  }

  console.error(render(result.secret, result.detail, result.fix));
  if (result.verdict === "unarmed") {
    console.error(`  (verdict: NOT ARMED — exit ${EXIT.unarmed})\n`);
  }
  process.exitCode = result.code;
}

/* ── Self-test ───────────────────────────────────────────────────────────── */

/**
 * Prove the verdicts against real HTTP servers, not mocks of the logic: a
 * second copy of the "is this our API?" rule is exactly how the first version
 * shipped inverted. Each case is a host this canary must classify correctly.
 * `node scripts/jobs-canary.mjs --self-test`; wired into `scripts/proofs.mjs`.
 */
async function selfTest() {
  let pass = 0;
  let failed = 0;
  const ok = (name, cond, detail = "") => {
    if (cond) {
      pass++;
      console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`);
    } else {
      failed++;
      console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    }
  };

  const GOOD_TOKEN = "self-test-token";

  /** Serve the given routes; `/v1/readiness` is always token-gated like the API. */
  const start = async (health) => {
    const server = createServer((req, res) => {
      const send = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.url === "/healthz") {
        if (health.raw !== undefined) {
          res.writeHead(health.status ?? 200, { "content-type": health.contentType ?? "application/json" });
          res.end(health.raw);
          return;
        }
        send(health.status ?? 200, health.body);
        return;
      }
      if (req.url === "/v1/readiness") {
        if (req.headers["x-internal-token"] !== GOOD_TOKEN) return send(401, { error: "Unauthorized" });
        return send(200, {
          data: { ready: 9, configurationRequired: 3, devOnly: 1, blocking: ["email"] },
        });
      }
      send(404, { error: "Not found" });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
  };

  const check = async (hostSpec, { token = GOOD_TOKEN } = {}) => {
    const srv = await start(hostSpec);
    try {
      return await checkScheduledJobsHost({ apiUrl: srv.url, token, timeoutMs: 5_000 });
    } finally {
      await srv.close();
    }
  };

  console.log("=== jobs-canary self-test ===");

  // 1. The real API envelope — the case the first version got wrong.
  const live = await check({ body: { data: { status: "ok", service: "orq8-api" } } });
  ok("live API passes", live.verdict === "pass" && live.code === EXIT.pass, live.detail ?? `ready=${live.facts.ready}`);
  ok("live API reports readiness counts", live.facts.ready === 9 && live.facts.blocking === 1);

  // 2. The web app's envelope: top-level `status`, service `orq8-web`. The first
  //    version of this file passed this and failed case 1 — the inversion.
  const web = await check({ body: { status: "ok", service: "orq8-web" } });
  ok("web app is rejected, not passed", web.verdict === "fail" && web.code === EXIT.fail && web.secret === "API_URL", web.detail?.split("\n")[0]);
  ok("web app failure says it is the web app", /orq8-web/.test(web.detail ?? "") && /not the API/.test(web.fix ?? ""));

  // 3. The deleted Railway host — the shape this canary exists to name.
  const deleted = await check({
    status: 404,
    body: { status: "error", code: 404, message: "Application not found" },
  });
  ok("deleted host is rejected", deleted.verdict === "fail" && deleted.code === EXIT.fail && deleted.secret === "API_URL");
  ok("deleted host failure says the host is gone", /HTTP: {4}404/.test(deleted.detail ?? "") && /deleted/.test(deleted.fix ?? ""));

  // 4. A 200 that is not JSON at all (a marketing page, a proxy error page).
  const html = await check({ raw: "<html><body>hello</body></html>", contentType: "text/html" });
  ok("HTML 200 is rejected", html.verdict === "fail" && html.code === EXIT.fail && html.secret === "API_URL", html.detail?.split("\n")[0]);

  // 5. Right host, wrong token — the other secret, named separately.
  const badToken = await check({ body: { data: { status: "ok", service: "orq8-api" } } }, { token: "wrong-token" });
  ok("refused token names INTERNAL_TOKEN", badToken.verdict === "fail" && badToken.code === EXIT.fail && badToken.secret === "INTERNAL_TOKEN", badToken.detail?.split("\n")[0]);

  // 6. Not armed: no URL, no token. Distinct verdict so a caller can tell a
  //    missing secret from a broken one.
  const noUrl = await checkScheduledJobsHost({ apiUrl: "  ", token: GOOD_TOKEN });
  ok("missing API_URL is NOT ARMED", noUrl.verdict === "unarmed" && noUrl.code === EXIT.unarmed && noUrl.secret === "API_URL");
  const noToken = await checkScheduledJobsHost({ apiUrl: "http://127.0.0.1:1", token: "" });
  ok("missing INTERNAL_TOKEN is NOT ARMED", noToken.verdict === "unarmed" && noToken.code === EXIT.unarmed && noToken.secret === "INTERNAL_TOKEN");
  // Every failure must carry a non-zero exit code: a verdict that forgets one
  // returns 0 from the CLI and the workflow stays green.
  ok(
    "no failure verdict exits 0",
    [web, deleted, html, badToken].every((r) => typeof r.code === "number" && r.code !== EXIT.pass),
  );

  // 7. Unreachable host (a deleted service that no longer resolves/answers).
  const dead = await checkScheduledJobsHost({ apiUrl: "http://127.0.0.1:1", token: GOOD_TOKEN, timeoutMs: 3_000 });
  ok("unreachable host is a failure naming API_URL", dead.verdict === "fail" && dead.code === EXIT.fail && dead.secret === "API_URL", dead.detail?.split("\n")[0]);

  // 8. A malformed URL is a failure, not an unarmed skip.
  const malformed = await checkScheduledJobsHost({ apiUrl: "orq8.example.com", token: GOOD_TOKEN });
  ok("malformed URL is a failure", malformed.verdict === "fail" && malformed.code === EXIT.fail && malformed.secret === "API_URL");

  console.log(`\n=== JOBS-CANARY SELF-TEST: ${pass} passed, ${failed} failed ===`);
  process.exitCode = failed > 0 ? 1 : 0;
}

if (process.argv.includes("--self-test")) {
  await selfTest();
} else {
  await main();
}
