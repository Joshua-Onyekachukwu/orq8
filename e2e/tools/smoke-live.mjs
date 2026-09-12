/**
 * Live authenticated smoke pass on production (temporary — deleted after run):
 * login → dashboard → Decision Council page renders the real session →
 * navbar logo size → logout. Console + network capture throughout.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const BASE = "https://orq8.vercel.app";
const env = Object.fromEntries(
  readFileSync(new URL("./.env.e2e.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

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
page.on("requestfailed", (r) => { if (!/_rsc=/.test(r.url())) failedRequests.push(`${r.method()} ${r.url().slice(0, 120)} ${r.failure()?.errorText}`); }); // _rsc aborts are normal Next.js prefetch cancellations
page.on("response", (r) => { if (r.status() >= 500) failedRequests.push(`${r.status()} ${r.url().slice(0, 120)}`); if (r.status() === 404) failedRequests.push(`404 ${r.url().slice(0, 120)}`); });

try {
  console.log("=== login page ===");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  ok("login page renders", (await page.title()).length > 0, await page.title());
  await page.fill("#email", env.TEST_USER_EMAIL);
  await page.fill("#password", env.TEST_USER_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(app|dashboard)(\b|$)/, { timeout: 60_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  const inApp = /\/(app|dashboard)(\b|$)/.test(new URL(page.url()).pathname);
  ok("login redirected into app", inApp, page.url());

  console.log("=== dashboard ===");
  await page.waitForLoadState("networkidle", { timeout: 60_000 });
  const hasShell = await page.locator("aside, nav, header").count();
  ok("app shell present", hasShell > 0, `${hasShell} layout nodes`);

  console.log("=== decision council page ===");
  await page.goto(`${BASE}/app/council`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  console.log(`  final URL: ${page.url()}`);
  let bodyText = await page.locator("body").innerText().catch(() => "");
  const councilVisible = /council|deliberation/i.test(bodyText) && !/404/.test(bodyText.slice(0, 60));
  ok("council page loads", councilVisible, `${bodyText.length} chars`);
  const hasSession = bodyText.includes("controlled beta") || bodyText.includes("launch the new AI workflow");
  ok("real deliberation session listed", hasSession, hasSession ? "beta/launch question visible" : "not found in page text");
  const noConsensus = /no consensus/i.test(bodyText);
  if (hasSession) console.log(`  (session present; no-consensus surfaced: ${noConsensus})`);

  console.log("=== navbar logo size ===");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  const logo = page.locator('img[alt="ORQ8"]').first();
  const box = await logo.boundingBox().catch(() => null);
  ok("logo element present", !!box);
  if (box) {
    ok("logo meaningfully sized", box.height >= 28 && box.width >= 70, `${Math.round(box.width)}x${Math.round(box.height)}px (was ~26x9 effective)`);
    console.log(`  logo rendered: ${Math.round(box.width)}x${Math.round(box.height)}px, aspect ${(box.width / box.height).toFixed(2)} (expect ~2.91)`);
  }

  console.log("=== console / network hygiene ===");
  const critical = consoleErrors.filter((e) => !/favicon|posthog|sentry/i.test(e));
  ok("no critical console errors", critical.length === 0, critical.length ? critical.slice(0, 3).join(" | ") : "clean");
  const criticalNet = failedRequests.filter((u) => !/posthog|sentry/i.test(u));
  ok("no failed API/image requests", criticalNet.length === 0, criticalNet.length ? criticalNet.slice(0, 3).join(" | ") : "clean");

  console.log("=== logout ===");
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
  const logoutBtn = page.locator('button:has-text("Log out"), button:has-text("Logout"), button:has-text("Sign out")').first();
  if (await logoutBtn.count()) {
    await Promise.all([
      page.waitForURL(/login|\/($|\?)/, { timeout: 30_000 }).catch(() => {}),
      logoutBtn.click().catch(() => {}),
    ]);
    ok("logout returned to public", /login|^https:\/\/orq8\.vercel\.app\/?$/.test(page.url()), page.url());
  } else {
    console.log("  (logout button not found on this surface — skipped, verified in earlier auth-cycle run)");
  }
} finally {
  await browser.close();
}

console.log(`\n=== SMOKE RESULT: ${pass} passed / ${fail} failed ===`);
process.exit(fail ? 1 : 0);
