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
// Run the real queue in the review stack: the API only enqueues, and a real
// `apps/worker` child drains `agent_jobs`. Off (REVIEW_JOBS=0) means inline
// execution and an empty queue — useful only when reviewing UI that never
// touches work.
const WITH_JOBS = process.env.REVIEW_JOBS !== "0";
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

/**
 * Live model credentials. When the operator has put real keys in
 * apps/api/.env (gitignored) — or the process env — the stack talks to
 * OpenRouter/NVIDIA for real and the stub gateway stands by; otherwise the
 * stub gateway is the default so offline runs never fail. REVIEW_LLM=stub
 * forces the offline gateway even with keys present.
 */
function readApiEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../apps/api/.env", import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}
const API_ENV = readApiEnv();
const OPENROUTER_KEY = (process.env.OPENROUTER_API_KEY ?? API_ENV.OPENROUTER_API_KEY ?? "").trim();
const NVIDIA_KEY = (process.env.NVIDIA_API_KEY ?? API_ENV.NVIDIA_API_KEY ?? "").trim();
const NVIDIA_KEYS = (process.env.NVIDIA_API_KEYS ?? API_ENV.NVIDIA_API_KEYS ?? "").trim();
const LIVE_LLM =
  process.env.REVIEW_LLM !== "stub" &&
  (OPENROUTER_KEY.startsWith("sk-or-") || NVIDIA_KEY.startsWith("nvapi-"));

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
  console.log(`[review] model gateway on port ${gateway.port}${LIVE_LLM ? " (standby — live model keys in use)" : ""}`);

  const mail = WITH_MAIL ? await startMailSink() : null;
  console.log(
    mail
      ? `[review] local SMTP sink on port ${mail.port} — the mail capability is genuinely activated`
      : "[review] no mail provider: the readiness report will name `email` as blocking (REVIEW_MAIL=1 attaches a local SMTP sink)",
  );

  const { loadConfig, createLogger } = await import("@orq8/core");
  const { createDb } = await import("@orq8/db");
  const { buildApp } = await import("../apps/api/src/app.js");

  // One env object decides what the API uses AND what the worker child gets.
  // They must agree: if the worker could not see the same provider config, the
  // work the API queued would run somewhere the review is not looking at.
  const runtimeEnv = {
    NODE_ENV: "test",
    DATABASE_URL: pg.databaseUrl,
    SESSION_SECRET: "review-stack-session-secret-32-bytes!!",
    ENCRYPTION_KEY: "review-stack-encryption-key-32-bytes!",
    LOG_LEVEL: "warn",
    // NODE_ENV=test normally leaves the layered rate limits off so test suites
    // are not rewritten by a new ceiling; the review stack forces them on so
    // the demo shows the real production limits (docs/80 §3.3).
    RATE_LIMIT_FORCE: "true",
    // docs/75: the API stops executing agent work on the request path; the
    // worker process below drains it. REVIEW_JOBS=0 keeps the old inline path
    // for pure-UI review sessions.
    JOB_QUEUE_MODE: WITH_JOBS ? "enqueue" : "inline",
    JOB_WORKER_INTERVAL_MS: "1000",
    PORT: String(API_PORT),
    ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
    APP_URL: `http://localhost:${WEB_PORT}`,
    ...(LIVE_LLM
      ? {
          OPENROUTER_API_KEY: OPENROUTER_KEY.startsWith("sk-or-") ? OPENROUTER_KEY : "",
          OPENROUTER_BASE_URL: API_ENV.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
          OPENROUTER_MODEL: API_ENV.OPENROUTER_MODEL || "openai/gpt-4o-mini",
          NVIDIA_API_KEY: NVIDIA_KEY.startsWith("nvapi-") ? NVIDIA_KEY : "",
          NVIDIA_API_KEYS: NVIDIA_KEYS || undefined,
          NVIDIA_BASE_URL: API_ENV.NVIDIA_BASE_URL || undefined,
          NVIDIA_MODEL: API_ENV.NVIDIA_MODEL || undefined,
          NVIDIA_MODEL_FALLBACKS: API_ENV.NVIDIA_MODEL_FALLBACKS || undefined,
        }
      : {
          NVIDIA_API_KEY: "",
          OPENROUTER_API_KEY: STUB_KEY,
          OPENROUTER_BASE_URL: `http://127.0.0.1:${gateway.port}/v1`,
          OPENROUTER_MODEL: STUB_MODEL,
        }),
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
  } as NodeJS.ProcessEnv;

  const config = loadConfig(runtimeEnv);

  const logger = createLogger(config);
  const created = createDb(pg.databaseUrl);
  (created.pool as unknown as { on?: (event: string, fn: () => void) => void }).on?.("error", () => {});
  const app = await buildApp({ config, db: created.db, pool: created.pool, logger });
  await app.listen({ port: API_PORT, host: "127.0.0.1" });
  const API = `http://127.0.0.1:${API_PORT}`;
  console.log(`[review] API on ${API}`);
  console.log(
    LIVE_LLM
      ? `[review] LLM: LIVE — openrouter primary (${API_ENV.OPENROUTER_MODEL || "openai/gpt-4o-mini"})${NVIDIA_KEY ? ` → nvidia fallback (${API_ENV.NVIDIA_MODEL || "nvidia/llama-3.1-nemotron-70b-instruct"})` : ""}`
      : "[review] LLM: stub gateway — no live keys found in apps/api/.env (REVIEW_LLM=stub forces this)",
  );

  // ── The worker process (docs/75 phase 2) ─────────────────────────────────
  // A real second process, started exactly the way production starts it: the
  // API above only enqueues, this child claims with SKIP LOCKED and runs the
  // same quality pipeline. That is what makes the Commands tab and any queue
  // behaviour in the review stack real rather than staged.
  let workerChild: ReturnType<typeof spawn> | null = null;
  if (WITH_JOBS) {
    workerChild = spawn("pnpm", ["--filter", "@orq8/worker", "start"], {
      cwd: process.cwd(),
      // runtimeEnv carries the same provider configuration the API got, so the
      // worker talks to the same model gateway (stub or live) the stack uses.
      env: {
        ...process.env,
        ...runtimeEnv,
        JOB_QUEUE_MODE: "workers",
        WORKER_ID: "review-worker",
      },
      shell: true,
      stdio: "inherit",
    });
    workerChild.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[review] the worker exited with code ${code} — queued work will not run`);
      }
    });
    console.log(
      `[review] worker started — API enqueues jobs, the worker drains agent_jobs (pid ${workerChild.pid ?? "?"})`,
    );
  } else {
    console.log("[review] jobs: inline (REVIEW_JOBS=0) — agent_jobs stays empty by design");
  }

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
  // The seeded founder is this stack's platform admin, so the admin console is
  // actually reviewable. It is a local harness with one user and one org —
  // without this, every /admin page (including Commands, docs/78) answered
  // "Access Denied" and could not be reviewed at all. Set REVIEW_ADMIN=0 to
  // review the denied path instead.
  if (process.env.REVIEW_ADMIN !== "0") {
    await pg.pool.query("update users set platform_role = 'admin' where email = $1", [FOUNDER_EMAIL]);
  }
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

  // ── A full startup, not a skeleton ────────────────────────────────────────
  // The seeded company matches the approved org chart (docs/71 §F,
  // marketing/headquarters-mock-v2.html): four departments, seven AI
  // employees, and work in every state a real week produces — two employees
  // mid-task, two waiting on the founder's decision, one blocked, the rest
  // idle with queued work. Every persona is a real system prompt that the
  // task executor will use when the employee runs work.
  const deptRows = await pg.pool.query<{ id: string }>(
    `insert into departments (org_id, name, description) values
       ($1, 'Research', 'Markets, competitors and pricing signals from public data.'),
       ($1, 'Engineering', 'Builds and ships the product surface: pages, APIs, deploys.'),
       ($1, 'Communications', 'Public copy, briefings and newsletters. Publishes only through a gate.'),
       ($1, 'Growth', 'Demand, positioning and waitlist conversion.')
     returning id, name`,
    [orgId],
  );
  const deptId = new Map(deptRows.rows.map((r) => [r.name, r.id]));
  const research = deptId.get("Research")!;
  const engineering = deptId.get("Engineering")!;
  const communications = deptId.get("Communications")!;
  const growth = deptId.get("Growth")!;
  const team = (
    await pg.pool.query<{ id: string }>(
      "insert into teams (org_id, department_id, name, lead) values ($1, $2, 'Acquisition', 'Milo') returning id",
      [orgId, growth],
    )
  ).rows[0]?.id;

  const hire = async (
    name: string,
    role: string,
    autonomy: string,
    opts: {
      departmentId: string;
      teamId?: string | null;
      currentTask?: string | null;
      creditsUsed?: number;
      weeklyCost?: number;
      tasksCompleted?: number;
      tasksFailed?: number;
      persona: string;
      capabilities?: string[];
    },
  ) =>
    (
      await pg.pool.query<{ id: string }>(
        `insert into agents (org_id, name, role, department_id, team_id, status, autonomy_level,
                             capabilities, authority, config, current_task, credits_used,
                             weekly_cost, tasks_completed, tasks_failed, last_active_at)
         values ($1, $2, $3, $4, $5, 'active', $6, $7::jsonb, $8::jsonb,
                 $9::jsonb, $10, $11, $12, $13, $14, now() - interval '4 minutes')
         returning id`,
        [
          orgId,
          name,
          role,
          opts.departmentId,
          opts.teamId ?? null,
          autonomy,
          JSON.stringify(opts.capabilities ?? [role.replace(/_/g, " "), "analysis"]),
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
          // Persona: the system prompt this employee is prompted with when it
          // executes work (task-executor reads agents.config.systemPrompt).
          JSON.stringify({ systemPrompt: opts.persona }),
          opts.currentTask ?? null,
          opts.creditsUsed ?? 0,
          opts.weeklyCost ?? 0,
          opts.tasksCompleted ?? 0,
          opts.tasksFailed ?? 0,
        ],
      )
    ).rows[0]!.id;

  const nova = await hire("Nova", "market_researcher", "autonomous", {
    departmentId: research,
    currentTask: "Pricing research sweep",
    creditsUsed: 41200,
    weeklyCost: 41200,
    tasksCompleted: 14,
    persona:
      "You are Nova, the Market Researcher of Northwind Labs. You find markets, competitors and pricing signals from public data, and you turn them into decision-ready intelligence: specific numbers, named sources, clear recommendations. You never invent a figure — if the data is missing you say so and name what would fill the gap.",
    capabilities: ["market_researcher", "competitive analysis", "pricing research", "analysis"],
  });
  const ada = await hire("Ada", "data_analyst", "autonomous", {
    departmentId: research,
    creditsUsed: 20300,
    weeklyCost: 20300,
    tasksCompleted: 9,
    persona:
      "You are Ada, the Data Analyst of Northwind Labs. You turn raw datasets into decision-ready summaries: baselines, trends and anomalies, each with the numbers behind it. You are precise with units and time windows, and you flag uncertainty instead of smoothing it over.",
    capabilities: ["data_analyst", "metrics", "reporting", "analysis"],
  });
  const sage = await hire("Sage", "data_analyst", "autonomous", {
    departmentId: research,
    creditsUsed: 0,
    tasksCompleted: 3,
    persona:
      "You are Sage, the Analyst of Northwind Labs. You own the weekly metrics baseline and the anomaly watch: every Monday you record where the numbers stand so the company can see movement honestly. You are quiet until the numbers move.",
    capabilities: ["data_analyst", "weekly metrics", "anomaly detection"],
  });
  const ridge = await hire("Ridge", "software_engineer", "autonomous", {
    departmentId: engineering,
    currentTask: "Pricing page build",
    creditsUsed: 68800,
    weeklyCost: 68800,
    tasksCompleted: 21,
    persona:
      "You are Ridge, the Engineer of Northwind Labs. You build and ship the product surface: pages, APIs and deploys. You write code that matches the existing design system, you verify your own work before reporting it done, and you flag anything that needs production access instead of forcing it — pushes to production go through the founder.",
    capabilities: ["software_engineer", "frontend", "api", "testing"],
  });
  // Iris is in observe mode: her work is refused by the autonomy check, which is
  // how a founder gets a failed task to retry.
  const iris = await hire("Iris", "operations_manager", "observe", {
    departmentId: engineering,
    creditsUsed: 7700,
    weeklyCost: 7700,
    tasksCompleted: 6,
    tasksFailed: 1,
    persona:
      "You are Iris, the Ops Engineer of Northwind Labs. You wire integrations, credentials and pipelines, and you keep the operational plumbing honest: every connection is tested, every failure is named. You never guess at credentials — you ask.",
    capabilities: ["operations_manager", "integrations", "pipelines", "credentials"],
  });
  // Ember is a communications agent because the tool gate is reached through a
  // tool the registry restricts by ROLE: `write_email` (requiresApproval) is
  // open to `communications_agent` and `executive_agent` only, so a content
  // writer asking for it is refused — correctly — and no approval is ever
  // raised. The fixture has to be a role that may actually use the tool for the
  // founder to see the gate at all.
  const ember = await hire("Ember", "communications_agent", "execute_with_approval", {
    departmentId: communications,
    creditsUsed: 9500,
    weeklyCost: 9500,
    tasksCompleted: 11,
    persona:
      "You are Ember, the Communications lead of Northwind Labs. You write and draft all public copy — announcements, briefings, newsletters — in a clear, warm voice that matches the brand. You draft freely, but you never publish externally yourself: publishing always goes through the founder's approval.",
    capabilities: ["communications_agent", "copywriting", "email", "announcements"],
  });
  const milo = await hire("Milo", "market_researcher", "autonomous", {
    departmentId: growth,
    teamId: team,
    creditsUsed: 0,
    tasksCompleted: 4,
    persona:
      "You are Milo, the Growth lead of Northwind Labs. You own outreach, campaigns and waitlist conversion. You measure every channel by cost per activated trial, and you pause spend the moment a channel stops converting. Growth work that costs money is proposed, never started silently.",
    capabilities: ["market_researcher", "growth", "outreach", "campaigns"],
  });

  // ── Goals, tasks, approvals: one live week ─────────────────────────────
  const goal1 = (
    await pg.pool.query<{ id: string }>(
      "insert into goals (org_id, title, description, status, progress, priority, due_date) values ($1, 'Announce the new pricing page', 'Ship the public pricing page and announce it to the waitlist.', 'active', 64, 'high', now() + interval '3 days') returning id",
      [orgId],
    )
  ).rows[0]!.id;
  const goal2 = (
    await pg.pool.query<{ id: string }>(
      "insert into goals (org_id, title, description, status, progress, priority, due_date) values ($1, 'Convert waitlist to trials', 'Turn the waitlist into activated trials after the pricing announcement.', 'active', 8, 'normal', now() + interval '10 days') returning id",
      [orgId],
    )
  ).rows[0]!.id;

  // Two employees mid-task right now.
  await pg.pool.query(
    "insert into tasks (org_id, goal_id, agent_id, title, description, status, priority, cost) values ($1, $2, $3, 'Pricing research sweep', 'Collect the public pricing of the three closest competitors and summarize each plan.', 'in_progress', 'high', 600)",
    [orgId, goal1, nova],
  );
  await pg.pool.query(
    "insert into tasks (org_id, goal_id, agent_id, title, description, status, priority, cost) values ($1, $2, $3, 'Pricing page build', 'Build the public pricing page: three tiers, annual toggle, FAQ. Match the site design system.', 'in_progress', 'high', 3600)",
    [orgId, goal1, ridge],
  );
  // Finished work with real results, so Done columns and reports have rows.
  await pg.pool.query(
    "insert into tasks (org_id, goal_id, agent_id, title, description, status, priority, cost, result) values ($1, $2, $3, 'Competitor page screenshots', 'Screenshot and archive the competitor pricing pages.', 'completed', 'normal', 1800, $4)",
    [orgId, goal1, iris, "Screenshots archived for all three competitor pricing pages (full-page, desktop + mobile widths) and filed under competitor-intel in company memory."],
  );
  await pg.pool.query(
    "insert into tasks (org_id, goal_id, agent_id, title, description, status, priority, cost, result) values ($1, $2, $3, 'Weekly metrics baseline', 'Record this week''s baseline: signups, activation, revenue.', 'completed', 'normal', 900, $4)",
    [orgId, goal1, ada, "Baseline recorded: 412 signups, 9.4% activation, $1,204 MRR. No anomalies vs. last week."],
  );
  // The gated task: Ember's publish is stopped pending the founder's decision.
  const publishTask = (
    await pg.pool.query<{ id: string }>(
      "insert into tasks (org_id, goal_id, agent_id, title, description, status, priority, cost) values ($1, $2, $3, 'Publish the pricing post', 'Publish the pricing announcement to the company blog and newsletter.', 'awaiting_approval', 'high', 0) returning id",
      [orgId, goal1, ember],
    )
  ).rows[0]!.id;
  await pg.pool.query(
    "insert into tasks (org_id, goal_id, agent_id, title, description, status, priority, cost) values ($1, $2, $3, 'Draft launch email to waitlist', 'Draft the launch email announcing the new pricing.', 'pending', 'normal', 0)",
    [orgId, goal2, ember],
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

  // Two open gates, matching the mock's banner: an external publish (Ember)
  // and a spend-cap raise (Nova on Ada's behalf).
  await pg.pool.query(
    "insert into approvals (org_id, agent_id, action, description, cost, risk_level, status, task_id) values ($1, $2, 'Publish the pricing post', 'Ember wants to publish the pricing announcement to the company blog and newsletter. Authority: may draft, may not publish externally.', 2500, 'medium', 'pending', $3)",
    [orgId, ember, publishTask],
  );
  await pg.pool.query(
    "insert into approvals (org_id, agent_id, action, description, cost, risk_level, status) values ($1, $2, 'Raise Ada''s daily spend cap', 'Nova requests Ada''s cap 500 → 800 Cr/day for two days to finish the pricing sweep. If approved the cap resets automatically on Friday.', 60000, 'medium', 'pending')",
    [orgId, nova],
  );

  // A live activity stream for the terminal and the EA dock (mixed types,
  // newest last so the hub's newest-first slice reads like a real feed).
  const ev = (minutesAgo: number, type: string, summary: string, opts: { agentId?: string; taskId?: string; cost?: number; department?: string } = {}) =>
    pg.pool.query(
      "insert into activity_events (org_id, agent_id, task_id, type, summary, reason, cost, department, occurred_at) values ($1, $2, $3, $4, $5, $6, $7, $8, now() - ($9 || ' minutes')::interval)",
      [orgId, opts.agentId ?? null, opts.taskId ?? null, type, summary, null, opts.cost ?? 0, opts.department ?? null, String(minutesAgo)],
    );
  await ev(46, "task_completed", "Weekly metrics baseline recorded — 412 signups, 9.4% activation", { agentId: ada, cost: 900, department: "Research" });
  await ev(41, "tool_call", "dataset.query · competitor_prices", { agentId: nova, cost: 40, department: "Research" });
  await ev(37, "task_completed", "Competitor page screenshots archived", { agentId: iris, cost: 1800, department: "Engineering" });
  await ev(31, "task_started", "Pricing page build", { agentId: ridge, department: "Engineering" });
  await ev(27, "tool_call", "browser.open · pricing page preview", { agentId: ridge, cost: 60, department: "Engineering" });
  await ev(22, "task_started", "Pricing research sweep", { agentId: nova, department: "Research" });
  await ev(18, "analyzed", "Competitor pricing patterns summarized — seat-anchored vs usage-metered", { agentId: nova, cost: 120, department: "Research" });
  await ev(13, "drafted", "Launch email outline ready for review", { agentId: ember, cost: 80, department: "Communications" });
  await ev(9, "approval_requested", "Ember requests approval: publish the pricing post", { agentId: ember, taskId: publishTask, cost: 2500, department: "Communications" });
  await ev(5, "tool_call", "test.run · pricing.spec.ts (14 checks)", { agentId: ridge, cost: 90, department: "Engineering" });
  await ev(2, "executing", "Pricing research sweep — competitor tier comparison", { agentId: nova, cost: 30, department: "Research" });

  // Two filed decisions so the Decision Center and the hub's "Recent
  // decisions" panel show real rows.
  await pg.pool.query(
    `insert into decisions (org_id, title, decision_type, status, confidence, decision_maker_type, decision_maker_name, what_was_decided, rationale, expected_outcome, decided_at)
     values ($1, 'Price the starter plan at $29 per month', 'pricing', 'active', 'high', 'user', 'Ada Founder',
             'Starter is $29/mo per agency; Studio is $79/mo unlimited clients, with an annual toggle at two months free.',
             'Design partners anchor value per agency, not per seat; usage pricing tested worse in the pilot.',
             '10 paying agencies by Oct 31 at blended ARPU above $35.', now() - interval '2 days')`,
    [orgId],
  );
  await pg.pool.query(
    `insert into decisions (org_id, title, decision_type, status, confidence, decision_maker_type, decision_maker_name, what_was_decided, rationale, expected_outcome, decided_at)
     values ($1, 'Move the pricing launch to Friday', 'operational', 'active', 'medium', 'agent', 'Atlas (Executive Agent)',
             'Launch announcement moves to Friday because the Stripe test products are still in progress.',
             'Announcing before checkout works would burn the waitlist''s first impression on a dead link.',
             'Launch lands with a working checkout and a same-day newsletter.', now() - interval '3 hours')`,
    [orgId],
  );

  console.log("[review] company seeded: 4 departments (Research, Engineering, Communications, Growth), 7 AI employees with personas, 2 goals, 8 tasks (2 in progress, 2 done, 1 gated, 2 pending to run, 1 failed), 2 open approvals, live activity stream, 2 decisions");

  // One command through the real pipeline so activity, credits, traces and the
  // attention queue carry real rows before the review starts.
  const command = await api("/v1/commands", {
    method: "POST",
    token,
    body: { command: "Research our three closest competitors and summarize what they charge for their core product." },
  });
  console.log(`[review] executive agent command: status=${command.body?.data?.status} tasks=${command.body?.data?.taskIds?.length ?? 0} provider=${command.body?.data?.llmProvider}`);

  // Plan revisions (docs/71 §W item 4): a ratified rev 1 as direction and an
  // unratified rev 2 awaiting the founder, so the Strategy page shows the
  // ratify banner, the revision rail and the diff card against real rows.
  const rev1 = (
    await pg.pool.query<{ id: string; rev: number }>(
      `insert into plan_revisions
         (org_id, rev, status, title, summary, content, author_type, author_name, ratified_at, ratified_by)
       values ($1, 1, 'ratified', 'Initial plan', 'Scope: launch pricing before ads', $2::jsonb, 'user', 'Ada Founder', now() - interval '21 days', 'Ada Founder')
       returning id, rev`,
      [
        orgId,
        JSON.stringify({
          whatWereBuilding:
            "Northwind Labs sells a lightweight client-report portal for freelance agencies: branded dashboards their clients can log into, fed automatically from spreadsheets the agency already uses.",
          whoItsFor: "Two-to-ten-person marketing agencies that report to clients monthly and lose a day per client to manual slide decks.",
          howItMakesMoney: "$29/mo per agency (starter) and $79/mo (studio, unlimited clients). Annual toggle at two months free.",
          currentFocus: ["Launch the public pricing page", "Convert waitlist to trials after announcement"],
          kpis: "10 paying agencies by Oct 31 · 25% trial→paid · <2% weekly churn",
        }),
      ],
    )
  ).rows[0]!;
  await pg.pool.query(
    `insert into plan_revisions
       (org_id, rev, status, title, summary, content, author_type, author_name)
     values ($1, 2, 'draft', 'Move the launch to Friday', 'Pricing launch moved to Friday — Stripe test products still in progress', $2::jsonb, 'agent', 'Atlas')`,
    [
      orgId,
      JSON.stringify({
        whatWereBuilding:
          "Northwind Labs sells a lightweight client-report portal for freelance agencies: branded dashboards their clients can log into, fed automatically from spreadsheets the agency already uses.",
        whoItsFor: "Two-to-ten-person marketing agencies that report to clients monthly and lose a day per client to manual slide decks.",
        howItMakesMoney: "$29/mo per agency (starter) and $79/mo (studio, unlimited clients). Annual toggle at two months free. Launch pricing announced Friday.",
        currentFocus: ["Launch the public pricing page Friday", "Convert waitlist to trials after the Friday announcement"],
        kpis: "10 paying agencies by Oct 31 · 25% trial→paid · <2% weekly churn",
      }),
    ],
  );
  console.log(`[review] plan seeded: rev ${rev1.rev} ratified (direction), rev 2 drafted by Atlas (unratified)`);

  // ── The living company ───────────────────────────────────────────────
  // A slow background ticker keeps Northwind Labs moving after the seed: an
  // in-progress task finishes, the next pending one starts, tool calls and
  // drafts land in the feed, and every few cycles a new approval shows up —
  // so a demo never stares at a frozen snapshot. Every action is bounded
  // (≤3 running, ≤4 pending, ≤2 open approvals) and REVIEW_TICKER=0 opts out.
  const TICKER_ON = process.env.REVIEW_TICKER !== "0";
  let tickerStopped = false;
  let tickerTimer: NodeJS.Timeout | null = null;
  if (TICKER_ON) {
    const cast = [
      { id: nova, name: "Nova", department: "Research" },
      { id: ada, name: "Ada", department: "Research" },
      { id: sage, name: "Sage", department: "Research" },
      { id: ridge, name: "Ridge", department: "Engineering" },
      { id: iris, name: "Iris", department: "Engineering" },
      { id: ember, name: "Ember", department: "Communications" },
      { id: milo, name: "Milo", department: "Growth" },
    ];
    const FLAVOR: Record<string, { type: string; summary: string; cost?: number }[]> = {
      Nova: [
        { type: "tool_call", summary: "dataset.query · competitor_pricing (12 rows)", cost: 40 },
        { type: "analyzed", summary: "Competitor discounting patterns summarized — holiday bundles spotted", cost: 120 },
      ],
      Ada: [
        { type: "tool_call", summary: "metrics.baseline · activation 9.4% → 9.6%", cost: 60 },
        { type: "analyzed", summary: "Checkout funnel anomaly queue clear", cost: 90 },
      ],
      Sage: [
        { type: "tool_call", summary: "weekly metrics delta computed", cost: 50 },
        { type: "analyzed", summary: "Churn risk flat week-over-week", cost: 80 },
      ],
      Ridge: [
        { type: "tool_call", summary: "test.run · pricing.spec.ts (14 checks green)", cost: 90 },
        { type: "tool_call", summary: "deploy.preview · pricing page rebuilt", cost: 120 },
      ],
      Iris: [
        { type: "tool_call", summary: "integrations.health — all connectors green", cost: 30 },
        { type: "tool_call", summary: "Credential rotation reminder filed", cost: 0 },
      ],
      Ember: [
        { type: "drafted", summary: "Waitlist announcement v2 — tightened for scannability", cost: 80 },
        { type: "drafted", summary: "Launch email subject-line A/B pair ready", cost: 70 },
      ],
      Milo: [
        { type: "tool_call", summary: "outreach.batch · 40 agencies queued", cost: 60 },
        { type: "analyzed", summary: "Reply rate 15% — above the 12% bar", cost: 100 },
      ],
    };
    const NEW_TASKS: Record<string, { title: string; description: string }[]> = {
      Nova: [{ title: "Churn-signal scan on trial accounts", description: "Identify trial accounts showing churn signals and summarize the top three patterns." }],
      Ada: [{ title: "Cohort retention cut", description: "Cut retention by signup cohort and flag any cohort below 40% on day 7." }],
      Sage: [{ title: "Weekly metrics baseline", description: "Record where every KPI stands this Monday so movement stays visible." }],
      Ridge: [{ title: "Performance pass on the pricing page", description: "Get LCP under 2.5s on the pricing page and re-run the spec suite." }],
      Ember: [{ title: "Draft the waitlist announcement", description: "Draft the pricing-launch announcement email, warm and scannable." }],
      Milo: [{ title: "Follow up with warm outreach replies", description: "Reply personally to every agency that answered the first outreach batch." }],
    };
    const RESULTS: Record<string, string> = {
      Nova: "Pricing sweep updated — closest competitor moved to usage-metered at $0.008/request; delta and talking points filed.",
      Ada: "Metrics baseline refreshed — activation 9.4% → 9.6%, no anomalies open; dashboards updated.",
      Sage: "Weekly baseline recorded — every KPI inside its band except trial→paid (down 0.3pt), flagged for Growth.",
      Ridge: "Pricing page build advanced — annual toggle shipped to preview; 14 spec checks green.",
      Ember: "Draft ready for review — announcement email tightened, warm close added. Publishing stays gated to you.",
      Milo: "Outreach batch processed — 40 sent, 6 replies; cost per reply $1.90, under the $3 bar.",
    };
    const GATES = [
      { agentId: ember, name: "Ember", department: "Communications", action: "Publish the launch newsletter", description: "Ember wants to publish the launch newsletter to the full list. Authority: may draft, may not publish externally.", cost: 2500, risk: "medium" },
      { agentId: nova, name: "Nova", department: "Research", action: "Raise Nova's daily spend cap", description: "Nova requests a temporary cap raise, 500 → 700 Cr/day, to finish the churn-signal scan in one pass.", cost: 20000, risk: "low" },
    ];
    const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
    const scalar = async (sql: string): Promise<string> =>
      (await pg.pool.query<{ n: string }>(sql, [orgId])).rows[0]?.n ?? "0";

    const tick = async (): Promise<void> => {
      const actor = pick(cast);
      const openGates = Number(await scalar("select count(*)::text as n from approvals where org_id = $1 and status = 'pending'"));
      const running = Number(await scalar("select count(*)::text as n from tasks where org_id = $1 and status = 'in_progress'"));
      const pending = Number(await scalar("select count(*)::text as n from tasks where org_id = $1 and status = 'pending'"));

      // Rarely, a gated action asks for the founder (capped at two open).
      if (openGates < 2 && Math.random() < 0.15) {
        const gate = pick(GATES);
        await pg.pool.query(
          "insert into approvals (org_id, agent_id, action, description, cost, risk_level, status) values ($1, $2, $3, $4, $5, $6, 'pending')",
          [orgId, gate.agentId, gate.action, gate.description, gate.cost, gate.risk],
        );
        await ev(0, "approval_requested", `${gate.name} requests approval: ${gate.action.charAt(0).toLowerCase()}${gate.action.slice(1)}`, { agentId: gate.agentId, cost: gate.cost, department: gate.department });
        console.log(`[ticker] gate raised — ${gate.name}: ${gate.action}`);
        return;
      }

      // Usually the actor's own in-progress task finishes (Iris is observe-mode
      // by design — her runs are refused, so she never completes work here).
      if (running > 0 && actor.name !== "Iris" && Math.random() < 0.4) {
        const finished = (
          await pg.pool.query<{ id: string; title: string }>(
            "update tasks set status = 'completed', result = $3, updated_at = now() where id = (select id from tasks where org_id = $1 and agent_id = $2 and status = 'in_progress' order by created_at limit 1) returning id, title",
            [orgId, actor.id, RESULTS[actor.name] ?? "Task completed."],
          )
        ).rows[0];
        if (finished) {
          await pg.pool.query(
            "update agents set tasks_completed = tasks_completed + 1, credits_used = credits_used + 400, current_task = null, last_active_at = now() - interval '2 minutes' where id = $1",
            [actor.id],
          );
          await ev(0, "task_completed", `${finished.title} — done`, { agentId: actor.id, cost: 400, department: actor.department });
          console.log(`[ticker] completed — ${actor.name}: ${finished.title}`);
          return;
        }
      }

      // Or the actor picks up the next pending task.
      if (running < 3 && pending > 0 && Math.random() < 0.5) {
        const started = (
          await pg.pool.query<{ id: string; title: string; agent_id: string | null }>(
            "update tasks set status = 'in_progress', updated_at = now() where id = (select id from tasks where org_id = $1 and status = 'pending' order by created_at limit 1) returning id, title, agent_id",
            [orgId],
          )
        ).rows[0];
        if (started) {
          const owner = cast.find((c) => c.id === started.agent_id) ?? actor;
          await pg.pool.query(
            "update agents set current_task = $2, last_active_at = now() - interval '2 minutes' where id = $1",
            [owner.id, started.title],
          );
          await ev(0, "task_started", started.title, { agentId: owner.id, department: owner.department });
          console.log(`[ticker] started — ${owner.name}: ${started.title}`);
          return;
        }
      }

      // Or the actor files a new piece of work to run later.
      if (pending < 4) {
        const next = pick(NEW_TASKS[actor.name] ?? []);
        if (next) {
          await pg.pool.query(
            "insert into tasks (org_id, agent_id, title, description, status, priority) values ($1, $2, $3, $4, 'pending', 'normal')",
            [orgId, actor.id, next.title, next.description],
          );
          console.log(`[ticker] queued — ${actor.name}: ${next.title}`);
          return;
        }
      }

      // And otherwise, just texture for the live feed.
      const beat = pick(FLAVOR[actor.name] ?? []);
      if (beat) {
        await pg.pool.query(
          "update agents set credits_used = credits_used + $2, last_active_at = now() - interval '2 minutes' where id = $1",
          [actor.id, beat.cost ?? 0],
        );
        await ev(0, beat.type, beat.summary, { agentId: actor.id, cost: beat.cost ?? 0, department: actor.department });
        console.log(`[ticker] ${beat.type} — ${actor.name}: ${beat.summary}`);
      }
    };

    const scheduleTick = (): void => {
      if (tickerStopped) return;
      tickerTimer = setTimeout(() => {
        void tick()
          .catch((err) => console.error(`[ticker] skipped a beat: ${(err as Error).message}`))
          .finally(scheduleTick);
      }, 90_000 + Math.random() * 90_000);
    };
    scheduleTick();
    console.log("[review] the company is alive — ticker on (tasks complete, agents move, gates appear; REVIEW_TICKER=0 to freeze)");
  }

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
  console.log(`  company:   Northwind Labs (7 AI employees across 4 departments)`);
  // The gate is a machine, so it gets the literal IPv4 host: `localhost`
  // resolves to ::1 first on Windows and Next serves on IPv4 only, which costs
  // a ten-second happy-eyeballs wait on every request. The founder's browser is
  // unaffected — it opens whatever the printed URL says.
  console.log(`  gate:      node scripts/release-gate.mjs --api-url ${API} \\`);
  console.log(`               --web-url http://127.0.0.1:${WEB_PORT} --internal-token ${INTERNAL_TOKEN}`);
  console.log(`===========================================\n`);

  const shutdown = async () => {
    tickerStopped = true;
    if (tickerTimer) clearTimeout(tickerTimer);
    // The worker reaps its own in-flight job on SIGTERM (JOB_SHUTDOWN_GRACE_MS);
    // killing it here keeps the child from outliving the stack's database.
    workerChild?.kill();
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
