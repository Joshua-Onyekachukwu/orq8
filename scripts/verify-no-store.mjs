#!/usr/bin/env node
/**
 * Proxy cache-policy check (docs/87 §5 item 11, docs/78 A7).
 *
 * WHY THIS EXISTS
 * Forty web proxy routes cached an authenticated, per-session read with
 * `next: { revalidate: N }`. The data behind each one is one company's, and it
 * changes when that company acts — so caching it produced failures the product
 * displayed confidently:
 *
 *   stale-after-mutation  the task page ran an action, then refetched itself;
 *                        with `revalidate: 30` the refetch served the
 *                        pre-action body, so the toast said "awaiting approval"
 *                        while the badge still said PENDING.
 *   shared-cache risk     a per-tenant response sitting in a shared cache is a
 *                        cross-company read waiting to happen.
 *
 * `apps/web/lib/api.ts` (`proxyApiJson`) already got this right — reads are
 * `no-store` unless a route knowingly opts in — but 40 routes built their own
 * `fetch(...)` and opted *out* of that policy by hand. They are swept now
 * (`cache: "no-store"`), and this is the check that keeps them swept: a route
 * that re-enables caching fails the build by name.
 *
 * WHAT IT FORBIDS (on comment-stripped source — prose is not code)
 *   `revalidate`       any occurrence, in any option. In Next 15
 *                      `next: { revalidate: false }` means INFINITE cache, so
 *                      even the "off" spelling is a cache.
 *   `force-cache` / `only-if-cached`
 *   `cache:` anything but `"no-store"` or `"private"` — `proxyApiJson` maps
 *                      `private` to `no-store`; only `public` opts a read into
 *                      a shared cache.
 *
 * WHAT IT REFUSES TO REPORT
 *   a tree with no `fetch(` at all: that is a broken scanner, not a clean app,
 *   so it fails rather than passing vacuously.
 *
 * Usage:
 *   node scripts/verify-no-store.mjs              scan apps/web/app/api
 *   node scripts/verify-no-store.mjs --web-dir D  scan D (the self-test's fixtures)
 *   node scripts/verify-no-store.mjs --self-test
 *
 * Exit codes: 0 clean, 1 violations, 2 usage error. No dependencies.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./lib/strip-comments.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const EXIT = { pass: 0, fail: 1, usage: 2 };

/** Source files that can carry a fetch call. */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

/** Caching spellings that are always wrong in an authenticated proxy. */
const FORBIDDEN = [
  { id: "revalidate", why: "Next 15 `next: { revalidate: N }` caches the response; `revalidate: false` means INFINITE cache" },
  { id: "force-cache", why: "explicitly caches the response" },
  { id: "only-if-cached", why: "cache-mode that assumes a cached copy exists" },
];

/** `cache:` accepts only the two values that mean "do not cache". */
const ALLOWED_CACHE_VALUES = new Set(['"no-store"', "'no-store'", '"private"', "'private'"]);

/**
 * The server-component helper `apps/web/lib/api.ts` (`fetchWithToken`) carries
 * every authenticated, per-tenant read a server component makes — the half of
 * docs/87 §5 item 11 the route sweep did not touch. It must default to
 * `no-store`. The check is narrow so it cannot false-positive on the two
 * things that file legitimately contains: the single documented opt-in
 * (`options?.revalidate` wired to `next: { revalidate }`), and the prose in
 * its block comment (already stripped). Any other caching reintroduced here
 * is a regression this check must catch by name.
 */
const TOKEN_HELPER = "apps/web/lib/api.ts";

/**
 * Is this the server-component helper file, where the narrower rule applies?
 *
 * Matched by path SUFFIX, not exact equality: the self-test writes fixtures
 * under a tempdir, so their repo-relative path is `../../..<tmp>/apps/web/lib/api.ts`
 * and an exact match would never fire there — the rule would be silently
 * untested while passing on the real file by coincidence of its path.
 * Suffix matching makes the fixture drive detection the same way the real
 * file does, so "passes when clean" and "fails when regressed" are both real.
 */
function isTokenHelper(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  return normalized === TOKEN_HELPER || normalized.endsWith(`/${TOKEN_HELPER}`);
}

/**
 * Scan one directory of route handlers. Returns violations with file:line and
 * the fetch-call count, so a caller can tell "clean" from "scanner saw nothing".
 */
export function scanProxyCache({ webDir }) {
  const violations = [];
  let fetchCalls = 0;

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      // A path that does not exist is a caller's mistake, handled by the
      // vacuous-scan verdict below — not a crash.
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".next") walk(full);
        continue;
      }
      if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name))) continue;

      const code = stripComments(readFileSync(full, "utf8"));
      const rel = path.relative(repoRoot, full).split(path.sep).join("/");
      const lines = code.split("\n");

      // The server-component helper (fetchWithToken) carries every
      // authenticated per-tenant read a server component makes — the half of
      // docs/87 §5 item 11 the route sweep did not touch. Its fetch MUST default
      // to cache: "no-store". A regression removes that default (or wraps the
      // fetch in an unconditional next.revalidate). Enforced as a whole-file
      // rule after the line scan, because the default is a property of the
      // whole fetchInit, not of one line.
      const helper = isTokenHelper(rel);

      lines.forEach((line, i) => {
        const at = `${rel}:${i + 1}`;
        if (/\bfetch\s*\(/.test(line)) fetchCalls++;
        if (helper) fetchCalls++;

        let forbiddenHit = false;
        for (const { id, why } of FORBIDDEN) {
          if (new RegExp(`\\b${id}\\b`).test(line)) {
            // In the server-component helper, `revalidate` appears on the
            // explicit opt-in wiring line (`options?.revalidate` →
            // `next: { revalidate: ... }`); that one is legal because the
            // default below is `cache: "no-store"` and `revalidate` is only
            // ever a caller-controlled opt-in, never a default. The real
            // regression — a fetch that is no longer defaulted to no-store —
            // is caught by the whole-file rule after this loop, so there is no
            // per-line exception to get wrong here.
            if (helper && id === "revalidate") continue;
            violations.push({ at, id, why, line: line.trim() });
            forbiddenHit = true;
          }
        }

        // `cache: <value>` — only "no-store" and "private" are allowed. Skipped
        // when the line already carries a forbidden id, so one line is one
        // violation with one fix, not a pile of echoes.
        const cache = line.match(/\bcache\s*:\s*([^\s,}]+)/);
        if (!forbiddenHit && cache && !ALLOWED_CACHE_VALUES.has(cache[1])) {
          violations.push({
            at,
            id: `cache: ${cache[1]}`,
            why: 'only `cache: "no-store"` (or the `private` alias) is allowed on an authenticated proxy read',
            line: line.trim(),
          });
        }
      });

      // Whole-file rule for the helper: its fetch must default to cache:
      // "no-store". A regression removes that default (the shape fetchWithToken
      // shipped with — an unconditional `next: { revalidate: N }`), which is a
      // property of the whole file, not of one line.
      if (helper && !/cache\s*:\s*["']no-store["']/.test(code)) {
        violations.push({
          at: `${rel}:fetchWithToken`,
          id: "helper-default-not-no-store",
          why: "fetchWithToken must default its fetch to cache: \"no-store\" — a per-tenant read must never be cached (docs/87 §5 item 11)",
          line: "fetchWithToken no longer defaults to cache: \"no-store\"",
        });
      }
    }
  };

  walk(webDir);
  return { violations, fetchCalls };
}

function report({ violations, fetchCalls }, webDir) {
  console.log(`fetch calls scanned: ${fetchCalls} in ${path.relative(repoRoot, webDir)}`);
  if (fetchCalls === 0) {
    console.error(
      "::error::the scanner found no fetch calls at all in this tree — that is a broken scanner, not a clean app, so this check cannot pass",
    );
    return false;
  }
  if (violations.length === 0) {
    console.log("no proxy read is cached");
    return true;
  }
  console.error(`::error::${violations.length} proxy read(s) are cached — an authenticated, per-session read must never be`);
  for (const v of violations) {
    console.error(`         ${v.at}  ${v.id}`);
    console.error(`             ${v.line}`);
    console.error(`             why: ${v.why}`);
    console.error(`             fix: cache: "no-store",`);
  }
  return false;
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : fallback;
};

function main() {
  const webDir = path.resolve(repoRoot, flag("web-dir", "apps/web/app/api"));
  const ok = report(scanProxyCache({ webDir }), webDir);
  console.log(ok ? "\npass" : "\nFAIL");
  process.exitCode = ok ? EXIT.pass : EXIT.fail;
}

/* ── Self-test ───────────────────────────────────────────────────────────── */

/**
 * Every case is a real file on disk. The traps are pinned on purpose: a comment
 * that mentions caching must not fail (that false positive gets a gate deleted),
 * and `next: { revalidate: false }` must fail even though it *reads* like the
 * off switch — in Next 15 it is the infinite cache.
 * `node scripts/verify-no-store.mjs --self-test`, wired into `scripts/proofs.mjs`.
 */
function selfTest() {
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

  const root = mkdtempSync(path.join(tmpdir(), "orq8-nostore-"));
  const routes = path.join(root, "api");
  const put = (rel, body) => {
    const full = path.join(routes, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
    return full;
  };

  try {
    console.log("=== no-store check self-test ===");

    // 1. The swept shape: passes.
    put("tasks/route.ts", `
      const res = await fetch(url, {
        headers: proxyAuthHeaders(token),
        // Authenticated, per-session read: never cached (docs/87 §5 item 11).
        cache: "no-store",
      });
    `);
    // 2. The shape this replaced: fails, by name and line.
    put("goals/route.ts", `
      const res = await fetch(url, {
        headers: proxyAuthHeaders(token),
        next: { revalidate: 30 },
      });
    `);
    // 3. The Next 15 trap: `revalidate: false` is INFINITE cache, not "no cache".
    put("squads/route.ts", `const res = await fetch(url, { next: { revalidate: false } });`);
    // 4. An explicit force-cache, and a cache value that is not no-store.
    put("mcp/route.ts", `
      const a = await fetch(url, { cache: "force-cache" });
      const b = await fetch(url, { cache: "default" });
    `);
    // 5. The deliberate opt-in is still a cache: a route may not do it.
    put("members/route.ts", `return proxyApiJson(request, "/v1/members", { cache: "public" });`);
    // 6. Prose about caching is not code: this file is clean.
    put("lineage/route.ts", `
      // This route used to say next: { revalidate: 30 } — see docs/87 §5 item 11.
      /* cache: "force-cache" was here once. */
      const res = await fetch(url, { cache: "no-store" });
    `);
    // 7. A write-only route with no cache option at all: clean (route-handler
    //    fetch defaults to no-store).
    put("upload/route.ts", `const res = await fetch(url, { method: "POST", body });`);

    const clean = scanProxyCache({ webDir: path.join(routes, "lineage") });
    ok("a clean route passes", clean.violations.length === 0, clean.violations[0]?.id ?? "");

    const prose = scanProxyCache({ webDir: path.join(routes, "upload") });
    ok("a write-only route with no cache option passes", prose.violations.length === 0);

    const swept = scanProxyCache({ webDir: path.join(routes, "tasks") });
    ok("the swept shape passes", swept.violations.length === 0, swept.violations[0]?.id ?? "");

    const stale = scanProxyCache({ webDir: path.join(routes, "goals") });
    ok("revalidate is caught", stale.violations.length === 1 && stale.violations[0].id === "revalidate", stale.violations[0]?.at);
    ok("the failure names the file and line", /goals\/route\.ts:4$/.test(stale.violations[0].at), stale.violations[0].at);

    const trap = scanProxyCache({ webDir: path.join(routes, "squads") });
    ok("revalidate: false is caught (it is the infinite cache)", trap.violations.length === 1 && trap.violations[0].id === "revalidate");

    const forced = scanProxyCache({ webDir: path.join(routes, "mcp") });
    ok("force-cache and a non-no-store cache value are caught", forced.violations.length === 2, forced.violations.map((v) => v.id).join(", "));

    const opted = scanProxyCache({ webDir: path.join(routes, "members") });
    ok("a route opting a tenant read into a shared cache is caught", opted.violations.length === 1 && opted.violations[0].id === 'cache: "public"', opted.violations[0]?.id);

    // The scanner must not pass a tree it cannot see into.
    const empty = scanProxyCache({ webDir: path.join(root, "nothing-here") });
    ok("an empty tree is reported as a broken scanner", empty.fetchCalls === 0 && report(empty, path.join(root, "nothing-here")) === false);

    // 8. The server-component helper guard. `fetchWithToken`'s default must be
    //    no-store; its single documented opt-in is allowed. These fixtures sit
    //    at the helper's real repo-relative path so `isTokenHelper` fires.
    //    A clean helper (no-store default + the one opt-in line) passes…
    const putRel = (relPath, body) => {
      const full = path.join(root, relPath);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, body);
      return full;
    };
    putRel("apps/web/lib/api.ts", `
      const init = {
        ...(isWrite
          ? {}
          : options?.revalidate !== undefined && options.revalidate !== false
            ? { next: { revalidate: options?.revalidate } }
            : { cache: "no-store" as const }),
      };
      const res = await fetch(\`${'${API_URL}'}${'${path}'}\`, init);
    `);
    const helperClean = scanProxyCache({ webDir: path.join(root, "apps/web/lib") });
    ok("a no-store helper default passes, opt-in line allowed", helperClean.violations.length === 0, helperClean.violations[0]?.id ?? "");

    // …and a helper that no longer defaults to no-store — the regression the
    // guard exists to catch (the shape fetchWithToken shipped with before the
    // fix: an unconditional 30s revalidate, no no-store default anywhere).
    putRel("apps/web/lib/api.ts", `
      const init = {
        ...(isWrite ? {} : { next: { revalidate: 30 } }),
      };
      const res = await fetch(\`${'${API_URL}'}${'${path}'}\`, init);
    `);
    const helperStale = scanProxyCache({ webDir: path.join(root, "apps/web/lib") });
    ok("a helper that regressed off the no-store default is caught", helperStale.violations.length >= 1, helperStale.violations.map((v) => v.id).join(", ") || "(none)");
    ok("the helper failure is named", helperStale.violations.some((v) => /revalidate|helper-default/.test(v.id)), helperStale.violations.map((v) => v.id).join(", "));
    ok("the helper failure names the file", helperStale.violations.some((v) => /apps\/web\/lib\/api\.ts/.test(v.at)), helperStale.violations[0]?.at);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(`\n=== NO-STORE SELF-TEST: ${pass} passed, ${failed} failed ===`);
  process.exitCode = failed > 0 ? EXIT.fail : EXIT.pass;
}

if (args.includes("--self-test")) {
  selfTest();
} else {
  main();
}
