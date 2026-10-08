# 77 — AI Cost, Security, Rate Limiting & Credit Economy: Audit + Remediation Plan

Status: **AUDIT COMPLETE. P0 shipped; P1 §5 (cost recording) shipped; P1 §8 (layered rate limits,
including per-provider concurrency) shipped 2026-10-02 via docs/80 Phase 3. Still open: P1 §6–7
and the P2/P3 remainder.**

Shipped since this audit was written:

- **P0** (items 1–3): `POST /v1/credits/top-up` deleted; Stripe signature verification on
  `request.rawBody` + `webhook_events` idempotency; atomic SQL-increment balance math with
  idempotency keys, `(org, period_start)` unique index, and `GET /v1/admin/credits/reconcile`.
  See commit `24103f6`.
- **P1 §5** (item 5): real per-call provider cost — `llm_performance.provider_cost_usd`,
  `credits_attributed`, `pricing_source` (migrations 0016 / 0040); cost derived from the
  provider's reported figure or `MODEL_REGISTRY` rates; settlement writes the attribution onto
  the ledger row it already had columns for; `/v1/admin/ai-usage` reports USD and credits as
  separate units with a stated-rate margin. See `services/llm-pricing.ts`, `services/economics.ts`.
- **P3 §13** (partial): the abuse suite (`test/abuse-suite.integration.test.ts`) covers
  cross-tenant ids, list leakage, waitlist spam/burst, `Idempotency-Key` replay, and a
  concurrent settlement race. Its five `it.todo` entries are the scenarios still without a
  control — the layered limits below were the first of them.
- **P1 §8** (item 8): layered rate limits shipped. Per-user / per-org / per-endpoint-class
  sliding windows, a per-agent hourly job quota counted from the durable queue, global +
  per-provider concurrency gates in the LLM chain, a per-org job-claim cap, and fail-closed
  behaviour when Redis is configured but unreachable. Files, budgets and evidence: docs/80
  Appendix C.
- The first abuse `it.todo` is now a real test (same appendix); four remain.
- Two defects the suite found and this work fixed: the `Idempotency-Key` guard compared its
  payload hash in `onRequest` (before Fastify parses the body), so every legitimate replay was
  answered **409 "different payload" instead of the stored response**; and
  `POST /v1/agents/:id/emergency-stop` answered **200 for an unknown agent**, claiming a stop
  that never happened.

Still open: P1 §6–7 (reservations, budget enforcement) and P2.
**No further code should be written against the numbers above until the founder has reviewed the
margin output of §5.**

Method: full read of the credit, billing, usage, rate-limit, LLM-routing, worker and auth surfaces,
with file:line citations. Nothing below is assumed correct because it exists.

---

## Part A — Findings, severity-ranked

### A1. CRITICAL — `POST /v1/credits/top-up` lets any org member mint credits

`apps/api/src/routes/credits.ts:107-127` — authenticated-only (`requireAuth`), no payment
verification, no admin gate, no audit, no idempotency:

```ts
const balance = await credits.addPurchasedCredits(db, ctx.orgId, parsed.data.amount, …)
// amount: z.number().int().positive().max(100_000)
```

Any member of any org can `curl -X POST /v1/credits/top-up -d '{"amount":100000}'` in a loop and
receive unlimited free AI spend. The web app currently has **no caller** (grep: zero hits for
`top-up` under `apps/web`), so this is a latent hole rather than a shipped feature — but it is one
HTTP request wide. **Fix: delete it and route credit purchases exclusively through a Stripe
checkout + webhook path, or gate it behind `requirePlatformAdmin` for support grants (with audit).**

Same file, `POST /v1/credits/consume:68-105` is commented "for testing/admin" yet registered for
every authenticated user; it consumes the caller's own credits (low direct harm) but is
unrestricted API surface that should be admin/dev-only.

### A2. CRITICAL — Stripe webhook verification cannot pass, and is not idempotent

`apps/api/src/routes/billing.ts:107`:

```ts
const rawBody = JSON.stringify(request.body);   // ← re-serialized JSON, not raw bytes
const event = billing.verifyWebhookSignature(config, rawBody, signature);
```

`constructEvent` (`services/billing.ts:465`) requires the **exact bytes** Stripe signed. JSON
re-serialization changes whitespace/key order, so verification fails → every webhook returns 400 →
`checkout.session.completed` never runs `activateSubscription` → **payments never grant plans or
credits**. (Ironically the app already captures the raw body: `app.ts` stores `request.rawBody` for
exactly this purpose; the billing route ignores it.)

And once it does pass: `handleWebhook` (`services/billing.ts:290`) has **no idempotency** — no check
against the existing `webhookEvents` table (which is used only by the unrelated connector-webhook
system), no unique provider event id. A duplicate/replayed `checkout.session.completed` runs
`activateSubscription` twice → duplicate subscription rows and duplicate credit allocation.

### A3. CRITICAL — Credit balance updates can silently lose charges (lost update)

`services/credits.ts:335` in `consumeCredits`:

```ts
.set({ usedCredits: balance.used + cost })            // absolute write from a stale read
.where(… sql`used_credits + ${cost} <= included_credits + purchased_credits`)   // cap guard
```

The WHERE guard correctly prevents **overspend** (good design), but the SET writes an **absolute**
value computed from a read that happened before the update. Two concurrent spends (both read
`used=0`) both write `used=2`: two usage rows in `credit_transactions`, one charge reflected in the
balance. The ledger and the balance diverge — the org gets AI time it was never debited for.
Same pattern in `addPurchasedCredits:400` (`purchasedCredits: balance.purchased + amount`) and
`adjustCredits:431` (which also writes no audit row).

Correct form: `set({ usedCredits: sql\`used_credits + ${cost}\` })` with the same WHERE guard, plus
an idempotency key on the transaction insert.

### A4. HIGH — No reservation; work can run to completion unbilled

Credits are checked **before** work (`task-executor.ts:415 hasEnoughCredits`) and charged **after**
(`task-executor.ts:720 consumeCredits`). In workers mode the job is enqueued, the worker runs the
full multi-step pipeline, and only then does the settlement attempt happen. On insufficient funds
the code deliberately records `credits.unbilled` (`task-executor.ts:735`) rather than lying about
success — honest, but the provider spend already happened. Concurrency makes this worse: the
pre-check passes for N simultaneous jobs, all run, one settles. **Need reservation → settle →
release.**

### A5. HIGH — Charging does not match the catalog, so usage is unpredictable

- Task charge: `Math.max(1, Math.ceil(tokensUsed / 1000))` credits — **1 credit per 1K tokens**
  (`task-executor.ts:691`), plus separately-charged tool calls.
- Tool charge: `tool.${toolId}` looked up in `OPERATION_COSTS`, which has **no `tool.*` keys** →
  falls through to `default: 2` (`services/credits.ts:56`) → **2 credits per tool call**
  (`tool-registry.ts:449`).
- Catalog says `task.executed: 2` credits (`credits.ts:22-25`) and documents "1 credit ≈ 1 standard
  operation".

So `/v1/credits/check` and the `OPERATION_COSTS` table tell the user one number while the actual
charge is a token formula plus flat tool fees. A 9,000-token research task with 3 tool calls costs
~15 credits, not the 2 the catalog implies. This is exactly the "surprise charge" class the brief
forbids (§15) and the inconsistency between §6 and reality.

### A6. HIGH — No provider cost is ever recorded; the admin "cost" is actually credits

- `llm_performance` records tokens and `routingSource` but has **no cost column**
  (`packages/db/src/schema.ts:600-622`).
- `llm-tracer.ts:177` sets `cost: Math.max(0, Math.ceil(trace.totalTokens / 1000))` — that is the
  same *credit* formula stored in a field named `cost`.
- `GET /v1/admin/ai-usage` reports `costCents: sum(activityEvents.cost)`
  (`apps/api/src/routes/admin.ts:781-792`) — `activityEvents.cost` is credits, labeled as cents.

Net effect: **ORQ8 cannot currently compute its own margin.** No revenue-per-credit, no provider
cost-per-credit, no negative-margin detection. Meanwhile real provider prices *do* exist in
`MODEL_REGISTRY` (`model-router.ts:57-58, 257+`: `costPer1kInput` / `costPer1kOutput` USD) — they are
used only to order tiers, never to record or price anything.

### A7. HIGH — Budget policy exists as data and is never enforced

`services/playbooks.ts:74,87,187` and `routes/constitution.ts:19,61` define
`budgetPolicy: { dailyLimit, monthlyLimit, requiresApprovalAbove }` — stored, editable, and **read by
nothing** (grep: only definitions/validation, zero enforcement). There is no agent spend cap column,
no per-task credit ceiling, no daily org ceiling, no max tool calls, no max concurrent jobs per org.
`agents.creditsUsed` exists as a cumulative counter only (`schema.ts:392`). The demo's "Ada's cap
500 → 800 Cr/day" is seed narrative, not an enforced limit.

### A8. MEDIUM — Rate limiting is single-layer and instance-local

Present: global 300/min per session (Redis) or 60/min per IP (in-memory) — `app.ts`; login 5/min,
register 3/min, forgot/reset/verify 3-5/min, OAuth 20/min, commands 10/min, SSE handshake 30/min.
Missing: per-**org**, per-**agent**, per-**job**, per-**provider** limits; dedicated limits for task
execute / tool calls / credits endpoints; and the in-memory fallback (`plugins/rate-limit.ts`) is
bypassable by running more than one instance or by cycling sessions. `rateLimitRoute` keys on `ip`
for every route, so all users behind one proxy share a bucket where Redis is absent.

**Shipped 2026-10-02** — resolved by the layered per-user/per-org/per-agent/per-class limits and the
provider gates; see docs/80 Appendix C.

### A9. MEDIUM — Model selection is genuinely good on quality, blind on economics

Strengths (worth keeping): `classifyTask` risk/complexity sets a tier **floor** (critical work never
downgrades), `selectMeasuredModel` picks the **cheapest tier-sufficient** model and overrides with
measured performance (`SUCCESS_RATE_FLOOR 0.9`, degrade `<0.7`, min 8/4 calls, 14-day window,
`model-selector.ts:26-34`), ties break by cost, and `routingSource` is persisted for audit.
Gaps: selection does not consider **plan, remaining credits, task budget, or expected call cost**;
there is no per-agent preferred model (personas carry voice only —
`agent-personas.ts` has no model/tier field); there is no per-call cost ceiling; and models reached
via `OPENROUTER_MODEL` may not be in the registry, so they have no known price.

### A10. MEDIUM — Trial abuse economics

A new org gets an auto-created trial subscription with 100 credits (`credits.ts:12, 189-215`) and no
card. 100 credits ≈ 100K tokens of model output. Email verification gates the app
(`app/layout.tsx` → `check-email`), which is a real mitigation, but there is no per-IP/per-domain
signup friction beyond register 3/min, and no per-day cap for trials. Flag for abuse testing.

### A11. MEDIUM — `getOrCreateBalance` has side effects on read paths

It is called by `GET /v1/credits/balance`, `/v1/billing/limits`, and every pre-check, and it can
**create** a subscription and a balance row, and roll the period over (`credits.ts:115-260`). Period
boundaries are computed as **calendar month** while `subscriptions.currentPeriodStart/End` use a
different rule, and there is no unique index on `(org_id, period_start)` → concurrent requests can
create duplicate rows; rollover can also re-insert an allocation transaction.

### A12. MEDIUM — Ledger vocabulary and metadata are too thin for the requested economy

`credit_transactions` has `type` (usage|purchase|adjustment|rollover), `amount`, `description`,
`referenceId/Type`, `createdAt` (`schema.ts:293-308`). Missing: grant / promotional / refund /
reversal / expiration / reservation types; provider, model, tokens, credits-charged, agent, task and
job attribution columns; and an idempotency key. `getUsageSummary` already has to regex the
`description` string to recover a task id (`credits.ts`) — a sign the schema, not the reporting, is
the problem. There is **no refund path at all** (failed infrastructure spend is silently absorbed).

### A13. LOW — Dead policy + reporting nits

`adjustCredits` writes no audit row (`credits.ts:431`); `updateTaskBody` cannot set
`awaiting_approval` (found in docs/76 audit; relevant here as the approval/spend bridge);
`/v1/admin/ai-usage` conflates credits with cents (A6).

### What is already sound (do not rebuild)

Org-scoped authz on credits/tasks/goals/jobs (`requireAuth` → `ctx.orgId` in every WHERE clause
spot-checked); `requirePlatformAdmin` for admin routes; RLS enabled with **select-only** policies for
`credit_balances`, `credit_transactions`, `credit_alerts`, `subscriptions`
(`supabase/migrations/0033_rls_hardening.sql:142-204`) — writes only through the API; no Supabase
service-role key in web routes; the durable `agent_jobs` queue with SKIP LOCKED, attempts, backoff
and stale-lock reaping; the atomic overspend guard (A3 is the increment bug, not a missing guard);
the measured-router quality logic; the EA wall-clock budget (`ea-execution-budget.ts`); failed tasks
cost 0 credits.

---

## Part B — Remediation plan (prioritized, for approval)

**P0 — close the bleeding (no new features, small diffs)**
1. Remove `POST /v1/credits/top-up` (or make it platform-admin + audited + idempotent) and gate
   `POST /v1/credits/consume` behind admin/dev.
2. Fix the Stripe path end-to-end: use `request.rawBody`, verify signature, persist
   `webhookEvents` with the Stripe event id as the idempotency key (unique index), process inside a
   transaction, and grant credits/p lan only on success. Then wire the **purchase** flow (checkout
   for credit packs with a server-side price table).
3. Make balance math atomic increments + idempotency keys; add unique index
   `(org_id, period_start)`; reconcile ledger vs balance and report drift.

**P1 — the economy becomes real**
4. Ledger v2: typed transactions (purchase/grant/promo/usage/refund/reversal/adjustment/expiration/
   reservation), metadata (provider, model, input/output tokens, credits, costUsd, agentId, taskId,
   jobId, idempotencyKey), append-only.
5. **Cost recording**: add `providerCostUsd` + `creditsCharged` to `llm_performance` and the trace;
   compute USD from `MODEL_REGISTRY` prices (extend the registry, or capture OpenRouter-reported
   usage cost when present); aggregate per task / job / agent / org / model / day.
6. **Reservation → settle → release** for task.execute jobs and EA commands: reserve an estimate from
   the routing tier and measured history, hard-stop multi-step loops when the reservation is spent,
   settle actuals, release the remainder. Includes a per-task credit ceiling.
7. **Budget enforcement**: wire `budgetPolicy` (daily/monthly/requiresApprovalAbove) + agent caps
   (daily, per-task, max tool calls, max concurrent jobs, max runtime) and bridge
   `requiresApprovalAbove` into the existing authority model (CAN DO / CAN SPEND / REQUIRES
   APPROVAL / CANNOT DO) so expensive work opens a real gate instead of running.
8. **Rate limits, layered**: org-scoped + agent-scoped + endpoint-class (task execute, tools, credits,
   commands) + per-provider concurrency in `llm.ts`; Redis-backed in production, with the in-memory
   fallback documented as single-instance only.

**P2 — intelligence + transparency**
9. Pricing calibration from measured data: internal credits-per-1K-token table by tier, credit price
   derived from cost + target margin, and a negative-margin workflow report.
10. Model selection gains economics inputs: plan, remaining credits, per-task budget, expected cost
    ceiling; per-agent preferred model (persona config) applied **unless** economics/availability
    veto it, with the fallback recorded as the routing reason.
11. Admin AI-economics dashboard: revenue (subscriptions + purchases) vs provider cost, gross margin
    by model/provider/agent/company/workflow, failed/retry cost, top consumers, negative-margin list;
    fix `/v1/admin/ai-usage` labeling.
12. User-facing usage: pre-run estimate on expensive operations, per-task credit breakdown
    (estimate vs actual), remaining-credits context in the dock, low-balance warnings, purchase UI.

**P3 — verify**
13. Automated abuse suite covering the brief's 29 scenarios (spam, replay webhooks, cross-tenant
    ids, recursive work, provider exhaustion, concurrent spend, idempotency).
14. Tenancy sweep: a test harness that exercises every route with a foreign `orgId`/`id` to prove
    org scoping, plus a query audit for `credit*`, `agent_jobs`, `tasks`, `llm_performance`.

**Deliverables on completion**: Security Report, AI Cost Report, Rate-Limit Report, Credit System
Report, Model Routing Report, Economics Report, Test Report (PASS/FAIL/BLOCKED — nothing claimed
untested).

---

## Part C — Decisions I need from you

1. **Top-up policy**: delete the endpoint entirely until Stripe credit packs exist (recommended), or
   keep it platform-admin-only for support grants?
2. **Credit model**: keep the token formula (1 credit/1K tokens) and align the catalog to it, or move
   to fixed per-operation credits and convert tokens to internal cost only? (Recommendation: keep
   the measured token formula for tasks — it tracks real cost — but publish estimates per operation
   so the catalog and reality agree.)
3. **Reservation strictness**: hard-stop when a reservation is exhausted (work marks itself
   `awaiting_approval`/deferred) — recommended — or soft-stop and settle negative (never).
4. **Granularity of budgets**: org-level only, or org + agent (recommended: both, with agent caps
   defaulted per persona).
