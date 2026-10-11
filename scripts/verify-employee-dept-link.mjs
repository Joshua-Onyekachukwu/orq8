/**
 * Employee → department navigation proof.
 *
 * The employee workspace shows the department that owns the agent; that label
 * is the way back down to the unit. This script drives the real UI and proves
 * the round trip rather than the markup: the link renders exactly once in the
 * identity header, points at the agent's real department FK, lands on a
 * department workspace that actually renders, and that page links back to the
 * same employee. A label that links the wrong department, a 404, or a
 * workspace that comes up blank is a failure, not a warning.
 *
 * It also asserts the negative half: an agent that carries only the legacy
 * text column (no department FK) must render plain text, never a link that
 * 404s. That check is skipped with a note when the dataset has no such agent.
 *
 * Usage: node verify-employee-dept-link.mjs [--base http://127.0.0.1:3112]
 *
 * Credentials come from the same place scripts/review-stack.ts seeds them
 * (scripts/.env.demo.local), with the same fallbacks, so a stack booted by
 * the harness logs in here without extra flags.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const argBase = process.argv.indexOf("--base");
const BASE =
  argBase > -1 ? process.argv[argBase + 1] : "http://127.0.0.1:3112";
const envArg = Object.fromEntries(
  process.argv
    .map((a, i, all) =>
      a === "--email" || a === "--password"
        ? [a.slice(2).toUpperCase(), all[i + 1]]
        : null,
    )
    .filter(Boolean),
);
const env = (() => {
  try {
    return Object.fromEntries(
      readFileSync(new URL("./.env.demo.local", import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [
          l.slice(0, l.indexOf("=")),
          l.slice(l.indexOf("=") + 1).trim(),
        ]),
    );
  } catch {
    return {};
  }
})();
const EMAIL = envArg.EMAIL ?? env.DEMO_EMAIL ?? env.E2E_EMAIL ?? "founder@orq8.test";
const PASSWORD =
  envArg.PASSWORD ?? env.DEMO_PASSWORD ?? env.E2E_PASSWORD ?? "ReviewPass123!";

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});

try {
  console.log(`=== login (as ${EMAIL} at ${BASE}) ===`);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL(/\/app(\b|$)/, { timeout: 60_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  ok(
    "login redirected into /app",
    /\/app(\b|$)/.test(new URL(page.url()).pathname),
    page.url(),
  );

  // Discover both halves of the dataset through the app's own API: the agent
  // whose department becomes a link, and — when one exists — the agent that
  // must stay plain text.
  const agents = await page.evaluate(async () => {
    const r = await fetch("/api/agents?limit=100");
    if (!r.ok) return null;
    const j = await r.json();
    return j.data ?? [];
  });
  const linked = agents?.find((a) => a?.id && a.departmentId) ?? null;
  const textOnly = agents?.find((a) => a?.id && !a.departmentId) ?? null;
  ok(
    "found an agent with a real department FK",
    !!linked,
    linked ? `${linked.name} → ${linked.departmentName ?? linked.department}` : "none in /api/agents",
  );
  if (!linked) throw new Error("no linkable agent to prove against");

  consoleErrors.length = 0;
  console.log(`=== employee page (${linked.name}) ===`);
  await page.goto(`${BASE}/app/agents/${linked.id}`, {
    waitUntil: "networkidle",
    timeout: 45_000,
  });
  const header = page.locator("header.console-card").first();
  const link = header.locator(`a[href="/app/departments/${linked.departmentId}"]`);
  const linkCount = await link.count();
  ok("department link renders once in the identity header", linkCount === 1, `${linkCount} match(es)`);
  const label = linkCount ? (await link.innerText()).trim().toUpperCase() : "";
  const expectedLabel = (linked.departmentName ?? linked.department ?? "").toUpperCase();
  ok(
    "label is the department name",
    expectedLabel !== "" && label === expectedLabel,
    `"${label}"`,
  );

  if (linkCount) {
    const back = page.locator(`a[href="/app/agents/${linked.id}"]`);
    await Promise.all([
      page
        .waitForURL(`**/app/departments/${linked.departmentId}`, { timeout: 45_000 })
        .catch(() => {}),
      link.click(),
    ]);
    ok(
      "click lands on the department workspace",
      new URL(page.url()).pathname === `/app/departments/${linked.departmentId}`,
      page.url(),
    );
    // The click is a client-side navigation: the URL changes before the
    // workspace's server-rendered payload paints, so waiting on load state
    // alone reads a half-built page (observed: 283 chars, zero back-links).
    // The workspace's own back-link is the signal that it has rendered.
    const rendered = await back
      .first()
      .waitFor({ state: "attached", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    const body = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
    ok("department workspace renders", body.trim().length >= 80, `${body.length} chars`);
    const backCount = await back.count();
    ok(
      "workspace links back to the employee",
      rendered && backCount >= 1,
      `${backCount} link(s)`,
    );
  }

  if (textOnly) {
    console.log(`=== legacy text-only agent (${textOnly.name}) ===`);
    await page.goto(`${BASE}/app/agents/${textOnly.id}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    const strayLinks = await page
      .locator('header.console-card a[href^="/app/departments/"]')
      .count();
    ok("text-only agent stays plain text (no 404 link)", strayLinks === 0, `${strayLinks} link(s)`);
  } else {
    console.log("  SKIP text-only agent check — no agent without a department FK");
  }

  const critical = consoleErrors.filter((e) => !/favicon|posthog|sentry|hydrat/i.test(e));
  ok("no console errors", critical.length === 0, critical[0] ?? "");
} catch (err) {
  fail++;
  console.log(`  FAIL harness — ${String(err).slice(0, 200)}`);
} finally {
  await browser.close();
  console.log(`\n=== EMPLOYEE→DEPARTMENT RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}
