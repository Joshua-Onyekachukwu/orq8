#!/usr/bin/env node
/**
 * Production data-path canary.
 *
 * WHY THIS EXISTS
 * Two canaries already ask whether the machinery is configured: `jobs-canary`
 * asks the GitHub secret `API_URL`, and the release gate asks
 * `PRODUCTION_API_URL`. Neither asks the question a founder's first five
 * minutes actually pose — can the deployed WEB app reach the API, sign a
 * person up, and read their row back? When the Vercel project's `API_URL`
 * pointed at a deleted Railway application, every data read in the deployed
 * product failed (`/api/org` relayed the dead host's 404 verbatim) while both
 * existing checks had nothing to say about it: the gate's secret was unset, so
 * it honestly reported NOT RUN, and the jobs canary reads a *different*
 * variable in a *different* system (a GitHub secret, not the Vercel project's
 * env). This canary closes that gap by exercising the product the way a user
 * does — over the public internet, through the web app's own proxy routes,
 * with no secrets and no direct database access.
 *
 * THE JOURNEY (every step is a real HTTP round trip to the deployed product)
 *   1. POST /api/auth/register with a throwaway founder (unique email, a real
 *      password, an org named `ORQ8 Canary <timestamp>`). A live API answers
 *      2xx, or refuses with its own error envelope (a duplicate email would be
 *      `error.code: "conflict"`). A dead or misrouted upstream answers 502/504
 *      ("Could not reach the ORQ8 API") or relays a foreign 404 without the
 *      API's `error.code` — because the web route strips anything that is not
 *      `error.message` and substitutes its own text. So the discriminator is:
 *      does the answer carry OUR envelope or OUR 2xx? Anything else is not
 *      this API.
 *   2. Read the row back: GET /api/auth/me with the session cookie that
 *      registration minted. The response must echo the throwaway's own email
 *      and the org we just created. An echo of a DIFFERENT user or org is the
 *      founder-visible failure this repository swept forty routes to prevent
 *      (docs/87 §5 item 11): a per-session read served from a shared or stale
 *      cache. When email verification is off, GET /api/org is read too — one
 *      more per-tenant row through a second proxy route.
 *   3. Log out, best-effort, so the session is revoked rather than left to
 *      expire.
 *
 * THE FOUR VERDICTS (each names what to change, not which step failed)
 *   0  PASS        registration and the read-back both came from this product.
 *   1  FAIL — dead upstream:      the web app could not reach its API
 *                 (502/504, "Could not reach the ORQ8 API"). Lever: the
 *                 `API_URL` env var of the WEB project (Vercel), not the
 *                 GitHub secret of the same name.
 *   1  FAIL — foreign upstream:   the register call was answered by something
 *                 that is not the ORQ8 API (a deleted host's relayed 404, an
 *                 HTML page, a proxy error) — the stale-`API_URL` shape.
 *   1  FAIL — stale/cross-session read:  registration worked, but the
 *                 read-back echoed another user's row, or a route the current
 *                 API allowlists for unconfirmed sessions answered
 *                 `email_not_verified` (a build behind the code).
 *   2  NOT ARMED   no web URL is configured at all (an explicitly empty
 *                 ORQ8_WEB_URL) — the canary has nothing to probe.
 *
 * SIDE EFFECT, STATED PLAINLY
 * Each run creates one throwaway user and one org in the target environment
 * (plus a session it tries to revoke). The org is named
 * `ORQ8 Canary <ISO timestamp>` so they are greppable and deletable. It runs
 * every six hours: four throwaway orgs a day in exchange for detecting a dead
 * production upstream within hours instead of days.
 *
 * Usage:
 *   node scripts/data-path-canary.mjs [--web-url URL] [--timeout SECONDS]
 *   node scripts/data-path-canary.mjs --self-test
 *
 * Environment fallbacks: ORQ8_WEB_URL (default https://orq8.vercel.app).
 * No dependencies, deliberately: a production canary must run even when the
 * install does not.
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};

/** The web deployment's identity, read from /healthz (docs/43). */
const WEB_SERVICE = "orq8-web";

/** Verdict → process exit code. Kept in one place so the self-test can pin it. */
export const EXIT = { pass: 0, fail: 1, unarmed: 2 };

/** The deployed product this canary protects. Override to aim it elsewhere. */
export const DEFAULT_WEB_URL = "https://orq8.vercel.app";

/**
 * Build a non-pass verdict. `code` travels with the verdict — the CLI sets
 * `process.exitCode` from it, and a verdict that forgets its code exits 0,
 * which is a canary that reports a dead upstream and still goes green.
 */
function fail(code, lever, detail, fix) {
  return { verdict: code === EXIT.unarmed ? "unarmed" : "fail", code, lever, detail, fix };
}

/** The throwaway founder this run signs up. Unique per run, never reused. */
export function makeIdentity(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return {
    email: `canary-${stamp}-${randomBytes(3).toString("hex")}@example.com`,
    password: `canary-${randomBytes(12).toString("hex")}`,
    orgName: `ORQ8 Canary ${stamp}`,
  };
}

/**
 * Pull `orq8_session` out of a Set-Cookie header list (or a getSetCookie
 * function, whichever the caller has). Accepting both is not indulgence: the
 * first version of this file was handed the array and looked for a function,
 * so every healthy signup "lost" its cookie — and the self-test's very first
 * case is what caught it.
 */
export function sessionCookieFrom(setCookie) {
  const list = Array.isArray(setCookie)
    ? setCookie
    : typeof setCookie === "function"
      ? setCookie()
      : [];
  for (const header of list) {
    const match = /(?:^|,\s*)orq8_session=([^;]+)/.exec(header);
    if (match) return match[1];
  }
  return null;
}

/**
 * Ask the deployed product one founder-shaped question: can it sign a person
 * up, and does the row it wrote come back on that person's own session?
 *
 * Pure network + string work: no printing, no `process.exit`, so the self-test
 * can drive every branch in-process against real local HTTP servers.
 *
 * Returns `{ verdict, code, lever, detail, fix, facts }`.
 */
export async function checkFounderDataPath({
  webUrl,
  identity,
  timeoutMs = 30_000,
  fetchImpl = fetch,
} = {}) {
  const rawUrl = (webUrl ?? "").trim();
  const who = identity ?? makeIdentity();
  const facts = { webUrl: rawUrl, email: who.email, orgName: who.orgName };

  /* ── 1. Is there a product to probe? (NOT ARMED if not) ──────────────── */
  if (!rawUrl) {
    return {
      ...fail(
        EXIT.unarmed,
        "ORQ8_WEB_URL",
        "No web URL is configured, so the canary has no deployed product to sign up on.",
        "Set ORQ8_WEB_URL (or pass --web-url) to the deployed web origin, e.g. `https://orq8.vercel.app`.",
      ),
      facts,
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
        "ORQ8_WEB_URL",
        `\`ORQ8_WEB_URL\` is not a valid absolute URL: \`${rawUrl}\``,
        "Use the full origin including scheme, e.g. `https://orq8.vercel.app`.",
      ),
      facts,
    };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return {
      ...fail(
        EXIT.fail,
        "ORQ8_WEB_URL",
        `\`ORQ8_WEB_URL\` uses the wrong scheme (\\\`${parsed.protocol}\\\`).`,
        "Use `https://` (or `http://` only for a local stack).",
      ),
      facts,
    };
  }

  const call = async (path, init = {}) => {
    try {
      const res = await fetchImpl(`${base}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "manual",
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON kept as text so the message can quote what came back */
      }
      return {
        ok: true,
        status: res.status,
        json,
        text,
        setCookie: res.headers?.getSetCookie?.() ?? [],
        cacheControl: res.headers?.get?.("cache-control") ?? null,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const quoted = (r) => (r.text ?? "").replace(/\s+/g, " ").slice(0, 200) || "(empty body)";

  /* ── 2. Sign the throwaway founder up ────────────────────────────────── */
  const started = Date.now();
  const register = await call("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: who.email, password: who.password, org_name: who.orgName }),
  });
  facts.registerMs = Date.now() - started;

  if (!register.ok) {
    return {
      ...fail(
        EXIT.fail,
        "the web deployment",
        `The web app did not answer the sign-up at all: ${register.error}\n  URL: ${base}/api/auth/register`,
        "The deployed web origin is down or unreachable from the public internet. Check the Vercel deployment's status and the domain.",
      ),
      facts,
    };
  }

  // Our API answers 2xx, or answers a non-2xx carrying its own `error.code`
  // (zod validation, `conflict`, `rate_limited`, …). The web register route
  // relays a string `error.code` through; a foreign upstream's body (the
  // deleted Railway app's `{"status":"error","code":404,"message":…}`, an HTML
  // error page) has no such field and arrives as bare status + substituted
  // text. So: string code ⇒ our API. 2xx ⇒ our API. Anything else ⇒ not ours.
  const code = register.json?.ok === false && typeof register.json?.code === "string" ? register.json.code : null;
  const ours = register.status >= 200 && register.status < 300 ? register.json?.ok === true : code !== null;

  if (!ours) {
    const deadShape = register.status === 502 || register.status === 504;
    return {
      ...fail(
        EXIT.fail,
        "the web project's `API_URL`",
        deadShape
          ? `The web app could not reach its API upstream.\n  URL:     ${base}/api/auth/register\n  HTTP:    ${register.status}\n  Answer:  ${quoted(register)}`
          : `The register call was answered by something that is not the ORQ8 API.\n  URL:     ${base}/api/auth/register\n  HTTP:    ${register.status}\n  Answer:  ${quoted(register)}\n  (no API error envelope — a deleted host's 404 or a proxy page arrives here as bare status + the web app's own fallback text)`,
        deadShape
          ? "Set `API_URL` in the WEB project's environment (Vercel → Settings → Environment Variables) to the live API origin and redeploy. This is the same-named variable the jobs canary checks as a GitHub secret — they are two different places, and only this one is the product's."
          : "The web project's `API_URL` points at a host that is not this API (the deleted Railway application answers every path with a 404 the web app relays without its code). Point it at the live API origin and redeploy.",
      ),
      facts,
    };
  }

  /* ── 3. Read the founder's own row back on the founder's session ─────── */
  const token = sessionCookieFrom(register.setCookie);
  if (!token) {
    return {
      ...fail(
        EXIT.fail,
        "the web app's session handling",
        `Registration succeeded (HTTP ${register.status}) but no orq8_session cookie came back, so there is no session to read a row on.\n  Answer: ${quoted(register)}`,
        "The register route attaches the session cookie on success; a response without it means the web build is behind the API (or the route changed). Deploy the current web build.",
      ),
      facts,
    };
  }
  facts.emailVerified = register.json?.email_verified === true;

  const authHeader = { cookie: `orq8_session=${token}` };
  const me = await call("/api/auth/me", { headers: authHeader });
  if (!me.ok) {
    return {
      ...fail(
        EXIT.fail,
        "the web deployment",
        `The web app stopped answering between sign-up and read-back: ${me.error}\n  URL: ${base}/api/auth/me`,
        "The deployment went away mid-journey. Check the Vercel deployment's status and re-run.",
      ),
      facts,
    };
  }

  // Three refusals that mean the same thing — the deployment is behind the
  // code. `email_not_verified` on /v1/auth/me is the clearest: the current API
  // allowlists that route for unconfirmed sessions (plugins/auth.ts), so a
  // deployment that gates it is serving an older build.
  if (me.status !== 200) {
    const meCode = typeof me.json?.error?.code === "string" ? me.json.error.code : null;
    if (me.status === 401) {
      return {
        ...fail(
          EXIT.fail,
          "the web app's session handling",
          `Registration minted a session, but /api/auth/me refused it (HTTP 401).\n  Answer: ${quoted(me)}`,
          "A cookie that worked for nothing is a session store the web app cannot reach, or a build that stopped forwarding the cookie. Check the API's `DATABASE_URL`/`REDIS_URL` and deploy the current web build.",
        ),
        facts,
      };
    }
    if (meCode === "email_not_verified") {
      return {
        ...fail(
          EXIT.fail,
          "the deployment (it is behind)",
          `The API refused /v1/auth/me with \`email_not_verified\` for a session registration just minted.\n  URL:  ${base}/api/auth/me\n  HTTP: ${me.status}\n  The current code allowlists that route for unconfirmed sessions (apps/api/src/plugins/auth.ts), so this deployment predates that fix.`,
          "Deploy the current API build. Until then, every founder who signs up before confirming their email hits a dead end on every page.",
        ),
        facts,
      };
    }
    return {
      ...fail(
        EXIT.fail,
        "the product's read path",
        `Read-back of the founder's own row failed.\n  URL:  ${base}/api/auth/me\n  HTTP: ${me.status}\n  Answer: ${quoted(me)}`,
        "Registration succeeded but the row could not be read back on the founder's session — the exact founder-visible failure this canary exists for. Check the API's logs for this timestamp.",
      ),
      facts,
    };
  }

  const echoEmail = typeof me.json?.data?.user?.email === "string" ? me.json.data.user.email : null;
  const echoOrgs = Array.isArray(me.json?.data?.memberships)
    ? me.json.data.memberships.map((m) => m?.org?.name).filter((n) => typeof n === "string")
    : [];
  facts.readBackEmail = echoEmail;
  facts.readBackOrgs = echoOrgs;

  if (echoEmail !== who.email || !echoOrgs.includes(who.orgName)) {
    const mismatches = [];
    if (echoEmail !== who.email) mismatches.push(`email: registered \`${who.email}\`, read back \`${echoEmail ?? "(none)"}\``);
    if (!echoOrgs.includes(who.orgName)) {
      mismatches.push(`org: registered \`${who.orgName}\`, read back [${echoOrgs.map((n) => `\`${n}\``).join(", ") || "none"}]`);
    }
    return {
      ...fail(
        EXIT.fail,
        "the web proxy's cache (a per-session read is being served from somewhere shared)",
        `The read-back echoed a row this session never wrote:\n  ${mismatches.join("\n  ")}\n  URL: ${base}/api/auth/me (HTTP ${me.status})`,
        "A founder's own /api/auth/me answering with another user's email or org is one tenant's row reaching another session — the failure the no-store sweep (docs/87 §5 item 11) exists to prevent. Check the web app's proxy routes for `cache`/`revalidate` and the `Cache-Control` header on this response; re-run after deploying the current web build.",
      ),
      facts,
    };
  }

  // With verification off, one more per-tenant row through a second proxy
  // route. With it on, /v1/org is gated for unconfirmed sessions by design,
  // so this canary does not pretend otherwise.
  if (facts.emailVerified) {
    const org = await call("/api/org", { headers: authHeader });
    const orgName = org.status === 200 && typeof org.json?.data?.name === "string" ? org.json.data.name : null;
    facts.orgRead = orgName ?? `HTTP ${org.status}`;
    if (orgName !== who.orgName) {
      return {
        ...fail(
          EXIT.fail,
          "the product's read path",
          `GET /api/org did not echo the org this session just created.\n  Expected: \`${who.orgName}\`\n  Read:     ${orgName === null ? `${org.status} ${quoted(org)}` : `\`${orgName}\``}`,
          "The org row registration wrote is not the org row the session reads. This is a stale or shared read of per-tenant data — check the web proxy routes and the API's read path.",
        ),
        facts,
      };
    }
    // A shared-cache directive on an authenticated read is the same defect,
    // one layer earlier: it invites any shared cache to hold one tenant's row.
    const cc = (org.cacheControl ?? me.cacheControl ?? "").toLowerCase();
    if (/\bs-maxage\b|\bstale-while-revalidate\b/.test(cc) || /(?:^|,)\s*public\b/.test(cc)) {
      return {
        ...fail(
          EXIT.fail,
          "the web proxy's cache headers",
          `An authenticated read answered with a shared-cache directive: \`Cache-Control: ${org.cacheControl ?? me.cacheControl}\``,
          "`public`, `s-maxage` and `stale-while-revalidate` on a per-session read invite a shared cache to serve one founder's row to another (docs/78 A7). Every proxy read must say `no-store`.",
        ),
        facts,
      };
    }
  } else {
    facts.orgRead = "skipped (email verification is on; /v1/org is gated for unconfirmed sessions by design)";
  }

  /* ── 4. Leave the session revoked rather than abandoned ──────────────── */
  const logout = await call("/api/auth/logout", { method: "POST", headers: authHeader });
  facts.sessionRevoked = logout.ok && logout.status === 204;

  facts.elapsedMs = Date.now() - started;
  return { verdict: "pass", code: EXIT.pass, lever: null, detail: null, fix: null, facts };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

/** The block a human reads under a red workflow run. Names what to change. */
function renderFailure(result) {
  const lines = [
    "",
    `✗ DATA-PATH CANARY FAILED — fix: ${result.lever}`,
    "",
    ...String(result.detail).split("\n").map((line) => `  ${line}`),
    "",
    `  ${result.fix}`,
    "",
    "  This canary asks the one question the other checks cannot: can the",
    "  DEPLOYED WEB APP reach the API, sign a founder up, and read their row",
    "  back? The jobs canary checks a GitHub secret and the release gate checks",
    "  PRODUCTION_API_URL — both are configuration elsewhere; this is the",
    "  product itself, over the public internet.",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const started = Date.now();
  const result = await checkFounderDataPath({
    webUrl: flag("web-url") ?? process.env.ORQ8_WEB_URL ?? DEFAULT_WEB_URL,
    timeoutMs: (Number(flag("timeout")) || 30) * 1000,
  });

  if (result.verdict === "pass") {
    const f = result.facts;
    console.log(`data-path-canary: probing ${f.webUrl}`);
    console.log("");
    console.log("✓ DATA-PATH CANARY PASSED");
    console.log("");
    console.log(`  signup        ${f.email} — HTTP 2xx in ${f.registerMs}ms`);
    console.log(`  org           ${f.orgName}`);
    console.log(`  email_verified ${f.emailVerified}`);
    console.log(`  read-back     /api/auth/me echoed ${f.readBackEmail} and org [${f.readBackOrgs.join(", ")}]`);
    console.log(`  org row       ${f.orgRead}`);
    console.log(`  logout        ${f.sessionRevoked ? "session revoked" : "logout did not return 204 (session left to expire)"}`);
    console.log(`  total         ${f.elapsedMs ?? Date.now() - started}ms`);
    console.log("");
    console.log("  A real founder journey: registered through the deployed web app,");
    console.log("  read their own row back on their own session, logged out.");
    console.log("");
    process.exitCode = EXIT.pass;
    return;
  }

  console.error(renderFailure(result));
  if (result.verdict === "unarmed") {
    console.error(`  (verdict: NOT ARMED — exit ${EXIT.unarmed})\n`);
  }
  process.exitCode = result.code;
}

/* ── Self-test ───────────────────────────────────────────────────────────── */

/**
 * Prove the verdicts against real HTTP servers, not mocks of the logic: each
 * case is a deployment shape this canary must classify correctly. The two
 * that matter most are the ones this repository has actually shipped — the
 * dead upstream (502 "Could not reach the ORQ8 API") and the deleted host's
 * relayed 404 (bare status, the web app's fallback text, no API envelope) —
 * because both were live in production while the other checks reported
 * nothing.
 *
 * `node scripts/data-path-canary.mjs --self-test`; wired into `scripts/proofs.mjs`.
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

  /**
   * Serve one deployment shape. `spec.register`, `spec.me`, `spec.org` each
   * answer with the shape a real web app would for that case; the fixture
   * remembers what was registered so the read-back can echo it faithfully.
   */
  const start = async (spec) => {
    let registered = null;
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const send = (status, payload, headers = {}) => {
          res.writeHead(status, { "content-type": "application/json", ...headers });
          res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
        };
        if (req.method === "POST" && req.url === "/api/auth/register") {
          let parsedBody = null;
          try {
            parsedBody = JSON.parse(body);
          } catch {
            /* the spec's register handler decides what to do */
          }
          const out = spec.register(parsedBody);
          registered = out.stored ?? registered;
          const headers = out.cookie ? { "set-cookie": `orq8_session=${out.cookie}; Path=/; HttpOnly` } : {};
          return send(out.status, out.body, headers);
        }
        if (req.method === "GET" && req.url === "/api/auth/me") {
          const out = spec.me(registered);
          return send(out.status, out.body, out.headers ?? {});
        }
        if (req.url === "/api/org") {
          const out = spec.org(registered);
          return send(out.status, out.body, out.headers ?? {});
        }
        if (req.method === "POST" && req.url === "/api/auth/logout") {
          return send(204, "");
        }
        send(404, { error: "Not found" });
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
  };

  const check = async (spec, overrides = {}) => {
    const srv = await start(spec);
    try {
      return await checkFounderDataPath({
        webUrl: srv.url,
        timeoutMs: 5_000,
        ...overrides,
      });
    } finally {
      await srv.close();
    }
  };

  /**
   * A healthy deployment with verification DISABLED (email_verified: true at
   * signup — the launch configuration, and the only one where /api/org is
   * readable on a fresh session): the shape to beat.
   */
  const healthy = (overrides = {}) => ({
    register: (body) => {
      if (!body?.email || !body?.password || !body?.org_name) {
        return { status: 400, body: { ok: false, error: "Enter your email, password, and company name." } };
      }
      return {
        status: 200,
        body: { ok: true, email_verified: true },
        cookie: `sess-${body.email}`,
        stored: body,
      };
    },
    me: (who) => ({
      status: 200,
      body: {
        data: {
          user: { id: "u-1", email: who?.email ?? "nobody@example.com" },
          memberships: [{ org: { id: "o-1", name: who?.org_name ?? "Nobody" }, role: "owner" }],
          active_org_id: "o-1",
        },
      },
    }),
    org: overrides.org ?? ((who) => ({ status: 200, body: { data: { name: who?.org_name ?? "Nobody", role: "owner" } } })),
    ...overrides.handlers,
  });

  console.log("=== data-path-canary self-test ===");

  // 1. The healthy deployment: signup, read-back, org row, logout.
  const live = await check(healthy());
  ok("healthy deployment passes", live.verdict === "pass" && live.code === EXIT.pass, live.detail?.split("\n")[0] ?? `read-back ${live.facts.readBackEmail}`);
  ok("healthy run reports the echoed row", live.facts.readBackOrgs?.length === 1 && live.facts.orgRead === live.facts.orgName);
  ok("healthy run revokes the session", live.facts.sessionRevoked === true);

  // 2. Verification ON: register answers email_verified: false, the session
  //    is unconfirmed, /v1/org is gated for it by design — so the canary skips
  //    the org read rather than failing a correct deployment.
  const verified = await check({
    ...healthy({ handlers: { org: (who) => ({ status: 403, body: { error: { code: "email_not_verified", message: "Confirm your email address to continue." } } }) } }),
    register: (body) => ({ ...healthy().register(body), body: { ok: true, email_verified: false } }),
  });
  ok("verification-on deployment passes without the org read", verified.verdict === "pass" && String(verified.facts.orgRead).startsWith("skipped"), verified.facts.orgRead);

  // 3. The dead upstream — the live production failure this canary was written
  //    for: the web app's fetch to a deleted host throws, and the route
  //    answers its own 502 text with no API envelope.
  const dead = await check({
    register: () => ({ status: 502, body: { ok: false, error: "Could not reach the ORQ8 API. Try again in a moment." } }),
    me: () => ({ status: 502, body: { error: "Backend unavailable" } }),
    org: () => ({ status: 502, body: { error: "Backend unavailable" } }),
  });
  ok("dead upstream is a failure", dead.verdict === "fail" && dead.code === EXIT.fail, dead.detail?.split("\n")[0]);
  ok("dead upstream names the web project's API_URL", dead.lever === "the web project's `API_URL`" && /Vercel/.test(dead.fix ?? ""));
  ok("dead upstream quotes the 502 answer", /HTTP:    502/.test(dead.detail ?? "") && /Could not reach the ORQ8 API/.test(dead.detail ?? ""));

  // 4. The deleted host's relayed 404 — bare status, the web app's fallback
  //    text, no `error.code`. This is what the deleted Railway application
  //    looked like through the deployed product.
  const foreign = await check({
    register: () => ({ status: 404, body: { ok: false, error: "Your company could not be created. Check your details and try again." } }),
    me: () => ({ status: 404, body: { ok: false, error: "Failed to load user" } }),
    org: () => ({ status: 404, body: { ok: false, error: "Failed to load organization" } }),
  });
  ok("foreign upstream is a failure", foreign.verdict === "fail" && foreign.code === EXIT.fail);
  ok("foreign upstream says it is not this API", /not the ORQ8 API/.test(foreign.detail ?? "") && /deleted Railway|not this API/.test(foreign.fix ?? ""));
  ok("foreign upstream does not blame the secret the jobs canary checks", foreign.lever === "the web project's `API_URL`");

  // 5. An HTML answer (a proxy page, a marketing 404) is the same class.
  const html = await check({
    register: () => ({ status: 404, body: "<html><body>Page not found</body></html>" }),
    me: () => ({ status: 404, body: "nope" }),
    org: () => ({ status: 404, body: "nope" }),
  });
  ok("HTML answer is a failure", html.verdict === "fail" && html.code === EXIT.fail, html.detail?.split("\n")[0]);

  // 6. THE CROSS-SESSION READ: registration works, but /api/auth/me echoes a
  //    different user's row. This is the failure the forty-route sweep exists
  //    to prevent, measured from outside the product.
  const crossed = await check(
    healthy({
      handlers: {
        me: () => ({
          status: 200,
          body: {
            data: {
              user: { id: "u-2", email: "somebody-else@example.com" },
              memberships: [{ org: { id: "o-2", name: "Somebody Else Ltd" }, role: "owner" }],
              active_org_id: "o-2",
            },
          },
        }),
      },
    }),
  );
  ok("cross-session read-back is a failure", crossed.verdict === "fail" && crossed.code === EXIT.fail);
  ok("cross-session failure names the cache", /cache/.test(crossed.lever ?? ""));
  ok("cross-session failure quotes both emails", /registered `canary-/.test(crossed.detail ?? "") && /`somebody-else@example\.com`/.test(crossed.detail ?? ""));

  // 7. A stale build: the API gates /v1/auth/me for unconfirmed sessions,
  //    which the current code allowlists — the deployment is behind.
  const staleBuild = await check({
    register: () => ({ status: 200, body: { ok: true, email_verified: false }, cookie: "sess-1" }),
    me: () => ({ status: 403, body: { error: { code: "email_not_verified", message: "Confirm your email address to continue." } } }),
    org: () => ({ status: 403, body: { error: { code: "email_not_verified", message: "Confirm your email address to continue." } } }),
  });
  ok("gated /v1/auth/me is a failure naming the deployment", staleBuild.verdict === "fail" && /behind/.test(staleBuild.lever ?? ""), staleBuild.detail?.split("\n")[0]);

  // 8. Registration minted no cookie — a session-less success.
  const noCookie = await check({
    register: () => ({ status: 200, body: { ok: true, email_verified: false } }),
    me: () => ({ status: 200, body: { data: {} } }),
    org: () => ({ status: 200, body: { data: {} } }),
  });
  ok("missing session cookie is a failure", noCookie.verdict === "fail" && /session/i.test(noCookie.lever ?? ""), noCookie.detail?.split("\n")[0]);

  // 9. A genuine API refusal still counts as OUR API (envelope present) and
  //    is reported as that refusal, not as a foreign upstream.
  const refused = await check({
    register: () => ({ status: 429, body: { ok: false, error: "Too many requests.", code: "rate_limited" } }),
    me: () => ({ status: 401, body: { error: { code: "unauthorized", message: "Invalid session" } } }),
    org: () => ({ status: 401, body: { error: { code: "unauthorized", message: "Invalid session" } } }),
  });
  ok("API refusal is not mistaken for a foreign upstream", refused.verdict === "fail" && !/not the ORQ8 API/.test(refused.detail ?? ""), refused.detail?.split("\n")[0]);

  // 10. The web origin itself is gone (connection refused).
  const gone = await check(healthy(), { webUrl: "http://127.0.0.1:1" });
  ok("unreachable web origin is a failure naming the deployment", gone.verdict === "fail" && gone.lever === "the web deployment", gone.detail?.split("\n")[0]);

  // 11. NOT ARMED, and a malformed URL.
  const unarmed = await checkFounderDataPath({ webUrl: "   " });
  ok("empty web URL is NOT ARMED", unarmed.verdict === "unarmed" && unarmed.code === EXIT.unarmed && unarmed.lever === "ORQ8_WEB_URL");
  const malformed = await checkFounderDataPath({ webUrl: "orq8.vercel.app" });
  ok("malformed URL is a failure", malformed.verdict === "fail" && malformed.code === EXIT.fail);

  // 12. Every failure must carry a non-zero exit code: a verdict that forgets
  //     one returns 0 from the CLI and the scheduled workflow stays green
  //     while production is on fire.
  const all = [dead, foreign, html, crossed, staleBuild, noCookie, refused, gone, malformed];
  ok(
    "no failure verdict exits 0",
    all.every((r) => typeof r.code === "number" && r.code !== EXIT.pass),
  );

  console.log(`\n=== DATA-PATH-CANARY SELF-TEST: ${pass} passed, ${failed} failed ===`);
  process.exitCode = failed > 0 ? 1 : 0;
}

if (process.argv.includes("--self-test")) {
  await selfTest();
} else {
  await main();
}
