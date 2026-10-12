# ORQ8 Final Architecture — 2026-10-12

## A. Existing architecture (verified today)

```
Founder → Vercel web (Next) → Railway API (Fastify, -062a) → Supabase Postgres
                                   ↓ enqueue (agent_jobs, SKIP LOCKED)
                            Railway worker (@orq8/worker, no HTTP)
                                   ↓ chatCompletion chain
                            OpenRouter → NVIDIA (5-key pool) → dev → fallback
                                   ↓ app-level tools, credits ledger, audit
                            Supabase (single system of record; RLS enforced)
```

Approvals pause in Postgres (not in the worker); orphan reaper + claim fence (`execution_lock`, heartbeat 0056/0057, live in prod) keep rows honest. Rate limits prefer Redis but run in-memory (single instance — correct). Tracing seam exists, exporter not wired. No error-monitoring SDK.

## B. Recommendation: keep this architecture

- **Supabase stays.** No migration justification at zero workload; RLS proven in CI.
- **Railway API + worker stays.** Queue semantics (leases, retries, dead-letter, approval resume) already live in Postgres; moving to Trigger.dev/Cloud Run would re-platform ~zero jobs. Revisit Trigger.dev only when durable approval-pauses or run dashboards become requirements.
- **Vercel stays** for web. `Dockerfile.cloudrun` remains an undeployed fallback.
- **Providers:** OpenRouter primary, NVIDIA fallback — both verified live today.

## C. Alternatives considered and rejected (with reason)

- Trigger.dev: best managed workflows, but adds a platform for no workload; approval pauses already modeled in PG.
- Cloud Run Jobs: cheap at low volume but a container primitive, not a queue claimant; needs Scheduler+Workflows for what PG already does.
- New DB/auth/storage: no bottleneck measured; migration cost unjustified.
- Third LLM provider: no quality/cost evidence requiring it.

## D. Ordered next actions

1. Founder: `RESEND_API_KEY` → unblocks email + release gate (only red item).
2. Fix Actions→Supabase-pooler connectivity (`SUPABASE_DATABASE_URL`) or accept hand-applied migrations.
3. Add Sentry (dev plan free) + wire OTel exporter when first real users arrive.
4. `REDIS_URL` (Upstash) before running a second API replica.
5. Decide canonical web host (Vercel vs Railway web) to stop serving two.
