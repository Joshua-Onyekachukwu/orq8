/**
 * Phase A route sweep (§1) — every required /app route loads cleanly on
 * production with the demo org's real data: no runtime errors, no 404/500s,
 * no console errors, no hydration failures. Honest-output: a route that fails
 * fails the suite.
 *
 * Usage: node route-sweep.mjs [--base https://orq8.vercel.app]
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const argBase = process.argv.indexOf("--base");
const BASE =
  argBase > -1 ? process.argv[argBase + 1] : "https://orq8.vercel.app";
const env = Object.fromEntries(
  readFileSync(new URL("./.env.demo.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

const ROUTES = [
  "/app", "/app/health", "/app/jobs", "/app/approvals", "/app/report",
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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
});

try {
  console.log("=== login ===");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill("#email", env.DEMO_EMAIL ?? env.E2E_EMAIL);
  await page.fill("#password", env.DEMO_PASSWORD ?? env.E2E_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/app(\b|$)/, { timeout: 60_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  ok("login redirected into /app", /\/app(\b|$)/.test(new URL(page.url()).pathname), page.url());

  console.log(`=== route sweep (${ROUTES.length} routes) ===`);
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
    const criticalConsole = consoleErrors.filter((e) => !/favicon|posthog|sentry|hydrat/i.test(e));
    const criticalNet = failedRequests.filter((u) => !/posthog|sentry/i.test(u));
    const hydration = consoleErrors.filter((e) => /hydrat/i.test(e));

    const issues = [];
    if (loadError) issues.push(`load: ${loadError}`);
    if (redirected) issues.push(`redirected to ${finalPath}`);
    if (blank) issues.push("blank/near-blank body");
    if (criticalConsole.length) issues.push(`console: ${criticalConsole[0]}`);
    if (criticalNet.length) issues.push(`net: ${criticalNet[0]}`);
    if (hydration.length) issues.push(`hydration: ${hydration[0]}`);

    perRouteIssues[route] = issues;
    if (issues.length === 0) ok(route, true, `${ms}ms, ${bodyText.length} chars`);
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
