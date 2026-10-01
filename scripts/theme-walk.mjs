/**
 * Theme walk — every /app route renders cleanly in BOTH console themes.
 *
 * The route sweep proves routes load; this proves they load *legibly* in dark
 * and light. Per route it checks, inside the `.console` scope:
 *
 *   dark:   no leaf element painted raw white (the white-block bleed that
 *           shipped when legacy components kept light-theme backgrounds), and
 *           no near-black text (unreadable on the dark canvas);
 *   light:  no pure black text (palette drift — body ink is #2A3340), no
 *           white text on a light surface (invisible ink), and no element
 *           painted the dark canvas color #0B0F14 (dark-theme bleed).
 *
 * Honest output: a route that fails in either theme fails the walk.
 *
 * Usage: node theme-walk.mjs [--base http://localhost:3112] [--theme light]
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const argBase = process.argv.indexOf("--base");
const BASE = argBase > -1 ? process.argv[argBase + 1] : "http://localhost:3112";
const argTheme = process.argv.indexOf("--theme");
const THEMES = argTheme > -1 ? [process.argv[argTheme + 1]] : ["dark", "light"];

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
const EMAIL = env.DEMO_EMAIL ?? env.E2E_EMAIL ?? "demo@orq8.test";
const PASSWORD = env.DEMO_PASSWORD ?? env.E2E_PASSWORD ?? "Demo-Only-2026!x";

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

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

try {
  console.log(`=== login (as ${EMAIL}) ===`);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app/, { timeout: 30_000 });

  // Discover one real department and agent so their detail pages are walked too.
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
    // Discovery failure must not fail the walk — static routes still run.
  }

  console.log(`=== theme walk (${ROUTES.length} routes × ${THEMES.join(" + ")}) ===`);
  const perRouteIssues = {};
  for (const route of ROUTES) {
    // Pace like a fast human: rate limits bound runaway clients.
    await new Promise((r) => setTimeout(r, 1_200));
    for (const theme of THEMES) {
      // Set the theme cookie before navigating so the server layout paints it.
      await context.addCookies([
        { name: "orq8_console_theme", value: theme, url: BASE },
      ]);
      let loadError = null;
      await page
        .goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45_000 })
        .catch((e) => { loadError = String(e).slice(0, 120); });

      const result = await page
        .evaluate(() => {
          const c = document.querySelector(".console");
          if (!c) return { noConsole: true };
          const theme = c.getAttribute("data-console-theme") ?? "dark";
          // Nearest painted background starting at the element itself (an
          // element with its own fill — a tile, a badge — must be judged on
          // that fill, not its parent's).
          const effBg = (el) => {
            let n = el;
            while (n && n !== document.documentElement) {
              const s = getComputedStyle(n);
              if (s.backgroundColor && !/^rgba\(0, 0, 0, 0(\.0+)?\)$/.test(s.backgroundColor)) return s.backgroundColor;
              n = n.parentElement;
            }
            return "";
          };
          const lum = (rgb) => {
            const m = rgb.match(/\d+/g);
            if (!m) return 255;
            return (Number(m[0]) * 299 + Number(m[1]) * 587 + Number(m[2]) * 114) / 1000;
          };
          let whiteBlocks = 0, blackText = 0, invisible = 0, darkBleed = 0;
          const samples = [];
          for (const e of c.querySelectorAll("*")) {
            const s = getComputedStyle(e);
            const leaf = !e.firstElementChild;
            if (theme === "dark") {
              if (leaf && s.backgroundColor === "rgb(255, 255, 255)") {
                whiteBlocks++;
                if (samples.length < 3) samples.push(`white bg: <${e.tagName.toLowerCase()} ${String(e.className).slice(0, 50)}>`);
              }
            } else {
              if (s.backgroundColor === "rgb(11, 15, 20)") {
                darkBleed++;
                if (samples.length < 3) samples.push(`dark canvas bg: <${e.tagName.toLowerCase()} ${String(e.className).slice(0, 50)}>`);
              }
            }
            if (leaf && e.textContent.trim()) {
              if (s.color === "rgb(0, 0, 0)") {
                blackText++;
                if (samples.length < 3) samples.push(`pure black text: "${e.textContent.trim().slice(0, 30)}"`);
              }
              if (s.color === "rgb(255, 255, 255)") {
                const bg = effBg(e);
                if (theme === "light" && bg && lum(bg) >= 600) {
                  invisible++;
                  if (samples.length < 3) samples.push(`white on light: "${e.textContent.trim().slice(0, 30)}"`);
                }
              }
            }
          }
          return { theme, noConsole: false, whiteBlocks, blackText, invisible, darkBleed, samples };
        })
        .catch((e) => ({ evalError: String(e).slice(0, 120) }));

      const key = `${route} [${theme}]`;
      const issues = [];
      if (loadError) issues.push(`load: ${loadError}`);
      if (result.noConsole) issues.push("no .console scope");
      if (result.evalError) issues.push(`eval: ${result.evalError}`);
      if (result.whiteBlocks) issues.push(`${result.whiteBlocks} white block(s)`);
      if (result.blackText) issues.push(`${result.blackText} black-text leaf(es)`);
      if (result.invisible) issues.push(`${result.invisible} white-on-light text(s)`);
      if (result.darkBleed) issues.push(`${result.darkBleed} dark-canvas block(s)`);
      if (result.samples?.length) issues.push(...result.samples);
      perRouteIssues[key] = issues;
      ok(key, issues.length === 0, issues.length ? issues.join(" | ") : "clean");
    }
  }

  console.log("\n=== issues summary ===");
  const withIssues = Object.entries(perRouteIssues).filter(([, v]) => v.length > 0);
  if (withIssues.length === 0) console.log("none — every route is clean in both themes");
  for (const [route, issues] of withIssues) console.log(`${route}: ${issues.join(" | ")}`);

  console.log(`\n=== THEME WALK RESULT: ${ROUTES.length * THEMES.length - withIssues.length}/${ROUTES.length * THEMES.length} route-theme pairs clean ===`);
} finally {
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}
