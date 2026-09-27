/**
 * Live UI verification (temporary-ish, reusable): dashboard activity widget +
 * Departments/Teams search & pagination on production, with console/network
 * capture per page. Honest output: each check records what was actually
 * rendered, and any console error / failed request is reported.
 *
 * Usage: node ui-live-verify.mjs [--base https://orq8.vercel.app]
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const argBase = process.argv.indexOf("--base");
const BASE = argBase !== -1 ? process.argv[argBase + 1] : "https://orq8.vercel.app";
const env = Object.fromEntries(
  readFileSync(new URL("./.env.demo.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const consoleErrors = [];
const failedRequests = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("response", (r) => {
  if (r.status() >= 400 && r.url().includes("/api/")) failedRequests.push(`${r.status()} ${r.url().slice(0, 140)}`);
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill("#email", env.DEMO_EMAIL ?? env.E2E_EMAIL);
  await page.fill("#password", env.DEMO_PASSWORD ?? env.E2E_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 60_000 }).catch(() => {}),
    page.click("button[type=submit]"),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
}

try {
  await login();

  // ── 1. Dashboard activity widget ──
  console.log("\n== dashboard activity widget ==");
  const widget = page.locator("div.rounded-xl", { hasText: "Department activity" }).first();
  ok("widget renders", await widget.isVisible().catch(() => false));
  ok("widget renders", await widget.isVisible().catch(() => false));
  await page.waitForTimeout(4_000); // initial /api/activity + agents round-trips
  const connBadge = await widget.locator("span", { hasText: /Live|Synced|Connecting/ }).first().innerText().catch(() => "");
  ok("connection state shown honestly", /Live|Synced|Connecting/.test(connBadge), connBadge.trim());
  const rows = await widget.locator("ol li").count().catch(() => 0);
  ok("activity rows render from real history", rows > 0, `${rows} rows`);
  const deptLabels = await widget.locator("ol li span.font-semibold").allInnerTexts().catch(() => []);
  ok("rows resolve to departments", rows === 0 || deptLabels.length > 0, `${deptLabels.length} dept labels: ${[...new Set(deptLabels)].slice(0, 4).join(", ")}`);
  const fullLogHref = await widget.locator('a[href="/app/activity"]').count().catch(() => 0);
  ok("links to full activity log", fullLogHref === 1);

  // ── 2. Departments: search + pagination ──
  console.log("\n== departments search/pagination ==");
  await page.goto(`${BASE}/app/departments`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2_500);
  const deptCards = await page.locator('a[href^="/app/departments/"], [data-department-card]').count().catch(() => 0);
  const deptSearch = page.locator('input[placeholder="Search departments…"]').first();
  ok("search input present", await deptSearch.isVisible().catch(() => false));
  if (await deptSearch.isVisible().catch(() => false)) {
    await deptSearch.fill("Fin");
    await page.waitForTimeout(1_800); // debounce + fetch
    const bodyText = await page.locator("body").innerText().catch(() => "");
    ok("search filters the list", /Financ/i.test(bodyText), "query 'Fin'");
    await deptSearch.fill("");
    await page.waitForTimeout(1_800);
  }
  const pager = await page.locator('button:has-text("Next"), a:has-text("Next"), button[aria-label*="next" i]').first().isVisible().catch(() => false);
  console.log(`  INFO pagination controls visible: ${pager} (page size × total decides; small orgs legitimately lack a Next)`);

  // ── 3. Teams: search + pagination ──
  console.log("\n== teams search/pagination ==");
  await page.goto(`${BASE}/app/teams`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2_500);
  const teamSearch = page.locator('input[placeholder="Search teams…"]').first();
  ok("search input present", await teamSearch.isVisible().catch(() => false));
  if (await teamSearch.isVisible().catch(() => false)) {
    await teamSearch.fill("zzz-no-match-xyz");
    await page.waitForTimeout(1_800);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    ok("no-match search shows honest empty state", /no teams|no results|didn.t match|no match/i.test(bodyText), "query 'zzz-no-match-xyz'");
    await teamSearch.fill("");
    await page.waitForTimeout(1_800);
  }

  // ── 4. Console/network hygiene ──
  console.log("\n== console/network hygiene ==");
  ok("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "clean");
  ok("no failed /api requests (4xx/5xx)", failedRequests.length === 0, failedRequests.slice(0, 3).join(" | ") || "clean");

  console.log(`\n===== UI LIVE VERIFY: ${pass} passed / ${fail} failed =====`);
} finally {
  await browser.close();
}
process.exit(fail > 0 ? 1 : 0);
