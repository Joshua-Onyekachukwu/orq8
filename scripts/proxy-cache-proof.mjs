#!/usr/bin/env node
/**
 * Proxy cache proof (docs/87 §5 item 11, docs/78 A7).
 *
 * WHY THIS EXISTS — `scripts/verify-no-store.mjs` proves the *source* never
 * asks for a cached read. This proves the *behavior* a founder depends on:
 * a mutation is visible to the very next read through the same route a page
 * uses to refetch itself, and the response is not something a shared cache may
 * hold between the two.
 *
 * THE FAILURE IT REPRODUCES
 * The task page ran an action ("The task is now awaiting approval") and
 * refetched itself, and the refetch was served the pre-action body for up to 45
 * seconds — the badge still said PENDING and the link to the decision waiting on
 * the founder never appeared. The mechanism was measured, not guessed:
 *
 *   response caching (the one that bit)  a `next.config.ts` rule applied
 *     `private, s-maxage=15, stale-while-revalidate=30` to `/api/(.*)`, and Next
 *     applies config headers AFTER the handler — so it overwrote every route's
 *     own `no-store` and a shared cache held one company's rows. The rule is
 *     gone now (next.config.ts explains why at length), and this proof asserts
 *     the property it destroyed: **no proxy read response carries a shared-cache
 *     directive** (s-maxage, stale-while-revalidate, public, CDN-Cache-Control).
 *
 *   fetch data cache (the footgun)  40 routes also carried
 *     `next: { revalidate: N }` on their upstream fetch. Measured 2026-10-11 on
 *     Next 15.5 with the reverted code in the served build: the reads stayed
 *     fresh and the fetch cache recorded nothing (0 entries written), so that
 *     spelling is inert *today* — and reactivates on a version or config change.
 *     `verify-no-store.mjs` forbids it by name; this proof's freshness walk is
 *     the invariant that would catch it if it ever starts biting again.
 *
 * It runs against a real stack (web + API), because Next's caches do not exist
 * in `next dev`: a proof that passes against dev proves nothing about the build
 * the founder gets. Two routes are driven, not one — caching is a pattern, and
 * one route green is not a pattern green.
 *
 * Usage:
 *   node scripts/proxy-cache-proof.mjs [--web http://localhost:3112]
 *                                      [--api http://127.0.0.1:3111]
 *                                      [--email … --password …]
 *
 * Exit codes: 0 fresh and uncacheable, 1 a read was stale or cacheable,
 * 2 the stack could not be reached or no session could be established.
 * No dependencies.
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : fallback;
};

const WEB = (flag("web", process.env.REVIEW_WEB_URL ?? "http://localhost:3112")).replace(/\/+$/, "");
const API = (flag("api", process.env.REVIEW_API_URL ?? "http://127.0.0.1:3111")).replace(/\/+$/, "");

/**
 * Directives that let a shared cache hold the response between a mutation and
 * the next read. `private` alone is safe (a private cache is the browser's own),
 * but `s-maxage` / `stale-while-revalidate` / `public` hand it to the CDN — which
 * is exactly the rule that caused the PENDING-badge incident.
 */
const SHARED_CACHE_DIRECTIVES = ["s-maxage", "stale-while-revalidate", "stale-if-error", "public"];
const SHARED_CACHE_HEADERS = ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control", "surrogate-control"];

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

const json = async (res) => res.json().catch(() => null);

/**
 * A session cookie for a real company. Registering is the honest path (the
 * proof makes its own data and touches nobody's), but a stack may close
 * registration, so the seeded review founder is the fallback — same assertion,
 * different door.
 */
async function sessionCookie() {
  const email = flag("email") ?? `cache-proof-${Date.now()}-${Math.floor(Math.random() * 1e6)}@orq8.test`;
  const password = flag("password") ?? "CacheProof123!";

  const reg = await fetch(`${WEB}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, org_name: "Cache Proof Co" }),
    redirect: "manual",
  });
  const cookie = reg.headers.get("set-cookie")?.split(";")[0] ?? null;
  if (reg.ok && cookie) return cookie;

  console.log(`  (registration answered ${reg.status}, trying the seeded review founder)`);
  const login = await fetch(`${WEB}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: flag("email") ?? "founder@orq8.test", password: flag("password") ?? "ReviewPass123!" }),
    redirect: "manual",
  });
  const loginCookie = login.headers.get("set-cookie")?.split(";")[0] ?? null;
  if (login.ok && loginCookie) return loginCookie;
  return null;
}

/** What shared-cache directive, if any, does this response carry? */
function sharedCacheDirective(res) {
  for (const header of SHARED_CACHE_HEADERS) {
    const value = res.headers.get(header);
    if (!value) continue;
    for (const directive of SHARED_CACHE_DIRECTIVES) {
      if (new RegExp(`(^|[,\\s])${directive}(=|,|$)`, "i").test(value)) return `${header}: ${value}`;
    }
  }
  return null;
}

const countOf = (body) =>
  Array.isArray(body) ? body.length : (body?.data?.length ?? body?.items?.length ?? -1);

/** The stale-after-mutation walk, on one route. */
async function walkRoute(cookie, { name, create, list }) {
  const post = (body) =>
    fetch(`${WEB}${create}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });

  const a = await post({ title: "Cache proof A" });
  ok(`${name}: first create accepted`, a.ok, `HTTP ${a.status}`);

  const read1 = await fetch(`${WEB}${list}`, { headers: { cookie } });
  ok(
    `${name}: first read is not holdable by a shared cache`,
    sharedCacheDirective(read1) === null,
    sharedCacheDirective(read1) ?? "no shared-cache directive",
  );
  const firstCount = countOf(await json(read1));
  ok(`${name}: read sees the first record`, firstCount >= 1, `count=${firstCount}`);

  // The mutation a page makes and then refetches around. Everything between
  // here and the next read is well inside the old `s-maxage=15,
  // stale-while-revalidate=30` window — this is the window that used to serve
  // the stale body.
  const b = await post({ title: "Cache proof B" });
  ok(`${name}: second create accepted`, b.ok, `HTTP ${b.status}`);

  const read2 = await fetch(`${WEB}${list}`, { headers: { cookie } });
  ok(
    `${name}: second read is not holdable by a shared cache`,
    sharedCacheDirective(read2) === null,
    sharedCacheDirective(read2) ?? "no shared-cache directive",
  );
  const secondCount = countOf(await json(read2));
  ok(
    `${name}: the very next read sees the second record (no stale body)`,
    secondCount === firstCount + 1,
    `first=${firstCount} second=${secondCount} — a stale second read means the route is caching again`,
  );
}

async function main() {
  console.log(`=== proxy cache proof (web ${WEB}) ===`);

  // Is there a stack at all? Saying "cached" when the server is down would be
  // the same lie this whole suite exists to avoid.
  let up = false;
  try {
    const [apiHealth, webHealth] = await Promise.all([
      fetch(`${API}/healthz`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${WEB}/healthz`, { signal: AbortSignal.timeout(5000) }),
    ]);
    up = apiHealth.ok && webHealth.ok;
  } catch {
    up = false;
  }
  if (!up) {
    console.error(`::error::no healthy stack at ${API}/${WEB} — this proof needs the built stack (next start), not a dev server`);
    process.exitCode = 2;
    return;
  }

  const cookie = await sessionCookie();
  if (!cookie) {
    console.error("::error::could not establish a session (registration refused and no seeded founder) — not a caching verdict");
    process.exitCode = 2;
    return;
  }

  await walkRoute(cookie, { name: "tasks", create: "/api/tasks", list: "/api/tasks" });
  await walkRoute(cookie, { name: "goals", create: "/api/goals", list: "/api/goals" });

  console.log(`\n=== PROXY-CACHE PROOF: ${pass} passed, ${failed} failed ===`);
  process.exitCode = failed > 0 ? 1 : 0;
}

await main();
