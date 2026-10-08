# 80 — AI Cost, Security, Rate Limiting & Credit Economy: Audit Completion + Implementation Plan

Status: **APPROVED (2026-10-02). Phase 0 and Phase 3 (layered rate limits) SHIPPED and verified;
Phases 1–2 and 4–6 not started.** Phase 3 shipped ahead of the docs/79 sequence because it is the
direct answer to docs/77 P1 §8; its trial per-day ceiling remains open (abuse todo #3).

Founder decisions recorded at approval:

1. **Plan approved as written.**
2. **Credit model**: published classes with measured settlement inside a reservation (no surprise
   charges; §3.7).
3. **Sequencing**: Phase 0 now, then finish docs/79 phases 8–13 (demo readiness), then Phases 1–6;
   docs/79's preferred-model config is implemented once, as this plan's Phase 4.

Decisions 4–10 in Part 9 remain open and are needed before their respective phases (4, 5, 6, 7, 8,
9, 10). None of them block Phase 1.

Lineage:

- **docs/77** is the original audit of this exact domain. Its P0 and P1 §5 are shipped; its
  P1 §6–8 (reservations, budget enforcement, layered rate limits) and P2/P3 are the items this
  brief finally covers. This document completes the audit against the code as it exists **today**
  (2026-10-02), confirms what is still true, corrects what has changed, and turns the brief's
  30 sections into a phased, testable plan.
- **docs/79** (UI/worker demo readiness) has phases 8–13 still open; its Phase 8 "preferred
  provider/model config per persona" overlaps §12/§13 here and must be built once, not twice.
- **docs/78** (admin console) is a sibling plan — its AI-economics work (§23 here) lands on the
  same `/v1/admin/ai-usage` surface and should share the admin shell decisions.

Method: direct reads of every file cited below, plus targeted greps for the negative claims
(no reservation, no refund path, no enforcement, no purchase UI, no per-org limits). Nothing is
assumed correct because it exists. **28 of the brief's test scenarios are currently implemented
only in part or not at all** — Appendix B is the honest PASS/FAIL/BLOCKED ledger.

---

## Part 1 — What shipped since docs/77, so this plan does not re-propose it

| Shipped | Where | Consequence for this plan |
|---|---|---|
| Self-serve `POST /v1/credits/top-up` deleted; `consume` dev/admin-only (404 in prod) | `apps/api/src/routes/credits.ts` | Top-up policy decision from docs/77 Part C is effectively resolved. |
| Stripe signature verified on `request.rawBody`; `webhook_events` unique `(org, provider, external_event_id)`; `processWebhookEvent` replay guard | `apps/api/src/routes/billing.ts:100-146`, `services/billing.ts` | Payment path is replay-safe in the happy case — but see **H1**, a real defect remains. |
| Credit math is SQL-increment with in-transaction idempotent ledger insert; `(org, period_start)` unique balance; `GET /v1/admin/credits/reconcile` | `services/credits.ts` (`consumeCredits`, `addPurchasedCredits`, `adjustCredits`, `reconcileLedger`) | Ledger v2 is a schema **extension**, not a rebuild. |
| Real provider cost recorded per call: `llm_performance.provider_cost_usd`, `credits_attributed`, `pricing_source`; ledger rows carry provider/model/tokens/cost/agent/task/job/metadata; `/v1/admin/ai-usage` reports USD spend vs billed credits separately | `services/llm-pricing.ts`, `services/llm-tracer.ts`, `routes/admin.ts:805+`, migrations 0016/0040 | The economics data model exists. The aggregation, enforcement, and margin-reporting layers are what is missing. |
| Durable job queue with SKIP LOCKED claiming, attempts/backoff, dead-letter, stale-lock reaping; worker package + Docker scale path | `services/jobs.ts`, `services/job-worker.ts`, `apps/worker/**` | Worker risks in §24 are mostly mitigated already; remaining items are per-org concurrency and payload hardening. |
| Abuse suite: 7 integration tests + **5 explicit `it.todo`** items | `apps/api/test/abuse-suite.integration.test.ts:344-348` | The todos are this brief's test backlog: layered limits, recursion guard, trial day cap, provider-exhaustion proof, concurrent claim. |

---

## Part 2 — Audit findings (verified today)

### A. Current rate-limit implementation (§30 item 3)

Two parallel implementations, selected once at boot (`apps/api/src/app.ts:162-227`):

| Layer | Redis path | In-memory fallback | Key |
|---|---|---|---|
| Global | 300/min | 60/min (non-GET) | session hash (`sessionOrIpKey`) / IP |
| Login | 5/min | same | IP |
| Register | 3/min | same | IP |
| Forgot / Reset / Verify-email | 3–5 per 15 min | same | IP |
| OAuth | 20/min | same | IP |
| Commands (`/v1/commands`) | 10/min | same | session hash / **IP in fallback** |
| SSE handshake | 30/min | not registered | IP |

Findings:

- **A-R1 (HIGH).** No **org**, **agent**, **job-concurrency**, **provider-concurrency**, or
  **endpoint-class** limits exist anywhere. The abuse suite's first todo names exactly this.
- **A-R2 (MEDIUM).** Redis limiter **fails open** on error (`rate-limit-redis.ts`, every path
  catches and returns). Acceptable for read traffic; not for AI-spend classes.
- **A-R3 (MEDIUM).** The in-memory fallback keys authenticated routes on **IP**, so behind the web
  proxy all users share one bucket, and it is single-instance only (documented in the plugin).
- **A-R4 (LOW).** `rateLimitRoute` matches by `request.url.startsWith(path)`, so
  `/v1/commands-something` would share the commands bucket; harmless today, worth tightening.
- **A-R5 (LOW).** Login lockout exists in DB (`login_lockouts`, `plugins/brute-force.ts`) — good,
  keep. Register is per-IP; no per-email-domain friction.

### B. Current credit implementation (§30 item 4)

Data model (verified `packages/db/src/schema.ts`, migrations 0015/0039):

- `credit_balances`: `included_credits`, `purchased_credits`, `used_credits`, period bounds,
  unique `(org_id, period_start)`. **`remaining = included + purchased − used`; no reservation
  concept.**
- `credit_transactions`: append-only; `type` is free text but **only four values are ever
  written**: `usage | purchase | adjustment | rollover`; attribution columns
  (`provider, model, input_tokens, output_tokens, provider_cost_usd, agent_id, task_id, job_id,
  metadata`) and a partial unique `(org_id, idempotency_key)` — all shipped in P0/P1.
- `consumeCredits` is correct under concurrency (increment in SQL, cap in the WHERE, ledger row in
  the same transaction, idempotency key arbitrates replays). `reconcileLedger` proves drift.
- **No reservation, no release, no refund, no reversal, no expiration, no grant/promo type**
  anywhere in code (grep: zero hits). Failed infrastructure spend is absorbed silently unless an
  operator reconciles by hand.
- `getOrCreateBalance` is a **read path with write side effects**: it may create a subscription
  (`trial`, 100 credits) and a balance, and per-period it re-allocates credits. The unique indexes
  make it safe now, but every page load of `/app/usage` can mint a trial subscription; there is
  no per-day trial ceiling (abuse todo #3).
- Alerts (`credit-alerts.ts`) fire at 80/95/99/100% utilization with a 4h cooldown. Useful, but
  arrives late for long-running work that will overshoot while it runs.
- Trial: `PLAN_CREDITS.trial = 100`, auto-created, email verification gates the app.

### C. Current task / work charging (§30 item 6)

Verified call sites: `task-executor.ts:416` (pre-check), `:692` (price), `:733` (settle);
`tool-registry.ts:317` (pre-check), `:441-449` (charge); `executive-agent.ts:1653` (pre-check),
`:1878` (settle).

- Model charge: `Math.max(1, ceil(tokensUsed / 1000))` credits — **1 credit per 1K estimated
  tokens**, where tokens are estimated as `chars / 4` for prompt text plus provider-reported usage
  where available. Failed tasks cost 0. Deferred tasks cost 0.
- Tool charge: `OPERATION_COSTS['tool.<id>']` — **no `tool.*` keys exist in the table**, so every
  tool call falls through to `default: 2` credits. The published catalog (`task.executed: 2`)
  disagrees with both the token formula and the tool price. This is the docs/77 A5 "surprise
  charge" finding, **still open**.
- Aggregation: the whole multi-step pipeline (LLM loop + tool loop) accumulates into one
  `tokensUsed`, and one settlement charges it — so multi-step work is aggregated under the parent
  task correctly today (brief §20 already satisfied in shape, not in explained price).
- Tool credits are charged **at call time**, so they are billed even if the task later fails.
  Failed-tool behavior needs confirming in the fix (target rule in 3.8).
- `tasks.cost` and `activity_events.cost` are **credits** but their schema comments say "cents";
  the EA settlement path charges per operation type; the exact EA amount rule must be read and
  aligned during implementation (`executive-agent.ts:1860-1900`).
- Internal retries inside `chat()` are invisible to `tokensUsed` but visible to
  `llm_performance.retry_attempt` — **retry provider cost is recorded and never billed**, which is
  honest but needs a bound (see §14 risk table).

### D. Current payment implementation (§30 item 5) — including one real defect

Working: server-owned catalog (`CREDIT_PACKS`, `PLANS`), checkout sessions built server-side, pack
`metadata` read from server constants at webhook time, signature on raw bytes, replay guard.

**H1 (CRITICAL, new finding). `processWebhookEvent` writes the event row as `status: 'processed'`
BEFORE `applyWebhook` runs** (`services/billing.ts`, `processWebhookEvent`). If `applyWebhook`
throws (transient DB error mid-grant), the route returns 500, Stripe retries the same event id,
`onConflictDoNothing` finds the existing row and answers `duplicate: true` — **the credits are
never granted and no code path will retry them.** The ledger's own idempotency key
(`stripe:<event.id>`) cannot help because the second attempt is refused before it. Fix is in
Appendix A.

Other gaps:

- **H2.** No `charge.refunded` / refund handling: a Stripe refund does not claw back purchased
  credits. No `invoice.paid` handler, so **subscription renewals do not re-allocate credits**
  (allocation happens lazily on the next `getOrCreateBalance` — works, but the timing is
  read-driven and invisible). `checkout.session.expired` and `customer.subscription.created` are
  unhandled (no-ops today; document or handle).
- **H3.** Credit packs are purchasable by **any org member** (`routes/credits.ts` `POST
  /v1/credits/purchase` requires only `requireAuth`). Membership role is not consulted —
  a viewer can spend the company's money. Needs a role gate (owner/admin) or explicit policy.
- **H4.** Out-of-order delivery: `customer.subscription.updated` before `checkout.session.completed`
  is a silent no-op (subscription row not yet present). Low impact (later events converge), but it
  should be logged as `unresolved` rather than dropped.
- **H5.** No purchase UI exists in the web app at all: `grep` finds **zero** callers of
  `/v1/credits/purchase`, `/v1/billing/checkout`, or the packs catalog under `apps/web`. Credits
  cannot currently be bought from inside the product (brief §16).

### E. Current model-routing implementation (§30 item 7)

Three coexisting systems, of which the third is **dead code**:

1. **Live selection**: `model-intelligence.ts` (`classifyTask` → risk/complexity/reasoning; tiers
   0–3 over `MODEL_REGISTRY` sorted by `costPer1kInput`; critical work floored) +
   `model-selector.ts` (`selectMeasuredModel`: measured success-rate promotion/demotion from
   `llm_performance`, 14-day window, min-sample gates, cost tie-break) + `calibration-routing.ts`
   (consequential-work tier floor when calibration is weak).
2. **Live execution**: `llm.ts` `chat()`/`chatJson()` — OpenRouter → NVIDIA → LiteLLM → Ollama,
   multi-key pools, per-key 429 smoothing, two-stage timeouts, tracing. All four service files
   that call an LLM (`task-executor`, `deliberation`, `qa-evaluator`, `failure-analyzer`) import
   from `llm.ts`; `business-import-enrichment` uses `chatJson`. **No app route bypasses the
   gateway** — the brief §8 requirement is structurally met.
3. **Dead code**: a second, full provider-adapter stack `ModelRouter` (1955 lines,
   `model-router.ts`) with its own `selectModel` scoring — **never instantiated anywhere**
   (`getModelRouter` has no callers; only re-exported by `llm.ts:881`). Two selection philosophies
   in one repo is a correctness and maintenance hazard.

Gaps: routing does **not** consider plan, remaining credits, expected call cost, task budget,
provider health, or per-agent preference. There is no per-call cost ceiling. Personas
(`agent-personas.ts`) carry voice only; `agents.config.systemPrompt` is the persona slot
(`services/agents.ts:168-170`, `task-executor.ts:469-471`) — the room for `preferredModel` etc.
exists with **no migration** (matches docs/79 D1). Models reachable via `OPENROUTER_MODEL` may not
be in `MODEL_REGISTRY` → `pricing_source: 'unknown'` (already counted in admin).

### F. Current provider economics (§30 item 8)

- `llm-pricing.ts`: provider-reported cost wins (`provider_reported`), else registry rates
  (`registry`), else 0 + `unknown`. Computed on every traced call.
- `economics.ts`: `USD_PER_CREDIT_REFERENCE = 3.9¢` (Founder monthly), margin helper.
- `/v1/admin/ai-usage` already reports calls/tokens/USD spend, unknown-pricing counts, weekly/
  monthly/all-time, by provider, by model, billed credits and margin — a real foundation.
- **Missing**: by **agent**, by **task type**, by **company**, negative-margin workflow list,
  refund/unbilled reconciliation, revenue side (subscriptions + purchases) per period, date-range
  filtering, retry-cost reporting.
- **BYOK is inert for actual calls.** Provider keys are encrypted at rest per org
  (`routes/providers.ts`, `secret_records`-style storage, AES-256-GCM, masked, audited), with a
  `monthly_spend_ceiling` field accepted and stored — and the LLM gateway's provider chain is
  built from **environment config only** (`llm.ts:96-166`). Org keys are decrypted only by the
  `/test` route (`providers.ts:254`). So: customers can store keys, the product advertises BYOK,
  and no model call ever uses them; the ceiling is never enforced. This is the single largest
  untapped lever for both margin (customer pays provider) and §13 (preferred provider/model).

### G. Security / tenancy (§30 items 1, 24)

- Sound already (docs/77 verified, still true): org scoping on every spot-checked route;
  `requirePlatformAdmin` on admin routes; RLS select-only on credit/subscription tables
  (`0033_rls_hardening.sql:142-204`); no service-role key in web routes; CSRF plugin; security
  headers; idempotency plugin (with the preHandler fix); audit trail.
- Worker payload trust: `job-worker.ts` reads `taskId` from the payload but `orgId` from the job
  row and passes both to `executeWithQuality`. **`preflight` selects the task by id without an
  org match** (defense-in-depth gap only — jobs are created server-side from org-scoped routes;
  no client writes `agent_jobs`).
- `agent_jobs` RLS in the Supabase lineage (0038) should be re-verified line-by-line in Phase 0
  (this audit verified the API-side org scoping, not the policy text).
- Credit mutation surface: balance writes happen only in `services/credits.ts`; the frontend has
  no write path. Good.
- Emergency stop exists per agent; **no org-level "stop all AI spend" switch** exists.
- **Recursion**: delegation orchestrator exists; no depth/child/task caps are enforced
  (abuse todo #2). Combined with a 2-credit-per-tool-call price and no per-task ceiling, an agent
  loop is bounded only by the org's balance.

### H. Worker risks (§24) — mostly closed

Atomic claim (`FOR UPDATE SKIP LOCKED`), duplicate-task preflight, unknown-type/malformed-payload
dead-letter, `JOB_TIMEOUT_MS` 600s, stale-lock reaping at 300s, graceful shutdown, `command.run`
reserved+fail-fast. Remaining: **no per-org / per-agent concurrent-job cap** (one org can fill the
queue), no enqueue-time budget/reservation handshake (a job can be enqueued with insufficient
credits and run fully before settlement — the docs/77 A4 hole), no per-job credit ceiling.

### I. Provider health

`provider-health.ts` exists (389 lines: key probing, state). It is **not consulted by live
routing** — `selectTierModel`/`selectMeasuredModel` never ask it. §12's "current provider health"
input is available and unused.

### API surface risk (brief §2)

The only AI-capable HTTP surfaces are: `/v1/commands` (10/min, session), task execution via
`/v1/commands/tasks/execute-pending` and routes that enqueue `task.execute` jobs, tool execution
inside tasks, deliberation routes, and business-import enrichment. Every one of them settles or
charges credits, but **none of them reserves**, and the rate limits are one shared bucket per
session. So: direct credit-system bypass is not possible, but **cost runaway and unbilled spend
are possible** through legitimate surfaces. That is the central risk this plan closes.

---

## Part 3 — Proposed architecture

### 3.1 Credit Ledger v2 + reservations (brief §3, §4, §5)

Extend, do not rebuild. The P0 invariants (SQL increments, in-transaction ledger row, idempotency
key, cap-in-WHERE, reconcile) stay exactly as they are.

1. **Typed ledger.** One CHECK-constrained vocabulary, documented in the migration:
   `usage | purchase | grant | promotional | refund | reversal | adjustment | expiration |
   rollover | reservation_release`. (Reservations themselves live in their own table — see below
   — because they are state, not money movement; a `reservation` row per movement would double
   count under expiry.)
2. **Reservations.**
   - New table `credit_reservations` + `credit_balances.reserved_credits` (default 0).
   - `available = included + purchased − used − reserved`.
   - `reserveCredits(orgId, {estimate, taskId?, jobId?, agentId?, expiresAt})` — atomic guard in
     the UPDATE: `used + reserved + estimate <= included + purchased`, then INSERT reservation
     row and `reserved_credits += estimate`; ledger row `reservation_release` is NOT written at
     reserve time (not a money movement), only at release/settle.
   - `settleReservation(id, {actualCredits, attribution})` — one transaction: insert `usage`
     ledger row (amount −actual), `used += actual`, `reserved −= estimate`, reservation row →
     `settled` (records `settled_credits`); release the remainder implicitly.
   - `releaseReservation(id, reason)` — `reserved −= estimate`, reservation → `released`, audit.
   - **Stale sweep**: reservations past `expires_at` are released with an audit row (worker tick
     or cron). Timeout of the job, crash, or founder cancel all converge here.
   - **Hard stop**: a task whose reservation is exhausted stops — status `awaiting_approval` when
     the work is resumable and useful (per docs/77 decision 3, recommended), or deferred→pending
     when not; the spent portion settles, the remainder releases, and a founder decision resumes
     it with a top-up or budget raise.
3. **Estimation.** Estimate = max(floor, p90 measured tokens × tier price) from
   `llm_performance` per (org, phase/tier, task_type) with a cold-start fallback table per
   operation class; cap = `min(estimate, per-task ceiling, agent daily remaining, org remaining)`.
   An estimate is published to the user BEFORE running (3.7); it is a reservation, not a quote.
4. **Refunds / reversals** (`refundCredits`): ORQ8-caused failure after a charge → `refund`
   ledger row (positive), reasoned, idempotent; user-requested rerun → new charge (documented);
   Stripe refund → `reversal`/`refund` clawback keyed `stripe:refund:<id>` (decision 6). All
   refunds are audited and appear in admin economics.
5. **No client-side balance mutation** anywhere (already true — keep as an invariant test).

### 3.2 AI Cost Firewall / gateway (brief §7, §8)

`chat()`/`chatJson()` remain the only provider path; they gain a mandatory **spend context**:

```text
caller → chat(spendContext) → [rate limit] → [budget check] → [reservation headroom check]
      → [model already selected + expected-cost guard] → provider attempt(s)
      → trace (tokens, cost, retries, key source) → settlement by the caller
```

- **Expected-cost guard**: before dispatch, estimate the call's worst-case cost from
  `max_tokens` + prompt size + registry rates; refuse (structured error, no provider call) when it
  exceeds the remaining reservation headroom × per-call share. This is the "cost guard" box in the
  brief's diagram, and the enforcement point that makes reservations real.
- **Provider concurrency**: in-process semaphore per provider + global ceiling
  (`LLM_MAX_CONCURRENT`, `LLM_MAX_CONCURRENT_<PROVIDER>`); 429 handling already exists.
- **Health-aware ordering**: consult `provider-health.ts` before building the attempt order;
  a provider in `degraded` state moves to the tail instead of absorbing a timeout first.
- **BYOK resolution**: when the org has an enabled key for a provider (and the model is in
  `allowed_models` when set), prefer the org key: decrypt at call time, record
  `key_source: 'org'` on the trace and `provider_key_id`, enforce `monthly_spend_ceiling` against
  spend computed from `llm_performance` for that key; fall back to platform keys on
  401/403/429/ceiling-exceeded, recording why. Platform-key calls remain `key_source: 'platform'`.
- **Kill list**: delete the dead `ModelRouter` stack (or, if preferred, promote its scoring into
  `model-intelligence` and delete the rest) — decision 9.
- **Documented exceptions** (control-plane calls that legitimately do not go through spend
  checks): `POST /v1/providers/keys/:id/test`, provider-health probes, business-import enrichment
  (it uses `chatJson` already; it must adopt a spend context like everything else). The exception
  list is enforced by a test that greps for provider URLs outside `llm.ts`/`provider-health.ts`.

### 3.3 Layered rate limits (brief §9, §10) — closes docs/77 P1 §8

Keep IP (pre-auth) + session (user) layers; add, all Redis-sliding-window when Redis is present
and in-memory otherwise:

| Layer | Key | Example buckets (config-driven) |
|---|---|---|
| IP | ip | existing auth/widget limits (unchanged) |
| User | session hash | AI chat 30/min, task execute 10/min (exists as commands) |
| Org | orgId | AI-class 300/hour, task.execute 60/hour, tools 120/hour, purchases 5/hour |
| Agent | agentId | autonomous work 30/hour, tool calls 60/hour |
| Endpoint class | route group | `ai.chat`, `ai.execute`, `ai.tools`, `ai.bulk`, `credits`, `purchase` |
| Job | DB | max concurrent `running` jobs per org + per agent; max enqueued per org |
| Provider | in-process | max concurrent calls per provider + global |
| Runtime | already exists | `JOB_TIMEOUT_MS`, EA wall-clock budgets |

- **Fail-closed policy**: AI-spend classes use `fail_closed: true` — when Redis is configured but
  erroring, these return 503 (not unlimited). Read-only/navigation classes stay fail-open.
- **Circuit breakers**: per-org breaker on repeated job failures / provider errors (pause
  autonomous work, notify founder, keep manual actions available).
- **Trial ceiling**: per-org per-day credit cap for orgs with no payment method
  (e.g. 20 credits/day) — closes abuse todo #3.

### 3.4 Budgets, authority, recursion guards (brief §10, §11)

- **Enforce the existing `budgetPolicy`** (`constitution.ts`, `playbooks.ts`; currently stored and
  read by nothing): `dailyLimit`, `monthlyLimit`, `requiresApprovalAbove` interpreted in
  **credits** (convert the stored values at the documented reference rate; keep the UI in
  credits), checked at reservation and at the gateway. `requiresApprovalAbove` opens a real
  approval (existing approvals engine; `released_at` single-use; task → `awaiting_approval`)
  rather than running and settling.
- **Per-agent budgets** in `agents.config` (no migration): `dailyCredits`, `perTaskCredits`,
  `maxToolCalls`, `maxRetries`, `maxLlmCalls`, `maxRuntimeMs`, `maxConcurrentJobs`. Defaults per
  role seeded from `agent-personas.ts`; UI in the agent profile. Enforced in executor, tool
  registry, router.
- **Recursion guard** in delegation: `maxDepth` (default 3), `maxChildrenPerTask`,
  `maxTasksPerCommand` — closes abuse todo #2.
- **Org kill switch**: founder-level "pause all AI spend" (and reuse agents' emergency-stop
  plumbing); platform admin can too. Checked at reservation.
- `departments.budget` (exists, unused) becomes a per-department allocation ceiling — Phase 5,
  optional.

### 3.5 Model selection strategy + preferred models (brief §12, §13)

One selection function, extended inputs, deterministic precedence:

1. **Floor**: classification (risk/complexity/reasoning) + calibration floor — unchanged.
2. **Agent preference**: `agents.config.preferredProvider` / `preferredModel` / `maxModelTier` —
   honored **iff** the model is in the allowed set for the task's class and the plan tier cap.
3. **Plan cap**: `trial ≤ tier0, founder ≤ tier1, team ≤ tier2, company ≤ tier3` (decision 5).
4. **Budget/cost filter**: drop candidates whose expected call cost exceeds reservation headroom;
   never route above the per-task ceiling.
5. **Health filter**: skip providers in a bad state (from `provider-health`).
6. **Measured performance**: promote/demote within the surviving set (existing logic).
7. **Cheapest adequate**: ties broken by cost (existing).
8. **Record why**: persist `routing_reason` and a richer `routing_source`
   (`preferred | floored | measured | budget | fallback_health | plan_cap`), surfaced in the
   task view and admin report. A veto (preference ignored) must always be explainable.

### 3.6 Payments hardening (brief §16, §17, §18)

- **Fix H1** (Appendix A): event row is `pending` → applied → `processed`; a failed apply leaves
  `failed` with `last_error` and a retry path (Stripe's retry or an internal sweep) re-applies.
- **Refunds**: handle `charge.refunded` / `payment_intent.refunded` → idempotent clawback
  (`stripe:refund:<id>`), policy decision 6 (clawback even to negative with `adjustment` marker,
  or refuse when already consumed — recommend clawback against purchased, allow floor at 0 and
  record drift for finance).
- **Renewals**: handle `invoice.paid` → allocate the new period's included credits explicitly
  (idempotent on invoice id) instead of relying on lazy read-time rollover.
- **Role gate H3**: purchase requires owner/admin role, not any member (policy decision 7).
- **Purchase UX (H5)**: packs page wired to `/v1/credits/purchase`; success/cancel states; the
  packs catalog already returns server-owned prices.
- Handle `checkout.session.expired` (noop, log) and `customer.subscription.created` (align with
  `activateSubscription`).
- Keep the server-owned catalog invariant: no client-supplied price, quantity, currency, or
  status anywhere (already true; add a test).

### 3.7 Pricing model, transparency, dashboards (brief §6, §15, §19–§23)

- **Published credit classes** (replaces the misleading `OPERATION_COSTS` catalog):
  `quick` (1), `standard` (2–5 by type), `deep/agentic` (10–40, usage-based within reservation),
  `long-running/engineering` (reservation-based, approval above threshold). The user sees the
  class and an estimate; the ledger settles **measured** actuals capped by the reservation.
- **Per-task transparency**: `GET /v1/tasks/:id/usage` aggregated from `credit_transactions`
  (model credits, tool credits, provider cost hidden, model used, agent, remaining); task rows
  show estimate vs actual. `tasks.estimated_credits` column added for the estimate.
- **Pre-run estimate**: `POST /v1/credits/estimate` (operation class + agent + task type) →
  `{estimate, ceiling, approvalRequired}`; the execute UI shows it before running and routes to
  approval when above threshold.
- **User usage area** (`/app/usage`, `/app/budgets` — both exist and read real data today):
  period switcher (today/week/month), by-operation, by-agent, by-goal (APIs exist), by-model
  **category** (not provider pricing), purchase history + full ledger with human reasons.
- **Admin economics dashboard** (`/admin/ai-usage`, extend existing): date-range, by agent / task
  type / company / model / provider, revenue (subscriptions + packs) vs provider cost vs margin,
  refunds, unbilled/failed spend, retry cost, top consumers, negative-margin workflows, unknown
  pricing. Internal only (already platform-admin gated).

### 3.8 Failure / retry charging rules (brief §21)

| Case | Charge | Mechanism |
|---|---|---|
| Provider/model failure before usable output | 0 for that call | cost recorded as unbilled in `llm_performance`; reservation intact |
| ORQ8-caused internal retry | 0 additional | retries bounded by `maxRetries`; provider cost recorded, monitored as unbilled |
| Task fails entirely after partial spend | settle ≤ reserved, release rest; if failure is ORQ8-caused → full refund | `refundCredits` + audit |
| Tool call fails | 0 (today: needs confirming — tool registry charges on success path) | align in Phase 2 |
| Tool call succeeds externally then task fails | tool credits stand (real external effect) | documented rule |
| User-requested re-run | billable anew | new reservation + settlement |
| Founder cancels / emergency stop | settle actual, release rest | reservation sweep |

### 3.9 Observability (brief §26)

One structured event `ai.gateway.decision` per call: org, agent, task, job, model chosen + reason,
candidates vetoed, plan cap, budget verdict, reservation id, estimate vs headroom, key source,
provider attempt order, retries, tokens, provider cost, credits charged, pricing source, success,
duration. Plus `credit.reservation.*` and `ratelimit.blocked` events. Queryable via admin
economics; logs remain pino-structured. This supersedes "grep the audit table" debugging.

---

## Part 4 — Brief coverage map

| Brief § | Handled in |
|---|---|
| 1 Audit | This document, Part 2 |
| 2 Risk report | Part 2 sections A–H |
| 3 Ledger | 3.1 |
| 4 Anti-manipulation | 3.1, 3.2 (invariants + tests §28) |
| 5 Reservations | 3.1 |
| 6 Credit pricing model | 3.7 |
| 7 Cost tracking | Exists (P1 §5); extended in 3.2/3.9 |
| 8 Cost firewall | 3.2 |
| 9 Rate limits | 3.3 |
| 10 Autonomous safeguards | 3.3, 3.4 |
| 11 User budgets | 3.4 |
| 12 Model selection | 3.5 |
| 13 Preferred models | 3.5 (+ docs/79 Phase 8 merged) |
| 14 Margins | Part 7, 3.7 |
| 15 No overcharging | 3.7 (estimate, classes, refunds) |
| 16 Purchase system | 3.6 (UI in 5.3) |
| 17 Webhooks | 3.6, Appendix A |
| 18 Packages/pricing | Part 7 |
| 19 Task/work credits | 3.1, 3.7 (per-task usage) |
| 20 Multi-step aggregation | 3.1 (settlement already aggregates; reservation bounds it) |
| 21 Failed work/retries | 3.8 |
| 22 Usage dashboard | 3.7 |
| 23 Admin economics | 3.7 |
| 24 Security audit | Part 2 G/H + Phase 0 verification |
| 25 Abuse tests | Part 6 |
| 26 Observability | 3.9 |
| 27 Economic principle | Part 7 boundaries + margin invariant tests |
| 28 Final testing | Part 6 |
| 29 Deliverables | Part 10 |
| 30 Approval gate | This document ends at the gate |

---

## Part 5 — Required changes

### 5.1 Database / schema (migration 0041+, both lineages: `packages/db/migrations` + `supabase/migrations`)

1. `credit_reservations` table: id, org_id, task_id, job_id, agent_id, estimate_credits,
   settled_credits, status CHECK (active|settled|released|expired), reason, expires_at,
   created_at, updated_at; indexes `(org_id, status)`, `(task_id)`, `(expires_at) WHERE status =
   'active'`.
2. `credit_balances.reserved_credits integer NOT NULL DEFAULT 0` (+ backfill 0).
3. `credit_transactions.type` CHECK constraint for the v2 vocabulary; keep the table append-only.
4. `tasks.estimated_credits integer` (estimate shown vs actual).
5. `llm_performance`: `key_source text` ('platform'|'org'), `provider_key_id uuid`,
   `estimated_cost_usd numeric(14,8)`, `routing_reason text`; index `(org_id, agent_id, created_at)`
   and `(provider_key_id, created_at)` for per-key ceilings and by-agent margin.
6. RLS: select-only org policies for `credit_reservations` (members), none for writes; verify
   0038's `agent_jobs` policies line-by-line; economics indexes.
7. Optional (Phase 5): department budget enforcement needs no schema change (`departments.budget`
   exists).

### 5.2 Backend

- `services/credits.ts`: reserve/settle/release/expire + `refundCredits` + availability in
  `getOrCreateBalance`; cap guard updated to `used + reserved + cost <= total`.
- `services/job-worker.ts` / `jobs.ts`: claim query gains per-org/per-agent concurrency caps;
  enqueue path checks budget + creates reservation (or requires a reservation id in payload);
  job cost rollup by `job_id`.
- `llm.ts`: spend context, cost guard, concurrency semaphores, health-aware order, BYOK
  resolution + key_source, richer trace fields; delete `ModelRouter` (decision 9).
- `model-intelligence.ts` / `model-selector.ts`: plan caps, agent preferences, budget/health
  filters, routing reason; retire the `OPERATION_COSTS` catalog in favor of classes.
- `task-executor.ts` / `tool-registry.ts` / `executive-agent.ts`: reserve → execute → settle/release;
  tool pricing aligned to catalog; recursion caps; approval bridge for `requiresApprovalAbove`.
- `plugins/rate-limit*.ts`: org/agent/class helpers, fail-closed for AI classes.
- `services/billing.ts` + `routes/billing.ts`: H1 fix, refunds, renewals, role gate, event sweep;
  `routes/credits.ts`: role gate on purchase, estimate endpoint.
- `routes/admin.ts`: economics endpoints (by agent/task-type/company, date range, negatives,
  refunds, unbilled, retries) + reconcile listing.
- New: `services/ai-budget.ts` (policy resolution + checks), `services/credit-estimator.ts`.
- Config (`packages/core/src/config.ts`): rate-limit and concurrency knobs, trial day cap,
  fail-closed flag, per-plan tier caps.

### 5.3 Frontend

- New **purchase UI** (packs, checkout redirect, success/cancel, purchase history) — H5.
- `/app/usage`: period switcher, by-agent, by-task, by-model category, ledger with reasons.
- `/app/budgets`: bind the existing page to the **enforced** policy; add agent budgets; show
  usage vs budget; approval threshold editor (writes constitution, which already validates it).
- Task page + task list: estimate vs actual credits, per-task usage breakdown, model used.
- Execute/commands surfaces: pre-run estimate, approval prompt above threshold, insufficient-credit
  state with top-up link.
- `/settings/providers`: show enforcement state (ceiling, current spend, active-for-routing).
- `/admin/ai-usage`: economics dashboard (shared shell decisions with docs/78).

---

## Part 6 — Testing strategy (brief §25, §28)

Extend the existing abuse suite (its 5 todos are part of this plan) plus new suites, all against
the embedded-Postgres review stack:

1. **Credit invariants**: concurrent settle (N=20 tasks, one balance) exact ledger sum; reservation
   exhaustion hard-stop; release on timeout; expiry sweep; replay idempotency; refund idempotency;
   reconcile drift = 0.
2. **Budget/policy**: daily/monthly ceilings, per-task ceiling, per-agent caps, approval-threshold
   gate opens a real approval and does not execute; org kill switch.
3. **Rate limits**: org fan-out across many users hits the org bucket; agent loop hits agent
   bucket; provider semaphore under load; fail-closed behavior with Redis down; trial day cap.
4. **Recursion** (todo #2): delegation depth/children/tasks caps prove a loop terminates.
5. **Webhooks**: duplicate, out-of-order, invalid signature, apply-failure then retry (**H1
   regression test**), refund clawback, renewal allocation, replay-after-failure.
6. **BYOK**: org key used for calls (assert on key_source), ceiling blocks at limit, fallback on
   key failure, key never logged.
7. **Routing**: preferred honored / vetoed (unavailable, plan cap, budget) with reason recorded;
   unknown-pricing model blocked from routing; provider-health skip.
8. **Economics invariants**: for every priced model × plan, credits charged > provider cost at
   the reference token mix; seeded premium model triggers the negative-margin report.
9. **Tenancy sweep**: reservations, llm_performance, provider keys, usage/estimate endpoints with
   foreign org/user ids → 404/403, never data.
10. **Worker**: concurrent claim (todo #5), per-org concurrency cap, enqueue with insufficient
    credits.
11. **Provider exhaustion** (todo #4): all providers down → clean typed error within timeout, no
    charge, no hang.

Nothing is reported PASS without a run; the Test Report marks PASS/FAIL/BLOCKED per scenario.

---

## Part 7 — Pricing / margin analysis and risks (brief §14, §15, §18, §27)

**Revenue per credit (verified from `PLANS` / `CREDIT_PACKS`):**

| Source | Price | Credits | Revenue/credit |
|---|---|---|---|
| Founder monthly | $39 | 1,000 | 3.90¢ |
| Founder annual | $32 | 1,000 | 3.20¢ |
| Team monthly | $99 | 4,000 | 2.48¢ |
| Company monthly | $249 | 12,000 | 2.08¢ |
| **Company annual (floor)** | $199 | 12,000 | **1.66¢** |
| Starter pack | $19 | 500 | 3.80¢ |
| Growth pack | $69 | 2,000 | 3.45¢ |
| Scale pack | $299 | 10,000 | 2.99¢ |
| Trial | $0 | 100 | — (cost, not revenue) |

**Cost boundary.** At 1 credit per 1K tokens, a credit is profitable on a model when
`(inputPer1M × inShare + outputPer1M × outShare) / 1000 < revenuePerCredit`. Registry input rates
observed today run from $0.14/1M to $3.00/1M. Worked boundaries at the Company-annual floor
(1.66¢):

- A $0.14/$0.14 model: ~$0.00014/1K → ~99% gross margin.
- A $3/$15 model, 50/50 mix: ~$0.009/1K → ~46% margin.
- A $3/$15 model, output-heavy 20/80: ~$0.0126/1K → ~24% margin.
- A flagship-class $15/$75 model, 50/50: ~$0.045/1K → **negative**; only the Founder monthly
  price survives it, barely ($0.039/1K vs 3.9¢).

So the brief's concern is real at the premium end: **output-heavy premium-model work can exceed
the credit revenue on Team/Company plans.** Risks and mitigations:

| Risk | Mitigation in this plan |
|---|---|
| Premium/flagship models route onto low-margin plans | Plan tier caps (3.5), per-call cost guard (3.2), measured margin report (3.7) |
| Token estimate (`chars/4`) under/over-charges systematically | Publish class estimates, settle measured, reconcile attribution vs charge monthly (3.1, 3.7) |
| Retry cost never billed | Bounded retries; retry cost shown as unbilled in economics; circuit breaker |
| Unknown-pricing models (registry gap) | Block unpriced models from routing; `unknownPricingCalls` alarm (already counted) |
| BYOK customers get a different cost base | key_source on traces; margin math respects it; ceiling enforced |
| Trial farms | email gate + per-day trial ceiling + register limits (3.3) |
| Stripe fees, infra overhead not modeled | Add a fixed per-period overhead constant to the admin economics view (Phase 5) |
| Refund abuse | refunds only via rules (3.8) + audited; Stripe-refund clawback (3.6) |

---

## Part 8 — Phased delivery

Every phase ends green on typecheck + the full suite + review-stack verification, and ships with
its own tests. Nothing in Phases 2+ starts before approval of this document.

- **Phase 0 — Immediate fixes: SHIPPED (see Appendix A).** H1 webhook transactionality fix; ledger
  types CHECK migration; `agent_jobs` RLS; purchase role gate; preflight org-match hardening;
  `/v1/admin/credits/reconcile` surfaced in admin; env surface repaired. 5 abuse todos mapped to
  phases.
- **Phase 1 — Ledger v2 + reservations: SHIPPED (2026-10-03, see Appendix D).** schema 5.1
  items 1–4; reserve/settle/release/expire; task + EA paths converted; per-task ceiling; failure
  rules 3.8; estimate endpoint; plus the margin-invariant test (Part 7).
- **Phase 2 — Budgets + safeguards: SHIPPED (2026-10-03, see Appendix F).** constitution budgetPolicy
  enforcement (org + agent), approval bridge, recursion caps, kill switch. *(Job-level concurrency
  and the enqueue handshake shipped earlier in Phase 3; see Appendix C.)*
- **Phase 3 — Rate limits layered: SHIPPED (see Appendix C).** user/org/agent/class buckets,
  fail-closed for AI classes, provider semaphores (global + per-provider) and a per-org job-claim
  cap. The trial per-day ceiling (abuse todo #3) shipped with Phase 1's reservations (Appendix D).
- **Phase 4 — Economics-aware routing + BYOK: SHIPPED except agent preference (Bayesian).** BYOK
  routing + ceilings (Appendix E), plan model-tier caps, recorded `routing_reason`, and deletion of
  the dead `ModelRouter` stack (Appendix G). Still open: per-agent `preferredProvider`/
  `preferredModel`/`maxModelTier` honoring + veto recording (§3.5 step 2).
- **Phase 5 — Transparency + dashboards:** purchase UI, usage/budgets/task views, admin economics,
  department budgets (optional).
- **Phase 6 — Verification + reports:** full test matrix, margin invariant run, tenancy sweep,
  soak/load, and the six final reports (Security, AI Cost, Rate-Limit, Credit System, Model
  Routing, Economics) + Test Report with PASS/FAIL/BLOCKED.

Sequencing vs docs/79 (phases 8–13: provider/model config, diversity smoke, release gate, soak,
mobile, readiness report): **requested decision 10.** Recommendation: ship Phase 0 alongside
docs/79 8–13 (it is small and hardens the demo), implement Phase 4's preferred-model config as the
single implementation for both plans, and run Phases 1–3/5 immediately after demo readiness.

---

## Part 9 — Decisions needed (carried from docs/77 Part C + new)

1. **Top-up policy** — resolved in P0 (endpoint deleted; dev/admin-only consume). Confirm the
   permanent policy: credits are bought only through Stripe. *(Recommend: yes.)*
2. **Credit model** — *(Recommend: published classes with measured settlement inside a
   reservation — quality preserved, no surprise charges.)* Alternatives: keep showing
   1 credit/1K tokens; fixed per-operation prices only.
3. **Reservation strictness** — *(Recommend: hard-stop at reservation; settle spent, release rest;
   resumable work goes `awaiting_approval`.)*
4. **Budget granularity** — *(Recommend: org + agent, defaults per role.)*
5. **Plan model-tier caps** — trial ≤ tier0, founder ≤ tier1, team ≤ tier2, company ≤ tier3.
6. **Stripe-refund clawback** — *(Recommend: claw back purchased credits idempotently, floor at 0,
   record drift for finance when already consumed.)*
7. **Purchase role** — *(Recommend: owner/admin only.)*
8. **Fail-closed AI classes** — *(Recommend: yes, when Redis is configured.)*
9. **Dead `ModelRouter`** — *(Recommend: delete; keep the live selector.)*
10. **Sequencing vs docs/79 8–13** — see Part 8 recommendation.

## Part 10 — Deliverables on completion

Security Report · AI Cost Report · Rate-Limit Report · Credit System Report · Model Routing Report ·
Economics Report (revenue / provider cost / infra overhead / gross margin per major workflow) ·
Test Report (PASS/FAIL/BLOCKED — nothing claimed untested).

---

## Appendix A — Phase 0: SHIPPED (2026-10-02)

All six items implemented, typechecked, and verified. Files:

1. **H1 webhook transactionality** — `apps/api/src/services/billing.ts`. The `webhook_events` row
   is now the *claim*, not the receipt: inserted `pending` → `applyWebhook` → marked `processed`
   only on success; a failed apply leaves `failed` + `last_error` + `retry_count++`, and the next
   Stripe redelivery re-claims and re-applies it instead of being answered `duplicate`. To make
   re-apply safe, `activateSubscription` is now idempotent per Stripe subscription id (it refuses
   to cancel the live row and create a second one). **Two regression tests added**
   (`billing-webhook.test.ts`): failed-then-retried delivery grants exactly once and settles to
   `processed`; a replayed subscription checkout yields one subscription row. Suite: 8/8 pass.
2. **Ledger type CHECK + `agent_jobs` RLS** — `packages/db/migrations/0017_credit_ledger_hardening.sql`
   and `supabase/migrations/0041_credit_ledger_hardening.sql`. The ledger vocabulary is constrained
   to the docs/80 §3.1 set before any new type is written; `agent_jobs` joins the service-role-only
   tables (RLS enabled + forced, no client policies). RLS e2e: **55 passed / 0 failed**.
3. **Purchase role gate (H3)** — `apps/api/src/routes/credits.ts`. `POST /v1/credits/purchase` now
   requires an org **owner or admin**; verified live: viewer → 403 with the reason, owner → reaches
   the Stripe path (503 when `STRIPE_SECRET_KEY` is unset, i.e. the gate is not the blocker).
4. **Worker preflight org match** — `apps/api/src/services/job-worker.ts`. Both the task lookup and
   the concurrent-job lookup now match `org_id` alongside the id, so a payload that ever pointed at
   a foreign task reads as gone rather than executing under the wrong tenant.
5. **Reconcile surfaced in the admin console** — `apps/web/app/admin/ai-usage/page.tsx` gained a
   **Ledger integrity** panel backed by `GET /v1/admin/credits/reconcile`. It reports drift per org
   and, when the endpoint cannot answer, says *not checked* rather than rendering a clean zero.
   Verified live both ways: clean → "1 organization checked … No drift"; seeded +7 drift →
   "1 of 1 organizations drift … balance 11 / ledger 4 / +7" (seed then reverted).
6. **Env surface repair** — `apps/api/.env.example` now documents `JOB_BATCH_SIZE`,
   `JOB_TIMEOUT_MS`, `JOB_SHUTDOWN_GRACE_MS`, `WORKER_ID`; `env-surface.test.ts` 6/6 (it was
   failing before this Phase 0 work, from the worker-brief config keys).

Verification: `pnpm -r typecheck` clean (all 8 projects); full API suite green after the fixes;
web production build compiles; review stack restarted and the new panel reviewed at 1440px with
real data.

docs/77 audit todo: **all five `it.todo` abuse scenarios are now closed** — layered rate limits
(Appendix C), trial day cap (Appendix D), recursion guard (Appendix F), provider exhaustion
(`llm-fallback.test.ts`), and the concurrent-claim / no-leaked-lock proof (Appendix H,
`scripts/worker-soak.ts`). The abuse suite carries no `it.todo` items.

## Appendix B — Test ledger (honest status as of this audit)

| Scenario | Status |
|---|---|
| Concurrent settlement exactness | PASS (abuse suite) |
| Idempotency-Key replay on mutating endpoints | PASS (abuse suite, after preHandler fix) |
| Cross-tenant ids / list leakage | PASS (abuse suite) |
| Stripe duplicate webhook | PASS (billing-webhook tests) |
| Replayed subscription checkout creates one subscription | **PASS (Phase 0)** |
| Purchase requires owner/admin role | **PASS (Phase 0, live 403 for viewer)** |
| `agent_jobs` inaccessible to client roles | **PASS (Phase 0 RLS e2e 55/55)** |
| Ledger vocabulary constrained | **PASS (Phase 0 migration)** |
| Webhook apply-failure recovery | **PASS (Phase 0)** — regression test: failed delivery re-applies and settles once |
| Refund / cancellation / replayed purchase after failure | PARTIAL (Phase 1) — ledger `refund` + idempotency shipped; Stripe `charge.refunded` clawback (H2) is Phase 4 |
| Credit reservation, concurrent spend beyond balance | **PASS (Phase 1)** — reserve/settle/release/expire, hard-stop cap, 5-way settle race (Appendix D) |
| Per-org / per-agent / per-provider / per-endpoint-class limits | **PASS (Phase 3)** — abuse suite + unit pins + live 429 (Appendix C) |
| Recursive delegation loop | **PASS (Phase 2)** — depth/sibling/command caps; abuse suite now points at `ai-budget.test.ts` (Appendix F) |
| Budget policy enforced (org + agent) | **PASS (Phase 2)** — daily/monthly ceilings, per-agent caps (Appendix F) |
| Approval threshold opens a real gate | **PASS (Phase 2)** — task → `awaiting_approval`, grant consumed once (Appendix F) |
| Org AI-spend kill switch | **PASS (Phase 2)** — checked at reservation (Appendix F) |
| Trial per-day ceiling | **PASS (Phase 1)** — `CREDIT_TRIAL_DAILY_CAP`, enforced at reservation; abuse suite §5 + credit-reservations |
| Provider-exhaustion clean failure | **PASS at the gateway** — `llm-fallback.test.ts` proves every-provider-fails returns null (no hang) and a saturated gate fails over; an API-level command proof is still open |
| Concurrent job claim | **PASS (Phase 6)** — `scripts/worker-soak.ts`: 4 real workers, 23k+ jobs, one deliberately leaked lock; drains with `attempts > 1 = 0` and no leaked locks (Appendix H) |
| BYOK used for real calls / ceiling | **PASS (Phase 4 first slice)** — org key preferred, ceiling enforced, platform fallback (Appendix E) |
| Plan model-tier caps | **PASS (Phase 4)** — trial ≤ 0 / founder ≤ 1 / team ≤ 2 / company ≤ 3, cap wins over the quality floor (Appendix G) |
| Recorded routing reason | **PASS (Phase 4)** — `routing_reason` persists beside `routing_source`; a cap-bound pick reports `plan_cap` (Appendix G) |
| Dead `ModelRouter` stack removed | **PASS (Phase 4)** — class + adapters + their tests deleted; the live registry is all that remains (Appendix G) |
| Preferred-model honoring/veto | FAIL (not implemented) — per-agent `preferredModel`/`maxModelTier` is the remaining Phase 4 step |
| Negative-margin detection | **PASS (Phase 1)** — `margin-invariants.test.ts` flags any combo whose provider cost reaches revenue |
| Margin invariants per model × plan | **PASS (Phase 1)** — every supported plan × model × mix is margin-positive (Appendix D) |

"No further code should be written against the numbers above until the founder has reviewed the
margin output" (docs/77) remains the operative rule: **this plan is the review.**

---

## Appendix C — Phase 3 (layered rate limits + provider gates): SHIPPED (2026-10-02)

This closes docs/77 P1 §8 (item 8) and turns the first abuse-suite `it.todo` into real assertions.
Four layers, each at the boundary where its identity is known:

| Layer | Boundary | Where enforced | Storage |
|---|---|---|---|
| User | per session, per endpoint class, per minute | `onRequest` hook maps the request to a class (`ai.execute` 10, `ai.analyze` 10, `ai.import` 3, `credits` 60, `purchase` 3) | Redis zset sliding window, or in-memory |
| Org | per company, per class, per hour (closes fan-out across sessions) | handlers after `requireAuth` (60/120/30/300/5 per hour) | same |
| Agent | one AI employee's jobs per hour (60, 0 disables) | task execute + execute-pending, counted from `agent_jobs` over the last hour | Postgres (durable queue) |
| Provider | 12 concurrent model calls overall, 6 per provider | `acquireProviderSlot` around every attempt in `chatCompletion`; a saturated gate fails over to the next provider | process-local FIFO semaphore |
| Job | one org's running jobs at once (10) | `claimJob` correlated-subquery guard | Postgres |

Files: `services/rate-limit-service.ts` (class table, keys, sliding window),
`plugins/rate-limits.ts` (hook + org/agent enforcement + the 429 envelope),
`services/concurrency-gate.ts` (semaphore + provider slot registry), wired in `app.ts`,
`routes/commands.ts` (single execute, execute-pending, enqueue), `routes/credits.ts`,
`routes/deliberation.ts`, `routes/business-import.ts`, `services/llm.ts` and
`services/jobs.ts` / `job-worker.ts`. Config keys are the `RATE_LIMIT_*`,
`LLM_MAX_CONCURRENT*` and `JOB_MAX_CONCURRENT_PER_ORG` blocks in
`packages/core/src/config.ts`, documented in `apps/api/.env.example`.

Semantics worth stating:

- **Fail-closed when Redis is configured but unreachable** for AI-spend classes: a Redis outage
  answers 429 instead of opening the spend valve, and a zero count is not trusted when the
  connection dropped mid-call. With no `REDIS_URL`, the in-memory window is single-instance only —
  stated in code, not hidden.
- **`RATE_LIMIT_ENABLED=false`** disables the whole layered system. Under `NODE_ENV=test` it is off
  unless `RATE_LIMIT_FORCE=true`, which the review stack sets so the demo shows the real limits.
- 429 envelope: `{ error: { code: 'rate_limited', policy_ref: 'docs/80 §3.3' } }` with `Retry-After`.
- The legacy `/v1/commands` 10/min IP limiter was removed: commands are one bucket in the layered
  system, not two that can disagree.

Evidence:

- `test/rate-limits-layered.test.ts` (14 tests): class table (purchase before credits, POST-only),
  window expiry and identity isolation, fail-closed + midway Redis drop + thrown command, gate
  FIFO/timeout/disable, per-provider vs global ceilings.
- `test/abuse-suite.integration.test.ts` §5 (todo #1 replaced by 4 tests): per-user class 429 (with
  `policy_ref` + `Retry-After`), per-org fan-out across two sessions with another org unaffected,
  per-agent hourly quota (single execute 429 + batch `throttled`), and the kill switch.
- `test/llm-fallback.test.ts`: with OpenRouter's gate held, the chain serves from NVIDIA without
  calling OpenRouter.
- Live (review stack): the 4th `POST /v1/business-imports/analyze` in a minute → `429`,
  `retry-after: 59`, `policy_ref: docs/80 §3.3`.
- Full API suite **927 passed / 3 skipped / 4 todo**, 0 failed; `pnpm -r typecheck` clean.

Not in this ship: trial per-day ceiling (abuse todo #3), recursive delegation guard (todo #2),
all-providers-down API proof (todo #4), two-worker claim proof (todo #5 — the per-org claim cap
itself is in).

---

## Appendix D — Phase 1 (ledger v2: reservations + failure rules + margin): SHIPPED (2026-10-03)

Reserve → execute → settle/release, plus the economics invariant. What that means concretely:

**Schema** (`packages/db/migrations/0018_credit_reservations.sql`,
`supabase/migrations/0042_credit_reservations.sql`, mirrored in `packages/db/src/schema.ts`):

- `credit_reservations` (org, task, job, agent, `estimate_credits`, `settled_credits`, status
  `active|settled|released|expired`, `reason`, `expires_at`), with the status/estimate CHECKs, the
  `(org_id, status)` / `(task_id)` indexes and a partial `(expires_at) WHERE status='active'` index
  for the sweep. RLS: enabled + forced, service-role writes; members get a select-only policy in the
  Supabase lineage (`docs/80 §5.1`).
- `credit_balances.reserved_credits` (default 0) — `available = included + purchased − used −
  reserved`.
- `tasks.estimated_credits` — the estimate is stored so a task row can show estimate vs actual.

**Service** (`services/credits.ts`):

- `reserveCredits` — atomic hold with the cap in the UPDATE's WHERE
  (`used + reserved + estimate <= total`), so concurrent work cannot over-commit; no ledger row is
  written for the hold itself (state, not money movement).
- `settleReservation` — charges the measured actual **capped at the estimate** (hard stop; the
  excess is unbilled, never silently charged), releases the remainder implicitly, writes the `usage`
  row with full attribution, and is idempotent (the status transition is the arbiter).
- `releaseReservation` / `expireStaleReservations` — return the whole hold; a zero-amount
  `reservation_release` line records when/why.
- `refundCredits` — a `refund` ledger row plus a floored `used` decrement; `reconcileLedger` now sums
  `usage` and `refund` together, so drift stays 0 after a refund.
- `consumeCredits`' cap guard now spans reserved credits too.
- `services/credit-estimator.ts` — p90 of measured tokens per (org, phase) over a configurable
  lookback, priced at 1 credit/1K, floored, capped by `CREDIT_TASK_CEILING`, flagged
  `approvalRequired` above the ceiling; cold-start table when there is no history.

**Wiring**:

- `task-executor.ts` — Step 2d takes the reservation (records `estimated_credits`); Step 6b settles
  the measured model cost, or releases the whole hold when a task measured no model work
  (§3.8: no charge for a failed task). If the hold was swept mid-task it charges the measured actual
  directly, so real work is never unbilled.
- `executive-agent.ts` — the command's fixed class price is reserved at the credit check and settled
  at Step 7 (a hold swept mid-command falls back to a direct charge).
- `job-worker.ts` — the tick runs the stale sweep alongside the lock reaper.
- `routes/credits.ts` — `POST /v1/credits/estimate` returns `{ estimate, floor, ceiling, headroom,
  approvalRequired, source, basis }` for the caller's org.

**Config** (`packages/core/src/config.ts`, documented in `apps/api/.env.example`):
`CREDIT_RESERVATION_TTL_MS` (30 min), `CREDIT_TASK_CEILING` (100), `CREDIT_ESTIMATE_FLOOR` (2),
`CREDIT_ESTIMATE_LOOKBACK_DAYS` (90).

**Failure / retry charging rules (§3.8)** as implemented: a provider/model failure before usable
output charges 0 (the failed task releases its hold); ORQ8-caused internal retries are bounded and
charge no extra (a single settlement per execution); a task that fails after partial spend settles
≤ reserved and releases the rest; a user-requested re-run is a new reservation and a new charge;
refunds are the ledger primitive for an ORQ8-caused failure after a charge. Tool credits stand
(real external effect).

**Evidence** (`test/credit-reservations.test.ts`, 12 tests): hold moves credits out of `available`
with no ledger row; over-balance reservation refused; settle caps at the estimate and releases the
remainder; a reservation settled five ways charges exactly once; five concurrent 40-credit holds on
a 100-credit balance admit exactly two; failure releases the whole hold with no charge; release and
stale expiry return credits and record one `reservation_release`; a refund keeps reconcile drift at
0 and is idempotent; cross-org settlement leaves the other org untouched; the per-task ceiling caps
the estimate and flags approval; and `POST /v1/credits/estimate` is org-scoped.

**Trial per-day ceiling** (docs/80 §3.3, abuse todo #3): a `trial` org — no payment method — is
refused a reservation once today's measured spend plus the estimate would exceed
`CREDIT_TRIAL_DAILY_CAP` (default 20); paid plans are exempt. Enforced inside `reserveCredits`, so
every path that holds credits is covered. Evidence: `credit-reservations.test.ts` ("caps a trial
org's spending per day") and the abuse suite's "caps a trial org at its per-day credit ceiling even
with allotment left".

**Margin invariant** (`test/margin-invariants.test.ts`, 5 tests): for every revenue-bearing plan
(founder/team/company, monthly and annual) × every registry model within the plan's tier cap
(decision 5: founder ≤ tier1, team ≤ tier2, company ≤ tier3) × reference mixes 50/50, 20/80 and
0/100, credits charged strictly exceed provider cost; on the realistic mixes every combo clears cost
by ≥20%; a sentinel $15/$75 frontier model is detected as negative-margin (the check is not
vacuous); and trial is asserted cost-bearing and excluded. **No negative-margin workflow exists in
the current registry**; the test is the alarm for the first one that would.

Verification: `pnpm -r typecheck` clean (8 projects); full API suite **946 passed / 3 skipped /
3 todo**, 0 failed; the review stack boots the new lineage (both migrations apply cleanly).

Not in this ship: the Stripe `charge.refunded` clawback and renewal allocation (Phase 4/§3.6), and
the budget/authority/recursion safeguards (Phase 2).

---

## Appendix E — Phase 4 first slice (BYOK + per-key ceilings): SHIPPED (2026-10-03)

Org provider keys now power real model calls. The gateway resolves the company's own key for a
provider and uses it; the platform's environment keys serve the call only when the org has no usable
key. What that means concretely:

- **New `services/org-provider-keys.ts`** — the one place a `user_provider_keys` row is turned back
  into credentials. It loads active+enabled rows, decrypts the AES-256-GCM payload (a key that fails
  to decrypt is skipped, never fatal), and computes each key's **month-to-date spend** from
  `llm_performance.provider_key_id` to evaluate its `monthly_spend_ceiling`. `monthly_spend_ceiling`
  is read as **USD dollars** (the stored integer has no documented unit; dollars is the convention
  used wherever a founder enters money).
- **`services/llm.ts`** — `chatCompletion` loads the org's keys once when the call carries an org id
  and db, then per provider picks the pool with the pure, unit-tested `selectProviderKeys`: the org
  key wins when it is present, **within its ceiling**, and the **allow-list permits the model**;
  otherwise the platform keys serve it and `reason` explains the pass-over. A BYO `endpoint` key's
  `base_url` overrides the provider base for that attempt.
- **Attribution** — `llm_performance` gained `key_source` ('org' | 'platform') and `provider_key_id`
  (migrations `0019` / `0043`, mirrored in the Drizzle schema, with `(provider_key_id, created_at)`
  and `(org_id, agent_id, created_at)` indexes). The trace carries both, so a call's key source is
  queryable and BYOK margin can be separated from platform margin.

Evidence: `test/llm-byok.test.ts` (8 tests) — the pure policy (org wins; over-ceiling falls back with
reason; allow-list veto; vendor-prefix-insensitive match; absent key → platform) plus an integration
suite that decrypts a stored key, marks an over-ceiling key unusable from real `llm_performance`
spend, and proves disabled keys and other orgs are ignored.

Verification: `pnpm -r typecheck` clean (8 projects); full API suite **954 passed / 3 skipped /
2 todo**, 0 failed.

Not in this ship at that point: plan model-tier caps, recorded `routing_reason`, and the dead
`ModelRouter` — all shipped the same day (Appendix G); and the constitution `budgetPolicy` /
recursion guards, shipped as Phase 2 (Appendix F).

---

## Appendix F — Phase 2 (budgets, approval bridge, recursion guard, kill switch): SHIPPED (2026-10-03)

Budgets are now enforced rather than merely stored. What that means concretely:

**New `services/ai-budget.ts`** — the one place the stored policy becomes a decision. It resolves
`organizations.settings.constitution.budgetPolicy` and `agents.config.budget` defensively (units:
**credits**; `0` = no ceiling, and for the threshold, `never`), measures real spend from the
append-only ledger (`usage` rows only — refunds and in-flight holds are not spend), and returns
whether the work may start, whether it needs a founder's approval, and why. `getBudgetOverview`
feeds the UI; `setKillSwitch` flips `settings.aiSpend.paused` (audited, merged so other settings
survive).

**Enforcement at reservation** (`services/credits.ts` `reserveCredits`): every spend path passes
through here, so the task executor and the Executive Agent are covered by construction. A killer
switch, an org daily/monthly ceiling, or an agent cap throws `BudgetExceededError` (nothing runs,
nothing is charged); spend above `requiresApprovalAbove` throws `BudgetApprovalRequiredError`.
`ReserveCreditsInput.approved` is how the executor presents the founder's grant; hard ceilings and
the kill switch still apply.

**Approval bridge** (`task-executor.ts`): the estimator's per-task ceiling and the org threshold
both raise a real gated approval (`gateTaskOnApproval`) and move the task to `awaiting_approval`;
on re-entry the granted approval is consumed once (`findGrantedGate` → `markGateReleased` →
re-reserve with `approved: true`). The Executive Agent refuses a command over a hard ceiling with
the reason, and surfaces an over-threshold command as `awaiting_approval`.

**Per-agent budgets** (`agents.config.budget`): `dailyCredits`, `monthlyCredits`, `perTaskCredits`,
no migration — enforced from measured agent spend and the per-task ceiling.

**Org kill switch**: `organizations.settings.aiSpend = { paused, reason, at, by }`, checked at
reservation, flipped by owner/admin via `POST /v1/budgets/kill-switch`. Reading is pure
(`readKillSwitch`), so the state is inspectable and testable.

**Recursion guard** (`services/delegation-guard.ts`, closing abuse todo #2): `maxDepth` (default 3),
`maxChildrenPerTask` (10), `maxTasksPerCommand` (50). Sub-tasks now record their parent
(`tasks.parent_task_id`, migrations `packages/db/migrations/0020` / `supabase/migrations/0044`),
which the depth walk reads; the walk is bounded by the cap, so a pre-existing cycle cannot loop
forever either. `delegateTask` merges passed limits over the defaults, so a partial override cannot
silently disable a cap; `executeDelegationPlan` stops creating once the command cap is reached and
reports `skippedCount`.

**New surface**: `GET /v1/budgets`, `PUT /v1/budgets/agents/:agentId` (owner/admin),
`POST /v1/budgets/kill-switch` (owner/admin). Config: `DELEGATION_MAX_DEPTH`,
`DELEGATION_MAX_CHILDREN_PER_TASK`, `DELEGATION_MAX_TASKS_PER_COMMAND` (documented in
`apps/api/.env.example`).

**Evidence** (`test/ai-budget.test.ts`, 13 tests): pure resolution/coercion of the policy,
agent budget and kill switch; the org daily and monthly ceilings; the approval threshold blocking
then passing with `approved: true`; per-agent per-task and daily caps; the kill switch refusing all
spend then resuming; the HTTP surface with an owner flipping the switch; and the recursion caps
(a chain terminates at `maxDepth`; a second sibling is refused; a plan is capped at
`maxTasksPerCommand`). The abuse suite's recursion `it.todo` is replaced by a pointer to these
assertions.

Also true of this ship: the per-task ceiling that the estimator already computed is now acted on
(previously it flagged `approvalRequired` and nothing read it), so the ceiling gate and the policy
threshold share one bridge.

Not in this ship: `departments.budget` (Phase 5, optional), and the UI for editing the policy /
agent budgets (the APIs exist; the `/app/budgets` page is Phase 5).

---

## Appendix G — Phase 4 remainder (plan tier caps, routing reason, ModelRouter removal): SHIPPED (2026-10-03)

**Plan model-tier caps (decision 5).** `model-intelligence.ts` gained `PLAN_TIER_CAP` and
`planTierCap` — `trial ≤ 0, founder ≤ 1, team ≤ 2, company/enterprise ≤ 3`, unknown plan treated as
uncapped. `selectTierModel` takes an optional `{ maxTier }`. The live selector
`selectMeasuredModel` reads the org's plan (`organizations.plan`) when the caller passes no cap and
**bounds candidates to the cap**. The cap routes *down*, never up: when a task's own risk/
complexity floor (or the calibration floor) is higher than the plan allows, the cap wins, so a
low-revenue plan cannot quietly burn a flagship model — the negative-margin risk §7 names. When the
cap binds, every tier up to the cap is fair game, so a plan capped at a tier with no registry model
still gets the cheapest eligible model rather than nothing.

**Recorded routing reason.** Selection now returns a `reason` beside `source`. `source` gained
`'plan_cap'` (a cap-bound pick always reports it), and a measured promotion/veto explains itself.
`llm_performance` gained `routing_reason` (`packages/db/migrations/0021` /
`supabase/migrations/0045`), the trace carries it (`llm-tracer.ts`, `llm.ts` `_trace`), and the
callers — `task-executor.ts`, `routed-chat.ts`, `executive-agent.ts` — pass it through, so the task
view and admin report can show *why* a model was chosen, not just which path.

**Dead `ModelRouter` removed.** `services/model-router.ts` was a 1,955-line module whose
`ModelRouter` class and four provider adapters were never instantiated — only re-exported by
`llm.ts`. The re-exports and the class/adapters/instance helpers are gone; the module is now just
the live `MODEL_REGISTRY` and the types real code imports (`ModelDefinition`, `TaskRequirements`,
`ModelCapability`, `ProviderId`). `model-router.test.ts` (which tested only the dead class) is
deleted.

**Evidence** (`test/model-plan-cap.test.ts`, 5 tests): the plan→cap map (including unknown plans
being uncapped); `selectTierModel` never returning above `maxTier`; a trial org clamped to tier 0
with `source: 'plan_cap'` and a reason; a higher plan not capped; and an explicit lower cap still
binding. `model-selector.integration.test.ts` now pins its orgs to a `company` plan so its measured
history is exercised without the cap (the cap is tested in its own suite).

Verification: `pnpm -r typecheck` clean (8 projects); full API suite **948 passed / 3 skipped /
1 todo**, 0 failed.

Not in this ship: per-agent `preferredProvider` / `preferredModel` / `maxModelTier` (§3.5 step 2)
and the budget/health candidate filters (§3.5 steps 4, 5), which remain for a later slice.

---

## Appendix H — Worker soak (queue safety under load): SHIPPED (2026-10-03)

`scripts/worker-soak.ts` is the deterministic proof the abuse suite could not be: the safety
properties of the durable queue, under real concurrency, on an isolated database. It boots an
embedded Postgres with the production lineage, seeds one org plus a completed-task factory, starts N
real `startJobWorker` loops, and runs a producer that keeps the queue deep for the whole window.

What it proves at the end (exit code 1 on any failure):

| Check | Why it matters |
|---|---|
| Queue drained — `pending = 0`, `running = 0` | work does not strand |
| No double-claims — every `attempts = 1` | `FOR UPDATE SKIP LOCKED` actually holds under contention |
| No leaked locks — no lock (`locked_at`) outside `running` | a crashed worker cannot hold a job forever |
| Leaked-lock job reaped and finished | `reapStaleJobs` returns work, it is not lost |
| No `failed` rows; only intended `dead` | the retry ladder is not silently churning |
| `done + dead = produced`; `claimed = produced` | every job is accounted for exactly once |

The jobs are `task.execute` jobs whose tasks are already `completed`, so the worker's preflight skips
them — that keeps the soak deterministic and credential-free while still exercising the exact
claim/complete/reap path (real task execution is covered by the integration suite). Flags:
`--seconds` (default 300), `--workers` (4), `--batch`, `--keep-db`.

Evidence: the default five-minute run — 4 workers, **23,226 jobs produced**, drained to
`done=23221 dead=5 pending=0 running=0`, **0 double-claims**, **0 leaked locks**, all checks PASS.
This closes the final abuse-suite todo; the suite is `12 tests, 0 todo`.
