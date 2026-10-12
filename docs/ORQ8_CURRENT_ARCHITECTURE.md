# ORQ8 Current Architecture — 2026-10-12

## Request path

```
Browser → Vercel (Next.js, iad1, security headers in apps/api/vercel.json)
  → Next proxy routes (/app/api/*, no-store, per-session)
  → Railway API Fastify (orq8api-production-062a, /start-railway.sh: migrate then serve)
  → Supabase Postgres (service-role server-side; RLS defense-in-depth)
```

## Data path

Next proxy → API validation (zod) → org-scoped Drizzle queries → Supabase.
Migrations: `supabase/migrations/*` via `migrate:supabase` (idempotent, ledgered);
Actions runner currently ECONRESETs → hand-applied via Management API until fixed.
Isolation: app-layer org checks + RLS policies (0052/0055), proven by RLS + claim-scope tests.

## AI execution path

```
EA/task → permissions + approvals + credit reservation (pre-execution gates)
  → agent_jobs row (enqueue) → worker claims (FOR UPDATE SKIP LOCKED)
  → chatCompletion chain: OpenRouter → NVIDIA (5-key pool, 429 smoothing)
    → LiteLLM/Ollama (dev) → structured fallback
  → app-level tools (text-parsed blocks, permission-checked)
  → terminal write fenced by execution_lock + heartbeat (0056/0057)
  → ledger settlement (USD cost), audit event, realtime fan-out
```

Timeouts: 30s first-byte / 90s total per attempt; circuit breakers per provider; bounded retries. Fallback preserves capabilities (tools are provider-agnostic).

## Background-job path

`agent_jobs` is the only queue (no BullMQ/Redis Streams — Redis is rate-limit/session cache only, currently in-memory fallback). Worker: same `startJobWorker` as API inline mode (no drift); horizontal scale via SKIP LOCKED; orphan reaper + converge-to-pending on budget expiry; dead-lettering with exit-1 `--once` drain for CI. Approvals pause in Postgres rows, resumed by founder action — no external orchestrator.

## Duplication / dead code found

- Retired `ModelRouter` class removed (registry only); live path is `llm.ts` + selector.
- Old Railway host defaults removed from dev scripts.
- `Dockerfile.cloudrun` kept as undeployed fallback (not duplication — option value).
