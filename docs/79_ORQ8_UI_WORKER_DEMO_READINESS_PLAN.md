# docs/79 — ORQ8 UI, Worker Architecture and Demo-Day Readiness: Audit + Implementation Plan

Status: **in execution (approved 2026-10-02). Phases 2–7 implemented in the working tree (uncommitted,
pending review); Phases 8–13 open.** The §13 progress log records the phase detail. Alongside this
brief, docs/80 Phase 0 and the layered rate limits (docs/80 Phase 3) also shipped; this brief's
Phase 8 merges into docs/80 Phase 4 so the preferred-model config is built once.
Companion docs: `docs/75` (backend architecture, the worker source of truth), `docs/76` (app-wide audit — the drawer primitive), `docs/78` (admin console plan — the Commands tab lands in its Phase D/E), `docs/73` (console UI skill — design law).

Phase mapping to the brief's §20 order is in §11. The ten required points are §1–§10.

---

## 1. What currently exists

### 1.1 Dashboard and "What's happening now"

- `apps/web/app/app/page.tsx` (1150 lines) is the dashboard. Relevant anchors: greeting L577, four-state strip L630, main grid L675, morphing banner L679, **"What's happening now" L713**, founder node L750, EA node L766, department columns L794, Live activity L911, goals/decisions L954, EA notes L1046, Atlas dock L1128.
- The current section is a `console-card p-4` containing a vertical org chart: Founder → EA → five department columns (`sm:w-[calc(50%-0.5rem)] xl:w-[calc(25%-0.75rem)]`). Each employee is a small row: `h-6 w-6` avatar, name + one-line detail, `state-dot`. Links go to `/app/agents/{id}` (a full page, not a drawer).
- State derivation is real and already correct-ish: `memberState(agent)` (L434) → Retired / Paused / "Needs you" (pending approval) / Blocked (newest FAILED activity) / Working (has `currentTask`) / Idle; `departmentState(members)` → Needs you / Blocked / N working / Empty / Idle. `workingAgent` feeds `EADock`.
- Data comes from real endpoints via `Promise.all([fetchDashboardData, fetchAgents, fetchApprovals, fetchDepartments, fetchActivity, fetchCompanyProgress, fetchOrgInfo, fetchBuilderState, fetchPriorities, fetchDecisions, fetchActiveGoals, fetchPendingRevision])`.
- **No invented activity today** — events come from `/v1/activity` (`ActivityEvent`: id, agentId, taskId, type, summary, reason, cost, department, occurredAt).

### 1.2 Agent drawer

- `apps/web/components/layout/drawer.tsx` exists and is the docs/76 Phase 3 shared primitive: right-side panel over the page (dashboard stays visible), backdrop click-to-close, Escape, body scroll lock, `role=dialog`, widths md/lg/xl.
- **There is no agent drawer implementation.** Clicking an agent navigates to `apps/web/app/app/agents/[id]/page.tsx`, which server-renders `EmployeeWorkspace` (`components/work/employee-workspace`) from `/v1/agents/:id`, `/v1/tasks?agent_id=`, `/v1/activity?agent_id=`, `/v1/agent-memory?agentId=`, `/v1/tools/role/:role`, `/v1/providers`. The workspace component is the right content source for the drawer.

### 1.3 Queue + worker (the real system)

- `supabase/migrations/0038_agent_jobs.sql` / `packages/db/migrations/0014_add_agent_jobs.sql`: `agent_jobs(id, org_id, type, payload, status, priority, attempts, max_attempts, run_at, locked_at, locked_by, last_error, task_id, created_at, updated_at)` + claim/org/task indexes. Actual statuses: **`pending | running | done | failed | dead`**. Actual types: `task.execute | command.run`.
- `apps/api/src/services/jobs.ts`: `enqueueJob` (idempotent per org+type+task while pending/running), `claimJob` (`FOR UPDATE SKIP LOCKED`, priority then `run_at`, increments `attempts`, sets `locked_at/locked_by`), `completeJob`, `failJob` (backoff `5_000 * 2^(attempts-1)`, dead at `max_attempts`, `last_error` kept), `reapStaleJobs(staleSeconds)`, `jobsOverview(db, limit)` → `{counts, recent}`.
- `apps/api/src/services/job-worker.ts`: `startJobWorker(config, db, logger)` → `{stop}`. Per tick: reap → claim ≤5 → dispatch → complete/fail. `STALE_LOCK_SECONDS = 300`. Dispatch has **only `case 'task.execute'`** → `executeWithQuality(...)`. `stop()` waits up to 2s for in-flight.
- Started only when `JOB_QUEUE_MODE === 'workers'` (`apps/api/src/app.ts` L371); `closeJobWorker(app)` on shutdown. Config: `JOB_QUEUE_MODE` (`inline` default | `workers`), `JOB_WORKER_INTERVAL_MS` (min 250, default 2000) in `packages/core/src/config.ts`.
- `apps/api/src/routes/commands.ts` enqueues `task.execute` in workers mode (`/execute`, `/execute-pending`) and returns 202. **Nothing enqueues `command.run`** — it is a reserved type with no dispatcher, so today it would retry to dead.
- `GET /v1/admin/jobs` exists (`jobsOverview`) but **no UI reads it**.

### 1.4 Admin console

- `apps/web/app/admin/jobs/page.tsx` ("Background Jobs") is **fabricated**: a hard-coded `jobDefs` list with counts derived from `/v1/admin/audit`. docs/78 already flags this.
- `apps/web/components/admin/admin-sidebar.tsx` nav groups: Overview, Customers, AI Infrastructure (AI Agents, Execution Monitor, Model Router, AI Usage), Operations (Approval Queue, Background Jobs, Activity Log, Errors & Audit), Security, Settings.

### 1.5 Personas and model routing

- `apps/api/src/services/agent-personas.ts` (68 lines): `DEFAULT_PERSONAS: Record<role, string>` and `ROLE_PROMPT_FALLBACK`. **No provider/model field.** Agents carry persona at `agents.config.systemPrompt` (agents are hired with a `config` jsonb).
- `agents` table: `role, department_id, team_id, status, autonomy_level, capabilities, authority jsonb, config jsonb, current_task, credits_used, weekly_cost, tasks_completed, tasks_failed, last_active_at`. **No provider/model column.**
- Task execution routing (`apps/api/src/services/task-executor.ts` L509-530): `classifyTask(...)` → `getCalibrationAdvice(...)` → `selectMeasuredModel(db, orgId, routing, advice)` → `chat(config, system, prompt, {model, temperature, max_tokens, retries, _trace})`. `routingSource` is **not** passed there (defaults to `'default'`).
- `apps/api/src/services/model-selector.ts`: measured routing over `llm_performance` (14d window; ≥8 successes to prefer, ≥4 failures @ ≤70% to demote; ties by cost). Only measured models may move.
- `apps/api/src/services/routed-chat.ts`: the correct pattern — route via `selectMeasuredModel`, then trace with `routingSource` — used by tool calls.
- `apps/api/src/services/llm.ts`: `chatCompletion` builds `buildProviderChain(config)` in fixed order (**OpenRouter → NVIDIA → LiteLLM → Ollama**; dev providers last by design) and, per provider, tries `[explicitModel, provider.defaultModel, ...fallbacks]`. There is **no way to pin a provider** on this path — `ModelRouter.complete` in `model-router.ts` does accept an authoritative `providerHint`, but the product path (`chatCompletion`) does not use it.
- Provider keys actually present in `apps/api/.env` (gitignored): `OPENROUTER_API_KEY` (real, `sk-or-…`), `OPENROUTER_MODEL=openai/gpt-4o-mini`, `NVIDIA_API_KEY` (real, `nvapi-…`), `NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b`, plus NVIDIA fallbacks; LiteLLM `localhost:4000` and Ollama `localhost:11434` are configured but dev-only. So **two real, independently usable providers** exist (OpenRouter, NVIDIA) — enough for genuine per-employee provider diversity.
- `routingSource` enum today: `'static' | 'measured' | 'default' | 'calibration'`.

### 1.6 Docker / Compose

- `apps/api/Dockerfile`: node:22-slim, corepack, **context = repo root**, filtered `pnpm install`, copies `supabase/migrations`, `CMD /start-railway.sh` (runs `pnpm --filter @orq8/db migrate:supabase`, then the API). `apps/api/Dockerfile.cloudrun` exists.
- `infra/docker-compose.yml` (219 lines): postgres pgvector, minio + init, ollama, litellm; profiles `app`, `tls`, `obs`; dev-only creds. **No worker service, no `apps/worker`.**

### 1.7 Release gate / smoke / soak harnesses

- `scripts/release-gate.mjs` (322 lines): `--api-url/--web-url/--require <capability>/--no-mail/--json`; checks web+api `/healthz`, `/v1/readiness`, capability blocking list, mail via `/v1/readiness/mail-check`; `check(name, ok, detail)` prints PASS/FAIL; exit 0 only if all pass.
- `scripts/llm-smoke.ts` (269 lines): layer 1 provider probes per configured provider with real keys; layer 2 persona probe (creates + executes one task per seeded employee, one Atlas command, then reads **LLM traces** to assert the real provider + model + tokens; Iris observe-mode refusal expected).
- `scripts/load-scale.ts`: embedded Postgres + real API, 120 departments / 10k employees.
- `scripts/review-stack.ts` (981 lines): boots embedded Postgres on **:60808**, the full migration lineage, a **stub LLM gateway** (canned responses, `stub/review-model`) used when no live keys are found, an SMTP sink (optional), the API in-process on **:3111**, the built web app on **:3112**, seeds Northwind Labs (7 employees, 4 departments, goals, approvals, activity), and runs the **ticker** (`REVIEW_TICKER=0` opts out, 90–180s cadence, bounded ≤3 running / ≤4 pending / ≤2 open approvals, logs `[ticker] …`). It reads real keys from `apps/api/.env`, so it currently runs **LIVE** LLM when those keys are present (`REVIEW_LLM=stub` forces the gateway).
- **The review stack runs `JOB_QUEUE_MODE` unset → `inline`**, so `agent_jobs` is empty there today. Any queue/Commands demo needs the stack to run `enqueue` + a worker process (see §5/§8).
- Tests: `apps/api` vitest, embedded Postgres global setup, 898 passed / 3 skipped / 5 todo; web 72/72.

---

## 2. What must change (per brief section)

| Brief | Change | Where |
|---|---|---|
| §1–§4 | Replace the org-chart section with a live operational view; rebuild agent cards | new `components/dashboard/whats-happening/*`, `app/app/page.tsx` |
| §5 | Agent drawer over the dashboard, reusing `Drawer` + `EmployeeWorkspace` content | new `components/agents/agent-drawer.tsx` |
| §6 | Dashboard hierarchy pass — shrink/retire competing cards | `app/app/page.tsx`, dashboard widgets |
| §7 | Real Commands tab reading `agent_jobs` | new `app/admin/commands/page.tsx` + `routes/admin.ts`, `services/jobs.ts` |
| §8 | Dead-letter triage + **working** Retry | `services/jobs.ts` (`retryJob`), `POST /v1/admin/jobs/:id/retry`, UI |
| §9–§11 | Standalone `apps/worker` process, reused loop, safety | new `apps/worker/*`, `apps/api/package.json` exports, `job-worker.ts` hardening |
| §10 | Worker Dockerfile + Compose service, independent scaling | `apps/worker/Dockerfile`, `infra/docker-compose.yml` |
| §12–§13 | Preferred provider/model in persona config, honored by routing | `agent-personas.ts`, new `model-preference.ts`, `task-executor.ts`, `llm.ts` provider pinning |
| §14 | Provider-diversity smoke from real trace metadata | `scripts/llm-smoke.ts` |
| §15 | Full release gate incl. queue/worker/retry/dead-letter | `scripts/release-gate.mjs` + `pnpm` checks |
| §16 | 5-minute worker/ticker soak with real metrics | new `scripts/worker-soak.ts` |
| §17 | Mobile pass on 11 surfaces | web fixes + evidence |
| §18 | Evidence-based readiness report | `docs/80_…_REPORT.md` |

---

## 3. Components and services we reuse (do not rebuild)

- **Drawer primitive** `components/layout/drawer.tsx` — agent drawer is a consumer, not a fork.
- **Employee content** `components/work/employee-workspace.tsx` (identity, tasks, activity, memory, tools, authority) — the drawer reuses its sections and data reads (`/v1/agents/:id`, `/v1/tasks?agent_id=`, `/v1/activity?agent_id=`, `/v1/agent-memory`, `/v1/tools/role/:role`, `/v1/providers`).
- **Design system**: `brand_guide.md`, `marketing/DESIGN_DIRECTION.md`, `docs/73` console law; existing tokens (`hairline`, `ink`, `muted`, `brand-deep`, `brand-ink`, `state-dot`, `mark-active`, `console-card`, `ink-accent`), `EmptyState`, `LoadingState`, `DataBoundary`, `PageContainer`.
- **Dashboard widgets** already on disk: `ActivityFeed`, `StatCards`, `ApprovalList`, `DepartmentActivityWidget`, `ExecutiveAgentPanel`, `GoalExecutionPanel`, `HealthScore`, `ReliabilityWidget`, `ModelPerformanceWidget`, `ReviewPanel`, `ea-dock`.
- **Queue**: `jobs.ts` claim/complete/fail/reap semantics — the worker uses `startJobWorker` **unchanged**; no new queue system.
- **Routing**: `classifyTask`, `getCalibrationAdvice`, `selectMeasuredModel`, `llm_performance`, tracer — preference is layered **on top**, not beside.
- **Harnesses**: `release-gate.mjs`, `llm-smoke.ts`, `review-stack.ts` ticker.

---

## 4. New components and files

**Web**
- `components/dashboard/whats-happening/whats-happening.tsx` — the section shell (header + live counts + bands).
- `components/dashboard/whats-happening/agent-work-card.tsx` — the large card for a working/attention agent.
- `components/dashboard/whats-happening/agent-status-rail.tsx` — compact rows for idle/paused/retired (keeps working agents dominant).
- `components/dashboard/whats-happening/attention-lane.tsx` — "Needs you" / "Blocked" / "Waiting" lanes built from approvals + FAILED activity.
- `components/dashboard/whats-happening/skeleton.tsx` — loading state matching the real card geometry.
- `components/agents/agent-drawer.tsx` — client component; `Drawer` + real fetches; opens from the dashboard without navigation.
- `components/admin/jobs/queue-health.tsx`, `jobs-table.tsx`, `dead-letter-panel.tsx`, `retry-button.tsx` (client, real POST + refresh).
- `app/admin/commands/page.tsx` — the Commands tab (replaces the fabricated page; `/admin/jobs` becomes a redirect).

**API**
- `services/model-preference.ts` — resolve `{provider, model, source, reason}` for an agent (persona default → per-agent override → measured/static).
- `services/jobs.ts` additions: `jobsHealth`, `recentJobsDetailed`, `deadLetterJobs`, `retryJob`.
- `routes/admin.ts`: `GET /v1/admin/jobs` (extended), `GET /v1/admin/jobs/health`, `POST /v1/admin/jobs/:id/retry`.
- `routes/agents.ts`: `preferredProvider` / `preferredModel` in `patchBody` (and hire body), validated against the registry.

**Worker**
- `apps/worker/package.json`, `tsconfig.json`, `Dockerfile`, `src/main.ts` (entry), `src/entry-once.ts` (`--once` drain for tests/CI).

**Scripts**
- `scripts/worker-soak.ts` — the 5-minute soak harness + JSON artifact.

---

## 5. Database and backend changes

**No new queue.** The existing `agent_jobs` table is the queue; `FOR UPDATE SKIP LOCKED` remains the concurrency primitive.

1. **Routing preference (decision D1).** Preferred option — no migration: role-level defaults in `agent-personas.ts` (`PERSONA_MODEL_PREFERENCES`) + per-agent override at `agents.config.preferredProvider` / `agents.config.preferredModel` (the same jsonb that already holds `config.systemPrompt`). Alternative — migration `0017` (drizzle) / `0041` (supabase) adding `preferred_provider text`, `preferred_model text` to `agents`, plus `agents` GET/PATCH plumbing. Both are additive; the config option ships faster and matches "persona configuration" exactly.
2. **`agent_jobs` needs no schema change** for §7/§8. `updated_at` is the last transition (completion for `done`, failure for `dead`), `locked_at` is the start, `created_at` the enqueue; `attempts` is the retry count; `last_error` the reason. A retry is recorded in the **audit trail** (`appendAudit`, `action: 'job.retry_requested'`) — the existing convention — not a new column.
3. **`jobs.ts` extensions** (all reads except retry):
   - `jobsHealth(db)`: counts by status, by type, eligible depth (`pending AND run_at <= now()`), oldest pending age, stale running (`running AND locked_at < now() - 5 min`), `lastClaimAt`, distinct `locked_by` seen in the last 10 min.
   - `recentJobsDetailed(db, filters, limit)`: job + task title + agent name (join `tasks`, `agents`), status, attempts/max, created/started/completed, error.
   - `retryJob(db, jobId, actor)`: validate status ∈ {`dead`,`failed`} (409 with reason for `running` — it may be live in a worker — and for `done`/`pending`), then one UPDATE: `status='pending', run_at=now(), locked_at=NULL, locked_by=NULL, attempts=0, updated_at=now()`, keeping `last_error` as history; audit row; return the fresh row. The job reappears in the queue immediately and the next worker tick picks it up.
4. **Job queue mode (decision D2).** Recommended: add `enqueue` to the enum (`inline | enqueue | workers`), meaning "handlers only enqueue, no local loop"; keep `workers` exactly as today (enqueue + in-process loop) for back-compat. Deployment then reads: API `enqueue`, worker `workers`. Alternative: new bool `JOB_WORKER_ENABLED=false` on the API.
5. **Unknown job types**: dispatch should fail fast to `dead` with `last_error: "no dispatcher for type …"` instead of burning three retries on a type nobody handles (decision D3 covers `command.run` itself).
6. **Duplicate-execution prevention** in dispatch: before executing, re-read the task; if it is already `in_progress` under a different job id, or `completed` after this job was created, complete the job as a no-op with a logged reason. Cheap, and it closes the retry-while-live window.
7. **Per-job timeout**: `JOB_TIMEOUT_MS` (default 10 min) races the dispatch; on timeout the job fails with a clear error and the stale-lock reaper remains the backstop for a hard kill.
8. **`config` exposure**: `GET /v1/agents/:id` already returns the row; ensure `config.preferredProvider/preferredModel` are surfaced (and typed) so the drawer can show the real preference.

---

## 6. Worker architecture (§9–§11)

```
API (JOB_QUEUE_MODE=enqueue)          Worker (JOB_QUEUE_MODE=workers, N replicas)
  request handler                       startJobWorker() — the SAME loop
      enqueueJob()  ──► agent_jobs ──►    reap stale locks
                        (Postgres)        claim ≤5 (SKIP LOCKED)
                                          dispatch: task.execute → quality pipeline
                                          complete / fail-with-backoff / dead
```

- **Entry**: `apps/worker/src/main.ts` — `loadConfig` → `createDb` → `createLogger` → `startJobWorker(config, db, logger)` → heartbeat log every 60s (worker id, processed counters, queue depth via `jobsHealth`) → on SIGTERM/SIGINT: stop claiming, wait for in-flight (configurable grace, default 30s), close the pool, exit 0.
- **Reuse without duplication**: `apps/api/package.json` gains `"./worker": "./src/services/job-worker.ts"` (and `"./jobs"`); the worker imports `@orq8/api/worker`. No duplicated pipeline code; if the API changes, the worker changes with it. Importing `@orq8/api` (the root export) is avoided because that entry starts an HTTP listener.
- **`--once` mode**: drains eligible jobs until the queue is empty, then exits — used by tests, the release gate and CI.
- **Safety across replicas**: claiming is already atomic (`SKIP LOCKED`, `attempts` incremented in the same UPDATE), `locked_by` carries the worker identity, stale locks are reaped at 300s, and enqueue is idempotent per (org, type, task). Multi-worker is safe today; we add the duplicate-execution guard (§5.6) and hard-kill backstop tests.
- **Docker** (`apps/worker/Dockerfile`, mirrors `apps/api/Dockerfile`: context = repo root, node:22-slim, corepack, filtered install, `CMD tsx apps/worker/src/main.ts`) plus an `infra/docker-compose.yml` service:

```yaml
  worker:
    build: { context: .., dockerfile: apps/worker/Dockerfile }
    environment:
      DATABASE_URL: postgres://…
      JOB_QUEUE_MODE: workers
      WORKER_ID: ${HOSTNAME}
    depends_on: [postgres]
    # no ports — the worker is not an HTTP surface
```

  Scaling independence is demonstrated with `docker compose up --scale api=2 --scale worker=5` (documented in the compose comments); workers hold no per-process state beyond the loop.
- **No new queue system**, per §11 and docs/75. Redis Streams remains the documented graduation path only if p99 claim >50ms or >50 jobs/min (docs/75 §2).

---

## 7. Model routing (§12–§14)

**Resolution order** (new `services/model-preference.ts`):

1. **Per-agent override** — `agents.config.preferredProvider` + `preferredModel`.
2. **Role persona default** — `PERSONA_MODEL_PREFERENCES[role]` in `agent-personas.ts` (a new export alongside `DEFAULT_PERSONAS`, same file and convention).
3. **No preference → today's measured/static path** unchanged.

**Honoring the preference** (the part that must not be metadata):
- Add `preferredProvider?: ProviderId` to `LLMOptions._trace`-adjacent options in `llm.ts` (`chatCompletion`): when set **and the provider is configured**, move that provider to the front of `buildProviderChain(config)`; every other configured provider stays behind it as fallback. This mirrors the already-fixed, authoritative `providerHint` semantics in `ModelRouter.complete`, on the path the product actually uses.
- Add `'persona'` to the `routingSource` enum; the tracer and `llm_performance` persist it, so **the smoke test reads which provider/model served from real records**, not from the model's self-description.
- **Fallbacks are explicit and recorded**: provider not configured → measured/static path + `fallbackReason='provider_not_configured'`; model unavailable/404 → `[preferredModel, provider.defaultModel, ...fallbacks]` (the existing behavior), recorded as a substitution; model measured-degraded in this org (≥4 failures at ≤70% over 14d) → demoted to the measured path (existing guardrail, applied to the preference).
- **Scope**: `task-executor.ts` (pass preference + `routingSource`), `routed-chat.ts` (tool calls made *by* the employee use the same preference), and `executive-agent.ts` (Atlas keeps its own routing unless given a preference).

**Proposed cast mapping** (actual configured providers; verified in Phase 9, fallbacks named):

| Employee | Role | Preferred provider | Preferred model |
|---|---|---|---|
| Ridge | software_engineer | NVIDIA | `nvidia/nemotron-3-super-120b-a12b` |
| Iris | operations_manager | NVIDIA | `nvidia/nemotron-3.5-lightning-30b-a3b` |
| Nova | market_researcher | OpenRouter | `openai/gpt-4o-mini` |
| Milo | market_researcher | OpenRouter | `meta-llama/llama-3.3-70b-instruct` (verified at smoke; falls back to the OpenRouter default) |
| Ada | data_analyst | OpenRouter | `openai/gpt-4o-mini` |
| Sage | data_analyst | OpenRouter | `google/gemini-2.0-flash-001` (verified at smoke) |
| Ember | communications_agent | OpenRouter | `anthropic/claude-3.5-haiku` (verified at smoke) |

Provider diversity is guaranteed by construction (two real providers); model diversity within OpenRouter is confirmed per model in Phase 9 and anything unverified is replaced or dropped — never claimed.

**Smoke test (§14)**: extend `scripts/llm-smoke.ts` layer 2 to print and assert a per-employee table sourced from `llm_performance`/traces: `employee → provider → model → routingSource → latency → success`, requiring ≥2 distinct providers and ≥3 distinct models across the cast, plus a fallback case (preference pinned to an unconfigured provider resolves through the recorded path). It runs against real keys.

---

## 8. Commands tab ↔ `agent_jobs` (§7–§8)

- **Route**: new `/admin/commands` page (server component for the first paint + a small client component polling `/api/admin/...` proxy every 10s for freshness; the existing `/api/org`-style proxy pattern in `apps/web/app/api/` is reused). The nav item "Commands" replaces "Background Jobs" under **AI Infrastructure**; `/admin/jobs` becomes a permanent redirect and the fabricated `jobDefs` list is deleted.
- **Reads** (all real): `GET /v1/admin/jobs` (extended) and `GET /v1/admin/jobs/health`.
- **Queue health band**: cards for the five real statuses — `pending → Queued`, `running → Running`, `done → Completed`, `failed → Failed`, `dead → Dead-letter` — plus eligible depth, oldest pending age, and worker liveness (`lastClaimAt`, distinct workers seen, stale-running count). Labels map to real statuses; no invented states.
- **Recent jobs table**: id (short), type, agent (join through `task_id`), task/work item, status, created/started/completed, attempts/max, error (truncated, full on row expand). Filter chips by status/type; empty, loading and error states; responsive (cards on mobile, table on desktop).
- **Dead-letter panel**: only `dead`/`failed` jobs; job info, agent, task, failure reason (`last_error`), attempts, timestamps, and a **Retry** button that calls `POST /v1/admin/jobs/:id/retry`, then refreshes the queue view. Client-side handling for 404/409/500 with the server's reason; successfully retried rows disappear from dead-letter and appear in the queue list. Platform-admin only, like the rest of `/v1/admin/*`, with the audit row as the record of who retried what.
- **Demo data reality**: the review stack will run `JOB_QUEUE_MODE=enqueue` with a real worker process so the tab shows genuine queue traffic; when empty it says so honestly.

---

## 9. Release gate (§15)

Extend, don't replace, `scripts/release-gate.mjs`:

1. **Application**: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm --filter @orq8/api test`, `pnpm --filter @orq8/web test`, `pnpm --filter @orq8/web build` (the review stack needs the production build anyway); route/nav/auth smoke through the gate's existing HTTP checks.
2. **Backend / queue**: new `--jobs` capability that against the running stack: enqueues a job through a real API route, observes it reach `done`; enqueues a job against a deliberately failing task, observes retry (`pending`, run_at moved) then `dead`; calls the retry endpoint and observes it requeue and process; asserts `/v1/admin/jobs/health` reflects each transition. Worker startup is proven by the worker's structured `worker started`/heartbeat log and by `lastClaimAt` moving.
3. **AI system**: reuse `llm-smoke.ts` (provider probes + persona routing assertions) as a gate step with live keys; EA interaction via the existing `/v1/commands` check.
4. **Dashboard/UI**: the gate can assert route 200s; state/drawer checks are done in the Browser panel and attached as evidence.
5. **Security**: existing checks plus new ones — the retry endpoint rejects non-admin (403) and unknown ids (404); cross-org job ids are not retryable.
6. Every check reports **PASS / FAIL / BLOCKED** with output captured; release blockers are fixed before the report, and anything untested is written as BLOCKED, never PASS.

---

## 10. Five-minute soak (§16)

New `scripts/worker-soak.ts`, modelled on `review-stack.ts` boot sequence (embedded Postgres, migration lineage, real API in `enqueue` mode, **plus a real `apps/worker` child process** — and optionally 2–3 worker replicas to prove concurrency):

- **Workload**: seed one org + 3 employees; enqueue a controlled stream of real `task.execute` jobs for 5+ minutes (e.g. every 10s, 1–3 jobs, spread across employees/routing preferences), plus every ~60s one deliberately poisoned job to exercise retry → dead-letter.
- **Providers**: default to the stub gateway so the soak is free and deterministic; `SOAK_LLM=live` switches to real keys (then the report notes real spend). Either way jobs flow through the real queue, worker and quality pipeline.
- **Sampling every 5s**: queue counts by status, eligible depth, oldest pending age, running count, stale-running count, distinct `locked_by`, jobs processed/succeeded/failed/retried/dead, per-job latency (created→done), duplicate detection (job processed twice; task executed twice), worker child exit/restart count, API `/healthz` + `/v1/admin/jobs/health` + DB ping, provider failures (`llm_performance.success=false` count).
- **Also during the window**: the review-stack ticker keeps running, so the dashboard keeps moving while the worker drains — the soak covers the ticker and the worker together, as the brief asks.
- **Output**: a JSON artifact with the raw samples + a summary table (processed / succeeded / failed / retried / dead / avg & p95 latency / stability / anomalies), embedded in the readiness report.
- **Anomalies** are reported, not smoothed: any worker crash, duplicate execution, stale lock, stuck `running`, or provider failure is named with its timestamp and job id.

---

## 11. Phase plan, deliverables and evidence (§20)

| Phase | Deliverable | Evidence |
|---|---|---|
| 1 Audit | this document | read-only |
| 2 "What's happening now" + cards | session band (working / attention / idle counts), large working cards with real current task + status + department + last change, attention lanes, compact idle/paused rail, skeleton + empty states; honest data only (no progress bar without a real progress source) | preview screenshots 1440 + 390, real seeded stack |
| 3 Agent drawer | click → right drawer (dashboard visible), sections identity/status/working now/recent activity/workstream/tools/authority/outputs/decisions/approvals; Escape/backdrop close; deep link to the full page retained | preview + a11y snapshot |
| 4 Dashboard coherence | hierarchy pass Founder → EA → Departments → Employees → Work → Outcomes; retire/compact competing cards (four-state strip, banner, duplicated roster widgets) | before/after screenshots |
| 5 Commands | real queue health, recent jobs, dead-letter + working retry; `/admin/jobs` faked page removed | live queue actions in preview + API responses |
| 6 `apps/worker` | standalone process, `enqueue` mode, dispatch hardening (unknown type, duplicate guard, timeout, graceful shutdown) | worker logs + job lifecycle assertions |
| 7 Docker | `apps/worker/Dockerfile`, compose service, scale demonstration | `docker compose config` / build log (if Docker is available; otherwise BLOCKED and stated) |
| 8 Preferred models | persona defaults + per-agent override, router honoring it, `'persona'` routing source | unit tests + traces |
| 9 Provider smoke | updated `llm-smoke.ts` diversity run | per-employee provider/model table from real records |
| 10 Release gate | extended gate run to green | captured PASS/FAIL output |
| 11 5-min soak | `worker-soak.ts` run + JSON | summary table + anomalies |
| 12 Mobile | 11 surfaces at 390×844; fixes for overflow/clipping/touch targets; Engineering gets a mobile adaptation, not a crushed IDE | per-surface evidence |
| 13 Report | `docs/80_ORQ8_DEMO_DAY_READINESS_REPORT.md` | all of the above, blockers separated |

---

## 12. Risks, constraints, non-goals

- **Real provider spend** is possible in Phase 9/10 if live keys are used; the review stack defaults to live when keys exist, so soak defaults to the stub gateway and the smoke run is explicitly budgeted (a handful of calls).
- **Windows process management** (netstat/taskkill recipes), CRLF files (`packages/db/src/schema.ts`, `task-executor.ts`), and the Next production build requirement for UI review are known and accounted for.
- **`llm-smoke.ts` correctness**: today's assertions must be re-read before extending so the new provider-diversity assertions replace, not duplicate, existing ones.
- **Non-goals (this brief)**: Redis Streams, the housekeeper split, gateway/web process splits (docs/75 phases 3–6), and the layered rate limits from docs/77 P1 §8 — those were shipped separately on 2026-10-02 (docs/80 Appendix C).
- **`command.run`** remains a reserved type — see decision D3.

---

## 13. Open decisions (please confirm before Phase 2)

**Decided 2026-10-02:**

- **D1 — Persona config, no migration.** Role-level defaults live in `agent-personas.ts`; a per-agent override may sit in the existing `agents.config` jsonb (`preferredProvider` / `preferredModel`). No schema change.
- **D2 — Add `enqueue`** to `JOB_QUEUE_MODE` (`inline | enqueue | workers`): the API runs `enqueue` (handlers only enqueue, no local loop); the worker process runs `workers`. `workers` keeps its current meaning for back-compat.
- **D3 — `command.run` stays reserved**: the worker fails it fast to `dead` with an explicit reason (no pointless retries), documented in docs/75. No async command path in this brief.
- **D4 — The review stack runs the queue for real**: `JOB_QUEUE_MODE=enqueue` plus a spawned `apps/worker` child against the same database, with an env opt-out for pure-UI work.

### Progress log

- **Phase 2 + 3 shipped** (this branch): `components/dashboard/whats-happening.tsx` (status strip, department row, attention band, large working cards, idle rail, real-data-only derivation in `app/app/page.tsx`), `components/agents/agent-drawer.tsx` (7 real-data sections over the dashboard), and the `Drawer` primitive now re-applies the console theme scope to its portalled panel (it was rendering outside `.console`, so console-scoped styles never applied inside a drawer).
- **Phase 4 in progress**: the morphing banner no longer repeats the approval actions the employee cards show (it names who is stopped); departments return as one real-count row; touch targets in the section are ≥32px at 390px width.
- **Phases 5–7 built in the working tree** (uncommitted at the time of writing): the admin commands dashboard (`app/admin/commands/`, `components/admin/commands-dashboard.tsx`, `app/api/admin/jobs/`) with real queue health, recent jobs and dead-letter retry — the previously faked `/admin/jobs` page now reads real data; the standalone `apps/worker` process (`apps/worker/src`, `Dockerfile`) plus the `enqueue` queue mode; and the `orq8-worker` compose service in `infra/docker-compose.yml` (scales independently of the API). Phase 8 is deliberately merged into docs/80 Phase 4 so it is implemented once.
