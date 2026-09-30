/**
 * Vertical slice E2E — the founder asks the Executive Agent for work.
 *
 * One run proves the first product slice end to end, against real
 * infrastructure and real application code (nothing inside ORQ8 is stubbed):
 *
 *   1. Embedded PostgreSQL carrying the production migration lineage.
 *   2. A local OpenAI-compatible model gateway the API reaches over HTTP —
 *      OPENROUTER_BASE_URL points at it, so the real provider chain, request
 *      shape, tracing and token accounting all run; only the model is local.
 *   3. The real API (buildApp) listening on 127.0.0.1.
 *   4. A founder registers, confirms the address, and hires an AI employee.
 *   5. The founder asks the Executive Agent for work (POST /v1/commands) and
 *      the resulting task executes through the quality pipeline.
 *   6. The authority and credit gates are proven twice: they pass on the happy
 *      path and they block a real task (with the reason persisted) when an
 *      agent lacks authority or the balance is exhausted.
 *   7. Credits, the audit chain, the model traces the admin surfaces read, and
 *      the realtime SSE stream are all checked against what actually ran.
 *
 * Usage: pnpm exec tsx scripts/vertical-slice-e2e.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootEmbeddedDatabase, killStaleEmbeddedPostgres } from "./lib/embedded-db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_NAME = "orq8_vertical_slice";
const FOUNDER_PASSWORD = "FounderPass123!";
const STUB_KEY = "vs-e2e-openrouter-key";
const STUB_MODEL = "stub/model-e2e";

// ─── Reporting ──────────────────────────────────────────────────────────────

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

function check(label: string, ok: boolean, detail = ""): boolean {
  checks.push({ label, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

function stage(n: number, total: number, label: string): void {
  console.log(`\n[${n}/${total}] ${label}`);
}

// ─── Local OpenAI-compatible model gateway ──────────────────────────────────

interface GatewayCall {
  phase: "intent_analysis" | "task_execution" | "qa" | "unknown";
  model: string;
  authorized: boolean;
  promptTokens: number;
  completionTokens: number;
}

const gatewayCalls: GatewayCall[] = [];

const INTENT_JSON = {
  intent: "Research the three closest competitors and summarize their core pricing",
  category: "research",
  answerOnly: false,
  requiresApproval: false,
  riskLevel: "low",
  estimatedCost: 0,
  suggestedAgentRole: "market_researcher",
  taskDecomposition: [
    {
      title: "Map competitor pricing for the core product",
      description:
        "Collect the public pricing pages of the three closest competitors and summarize what each charges for its core product.",
      suggestedAgentRole: "market_researcher",
      priority: "normal",
    },
  ],
  response: "I will have the market researcher map the three closest competitors and summarize their pricing.",
};

const TASK_RESULT_TEXT = `## Competitor pricing summary

1. Northwind Ops — $29 per seat per month for the core product; annual billing only.
2. Beacon Labs — usage-based at $0.04 per task, no seat minimum.
3. Fathom Suite — $79 per month flat for up to five seats, then $12 per extra seat.

Pattern: incumbents anchor pricing on seats while the newer entrant meters usage.
Recommendation: position between the two models and publish a per-task price.`;

const QA_JSON = {
  verdict: "pass",
  score: 88,
  criteria: [
    { name: "completeness", status: "pass", details: "All three competitors covered with prices.", severity: "minor" },
    { name: "accuracy", status: "pass", details: "Prices match the collected sources.", severity: "minor" },
  ],
  warnings: [],
  revision_instructions: null,
  estimated_revision_effort: "trivial",
  requires_founder_review: false,
};

/** Read a request body (JSON, small). */
async function readBody(req: IncomingMessage): Promise<string> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

function completion(content: string, promptTokens: number, completionTokens: number): string {
  return JSON.stringify({
    id: `chatcmpl-${Math.random().toString(36).slice(2, 10)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: STUB_MODEL,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
  });
}

/**
 * Start the stub gateway. It answers the three phases the slice runs
 * (intent analysis, task execution, QA) with phase-appropriate payloads and
 * records every call so the harness can prove the gateway was really used.
 */
async function startGateway(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || !(req.url ?? "").includes("/chat/completions")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const raw = await readBody(req);
    let body: { model?: string; messages?: Array<{ role: string; content: string }> } = {};
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      /* treat as empty */
    }
    const messages = body.messages ?? [];
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    let phase: GatewayCall["phase"] = "unknown";
    let content = "Stub gateway: no phase matched this prompt.";
    if (system.includes("Quality Assurance evaluator")) {
      phase = "qa";
      content = JSON.stringify(QA_JSON);
    } else if (user.includes("## Task Assignment")) {
      phase = "task_execution";
      content = TASK_RESULT_TEXT;
    } else if (system.includes("the Executive Agent")) {
      phase = "intent_analysis";
      content = JSON.stringify(INTENT_JSON);
    }

    gatewayCalls.push({
      phase,
      model: body.model ?? "unset",
      authorized: req.headers.authorization === `Bearer ${STUB_KEY}`,
      promptTokens: Math.ceil((system.length + user.length) / 4),
      completionTokens: Math.ceil(content.length / 4),
    });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(completion(content, Math.ceil((system.length + user.length) / 4), Math.ceil(content.length / 4)));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  process.on("unhandledRejection", () => {
    /* background SSE pump + pool shutdown races must never crash the harness */
  });

  // Scoped to this harness's data root so the slice never stops the embedded
  // Postgres behind a running review stack or dev stack on the same machine.
  await killStaleEmbeddedPostgres(".integration-suite-data");

  stage(1, 7, "booting embedded Postgres with the production migration lineage");
  const pg = await bootEmbeddedDatabase({ dbName: DB_NAME, dirPrefix: "slice" });
  console.log(`      database on port ${pg.port}, schema applied`);

  let app: Awaited<ReturnType<typeof import("../apps/api/src/app.js").buildApp>> | undefined;
  let gateway: { port: number; close: () => Promise<void> } | undefined;
  let sseAbort: AbortController | undefined;
  let exitCode = 1;

  try {
    stage(2, 7, "starting the local OpenAI-compatible model gateway");
    gateway = await startGateway();
    console.log(`      gateway on http://127.0.0.1:${gateway.port}/v1 (model ${STUB_MODEL})`);

    stage(3, 7, "booting the real API against the real database");
    const { loadConfig, createLogger } = await import("@orq8/core");
    const { createDb } = await import("@orq8/db");
    const { buildApp } = await import("../apps/api/src/app.js");

    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: pg.databaseUrl,
      SESSION_SECRET: "vertical-slice-session-secret-32b!!",
      ENCRYPTION_KEY: "vertical-slice-encryption-key-32!",
      LOG_LEVEL: "silent",
      // The real provider chain runs; its first provider is this local gateway.
      // The ambient environment is ignored because loadConfig parses only this object.
      NVIDIA_API_KEY: "",
      OPENROUTER_API_KEY: STUB_KEY,
      OPENROUTER_BASE_URL: `http://127.0.0.1:${gateway.port}/v1`,
      OPENROUTER_MODEL: STUB_MODEL,
      LLM_HEADERS_TIMEOUT_MS: "10000",
      LLM_TIMEOUT_MS: "20000",
    } as NodeJS.ProcessEnv);

    const logger = createLogger(config);
    const created = createDb(pg.databaseUrl);
    (created.pool as unknown as { on?: (event: string, fn: () => void) => void }).on?.("error", () => {});
    app = await buildApp({ config, db: created.db, pool: created.pool, logger });
    await app.ready();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const apiPort = (app.server.address() as { port: number }).port;
    const API = `http://127.0.0.1:${apiPort}`;
    console.log(`      API on ${API}`);

    const api = async (
      route: string,
      init: { method?: string; token?: string; body?: unknown } = {},
    ): Promise<{ status: number; body: any }> => {
      const res = await fetch(`${API}${route}`, {
        method: init.method ?? "GET",
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { status: res.status, body: parsed };
    };

    stage(4, 7, "founder registers, confirms the address, hires an AI employee");
    const stamp = Date.now();
    const email = `founder-${stamp}@orq8test.com`;
    const reg = await api("/v1/auth/register", {
      method: "POST",
      body: { email, password: FOUNDER_PASSWORD, name: "Founder", org_name: `Slice Co ${stamp}` },
    });
    check("register returns a session", reg.status === 201 && !!reg.body?.data?.token, `HTTP ${reg.status}`);
    const orgId: string = reg.body?.data?.org?.id ?? "";
    check("organization was created", !!orgId, orgId || "no org id");

    const verified = await pg.pool.query<{ id: string }>(
      "UPDATE users SET email_verified_at = now() WHERE email = $1 RETURNING id",
      [email],
    );
    const founderId = verified.rows[0]?.id ?? "";
    check("founder address confirmed in the real users row", !!founderId, founderId || "no user id");

    const login = await api("/v1/auth/login", { method: "POST", body: { email, password: FOUNDER_PASSWORD } });
    const token: string = login.body?.data?.token ?? "";
    check("login opens a session after confirmation", login.status === 200 && !!token, `HTTP ${login.status}`);

    // Seed the AI employee: a real agents row, active, with authority and an
    // autonomy level that permits task execution.
    const agentName = `Nova-${stamp}`;
    const agentInsert = await pg.pool.query<{ id: string }>(
      `insert into agents (org_id, name, role, status, autonomy_level, capabilities, authority)
       values ($1, $2, 'market_researcher', 'active', 'autonomous', '["research","analysis"]'::jsonb, $3::jsonb)
       returning id`,
      [
        orgId,
        agentName,
        JSON.stringify({
          canCreateTasks: true,
          canExecuteTasks: true,
          canCommunicateExternally: false,
          canModifyResources: false,
        }),
      ],
    );
    const agentId = agentInsert.rows[0]?.id ?? "";
    check("AI employee hired with real authority", !!agentId, `${agentName} (${agentId.slice(0, 8)}…)`);

    stage(5, 7, "founder asks the Executive Agent for work");
    const sseAbortController = new AbortController();
    sseAbort = sseAbortController;
    const liveEvents: Array<Record<string, unknown> & { type: string }> = [];
    const sse = await fetch(`${API}/v1/events`, {
      headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
      signal: sseAbortController.signal,
    });
    check("realtime stream connected", sse.status === 200, `HTTP ${sse.status}`);
    const reader = sse.body?.getReader();
    const decoder = new TextDecoder();
    let frames = "";
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader!.read();
          if (done) break;
          frames += decoder.decode(value, { stream: true });
          let cut = frames.indexOf("\n\n");
          while (cut >= 0) {
            const frame = frames.slice(0, cut);
            frames = frames.slice(cut + 2);
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              try {
                liveEvents.push(JSON.parse(line.slice(5).trim()) as Record<string, unknown> & { type: string });
              } catch {
                /* partial frame */
              }
            }
            cut = frames.indexOf("\n\n");
          }
        }
      } catch {
        /* aborted at teardown */
      }
    })();

    // The stream is registered inside the route handler; wait until the API
    // reports the connection so no event can be missed.
    const { getConnectionStats } = await import("../apps/api/src/services/realtime.js");
    const connectedBy = Date.now() + 3000;
    while (getConnectionStats().orgs < 1 && Date.now() < connectedBy) {
      await new Promise((r) => setTimeout(r, 25));
    }
    check("API tracks the live connection", getConnectionStats().orgs >= 1, `${getConnectionStats().totalConnections} stream(s)`);

    const command = "Research our three closest competitors and summarize what they charge for their core product.";
    const asked = await api("/v1/commands", { method: "POST", token, body: { command } });
    const plan = asked.body?.data;
    check("Executive Agent accepted the ask", asked.status === 200 && plan?.status === "completed", `HTTP ${asked.status}, status ${plan?.status}`);
    check(
      "intent analysis ran through the model gateway",
      plan?.workflowTrace?.steps?.some((s: any) => s.name === "intent_analysis" && s.status === "completed"),
      `provider ${plan?.llmProvider}`,
    );
    check(
      "the gateway provider served the command",
      plan?.llmProvider === "openrouter",
      `reported ${plan?.llmProvider}`,
    );
    check(
      "credit gate ran before execution",
      plan?.workflowTrace?.steps?.some((s: any) => s.name === "credit_check" && s.status === "completed"),
      `${plan?.credits?.consumed ?? 0} consumed, ${plan?.credits?.remaining ?? 0} remaining`,
    );
    const taskIds: string[] = Array.isArray(plan?.taskIds) ? plan.taskIds : [];
    check("the plan produced one real task", taskIds.length === 1, taskIds.join(", ") || "no task ids");

    const taskId = taskIds[0] ?? "";
    const taskRow = (
      await pg.pool.query<{ status: string; cost: number; agent_id: string | null; result: string | null }>(
        "select status, cost, agent_id, result from tasks where id = $1",
        [taskId],
      )
    ).rows[0];
    check(
      "task executed to completion by the hired employee",
      taskRow?.status === "completed" && taskRow?.agent_id === agentId,
      `status ${taskRow?.status}, agent ${taskRow?.agent_id === agentId ? "matched" : "mismatched"}`,
    );
    const taskCost = taskRow?.cost ?? 0;
    check("the task row records a measured cost", taskCost >= 1, `${taskCost} credits`);

    stage(6, 7, "authority and credit gates: one pass, two real blocks");

    const makeControlTask = async (title: string): Promise<string> => {
      const r = await pg.pool.query<{ id: string }>(
        `insert into tasks (org_id, agent_id, title, description, status, priority)
         values ($1, $2, $3, 'Vertical slice control task', 'pending', 'normal')
         returning id`,
        [orgId, agentId, title],
      );
      return r.rows[0]?.id ?? "";
    };

    // Control A — authority denied: the agent loses canExecuteTasks and the
    // block must persist on the task row, cost nothing, and reach realtime.
    await pg.pool.query(
      `update agents set authority = jsonb_set(authority, '{canExecuteTasks}', 'false'::jsonb) where id = $1`,
      [agentId],
    );
    const blockedTaskId = await makeControlTask("Slice control: authority denied");
    const blockedRun = await api(`/v1/commands/tasks/${blockedTaskId}/execute`, { method: "POST", token });
    const blockedResult: string = blockedRun.body?.data?.result ?? "";
    check(
      "authority check blocked the task with the reason persisted",
      blockedRun.status === 200 && blockedResult.includes("does not have permission to execute tasks"),
      blockedResult.slice(0, 90),
    );
    const blockedRow = (await pg.pool.query<{ status: string; cost: number }>("select status, cost from tasks where id = $1", [blockedTaskId])).rows[0];
    check("blocked task is failed at zero cost", blockedRow?.status === "failed" && blockedRow?.cost === 0, `status ${blockedRow?.status}, cost ${blockedRow?.cost}`);
    const blockedActivity = (
      await pg.pool.query<{ reason: string }>(
        "select reason from activity_events where task_id = $1 and type = 'failed' order by occurred_at desc limit 1",
        [blockedTaskId],
      )
    ).rows[0];
    check(
      "activity records the governance reason",
      (blockedActivity?.reason ?? "").includes("governance"),
      blockedActivity?.reason ?? "no activity row",
    );
    const blockedCharge = await pg.pool.query("select 1 from credit_transactions where reference_id = $1", [blockedTaskId]);
    check("no credits were charged for blocked work", blockedCharge.rowCount === 0, `${blockedCharge.rowCount} ledger rows`);
    await pg.pool.query(
      `update agents set authority = jsonb_set(authority, '{canExecuteTasks}', 'true'::jsonb) where id = $1`,
      [agentId],
    );

    // Control B — credits exhausted: the balance is emptied and the next task
    // must refuse to start, again with its reason persisted and no charge.
    // `balanceAfterRun` is the true post-run value the controls must not change.
    const balanceAfterRun = (
      await pg.pool.query<{ used_credits: number; included_credits: number; purchased_credits: number }>(
        "select used_credits, included_credits, purchased_credits from credit_balances where org_id = $1 order by period_start desc limit 1",
        [orgId],
      )
    ).rows[0];
    await pg.pool.query(
      "update credit_balances set used_credits = included_credits + purchased_credits where org_id = $1",
      [orgId],
    );
    const exhaustedTaskId = await makeControlTask("Slice control: credits exhausted");
    const exhaustedRun = await api(`/v1/commands/tasks/${exhaustedTaskId}/execute`, { method: "POST", token });
    const exhaustedResult: string = exhaustedRun.body?.data?.result ?? "";
    check(
      "credit exhaustion blocked the task before any model call",
      exhaustedRun.status === 200 && exhaustedResult.includes("Work Credits exhausted"),
      exhaustedResult.slice(0, 90),
    );
    const exhaustedActivity = (
      await pg.pool.query<{ reason: string }>(
        "select reason from activity_events where task_id = $1 and type = 'failed' order by occurred_at desc limit 1",
        [exhaustedTaskId],
      )
    ).rows[0];
    check(
      "blocked task records the credit pre-check reason",
      exhaustedActivity?.reason === "Pre-execution credit check",
      exhaustedActivity?.reason ?? "no activity row",
    );
    const exhaustedCharge = await pg.pool.query("select 1 from credit_transactions where reference_id = $1", [exhaustedTaskId]);
    check("exhausted work was not billed", exhaustedCharge.rowCount === 0, `${exhaustedCharge.rowCount} ledger rows`);
    // Restore the balance so the ledger assertions below describe the real run.
    await pg.pool.query("update credit_balances set used_credits = $2 where org_id = $1", [orgId, balanceAfterRun?.used_credits ?? 0]);

    stage(7, 7, "credits, audit, admin trace and realtime reflect the run");

    const ledger = (
      await pg.pool.query<{ amount: number; description: string; reference_id: string | null; reference_type: string | null }>(
        "select amount, description, reference_id, reference_type from credit_transactions where org_id = $1 and type = 'usage' order by created_at asc",
        [orgId],
      )
    ).rows;
    const taskCharge = ledger.find((t) => t.reference_type === "task" && t.reference_id === taskId);
    check(
      "the ledger carries the task's measured cost",
      taskCharge?.amount === -taskCost,
      `ledger ${taskCharge?.amount ?? "missing"} vs task row ${-taskCost}`,
    );
    const commandCharge = ledger.find((t) => (t.description ?? "").startsWith("Command:"));
    check("the ledger carries the command charge", commandCharge !== undefined, `${commandCharge?.amount ?? "missing"} credits`);
    const balance = (
      await pg.pool.query<{ used_credits: number; included_credits: number; purchased_credits: number }>(
        "select used_credits, included_credits, purchased_credits from credit_balances where org_id = $1 order by period_start desc limit 1",
        [orgId],
      )
    ).rows[0];
    const ledgerTotal = ledger.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const balanceUsed = balanceAfterRun?.used_credits ?? 0;
    check("the balance equals what the ledger charged", balanceUsed === ledgerTotal, `balance ${balanceUsed} vs ledger ${ledgerTotal}`);
    check(
      "the control tasks did not change the balance",
      balance?.used_credits === balanceAfterRun?.used_credits,
      `restored ${balance?.used_credits} vs ${balanceAfterRun?.used_credits}`,
    );
    check(
      "the command response reported the real balance",
      plan?.credits?.remaining === balance?.included_credits + balance?.purchased_credits - balance?.used_credits,
      `response ${plan?.credits?.remaining} vs row ${(balance?.included_credits ?? 0) + (balance?.purchased_credits ?? 0) - (balance?.used_credits ?? 0)}`,
    );

    const auditActions = (
      await pg.pool.query<{ action: string; cost: number | null }>(
        "select action, cost from audit_events where org_id = $1 order by id asc",
        [orgId],
      )
    ).rows;
    const actions = auditActions.map((r) => r.action);
    check("audit recorded the command and its workflow", actions.includes("command.received") && actions.includes("command.workflow_trace"), `${auditActions.length} rows`);
    const consumedRow = auditActions.find((r) => r.action === "credits.consumed");
    check("audit recorded the measured credit charge", consumedRow?.cost === taskCost, `cost ${consumedRow?.cost ?? "missing"} vs task row ${taskCost}`);
    check("audit recorded task completion and QA", actions.includes("task.completed") && actions.includes("task.qa_passed"), actions.filter((a) => a.startsWith("task.")).join(", "));
    check("no unbilled spend was recorded", !actions.includes("credits.unbilled"), actions.includes("credits.unbilled") ? "credits.unbilled present" : "clean");
    const { verifyChain } = await import("../apps/api/src/services/audit.js");
    const chain = await verifyChain(created.db, orgId);
    check("the audit hash chain verifies", chain.valid, `${chain.rows} rows chained`);

    const traces = await api("/v1/commands/traces?limit=50", { token });
    const traceRows: any[] = Array.isArray(traces.body?.data) ? traces.body.data : [];
    const intentTrace = traceRows.find((t) => t.phase === "intent_analysis" && t.commandId === plan?.commandId);
    check(
      "intent trace names the gateway model and provider",
      intentTrace?.success === true && intentTrace?.provider === "openrouter" && intentTrace?.model === STUB_MODEL,
      `${intentTrace?.provider ?? "none"}/${intentTrace?.model ?? "none"}, ${intentTrace?.totalTokens ?? 0} tokens`,
    );
    const taskTrace = traceRows.find((t) => t.phase === "task_execution" && t.taskId === taskId);
    check(
      "task trace names the gateway model and provider",
      taskTrace?.success === true && taskTrace?.provider === "openrouter" && taskTrace?.taskId === taskId,
      `${taskTrace?.totalTokens ?? 0} tokens in ${taskTrace?.durationMs ?? 0}ms`,
    );
    check(
      "the gateway really served the recorded calls",
      gatewayCalls.length >= 3 &&
        gatewayCalls.some((c) => c.phase === "intent_analysis") &&
        gatewayCalls.some((c) => c.phase === "task_execution") &&
        gatewayCalls.every((c) => c.authorized),
      `${gatewayCalls.length} calls (${[...new Set(gatewayCalls.map((c) => c.phase))].join(", ")})`,
    );
    const perf = (
      await pg.pool.query<{ phase: string; provider: string; success: boolean; total_tokens: number }>(
        "select phase, provider, success, total_tokens from llm_performance where org_id = $1 order by id asc",
        [orgId],
      )
    ).rows;
    check(
      "model performance rows persist for routing",
      perf.some((r) => r.phase === "intent_analysis" && r.provider === "openrouter" && r.success) &&
        perf.some((r) => r.phase === "task_execution" && r.provider === "openrouter" && r.success),
      `${perf.length} rows`,
    );

    await pg.pool.query("update users set platform_role = 'admin' where id = $1", [founderId]);
    const adminActivity = await api("/v1/admin/activity?limit=100", { token });
    const activityRows: any[] = Array.isArray(adminActivity.body?.data) ? adminActivity.body.data : [];
    const llmSuccessRows = activityRows.filter((r) => r.type === "llm.success").length;
    check(
      "admin activity shows the persisted LLM calls",
      llmSuccessRows >= 2,
      `${llmSuccessRows} llm.success rows`,
    );
    const adminAudit = await api("/v1/admin/audit?limit=200", { token });
    const adminAuditRows: any[] = Array.isArray(adminAudit.body?.data) ? adminAudit.body.data : [];
    check(
      "admin audit shows the same trail",
      adminAuditRows.some((r) => r.action === "command.received") && adminAuditRows.some((r) => r.action === "credits.consumed"),
      `${adminAuditRows.length} rows`,
    );
    const adminUsage = await api("/v1/admin/ai-usage", { token });
    check(
      "admin usage reflects the credits spent",
      (adminUsage.body?.data?.credits?.used ?? 0) >= ledgerTotal,
      `${adminUsage.body?.data?.credits?.used ?? 0} used`,
    );

    const types = new Set(liveEvents.map((e) => e.type));
    const started = liveEvents.find((e) => e.type === "task.started" && e.taskId === taskId);
    check("realtime delivered task.started", started !== undefined, [...types].join(", "));
    check("realtime delivered task.completed", liveEvents.some((e) => e.type === "task.completed" && e.taskId === taskId));
    const liveCharge = liveEvents.find((e) => e.type === "credits.consumed" && e.operationType === "task.executed");
    check(
      "realtime carried the measured credit charge",
      liveCharge?.amount === taskCost,
      `event ${liveCharge?.amount ?? "missing"} vs task row ${taskCost}`,
    );
    check(
      "realtime carried the blocked task's failure",
      liveEvents.some((e) => e.type === "task.failed" && e.taskId === blockedTaskId) &&
        liveEvents.some((e) => e.type === "task.failed" && e.taskId === exhaustedTaskId),
      `${liveEvents.filter((e) => e.type === "task.failed").length} task.failed events`,
    );
    check("realtime nudged the attention queue", types.has("attention.changed"), [...types].filter((t) => t === "attention.changed").join("") || "missing");
    check("QA passed over realtime", liveEvents.some((e) => e.type === "task.qa_passed" && e.taskId === taskId));

    exitCode = checks.every((c) => c.ok) ? 0 : 1;
  } finally {
    sseAbort?.abort();
    await app?.close().catch(() => undefined);
    await gateway?.close().catch(() => undefined);
    await pg.stop();
    try {
      rmSync(path.join(ROOT, ".vertical-slice-data"), { recursive: true, force: true });
    } catch {
      /* a leftover dir is harmless and gitignored */
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  for (const f of failed) console.log(`  FAILED: ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
  console.log(failed.length === 0 ? "\nPASS — the vertical slice ran end to end on real infrastructure." : "\nFAIL — the slice did not hold end to end.");
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[slice] fatal: ${(err as Error).stack ?? err}`);
    process.exit(1);
  });
