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
import { readFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { bootEmbeddedDatabase, killStaleEmbeddedPostgres } from "./lib/embedded-db.js";

const DB_NAME = "orq8_review";
// Ports default to the ones every other script in this repository assumes
// (route-sweep, proofs.mjs). They are overridable so a *second* stack can be
// booted beside a running one — which is what proving a release gate needs:
//   REVIEW_API_PORT=3113 REVIEW_WEB_PORT=3114 nohup pnpm exec tsx scripts/review-stack.ts &
const API_PORT = Number(process.env.REVIEW_API_PORT ?? 3111);
const WEB_PORT = Number(process.env.REVIEW_WEB_PORT ?? 3112);
// The same secret the cron hooks use. The review stack sets it so
// `scripts/release-gate.mjs` can read the readiness report the way a real
// release gate must: no session, names included.
const INTERNAL_TOKEN = process.env.REVIEW_INTERNAL_TOKEN ?? "review-stack-internal-token";
// Attach a local SMTP sink and point the API at it. Off by default, because the
// honest default for this harness is a deployment with no mail provider (the
// readiness report says `email` is blocking) — and that is exactly the state a
// release gate must refuse. Turn it on to review (or prove) the activated path:
//   REVIEW_MAIL=1 nohup pnpm exec tsx scripts/review-stack.ts &
const WITH_MAIL = process.env.REVIEW_MAIL === "1";
// This harness's own data root: it is what scopes the stale-postmaster cleanup
// so booting the stack (or running the tests) never stops another one.
//
// Scoped by API PORT, not shared across stacks. `killStaleEmbeddedPostgres`
// matches the root as a *substring* of the postmaster's command line, so two
// stacks sharing `.review-stack-data` meant booting the second killed the
// first's database — the reviewer's browser then answered 500 with no visible
// cause. Suffixing by port makes the two roots disjoint, which is what lets a
// second stack run beside a live one.
const DATA_ROOT = process.env.REVIEW_DATA_ROOT ?? `.review-stack-data-${API_PORT}`;

/**
 * Who the seeded founder is.
 *
 * The stack and `scripts/route-sweep.mjs` must agree on one identity, and the
 * sweep reads `scripts/.env.demo.local`. They did not agree: the stack seeded
 * `founder@orq8.test` while the sweep logged in as `demo@orq8.test`, so every
 * `/app` route reported "redirected to /login" on an app that was working, and
 * the routes proof could never go green locally. Both now read the same file,
 * and both fall back to the same default when it is absent.
 */
function readDemoEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL("./.env.demo.local", import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

const DEMO_ENV = readDemoEnv();
const FOUNDER_EMAIL = DEMO_ENV.DEMO_EMAIL || "founder@orq8.test";
const FOUNDER_PASSWORD = DEMO_ENV.DEMO_PASSWORD || "ReviewPass123!";
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

// The one task where the model asks for a tool instead of answering. Everything
// the tool path added (the request, the authority gate, the founder's approval
// carrying the exact arguments, the grant being consumed when the task resumes,
// the task record saying what it used) is invisible in a demo where the model
// never asks — and the seeded company could not produce a *gated* task by any
// other route either: `execute_with_approval` deliberately lets internal work
// run, so nothing stopped for a decision and the approval card's "Blocks …"
// line had no data to render.
const TOOL_TASK_TITLE = "Email the pilot team about the beta";
const TOOL_REQUEST = ["```tool", '{"toolId": "write_email", "params": {"recipient": "pilot@orq8.test", "purpose": "beta invitation"}}', "```"].join("\n");

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

/**
 * A local SMTP sink, so "mail is configured" can be true rather than claimed.
 *
 * The readiness model asks one question — is an SMTP host set? — and a stack
 * that set a hostname nothing listens on would make the answer a lie and the
 * release gate pass on a deployment that cannot send mail. This is the mail
 * twin of `startGateway`: a real socket that speaks enough SMTP for nodemailer's
 * connection check and for a real send to be accepted (and then dropped, which
 * is what a sink is for).
 */
async function startMailSink(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createTcpServer((socket) => {
    let inData = false;
    socket.on("error", () => {});
    socket.write("220 orq8-review-sink ESMTP\r\n");
    socket.on("data", (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.length === 0) continue;
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 2.0.0 queued as review-sink\r\n");
          }
          continue;
        }
        switch (line.split(/\s+/)[0]!.toUpperCase()) {
          case "EHLO":
            socket.write("250-orq8-review-sink\r\n250-8BITMIME\r\n250 PIPELINING\r\n");
            break;
          case "DATA":
            inData = true;
            socket.write("354 end data with <CR><LF>.<CR><LF>\r\n");
            break;
          case "QUIT":
            socket.write("221 2.0.0 bye\r\n");
            socket.end();
            break;
          default:
            socket.write("250 2.0.0 ok\r\n");
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

async function startGateway(): Promise<{ port: number; close: () => Promise<void> }> {
  const calls: string[] = [];
  const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
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
    } else if (user.includes("succeeded. Output:") || user.includes("did not run:")) {
      // A follow-up carrying the tool's outcome. Having read it, the model
      // answers — it does not ask for the same tool again.
      phase = "task_execution";
      content = TASK_RESULT;
    } else if (user.includes(TOOL_TASK_TITLE)) {
      phase = "tool_request";
      content = TOOL_REQUEST;
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

/** Is something already serving this port? */
async function responds(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/healthz`, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  process.on("unhandledRejection", () => {});

  // Refuse to start before touching anything. The port check used to happen
  // after the embedded database was up, and the stale-postmaster sweep is scoped
  // by data root — so a second stack on the same root killed the first stack's
  // database and *then* failed on the port, taking a live stack down to report
  // its own mistake. Nothing is started until both ports are known to be free.
  const busy = (await responds(API_PORT)) ? API_PORT : (await responds(WEB_PORT)) ? WEB_PORT : null;
  if (busy) {
    throw new Error(
      `port ${busy} is already serving — stop the process using it (an older review stack or a dev server) ` +
        `or start this one elsewhere: REVIEW_API_PORT=3113 REVIEW_WEB_PORT=3114`,
    );
  }

  await killStaleEmbeddedPostgres(DATA_ROOT);
  console.log("[review] booting embedded Postgres with the production lineage...");
  const pg = await bootEmbeddedDatabase({ dbName: DB_NAME, dataRoot: DATA_ROOT, dirPrefix: "review" });
  console.log(`[review] database on port ${pg.port}`);

  const gateway = await startGateway();
  console.log(`[review] model gateway on port ${gateway.port}`);

  const mail = WITH_MAIL ? await startMailSink() : null;
  console.log(
    mail
      ? `[review] local SMTP sink on port ${mail.port} — the mail capability is genuinely activated`
      : "[review] no mail provider: the readiness report will name `email` as blocking (REVIEW_MAIL=1 attaches a local SMTP sink)",
  );

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
    INTERNAL_TOKEN,
    ...(mail
      ? {
          SMTP_HOST: "127.0.0.1",
          SMTP_PORT: String(mail.port),
          SMTP_USER: "review",
          SMTP_PASS: "review",
          SMTP_SECURE: "false",
          // `EMAIL_FROM`, not `MAIL_FROM`: the schema's name (packages/core
          // config). The wrong key was silently ignored, so the stack reported
          // the product default sender instead of its own.
          EMAIL_FROM: "ORQ8 Review <review@orq8.test>",
        }
      : {}),
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
  // Mark the seeded company as already set up. The dashboard derives the
  // founder's stage from this row, and a demo company with live employees,
  // goals and work greeted as "Welcome to ORQ8 — tell me what you are
  // building" would be the demo lying about its own state.
  await pg.pool.query(
    `insert into onboarding_states (user_id, org_id, step, completed_at, organization)
     select id, $2, 'complete', now(), '{"name": "Northwind Labs"}'::jsonb from users where email = $1
     on conflict (user_id) do update set step = 'complete', completed_at = now(), updated_at = now()`,
    [FOUNDER_EMAIL, orgId],
  );
  const login = await api("/v1/auth/login", { method: "POST", body: { email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD } });
  const token: string = login.body?.data?.token ?? "";
  if (!token) throw new Error("login failed for the seeded founder");
  console.log(`[review] founder ready (org ${orgId.slice(0, 8)}...)`);

  // Label the seeded company as demo at the source, so every screen carries the
  // demo badge instead of the review data presenting itself as real execution.
  await pg.pool.query(
    "update organizations set settings = coalesce(settings, '{}'::jsonb) || '{\"isDemo\": true}'::jsonb where id = $1",
    [orgId],
  );

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

  const hire = async (
    name: string,
    role: string,
    autonomy: string,
    inTeam: boolean,
  ) =>
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
          // The same complete shape `POST /v1/agents` writes. A hand-built row
          // with fewer fields used to be enough to crash a tool call inside the
          // registry — the registry is defensive now, but a fixture that seeds
          // something the product never writes is a fixture that reviews the
          // wrong thing.
          JSON.stringify({
            canCreateTasks: true,
            canExecuteTasks: true,
            canAccessCompanyInfo: true,
            canCommunicateExternally: false,
            canModifyResources: false,
            spendingLimitCents: 0,
            requiresApprovalFor: [
              "financial_commitments",
              "external_communications",
              "irreversible_actions",
              "high_impact_decisions",
            ],
            forbiddenActions: [],
          }),
        ],
      )
    ).rows[0]!.id;

  const nova = await hire("Nova", "market_researcher", "autonomous", true);
  // Ember is a communications agent because the tool gate is reached through a
  // tool the registry restricts by ROLE: `write_email` (requiresApproval) is
  // open to `communications_agent` and `executive_agent` only, so a content
  // writer asking for it is refused — correctly — and no approval is ever
  // raised. The fixture has to be a role that may actually use the tool for the
  // founder to see the gate at all.
  const ember = await hire("Ember", "communications_agent", "execute_with_approval", true);
  await hire("Ridge", "operations_manager", "execute_with_approval", false);
  // Iris is in observe mode: her work is refused by the autonomy check, which is
  // how a founder gets a failed task to retry.
  const iris = await hire("Iris", "content_writer", "observe", false);

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
  // Left pending so the founder can run it from the product, and so "Run queued
  // work" has something to run.
  await pg.pool.query(
    "insert into tasks (org_id, agent_id, title, description, status, priority, cost, result) values ($1, $2, $3, 'Invite the pilot cohort to the beta and say what changed for them.', 'pending', 'high', 0, null)",
    [orgId, ember, TOOL_TASK_TITLE],
  );
  // Already failed, so "Retry this task" has something to retry — executed here
  // exactly the way the button executes it.
  const irisTask = (
    await pg.pool.query<{ id: string }>(
      "insert into tasks (org_id, agent_id, title, description, status, priority, cost, result) values ($1, $2, 'Publish the launch post', 'Publish it to the blog.', 'pending', 'normal', 0, null) returning id",
      [orgId, iris],
    )
  ).rows[0]!.id;
  const blocked = await api(`/v1/commands/tasks/${irisTask}/execute`, {
    method: "POST",
    token,
    body: {},
  });
  console.log(
    `[review] observe-mode task executed on purpose: status=${blocked.body?.data?.status} ("Retry this task" needs a failure)`,
  );
  console.log("[review] company seeded: 4 AI employees, Growth/Acquisition, goal, approval, 3 tasks (1 pending to run, 1 pending that stops for a tool approval, 1 failed)");

  // One command through the real pipeline so activity, credits, traces and the
  // attention queue carry real rows before the review starts.
  const command = await api("/v1/commands", {
    method: "POST",
    token,
    body: { command: "Research our three closest competitors and summarize what they charge for their core product." },
  });
  console.log(`[review] executive agent command: status=${command.body?.data?.status} tasks=${command.body?.data?.taskIds?.length ?? 0} provider=${command.body?.data?.llmProvider}`);

  // ── Web (built app) ──────────────────────────────────────────────────────
  // Both ports were checked at the top of main(), before anything was started:
  // the readiness poll below only asks whether *something* answers, so a stale
  // `next start` from an earlier run would otherwise let this harness print
  // "ORQ8 IS UP" while its own web child had just died with EADDRINUSE — and the
  // reviewer would then review the old build, wondering why their change was not
  // there.
  console.log("[review] starting the web app...");
  // `next start` reads PORT from the environment; passing `-p` through pnpm's
  // argument separator makes Next treat it as a project directory.
  const web = spawn("pnpm", ["--filter", "@orq8/web", "start"], {
    cwd: process.cwd(),
    env: { ...process.env, API_URL: API, NODE_ENV: "production", PORT: String(WEB_PORT) },
    shell: true,
    stdio: "inherit",
  });
  web.on("exit", (code) => {
    console.error(`[review] web app exited with code ${code}`);
    // A dead web child is a failed stack, not a warning: everything the reviewer
    // is about to look at would be served by nothing.
    if (code !== 0) process.exit(1);
  });
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
  console.log(`  company:   Northwind Labs (4 AI employees, Growth/Acquisition)`);
  // The gate is a machine, so it gets the literal IPv4 host: `localhost`
  // resolves to ::1 first on Windows and Next serves on IPv4 only, which costs
  // a ten-second happy-eyeballs wait on every request. The founder's browser is
  // unaffected — it opens whatever the printed URL says.
  console.log(`  gate:      node scripts/release-gate.mjs --api-url ${API} \\`);
  console.log(`               --web-url http://127.0.0.1:${WEB_PORT} --internal-token ${INTERNAL_TOKEN}`);
  console.log(`===========================================\n`);

  const shutdown = async () => {
    web.kill();
    await app.close().catch(() => undefined);
    await gateway.close().catch(() => undefined);
    await mail?.close().catch(() => undefined);
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
