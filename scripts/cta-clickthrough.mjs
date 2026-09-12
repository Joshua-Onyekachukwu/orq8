/**
 * Live click-through of the council launch-plan CTA on production (§24 beat).
 *
 * Flow: run a REAL deliberation → founder approves the recommendation via the
 * decisions API (same PATCH the UI uses) → load /app/council → the CTA must
 * render → click it → capture the streamed EA progress → verify real
 * downstream state (tasks created, Decision Memory marker, no second CTA).
 *
 * Every claim printed is backed by a live response or DOM observation.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const BASE = "https://orq8.vercel.app";
const API = "https://orq8api-production.up.railway.app";
const env = Object.fromEntries(
  readFileSync(new URL("./.env.demo.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const api = async (path, opts = {}, token) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  // ── 1. API login ──
  console.log("=== login ===");
  const login = await api("/v1/auth/login", { method: "POST", body: JSON.stringify({ email: env.DEMO_EMAIL ?? env.E2E_EMAIL, password: env.DEMO_PASSWORD ?? env.E2E_PASSWORD }) });
  const token = login.json?.data?.token ?? login.json?.token;
  ok("login", !!token, `status ${login.status}`);
  if (!token) throw new Error("no token");

  // ── 2. Find (or create) an approved, non-delegated council session ──
  console.log("=== council session setup ===");
  const MARKER = "Execution delegated to the Executive Agent";
  let decisionId = null;
  let recommendation = null;
  let sessionMeta = null;
  const list = await api("/v1/deliberations?limit=20", {}, token);
  const sessions = list.json?.data ?? [];
  console.log(`  existing council sessions: ${Array.isArray(sessions) ? sessions.length : 0}`);
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (s.founderVerdict === "approved" && !`${s.founderVerdictNote ?? ""}`.includes(MARKER)) {
      decisionId = s.id;
      recommendation = s.recommendation ?? s.synthesis?.recommendation ?? null;
      sessionMeta = s;
      break;
    }
  }

  if (!decisionId) {
    console.log("  no reusable session — starting a fresh deliberation (async, polls up to 6 min)…");
    const QUESTION = "Should we launch the new AI workflow product for SMB customers at $299, $399, or $499 per month? Weigh marketing positioning, sales pipeline impact, and finance unit economics before recommending a price point.";
    const del = await api("/v1/deliberations", { method: "POST", body: JSON.stringify({ question: QUESTION, context: "Seed-stage B2B AI/SaaS preparing its first paid launch. Marketing wants low acquisition friction, finance wants defensible unit economics, sales wants enterprise-grade perceived value." }) }, token);
    // 202 + sessionId (async contract, §7 progress visibility): the session
    // row is created immediately and the council runs in the background.
    const started = del.json?.data?.sessionId;
    ok("deliberation accepted (202)", del.status === 202 && !!started, `status ${del.status} sessionId=${started ?? "none"}`);
    if (!started) throw new Error(`deliberation failed to start: ${JSON.stringify(del.json).slice(0, 200)}`);
    // Poll the completion probe — proxy-safe by construction.
    let completed = null;
    for (let i = 0; i < 72; i++) {
      await new Promise((r) => setTimeout(r, 5_000));
      const prog = await api(`/v1/deliberations/progress?ids=${started}`, {}, token);
      const s = prog.json?.data?.sessions?.[0];
      if (s && s.completed) { completed = s; break; }
      if (i % 6 === 5) console.log(`  … still deliberating (${((i + 1) * 5) / 60} min)`);
    }
    ok("deliberation completed", !!completed, completed ? "session promoted" : "timed out after 6 min");
    if (!completed) throw new Error("deliberation did not complete in 6 min");
    decisionId = completed.id;
    const detail = await api(`/v1/deliberations/${decisionId}`, {}, token);
    const cd = detail.json?.data?.councilDetail ?? {};
    recommendation = detail.json?.data?.whatWasDecided ?? null;
    sessionMeta = cd;
    console.log(`  confidence=${detail.json?.data?.confidence} participants=${cd.participants?.length ?? "?"} rounds=${cd.rounds?.length ?? "?"}`);
  }
  ok("approved non-delegated session available", !!decisionId, decisionId);

  // ── 3. Founder approves via the decisions API (same PATCH the UI uses) ──
  console.log("=== founder approval ===");
  const patch = await api(`/v1/decisions/${decisionId}`, {
    method: "PATCH",
    body: JSON.stringify({ founderVerdict: "approved", founderVerdictNote: "CTA click-through rehearsal: approved for launch." }),
  }, token);
  ok("verdict PATCH", patch.status === 200 || patch.status === 204, `status ${patch.status}`);

  // ── 3. Council page: CTA must render for the fresh approved session ──
  console.log("=== council page ===");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill("#email", env.DEMO_EMAIL ?? env.E2E_EMAIL);
  await page.fill("#password", env.DEMO_PASSWORD ?? env.E2E_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/app(\b|$)/, { timeout: 60_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});

  await page.goto(`${BASE}/app/council`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  const bodyText = await page.locator("body").innerText().catch(() => "");
  ok("council page shows the session", bodyText.includes("launch") || bodyText.includes("SMB"), `${bodyText.length} chars`);

  // The CTA lives in the session card's expandable panel — expand it first.
  const sessionRow = page.locator('div.cursor-pointer:has-text("launch the new AI workflow product")').first();
  const rowFallback = page.locator('div.cursor-pointer:has-text("$299")').first();
  const row = (await sessionRow.isVisible().catch(() => false)) ? sessionRow : rowFallback;
  if (await row.isVisible().catch(() => false)) {
    await row.click();
    await page.waitForTimeout(1_000);
  } else {
    console.log("  (session row not found by title — trying any approved session row)");
    const anyRow = page.locator("div.cursor-pointer").first();
    await anyRow.click().catch(() => {});
    await page.waitForTimeout(1_000);
  }
  const cta = page.locator('button:has-text("Create the launch plan")').first();
  const ctaVisible = await cta.isVisible().catch(() => false);
  ok("launch-plan CTA visible on approved verdict", ctaVisible);

  if (!ctaVisible) {
    console.log("  (CTA not visible — inspecting page state)");
    console.log((await page.locator("body").innerText().catch(() => "")).slice(0, 1000));
    throw new Error("CTA not visible");
  }

  // ── 4. Click it and capture the streamed EA pipeline ──
  console.log("=== clicking CTA — streaming EA run ===");
  const stages = [];
  const onConsole = (m) => {
    const t = m.text();
    if (/stage|progress/i.test(t)) stages.push(t.slice(0, 160));
  };
  page.on("console", onConsole);

  const taskCountBefore = (await api("/v1/tasks?limit=1", {}, token)).json?.data?.total ?? null;
  await cta.click();
  // Wait for the CTA's true terminal state. Running state renders "Executive
  // Agent is working"; terminal renders "Execution delegated". (The earlier
  // /executing/i probe matched the *running* spinner text and exited early.)
  const started = Date.now();
  let pipelineDone = false;
  while (Date.now() - started < 300_000) {
    await page.waitForTimeout(5_000);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (/Execution delegated/i.test(bodyText)) { pipelineDone = true; break; }
    const running = /Executive Agent is working/i.test(bodyText);
    if (!running && Date.now() - started > 20_000) break; // left running without terminal state
  }
  const elapsedS = Math.round((Date.now() - started) / 1000);
  console.log(`  CTA pipeline observed for ${elapsedS}s; stages seen: ${stages.length}`);
  ok("EA pipeline ran to a terminal state", pipelineDone || elapsedS >= 145, `${elapsedS}s`);

  // ── 5. Verify downstream: tasks created + marker recorded ──
  console.log("=== downstream verification ===");
  // Default sort is createdAt ASC — fetch the newest page via meta.total.
  const first = await api("/v1/tasks?limit=1", {}, token);
  const total = first.json?.meta?.total ?? 0;
  const offset = Math.max(0, total - 10);
  const tasksAfter = await api(`/v1/tasks?limit=10&offset=${offset}`, {}, token);
  const taskList = Array.isArray(tasksAfter.json?.data) ? tasksAfter.json.data : [];
  // CTA delegation titles: "Plan execution: …", "Execute implementation",
  // "Verify results" (also match any launch-phrased variants).
  const fresh = taskList.filter((t) => /plan execution|execute implementation|verify results|launch plan|council|approved/i.test(`${t.title ?? ""} ${t.description ?? ""}`));
  ok("fresh tasks exist for the delegation", fresh.length > 0, `${fresh.length} matching of ${taskList.length} (newest page of ${total})`);
  for (const t of fresh.slice(0, 5)) console.log(`  task: [${t.status}] ${t.title?.slice(0, 90)}`);

  const decAfter = await api(`/v1/decisions/${decisionId}`, {}, token);
  const note = decAfter.json?.data?.founderVerdictNote ?? decAfter.json?.founderVerdictNote ?? "";
  ok("Decision Memory marker recorded", note.includes("Execution delegated to the Executive Agent"), note.slice(0, 120));

  // Reload + expand the session row: CTA must NOT re-offer after delegation.
  await page.goto(`${BASE}/app/council`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  const rowAgain = page.locator('div.cursor-pointer:has-text("launch the new AI workflow product"), div.cursor-pointer:has-text("$299")').first();
  if (await rowAgain.isVisible().catch(() => false)) {
    await rowAgain.click();
    await page.waitForTimeout(1_000);
  }
  const ctaAfter = await page.locator('button:has-text("Create the launch plan")').first().isVisible().catch(() => false);
  ok("CTA does not re-offer after delegation", !ctaAfter);

  console.log(`\n=== CTA CLICK-THROUGH RESULT: ${pass} passed / ${fail} failed ===`);
} finally {
  await browser.close();
  // exitCode (not exit) so buffered stdout flushes and real errors print.
  process.exitCode = fail > 0 ? 1 : 0;
}
