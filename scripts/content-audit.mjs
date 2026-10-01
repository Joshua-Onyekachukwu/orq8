/**
 * Content audit — the sweep's complement.
 *
 * `route-sweep.mjs` answers "does the route load?". This answers "does what it
 * renders make sense?": it logs in, fetches every /app route's server-rendered
 * HTML, strips scripts/styles, and looks for the visible fingerprints of a
 * data-shape bug — `NaN`, `undefined`, `null%`, `[object Object]`, `Infinity`.
 *
 * These are the failures that survive every other check: the departments page
 * rendered a confident "NaN%" for weeks because `activeCount` was missing from
 * the API and nothing threw. Rendered text is the only place that shows up.
 *
 * Usage: node content-audit.mjs --base http://localhost:3112
 */
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
const EMAIL = process.env.DEMO_EMAIL ?? env.DEMO_EMAIL ?? "demo@orq8.test";
const PASSWORD = process.env.DEMO_PASSWORD ?? env.DEMO_PASSWORD ?? "ReviewPass123!";

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

/** Strip anything the user cannot see, so a JS identifier never fails the run. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

const PATTERNS = [
  { name: "NaN", re: /\bNaN\b/ },
  { name: "undefined", re: /\bundefined\b/ },
  { name: "null%", re: /\bnull\s*%/i },
  { name: "[object Object]", re: /\[object Object\]/ },
  { name: "Infinity", re: /\bInfinity\b/ },
];

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  if (!login.ok) {
    console.error(`login failed: ${login.status}`);
    process.exit(1);
  }
  const cookie = (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");

  let issues = 0;
  console.log(`=== content audit (${ROUTES.length} routes) ===`);
  for (const route of ROUTES) {
    let res;
    try {
      res = await fetch(`${BASE}${route}`, { headers: { cookie }, redirect: "manual" });
    } catch (err) {
      console.log(`  ERROR ${route} — ${err.message}`);
      issues++;
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      console.log(`  REDIRECT ${route} — ${res.status} → ${res.headers.get("location") ?? "?"}`);
      issues++;
      continue;
    }
    const html = await res.text();
    const text = visibleText(html);
    const found = PATTERNS.filter((p) => p.re.test(text));
    if (found.length === 0) {
      console.log(`  OK   ${route} (${text.trim().length} chars)`);
      continue;
    }
    issues += found.length;
    for (const p of found) {
      const m = text.match(p.re);
      const idx = m ? text.indexOf(m[0]) : 0;
      const context = text.slice(Math.max(0, idx - 70), idx + 40).trim();
      console.log(`  DEFECT ${route} — "${p.name}" in: …${context}…`);
    }
  }
  console.log(`\n=== CONTENT AUDIT: ${issues === 0 ? "clean" : `${issues} defect(s)`} ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
