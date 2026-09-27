/**
 * Local review stack (development harness).
 *
 * Boots everything a founder needs to actually look at ORQ8 on this machine:
 * an embedded Postgres with the production migration lineage, a local
 * OpenAI-compatible gateway so the Executive Agent really runs, the real API,
 * and the built web app, seeded with one real company (AI employees, a
 * department and team, a goal, an approval, tasks) plus one command executed
 * end to end so credits, activity, attention and traces are non-empty.
 *
 * Prints the URL and the login credentials, then stays up. Nothing here is a
 * product feature; it exists so the current user experience can be reviewed.
 *
 * Usage: nohup pnpm exec tsx scripts/review-stack.ts > .review-stack.log 2>&1 &
 */

import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { bootEmbeddedDatabase, killStaleEmbeddedPostgres } from "./lib/embedded-db.js";

const DB_NAME = "orq8_review";
const API_PORT = 3111;
const WEB_PORT = 3112;
const FOUNDER_EMAIL = "founder@orq8.test";
const FOUNDER_PASSWORD = "ReviewPass123!";
const STUB_KEY = "review-stack-key";
const STUB_MODEL = "stub/review-model";

const INTENT_JSON = {
  intent: "Research the three closest competitors and summarize their pricing",
  category: "research",
  answerOnly: false,
  requiresApproval: false,
  riskLevel: "low",
  estimatedCost: 0,
  suggestedAgentRole: "market_researcher",
  taskDecomposition: [
    {
      title: "Map competitor pricing for the core product",
      description: "Collect the public pricing of the three closest competitors and summarize each plan.",
      suggestedAgentRole: "market_researcher",
      priority: "normal",
    },
  ],
  response: "I will have Nova map the three closest competitors and summarize their pricing.",
};

const TASK_RESULT = `## Competitor pricing summary

1. Northwind Ops: $29 per seat per month for the core product, annual billing only.
2. Beacon Labs: usage-based at $0.04 per task, no seat minimum.
3. Fathom Suite: $79 per month flat for five seats, then $12 per extra seat.

Pattern: incumbents anchor on seats, the newer entrant meters usage.
Recommendation: publish a per-task price and keep seat pricing for larger teams.`;

const QA_JSON = {
  verdict: "pass",
  score: 88,
  criteria: [{ name: "completeness", status: "pass", details: "All three competitors covered.", severity: "minor" }],
  warnings: [],
  revision_instructions: null,
  estimated_revision_effort: "trivial",
  requires_founder_review: false,
};

async function readBody(req: IncomingMessage): Promise<string> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

async function startGateway(): Promise<{ port: number; close: () => Promise<void> }> {
  const calls: string[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const raw = await readBody(req);
    let body: { model?: string; messages?: Array<{ role: string; content: string }> } = {};
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      /* empty body */
    }
    const messages = body.messages ?? [];
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    let content = "Stub gateway: unmatched prompt.";
    let phase = "unknown";
    if (system.includes("Quality Assurance evaluator")) {
      phase = "qa";
      content = JSON.stringify(QA_JSON);
    } else if (user.includes("## Task Assignment")) {
      phase = "task_execution";
      content = TASK_RESULT;
    } else if (system.includes("the Executive Agent")) {
      phase = "intent_analysis";
      content = JSON.stringify(INTENT_JSON);
    }
    calls.push(phase);
    console.log(`[gateway] ${phase} (${calls.length} total)`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: `chatcmpl-${Math.random().toString(36).slice(2, 10)}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: STUB_MODEL,
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: Math.ceil((system.length + user.length) / 4),
          completion_tokens: Math.ceil(content.length / 4),
          total_tokens: Math.ceil((system.length + user.length + content.length) / 4),
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

async function main(): Promise<void> {
  process.on("unhandledRejection", () => {});

  await killStaleEmbeddedPostgres();
  console.log("[review] booting embedded Postgres with the production lineage...");
  const pg = await bootEmbeddedDatabase({ dbName: DB_NAME, dataRoot: ".review-stack-data", dirPrefix: "review" });
  console.log(`[review] database on port ${pg.port}`);

  const gateway = await startGateway();
  console.log(`[review] model gateway on port ${gateway.port}`);

  const { loadConfig, createLogger } = await import("@orq8/core");
  const { createDb } = await import("@orq8/db");
  const { buildApp } = await import("../apps/api/src/app.js");

  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: pg.databaseUrl,
    SESSION_SECRET: "review-stack-session-secret-32-bytes!!",
    ENCRYPTION_KEY: "review-stack-encryption-key-32-bytes!",
    LOG_LEVEL: "warn",
    PORT: String(API_PORT),
    ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
    APP_URL: `http://localhost:${WEB_PORT}`,
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
  const app = await buildApp({ config, db: created.db, pool: created.pool, logger });
  await app.listen({ port: API_PORT, host: "127.0.0.1" });
  const API = `http://127.0.0.1:${API_PORT}`;
  console.log(`[review] API on ${API}`);

  const api = async (route: string, init: { method?: string; token?: string; body?: unknown } = {}) => {
    const res = await fetch(`${API}${route}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  };

  // ── Seed one real company ────────────────────────────────────────────────
  const reg = await api("/v1/auth/register", {
    method: "POST",
    body: { email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD, name: "Ada Founder", org_name: "Northwind Labs" },
  });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body).slice(0, 200)}`);
  const orgId: string = reg.body.data.org.id;
  await pg.pool.query("update users set email_verified_at = now() where email = $1", [FOUNDER_EMAIL]);
  const login = await api("/v1/auth/login", { method: "POST", body: { email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD } });
  const token: string = login.body?.data?.token ?? "";
  if (!token) throw new Error("login failed for the seeded founder");
  console.log(`[review] founder ready (org ${orgId.slice(0, 8)}...)`);

  const dept = (
    await pg.pool.query<{ id: string }>(
      "insert into departments (org_id, name, description) values ($1, 'Growth', 'Demand and positioning') returning id",
      [orgId],
    )
  ).rows[0]?.id;
  const team = (
    await pg.pool.query<{ id: string }>(
      "insert into teams (org_id, department_id, name, lead) values ($1, $2, 'Acquisition', 'Nova') returning id",
      [orgId, dept],
    )
  ).rows[0]?.id;

  const hire = async (name: string, role: string, autonomy: string, inTeam: boolean) =>
    (
      await pg.pool.query<{ id: string }>(
        `insert into agents (org_id, name, role, department_id, team_id, status, autonomy_level, capabilities, authority)
         values ($1, $2, $3, $4, $5, 'active', $6, $7::jsonb, $8::jsonb) returning id`,
        [
          orgId,
          name,
          role,
          dept,
          inTeam ? team : null,
          autonomy,
          JSON.stringify([role.replace(/_/g, " "), "analysis"]),
          JSON.stringify({ canExecuteTasks: true, canCreateTasks: true, canCommunicateExternally: false, canModifyResources: false }),
        ],
      )
    ).rows[0]!.id;

  const nova = await hire("Nova", "market_researcher", "autonomous", true);
  await hire("Ember", "content_writer", "execute_with_approval", true);
  await hire("Ridge", "operations_manager", "execute_with_approval", false);

  await pg.pool.query(
    "insert into goals (org_id, title, description, status, progress, priority, due_date) values ($1, 'Reach 100 paying companies', 'Move from design partners to a paying base.', 'active', 35, 'high', now() + interval '45 days')",
    [orgId],
  );
  await pg.pool.query(
    "insert into approvals (org_id, agent_id, action, description, cost, risk_level, status) values ($1, $2, 'Approve the paid pilot budget', 'The pilot needs a paid channel budget to start.', 250000, 'medium', 'pending')",
    [orgId, nova],
  );
  await pg.pool.query(
    "insert into tasks (org_id, agent_id, title, description, status, priority, cost, result) values ($1, $2, 'Draft the launch announcement', 'Write the public announcement for the beta.', 'pending', 'high', 0, null)",
    [orgId, nova],
  );
  console.log("[review] company seeded: 3 AI employees, Growth/Acquisition, goal, approval, pending task");

  // One command through the real pipeline so activity, credits, traces and the
  // attention queue carry real rows before the review starts.
  const command = await api("/v1/commands", {
    method: "POST",
    token,
    body: { command: "Research our three closest competitors and summarize what they charge for their core product." },
  });
  console.log(`[review] executive agent command: status=${command.body?.data?.status} tasks=${command.body?.data?.taskIds?.length ?? 0} provider=${command.body?.data?.llmProvider}`);

  // ── Web (built app) ──────────────────────────────────────────────────────
  console.log("[review] starting the web app...");
  // `next start` reads PORT from the environment; passing `-p` through pnpm's
  // argument separator makes Next treat it as a project directory.
  const web = spawn("pnpm", ["--filter", "@orq8/web", "start"], {
    cwd: process.cwd(),
    env: { ...process.env, API_URL: API, NODE_ENV: "production", PORT: String(WEB_PORT) },
    shell: true,
    stdio: "inherit",
  });
  web.on("exit", (code) => console.error(`[review] web app exited with code ${code}`));
  const WEB = `http://localhost:${WEB_PORT}`;
  const deadline = Date.now() + 120_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try {
      const res = await fetch(`${WEB}/healthz`, { signal: AbortSignal.timeout(5000) });
      up = res.ok;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!up) throw new Error("the web app did not come up in time");

  console.log(`\n================ ORQ8 IS UP ================`);
  console.log(`  open:      ${WEB}/login`);
  console.log(`  email:     ${FOUNDER_EMAIL}`);
  console.log(`  password:  ${FOUNDER_PASSWORD}`);
  console.log(`  api:       ${API}`);
  console.log(`  company:   Northwind Labs (3 AI employees, Growth/Acquisition)`);
  console.log(`===========================================\n`);

  const shutdown = async () => {
    web.kill();
    await app.close().catch(() => undefined);
    await gateway.close().catch(() => undefined);
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Keep the stack alive.
  setInterval(() => {}, 1 << 30);
}

main().catch(async (err) => {
  console.error(`[review] fatal: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
