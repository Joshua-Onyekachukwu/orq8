# docs/75 — ORQ8 Backend Architecture: Monolith → Services

Status: **proposed + slice 1 shipped** (the `agent_jobs` queue and background worker are live behind `JOB_QUEUE_MODE=workers`).

This doc is the plan for taking ORQ8 from a single Fastify monolith + Next.js app to a production backend that survives real founders, real model bills, and real failure. It names the boundaries, the queues, and the worker model — then ships the highest-value piece first, along the seam where the monolith is already weakest: the request path that runs agent work.

---

## 1. What exists today (honest inventory)

```
[Browser]
  └── apps/web (Next.js, SSR + client)
        └── /api/* proxies →
[apps/api — one Fastify process]
  ├── 74 route modules (auth, agents, tasks, approvals, commands, admin, …)
  ├── services/ — executive-agent, task-executor, quality-pipeline, llm,
  │   llm-tracer, jobs, job-worker, tool-registry, memory, audit, …
  ├── Postgres (@orq8/db, drizzle; migrations in packages/db + supabase)
  ├── Redis (rate limits, idempotency, sessions) — optional, in-memory fallback
  └── OpenRouter / NVIDIA NIM / LiteLLM / Ollama chain (services/llm.ts)
```

Everything runs in one Node process. That is correct for now — but three load classes already fight each other inside it:

| Load class | Example | Problem in-process |
|---|---|---|
| **Request-path LLM work** | `POST /v1/commands/tasks/:id/execute` runs a full model call + QA pass | Holds an HTTP connection for tens of seconds; one burst starves cheap reads; a crash mid-call loses the work |
| **Batch work** | `execute-pending` runs up to 10 tasks sequentially | Same, multiplied; the founder waits on all of it |
| **Housekeeping** | orphan reaper, rate-limit sweeps, briefings | Cheap, but shares fate with the process above |

## 2. Target architecture

```
                    ┌───────────────┐
   Browser ────────▶│   apps/web    │  (Next.js; BFF, no business logic)
                    └──────┬────────┘
                           │ /v1/*
                    ┌──────▼────────┐
                    │   api-gateway │  (apps/api today: auth, CORS, rate limits,
                    │  (stateless)  │   validation, routing, SSE, idempotency)
                    └──┬────┬────┬──┘
          enqueue      │    │    │  reads/writes
       ┌───────────────┘    │    └──────────────┐
       │                    │                   │
┌──────▼──────┐   ┌─────────▼────────┐   ┌──────▼───────┐
│  task-worker│   │  command-worker  │   │ housekeeper  │   (all consume the
│  (task.exec)│   │  (command.run)   │   │ (sweeps,     │    same DB-backed
└──────┬──────┘   └─────────┬────────┘   │  reaping)    │    queue; N replicas
       │                    │            └──────────────┘    each)
       └────────┬───────────┘
        ┌───────▼────────┐
        │ model gateway  │  (llm.ts chain: OpenRouter → NVIDIA → LiteLLM →
        │  (shared lib)  │   Ollama; keys, failover, tracer live here)
        └───────┬────────┘
        ┌───────▼────────┐
        │    Postgres    │  (system of record; agent_jobs is the queue)
        │  + agent_jobs  │
        └────────────────┘
```

### 2.1 Service boundaries (what each process may touch)

**api-gateway** (`apps/api` today, unchanged shape): authentication, sessions, org scoping, validation, rate limiting, idempotency, SSE. It may read every table. It may *mutate* only control-plane rows: tasks (`status: queued`), approvals, audit, activity. It must never run a model call on the request path in production.

**task-worker**: consumes `agent_jobs` where `type='task.execute'`. Runs the exact pipeline it inherits — `executeWithQuality` — unchanged. Writes: tasks, activity events, agent credit, LLM traces, audit. This is the service that must scale first (each job = one model spend, the expensive thing).

**command-worker**: consumes `type='command.run'`. Runs Executive Agent intent analysis + decomposition. Writes: tasks (creates), goals, commands, traces. Lower volume than task workers; separate type so a command storm cannot starve task execution (and vice versa).

**housekeeper**: orphan reaper, stale-lock reaper, briefing generation, anomaly scans, waitlist drips. Already exists as scattered `setInterval`s; the queue gives each a durable, inspectable home.

**model gateway**: stays a *library* (`@orq8/api` services/llm.ts), not a service, until (a) usage-based per-org routing or (b) a second language appears. Extracting it early would add a network hop to every model call for zero current benefit.

The rule that keeps boundaries honest: **workers never serve HTTP; the gateway never runs LLM work.** Both directions are enforced by what each binary imports, and `agent_jobs` is the only channel between them.

### 2.2 Why a DB-backed queue (not Redis/BullMQ/SQS — yet)

`agent_jobs` is a Postgres table with `FOR UPDATE SKIP LOCKED` claiming. For ORQ8's scale this beats a broker, on purpose:

- **No new infra.** Postgres is already the system of record; the queue inherits its backups, PITR, and failover. A broker means a second failure domain and a second consistency story for work that must agree with task rows.
- **Transactional enqueue.** "Create task + enqueue job" is one transaction — the exact race a broker makes you solve with outbox patterns, Postgres gives you free.
- **SKIP LOCKED is genuinely concurrent.** N worker replicas drain one table without double-execution; claiming is one indexed UPDATE.
- **Observability is SQL.** `SELECT status, count(*) FROM agent_jobs GROUP BY 1` is the ops dashboard (`GET /v1/admin/jobs` wraps exactly this).

Graduation trigger, written down so it's not vibes: when insert or claim latency is p99 > 50ms sustained, or jobs > ~50/min sustained, move the queue to Redis Streams (keep the table as the audit log). The service interfaces (`enqueueJob/claimJob/…` in `services/jobs.ts`) are the seam — swap the implementation, not the callers.

### 2.3 Queue semantics (as shipped)

Schema: `packages/db/migrations/0014_add_agent_jobs.sql` (supabase parity `0038_agent_jobs.sql`).

- **States**: `pending → running → done | failed | dead`. `failed` is reserved for terminal per-job errors that a human should see; `dead` = exhausted retries (default 3).
- **Claiming**: `UPDATE … WHERE id = (SELECT id … WHERE status='pending' AND run_at <= now() ORDER BY priority DESC, run_at ASC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING …`. Priority descending, then FIFO.
- **Idempotency**: `enqueueJob` reuses an existing `pending|running` job for the same `(type, task_id)` — double-clicks and batch/user races cannot double-spend model credits. (End-to-end execution idempotency is enforced upstream by the task status machine, not the queue.)
- **Retries**: exponential backoff `5s × 2^(attempts−1)`; after `max_attempts` the job dies with `last_error` preserved. `task.execute` jobs that exhaust retries leave the task in its failure state — visible in the product, retryable by the founder.
- **Crash safety**: `reapStaleJobs(300s)` returns `running` jobs whose lock is older than the window to `pending`. The window must exceed the longest honest run (LLM timeout budget is 90s; 300s gives 3× headroom). Re-run after crash ≠ duplicate work, because the task itself only completes once.
- **Fairness**: the in-process worker claims batches of ≤5 per tick with a re-check, so one org's backlog cannot starve the queue behind it.

## 3. Worker model (operations)

- **In-process first** (shipped): `startJobWorker` runs inside the API process when `JOB_QUEUE_MODE=workers`. This proves the seam with zero deployment change.
- **Split later = config, not code**: phase 2 adds `apps/worker/src/main.ts` — the same `startJobWorker` call, its own container, `JOB_QUEUE_MODE=workers`, no HTTP listener. Scale horizontally (`kubectl scale` / compose `--scale`); SKIP LOCKED makes replicas safe. Gateway replicas then run with `JOB_QUEUE_MODE=inline`-style *enqueue-only* (a third mode, `enqueue`, is the eventual rename of 'workers' for the gateway process).
- **Graceful shutdown**: `closeJobWorker(app)` stops the interval and waits up to 2s for an in-flight job; the stale reaper is the backstop for hard kills.
- **Autoscaling signal**: `SELECT count(*) FROM agent_jobs WHERE status='pending' AND run_at <= now()` — depth of eligible work. Alert when > 50 for 5 min; scale workers to ≈ depth / 20.
- **Ops surface**: `GET /v1/admin/jobs` (platform-admin) → counts by status + recent rows. Log lines: `job-worker: job done/failed` with jobId, type, attempts, duration.

## 4. Phases

| Phase | Scope | Status |
|---|---|---|
| **1 — Queue seam** | `agent_jobs` table + `enqueueJob/claimJob/…`, `JOB_QUEUE_MODE=workers` config, in-process worker draining `task.execute` via the unchanged quality pipeline, `/v1/admin/jobs`, enqueue-only execute routes | **Shipped** |
| 2 — Process split | `apps/worker` binary + deploy artifact; gateway becomes enqueue-only; `command.run` second dispatch arm; compose/k8s service defs | next |
| 3 — Realtime fan-out | Redis pub/sub for SSE so N gateway replicas see every event (Redis already half-wired via `services/redis.ts`) | next |
| 4 — Housekeeper split | briefings, anomaly scans, reapers move to the durable queue (each gets a job type; `run_at` becomes the scheduler) | later |
| 5 — Queue extraction | Redis Streams if scale triggers fire; `services/jobs.ts` interface unchanged | when metrics say so |
| 6 — Web split | Next.js BFF → static + client-direct-to-gateway behind CDN; SSR services thin to proxy | later |

## 5. Slice 1 — what landed, concretely

- `packages/core/src/config.ts`: `JOB_QUEUE_MODE` (`inline` default | `workers`), `JOB_WORKER_INTERVAL_MS` (default 2000).
- Migrations `0014_add_agent_jobs.sql` / `0038_agent_jobs.sql`: the queue table + claim/org/task indexes. `agentJobs` in `@orq8/db`.
- `apps/api/src/services/jobs.ts`: enqueue (idempotent per type+task), SKIP LOCKED claim, complete, fail-with-backoff (dead at `max_attempts`), stale reap, overview.
- `apps/api/src/services/job-worker.ts`: `startJobWorker` interval loop (reap → claim ≤5 → dispatch → complete/fail), `stop()` with grace; unknown job types fail into the normal retry path; a throwing tick never kills the loop.
- `apps/api/src/app.ts`: worker starts when `JOB_QUEUE_MODE=workers`; `closeJobWorker(app)` for shutdown. `apps/api/src/index.ts` stops worker before draining HTTP.
- `apps/api/src/routes/commands.ts`: `POST /v1/commands/tasks/:id/execute` and `/execute-pending` enqueue + return `202 {data:{queued…}}` in workers mode; inline mode untouched.
- `apps/api/src/routes/admin.ts`: `GET /v1/admin/jobs`.

Inline remains the default, so every existing test and deployment behaves exactly as before; `workers` is opt-in per environment. That is the whole point of a seam: slice 2 (process split) is a new main file and a deploy artifact, not a rewrite.
