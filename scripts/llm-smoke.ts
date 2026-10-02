/**
 * Live multi-provider + persona smoke test.
 *
 * Layer 1 — provider probes. Builds the provider chain from the operator's
 * real keys (process env over apps/api/.env) and calls each provider in
 * isolation with a one-line prompt, so a red line names the exact provider
 * that failed instead of "somewhere in the chain".
 *
 * Layer 2 — persona probe through the pipeline. With the review stack up and
 * live keys wired (see scripts/review-stack.ts), logs in as the founder,
 * creates and executes one real task per seeded employee, asks Atlas one
 * command, then reads the LLM traces: every row must name a real provider +
 * model with tokens, and every completion must sound like its persona.
 *
 * Usage:
 *   pnpm exec tsx scripts/llm-smoke.ts                    # both layers
 *   pnpm exec tsx scripts/llm-smoke.ts --providers-only   # layer 1 only
 *   pnpm exec tsx scripts/llm-smoke.ts --pipeline-only    # layer 2 only
 *   pnpm exec tsx scripts/llm-smoke.ts --api-url http://127.0.0.1:3111
 *
 * Iris (observe mode) is expected to be refused — that is the autonomy check
 * doing its job, not a failure of this test.
 */
import { loadConfig } from "@orq8/core";
import { chatCompletion } from "../apps/api/src/services/llm.js";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const API = has("--api-url")
  ? args[args.indexOf("--api-url") + 1]!
  : "http://127.0.0.1:3111";

function readEnvFile(url: URL): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(url, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}
const API_ENV = readEnvFile(new URL("../apps/api/.env", import.meta.url));
const env = (key: string) => (process.env[key] ?? API_ENV[key] ?? "").trim();

/** The seeded founder — same source as the stack and the route sweep. */
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
const DEMO = readDemoEnv();
const FOUNDER_EMAIL = DEMO.DEMO_EMAIL || "demo@orq8.test";
const FOUNDER_PASSWORD = DEMO.DEMO_PASSWORD || "Demo-Only-2026!x";

function chainConfig(only: "openrouter" | "nvidia") {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://smoke@127.0.0.1:5432/smoke",
    SESSION_SECRET: "llm-smoke-session-secret-32-bytes!!",
    ENCRYPTION_KEY: "llm-smoke-encryption-key-32-bytes!",
    OPENROUTER_API_KEY: only === "openrouter" ? env("OPENROUTER_API_KEY") : "",
    OPENROUTER_BASE_URL: env("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1",
    OPENROUTER_MODEL: env("OPENROUTER_MODEL") || "openai/gpt-4o-mini",
    NVIDIA_API_KEY: only === "nvidia" ? env("NVIDIA_API_KEY") : "",
    NVIDIA_API_KEYS: only === "nvidia" ? env("NVIDIA_API_KEYS") || undefined : undefined,
    NVIDIA_BASE_URL: env("NVIDIA_BASE_URL") || undefined,
    NVIDIA_MODEL: env("NVIDIA_MODEL") || undefined,
    NVIDIA_MODEL_FALLBACKS: env("NVIDIA_MODEL_FALLBACKS") || undefined,
  } as NodeJS.ProcessEnv);
}

const PROBE_MESSAGES = [
  {
    role: "user" as const,
    content: "Reply with exactly one short sentence confirming you are alive, then stop.",
  },
];

async function probeProvider(only: "openrouter" | "nvidia"): Promise<boolean> {
  const config = chainConfig(only);
  const started = Date.now();
  try {
    const res = await chatCompletion(config, {
      messages: PROBE_MESSAGES,
      max_tokens: 512,
      retries: 0,
    });
    if (!res) {
      console.log(`  FAIL ${only.padEnd(11)} — no provider configured (missing key?)`);
      return false;
    }
    const text = (res.choices?.[0]?.message?.content ?? "").replace(/\s+/g, " ").trim();
    const tokens = res.usage?.total_tokens != null ? `${res.usage.total_tokens} tok` : "tokens n/a";
    console.log(`  PASS ${only.padEnd(11)} ${res.model} · ${tokens} · ${Date.now() - started}ms`);
    console.log(`        "${text.slice(0, 110)}"`);
    return true;
  } catch (err) {
    console.log(`  FAIL ${only.padEnd(11)} — ${(err as Error).message?.slice(0, 160)}`);
    return false;
  }
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  autonomyLevel?: string;
}

async function api(
  method: "GET" | "POST",
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

/** One persona-flavoured task per employee — small, distinct, and on-brand. */
const PERSONA_TASKS: Record<string, { title: string; description: string }> = {
  Nova: {
    title: "Smoke: one-paragraph pricing insight",
    description: "In your researcher voice, give one short paragraph: the single most important pricing insight from the sweep so far.",
  },
  Ada: {
    title: "Smoke: one-metric read",
    description: "In your analyst voice, give one short paragraph: which metric moved this week and what it means.",
  },
  Sage: {
    title: "Smoke: one-line anomaly note",
    description: "In your quiet analyst voice, give one short paragraph: what in the weekly numbers deserves attention.",
  },
  Ridge: {
    title: "Smoke: one-line build note",
    description: "In your engineer voice, give one short paragraph: what you would verify first on the pricing page before calling it done.",
  },
  Iris: {
    title: "Smoke: integration check request",
    description: "Check the health of the connector pipeline and report.",
  },
  Ember: {
    title: "Smoke: one-sentence announcement draft",
    description: "In your communications voice, draft one warm sentence announcing that the pricing page is live.",
  },
  Milo: {
    title: "Smoke: one-line growth read",
    description: "In your growth voice, give one short paragraph: which channel deserves the next dollar and why.",
  },
};

async function pipelineLayer(token: string): Promise<void> {
  console.log("\n── Layer 2: each employee through the real pipeline ──");

  const agentsRes = await api("GET", "/v1/agents", { token });
  if (agentsRes.status !== 200) {
    console.log(`  FAIL could not list agents (HTTP ${agentsRes.status})`);
    return;
  }
  const agents: AgentRow[] = (agentsRes.body?.data ?? agentsRes.body ?? []) as AgentRow[];
  const employees = agents.filter((a) => PERSONA_TASKS[a.name]);
  if (employees.length === 0) {
    console.log("  FAIL none of the seeded employees found via /v1/agents");
    return;
  }

  const lines: string[] = [];
  for (const agent of employees) {
    const task = PERSONA_TASKS[agent.name]!;
    const created = await api("POST", "/v1/tasks", {
      token,
      body: { title: task.title, description: task.description, agentId: agent.id, priority: "low" },
    });
    const taskId = created.body?.data?.id;
    if (!(created.status >= 200 && created.status < 300) || !taskId) {
      lines.push(`  FAIL ${agent.name.padEnd(6)} — task create HTTP ${created.status}: ${JSON.stringify(created.body).slice(0, 100)}`);
      continue;
    }
    const run = await api("POST", `/v1/commands/tasks/${taskId}/execute`, { token });
    const status = run.body?.status ?? run.body?.data?.status ?? `HTTP ${run.status}`;
    const result: string = String(
      run.body?.data?.result ?? run.body?.data?.error ?? "",
    ).replace(/\s+/g, " ").trim();
    lines.push(
      `  ${agent.name.padEnd(6)} ${String(status).padEnd(12)} ${result.slice(0, 150) || "(no result text)"}`,
    );
  }
  console.log(lines.join("\n"));

  // Atlas speaks through the executive-agent command path.
  console.log("\n  Atlas (executive agent):");
  const command = await api("POST", "/v1/commands", {
    token,
    body: { command: "In one sentence: what should we focus on today?" },
  });
  if (command.status === 200) {
    const plan = command.body?.data?.plan;
    const desc = String(plan?.description ?? command.body?.data?.command ?? "").replace(/\s+/g, " ");
    console.log(`  PASS plan: ${plan?.action ?? "?"} — ${desc.slice(0, 140)}`);
  } else {
    console.log(`  FAIL command HTTP ${command.status}: ${JSON.stringify(command.body).slice(0, 140)}`);
  }

  // The traces are the proof: provider + model + tokens per call.
  const traces = await api("GET", "/v1/commands/traces?limit=60", { token });
  const rows: any[] = traces.body?.data ?? [];
  console.log("\n  LLM traces (this run):");
  if (rows.length === 0) {
    console.log("  WARN no traces recorded — calls may have been refused before the model");
  }
  for (const t of rows.slice(-14)) {
    const who = t.agentId ? (employees.find((a) => a.id === t.agentId)?.name ?? t.agentId.slice(0, 8)) : "atlas";
    console.log(
      `    ${String(who).padEnd(6)} ${String(t.phase).padEnd(15)} ${t.provider}/${t.model} · ${t.totalTokens ?? "?"} tok · ${t.success ? "ok" : "failed"}`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`LLM smoke — api ${API}`);
  const providersOnly = has("--providers-only");
  const pipelineOnly = has("--pipeline-only");

  if (!pipelineOnly) {
    console.log("\n── Layer 1: provider probes (isolated chains) ──");
    const openrouter = await probeProvider("openrouter");
    const nvidia = await probeProvider("nvidia");
    if (!openrouter && !nvidia) {
      console.log("\nNo live provider answered. Paste real keys into apps/api/.env");
      console.log("  OPENROUTER_API_KEY=sk-or-v1-…   (openrouter.ai/keys)");
      console.log("  NVIDIA_API_KEY=nvapi-…          (build.nvidia.com)");
      process.exitCode = 1;
      if (providersOnly) return;
    }
  }

  if (providersOnly) return;

  const login = await api("POST", "/v1/auth/login", {
    body: { email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD },
  });
  const token: string | undefined = login.body?.data?.token;
  if (login.status !== 200 || !token) {
    console.log(`\nLayer 2 skipped — could not log in to ${API} (HTTP ${login.status}). Is the review stack up?`);
    process.exitCode = 1;
    return;
  }
  await pipelineLayer(token);
}

await main();
