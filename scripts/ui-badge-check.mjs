/**
 * One-off production UI check (temporary): demo badge on /app, CTA tasks on /app/goals.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("./.env.demo.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = "https://orq8.vercel.app";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill("#email", env.DEMO_EMAIL ?? env.E2E_EMAIL);
  await page.fill("#password", env.DEMO_PASSWORD ?? env.E2E_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 60_000 }).catch(() => {}),
    page.click("button[type=submit]"),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(4_000);

  const badge = await page.locator("text=Demo data").first().isVisible().catch(() => false);
  const tooltip = await page
    .locator('[title*="staged demo content"], [title*="staged content"]')
    .first()
    .getAttribute("title")
    .catch(() => null);
  console.log("demo badge visible on /app:", badge);
  console.log("tooltip:", tooltip ? tooltip.slice(0, 110) : "(not found)");

  await page.goto(`${BASE}/app/goals`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3_000);
  const body = await page.locator("body").innerText().catch(() => "");
  console.log("goals page shows CTA task:", /Plan execution|Execute implementation|Verify results/.test(body));
  console.log("goals page sample:", body.replace(/\s+/g, " ").slice(0, 400));
} finally {
  await browser.close();
}
