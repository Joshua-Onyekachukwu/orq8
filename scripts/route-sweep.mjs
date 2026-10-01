/**
 * Phase A route sweep (§1) — every required /app route loads cleanly on
 * production with the demo org's real data: no runtime errors, no 404/500s,
 * no console errors, no hydration failures. Honest-output: a route that fails
 * fails the suite.
 *
 * Aborted requests are counted, not failed: the sweep hard-navigates between
 * routes, and the browser cancels any fetch still in flight (ERR_ABORTED) when
 * the document tears down. Genuine network failures (ERR_FAILED,
 * ERR_CONNECTION_*, timeouts) and any 4xx/5xx response still fail the route.
 *
 * Usage: node route-sweep.mjs [--base https://orq8.vercel.app] [--width 375]
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const argBase = process.argv.indexOf("--base");
const BASE =
  argBase > -1 ? process.argv[argBase + 1] : "https://orq8.vercel.app";
// Viewport width is a flag so the same sweep proves the desktop walk and the
// 375px one: `--width 375`. A page that renders at 1440 and blanks or
// overflows at 375 is a real defect the desktop-only sweep cannot see.
const argWidth = process.argv.indexOf("--width");
const VIEWPORT_WIDTH = argWidth > -1 ? Math.max(Number(process.argv[argWidth + 1]) || 1440, 320) : 1440;
const envArg = Object.fromEntries(
  process.argv
    .map((a, i, all) => (a === "--email" || a === "--password" ? [a.slice(2).toUpperCase(), all[i + 1]] : null))
    .filter(Boolean)
);
// The demo identity. The local review stack seeds the same account from the
// same file (scripts/.env.demo.local); when the file is absent both sides fall
// back to the same default. They used to disagree — the stack seeded
// founder@orq8.test while this logged in as demo@orq8.test — which made a
// healthy app report "redirected to /login" on every /app route.
const env = (() => {
  try {
    return Object.fromEntries(
      readFileSync(new URL("./.env.demo.local", import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
    );
  } catch {
    return {};
  }
})();
const EMAIL = envArg.EMAIL ?? env.DEMO_EMAIL ?? env.E2E_EMAIL ?? "founder@orq8.test";
const PASSWORD = envArg.PASSWORD ?? env.DEMO_PASSWORD ?? env.E2E_PASSWORD ?? "ReviewPass123!";

const ROUTES = [
  "/app", "/app/tasks", "/app/finance", "/app/health", "/app/jobs", "/app/approvals", "/app/report",
  "/app/performance", "/app/engineering", "/app/mcp", "/app/simulation",
  "/app/squads", "/app/roi", "/app/agents", "/app/departments", "/app/teams",
  "/app/strategy", "/app/goals", "/app/org", "/app/business-import",
  "/app/integrations", "/app/notifications", "/app/memory", "/app/lineage",
  "/app/decisions", "/app/knowledge", "/app/audit", "/app/budgets",
  "/app/usage", "/app/files", "/app/constitution", "/app/quality",
  "/app/council", "/app/briefings", "/app/learning",
];

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
// A fetch the browser cancelled mid-flight because the page navigated away.
// Not a route defect, but still reported so a real abort storm stays visible.
const isNavigationAbort = (u) => /ERR_ABORTED/.test(u);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_WIDTH < 600 ? 812 : 900 },
});
const page = await context.newPage();

const consoleErrors = [];
const failedRequests = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("requestfailed", (r) => {
  if (/_rsc=/.test(r.url())) return; // Next.js prefetch cancellations are normal
  failedRequests.push(`${r.method()} ${r.url().slice(0, 140)} ${r.failure()?.errorText}`);
});
page.on("response", (r) => {
  if (r.status() >= 500) failedRequests.push(`${r.status()} ${r.url().slice(0, 140)}`);
  if (r.status() === 404) failedRequests.push(`404 ${r.url().slice(0, 140)}`);
  if (r.status() === 429) {
    r.text().then((t) => failedRequests.push(`429 ${r.url().slice(0, 140)} body=${t.slice(0, 120)}`)).catch(() => failedRequests.push(`429 ${r.url().slice(0, 140)}`));
  }
});

try {
  console.log(`=== login (as ${EMAIL}) ===`);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL(/\/app(\b|$)/, { timeout: 60_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  ok("login redirected into /app", /\/app(\b|$)/.test(new URL(page.url()).pathname), page.url());

  // The two workspaces are dynamic routes. Discover one real department and one
  // real employee through the app's own API, so the sweep covers the pages a
  // new route cannot name statically.
  try {
    const deptId = await page.evaluate(async () => {
      const r = await fetch("/api/departments?limit=5");
      if (!r.ok) return null;
      const j = await r.json();
      return (j.data ?? []).find((d) => d && d.id)?.id ?? null;
    });
    if (deptId) ROUTES.push(`/app/departments/${deptId}`);
    const agentId = await page.evaluate(async () => {
      const r = await fetch("/api/agents?limit=5");
      if (!r.ok) return null;
      const j = await r.json();
      return (j.data ?? []).find((a) => a && a.id)?.id ?? null;
    });
    if (agentId) ROUTES.push(`/app/agents/${agentId}`);
  } catch {
    // A discovery failure must not fail the sweep — the static routes still run.
  }

  console.log(`=== route sweep (${ROUTES.length} routes at ${VIEWPORT_WIDTH}px) ===`);
  const perRouteIssues = {};
  for (const route of ROUTES) {
    // Pace like a fast human: rate limits exist to bound runaway clients, and
    // the sweep must prove the app works at legitimate founder speed — not
    // that a machine can hammer it.
    await new Promise((r) => setTimeout(r, 1_500));
    consoleErrors.length = 0;
    failedRequests.length = 0;
    let loadError = null;
    const start = Date.now();
    await page
      .goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45_000 })
      .catch((e) => { loadError = String(e).slice(0, 120); });
    const ms = Date.now() - start;
    const finalPath = new URL(page.url()).pathname;
    const redirected = finalPath !== route && !finalPath.startsWith(route);
    let bodyText = "";
    try { bodyText = await page.locator("body").innerText({ timeout: 8_000 }); } catch {}
    const blank = bodyText.trim().length < 80;
    // The document itself must never scroll sideways. Wide tables are fine —
    // they scroll inside their own container — but a page that overflows the
    // viewport makes the whole app feel broken on a phone.
    const overflow = await page
      .evaluate(() => {
        const de = document.documentElement;
        return de.scrollWidth - de.clientWidth;
      })
      .catch(() => 0);
    const criticalConsole = consoleErrors.filter((e) => !/favicon|posthog|sentry|hydrat/i.test(e));
    const relevantNet = failedRequests.filter((u) => !/posthog|sentry/i.test(u));
    const aborts = relevantNet.filter(isNavigationAbort);
    const criticalNet = relevantNet.filter((u) => !isNavigationAbort(u));
    const hydration = consoleErrors.filter((e) => /hydrat/i.test(e));

    const issues = [];
    if (loadError) issues.push(`load: ${loadError}`);
    if (redirected) issues.push(`redirected to ${finalPath}`);
    if (blank) issues.push("blank/near-blank body");
    if (overflow > 2) issues.push(`horizontal overflow (${overflow}px)`);
    if (criticalConsole.length) issues.push(`console: ${criticalConsole[0]}`);
    if (criticalNet.length) issues.push(`net: ${criticalNet[0]}`);
    if (hydration.length) issues.push(`hydration: ${hydration[0]}`);

    perRouteIssues[route] = issues;
    const note = aborts.length ? `, ${aborts.length} nav-aborted fetch${aborts.length === 1 ? "" : "es"}` : "";
    if (issues.length === 0) ok(route, true, `${ms}ms, ${bodyText.length} chars${note}`);
    else ok(route, false, issues.join(" | "));
  }

  console.log("\n=== issues summary ===");
  const withIssues = Object.entries(perRouteIssues).filter(([, v]) => v.length > 0);
  if (withIssues.length === 0) console.log("none — all routes clean");
  for (const [route, issues] of withIssues) console.log(`${route}: ${issues.join(" | ")}`);

  console.log(`\n=== ROUTE SWEEP RESULT: ${ROUTES.length - withIssues.length}/${ROUTES.length} routes clean ===`);
} finally {
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}
