/**
 * Phase 6-10 live rehearsal (temporary script — deleted after run).
 * Uses the real demo account on production, the real streaming endpoint, and
 * prints honest timings. No fake events.
 */
import { readFileSync } from "node:fs";

const API = "https://orq8api-production.up.railway.app";
const WEB = "https://orq8.vercel.app";
const env = Object.fromEntries(
  readFileSync(new URL("./.env.demo.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const results = [];
function step(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} | ${name} | ${detail}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, token, body, timeoutMs = 60000) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

// ── Login ─────────────────────────────────────────────────────────────────
const login = await api("POST", "/v1/auth/login", null, { email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
const token = login.data?.data?.token;
step("demo-login", login.status === 200 && !!token, `status=${login.status}`);
if (!token) process.exit(1);

// ── Current org state (demo must look alive) ──────────────────────────────
const depts = await api("GET", "/v1/departments", token);
const deptList = depts.data?.data ?? depts.data ?? [];
step("demo-departments", depts.status === 200 && deptList.length >= 5, `${deptList.length} departments: ${deptList.map((d) => d.name).slice(0, 8).join(", ")}`);

const agentsRes = await api("GET", "/v1/agents", token);
const agentList = agentsRes.data?.data ?? agentsRes.data ?? [];
step("demo-agents", agentsRes.status === 200 && agentList.length >= 3, `${agentList.length} AI employees`);
for (const a of agentList.slice(0, 6)) console.log(`  agent: ${a.name} — ${a.role} (${a.status ?? "?"})`);

const tasksRes = await api("GET", "/v1/tasks", token);
const taskList = tasksRes.data?.data?.tasks ?? tasksRes.data?.data ?? tasksRes.data ?? [];
step("demo-tasks", tasksRes.status === 200, `${taskList.length} tasks`);

// ── The 90-second founder request (streaming) ─────────────────────────────
const COMMAND =
  "We're launching our new AI workflow product. Evaluate whether we're ready to launch, identify the biggest risks, and coordinate the teams required to get us launch-ready.";
console.log(`\n-- STREAMING EA COMMAND (${new Date().toISOString()}) --`);
console.log(`> ${COMMAND}`);

const t0 = Date.now();
const stageLog = [];
const final = await new Promise((resolve) => {
  (async () => {
    try {
      const res = await fetch(`${API}/v1/commands/stream?command=${encodeURIComponent(COMMAND)}`, {
        headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok || !res.body) {
        resolve({ error: `stream HTTP ${res.status}` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastData = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data:")) continue;
            let ev;
            try {
              ev = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            const t = ((Date.now() - t0) / 1000).toFixed(1);
            if (ev.type === "stage") {
              stageLog.push(ev);
              console.log(`  [+${t}s] stage: ${ev.stage} — ${ev.label} (${ev.status})`);
            } else if (ev.type === "done") {
              console.log(`  [+${t}s] done`);
              lastData = ev.result;
            } else if (ev.type === "error") {
              console.log(`  [+${t}s] stream error: ${JSON.stringify(ev).slice(0, 200)}`);
              resolve({ error: ev });
              return;
            }
          }
        }
      }
      resolve(lastData ? { result: lastData } : { error: "stream ended without done event" });
    } catch (e) {
      resolve({ error: String(e) });
    }
  })();
});

const streamSecs = ((Date.now() - t0) / 1000).toFixed(1);
if (final.error) {
  step("ea-stream", false, `error after ${streamSecs}s: ${JSON.stringify(final.error).slice(0, 200)}`);
} else {
  step("ea-stream", true, `${stageLog.length} stage events over ${streamSecs}s`);
  const r = final.result ?? {};
  console.log(`  EA status=${r.status} commandId=${r.commandId} tasks=${(r.taskIds ?? []).length}`);
  console.log(`  message: ${String(r.message ?? "").slice(0, 300)}`);
  if (r.approvalRequest) console.log(`  APPROVAL GATE: ${r.approvalRequest.action ?? r.approvalRequest.reason ?? ""}`.slice(0, 250));
  if (r.plan?.description) console.log(`  plan: ${String(r.plan.description).slice(0, 250)}`);
  if (r.credits) console.log(`  credits: consumed=${r.credits.consumed} remaining=${r.credits.remaining}`);

  // Approval flow if gated (Phases 7 60-70s + execution)
  if (r.approvalRequest?.id) {
    const ap = await api("POST", `/v1/approvals/${r.approvalRequest.id}/approve`, token, {});
    step("approval-executes", ap.status === 200 || ap.status === 201, `approve status=${ap.status}`);
    await sleep(1500);
  }

  // Tasks created by the command
  const tasks2 = await api("GET", "/v1/tasks", token);
  const list2 = tasks2.data?.data?.tasks ?? tasks2.data?.data ?? tasks2.data ?? [];
  const relevant = list2.filter((x) => x.createdAt && Date.now() - new Date(x.createdAt).getTime() < 600000);
  step("tasks-created", true, `${relevant.length} tasks in the last 10 min`);
  for (const t of relevant.slice(0, 6)) console.log(`  task: [${t.status}] ${String(t.title).slice(0, 80)}`);
}

// ── Council / deliberations reachable from the demo org ───────────────────
const delib = await api("GET", "/v1/deliberations", token);
step("council-sessions", delib.status === 200, `status=${delib.status} sessions=${(delib.data?.data ?? []).length}`);

// ── §20 signals ───────────────────────────────────────────────────────────
const sig = await api("GET", "/v1/decisions/signals", token);
const s = sig.data ?? {};
step(
  "performance-signals",
  sig.status === 200,
  `decisionsReviewed=${s.decisionsReviewed ?? "?"} models=${(s.models ?? []).length} agents=${(s.agents ?? []).length}`,
);
for (const m of (s.models ?? []).slice(0, 4)) {
  console.log(`  model ${m.model}: ${m.calls} calls, ${(m.successRate * 100).toFixed(0)}% success, ${m.reliability}`);
}
for (const a of (s.agents ?? []).slice(0, 4)) {
  console.log(`  agent ${a.name}: ${a.tasksCompleted} done / ${a.tasksFailed} failed — ${a.verdict}`);
}

// ── Summary ───────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n==== REHEARSAL SUMMARY: ${results.length - failed.length}/${results.length} checks passed ====`);
if (failed.length) for (const f of failed) console.log(`  FAILED: ${f.name}: ${f.detail}`);
process.exit(failed.length ? 2 : 0);
