/**
 * Browser content audit — the client-rendered half of the check.
 *
 * Most console screens are client components that fetch after mount, so their
 * server HTML is a loading shell and a text grep sees nothing. The departments
 * page printed a confident "NaN%" for days for exactly that reason: by the time
 * the number existed, only the browser could see it.
 *
 * This drives a real browser, logs in once, waits for each route to settle, then
 * reads `document.body.innerText` and fails on the visible fingerprints of a
 * data-shape bug.
 *
 * Usage: node content-audit-browser.mjs [--base http://localhost:3112]
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const argBase = process.argv.indexOf("--base");
const BASE = argBase > -1 ? process.argv[argBase + 1] : "http://localhost:3112";

const env = (() => {
  try {
    return Object.fromEntries(
      readFileSync(new URL("./.env.demo.local", import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
})();
const EMAIL = env.DEMO_EMAIL ?? "demo@orq8.test";
const PASSWORD = env.DEMO_PASSWORD ?? "ReviewPass123!";

const ROUTES = [
  "/app", "/app/tasks", "/app/finance", "/app/health", "/app/jobs", "/app/approvals",
  "/app/attention", "/app/report", "/app/performance", "/app/engineering", "/app/mcp",
  "/app/simulation", "/app/squads", "/app/roi", "/app/agents", "/app/departments",
  "/app/teams", "/app/strategy", "/app/goals", "/app/org", "/app/business-import",
  "/app/integrations", "/app/notifications", "/app/memory", "/app/lineage",
  "/app/decisions", "/app/knowledge", "/app/audit", "/app/budgets", "/app/usage",
  "/app/files", "/app/constitution", "/app/quality", "/app/council", "/app/briefings",
  "/app/learning",
];

const PATTERNS = [
  { name: "NaN", re: /\bNaN\b/ },
  { name: "undefined", re: /\bundefined\b/ },
  { name: "null%", re: /\bnull\s*%/i },
  { name: "[object Object]", re: /\[object Object\]/ },
  { name: "Infinity", re: /\bInfinity\b/ },
  { name: "error boundary", re: /Something went wrong/i },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[type="email"], input[name="email"]', EMAIL);
await page.fill('input[type="password"], input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/app/, { timeout: 30_000 });
console.log(`=== browser content audit (${ROUTES.length} routes) ===`);

let issues = 0;
const INVALID = new Set(["/app/undefined", "/app/NaN"]);
for (const route of ROUTES) {
  if (INVALID.has(route)) continue;
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
    // Give client components a beat to paint their data after the last request.
    await page.waitForTimeout(1200);
  } catch (err) {
    console.log(`  LOADFAIL ${route} — ${err.message.split("\n")[0]}`);
    issues++;
    continue;
  }
  const url = page.url();
  if (!url.includes(route)) {
    console.log(`  REDIRECT ${route} → ${url}`);
    issues++;
    continue;
  }
  const text = await page.evaluate(() => document.body.innerText);
  const found = PATTERNS.filter((p) => p.re.test(text));
  if (found.length === 0) {
    console.log(`  OK   ${route} (${text.length} chars visible)`);
    continue;
  }
  issues += found.length;
  for (const p of found) {
    const m = text.match(p.re);
    const idx = m ? text.indexOf(m[0]) : 0;
    const context = text.slice(Math.max(0, idx - 80), idx + 50).replace(/\s+/g, " ").trim();
    console.log(`  DEFECT ${route} — "${p.name}": …${context}…`);
  }
}

console.log(`\n=== BROWSER CONTENT AUDIT: ${issues === 0 ? "clean" : `${issues} defect(s)`} ===`);
await browser.close();
process.exit(issues === 0 ? 0 : 1);
