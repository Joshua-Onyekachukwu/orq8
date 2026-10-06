# 82 — Deployment runbook: Railway + Supabase + Vercel (and how to move later)

**Status: ACTIVE (2026-10-03).** This is the deployment authority for the current stack. It records
what actually exists (verified through the Railway API and the connected Supabase account), exactly
what is still missing, and the steps to finish — plus what to re-create if we move hosts.

Read with: `docs/58_DEPLOYMENT.md` (deploy commands and the core-secret table),
`docs/81_SERVICE_SETUP_CHECKLIST.md` (§6 = Vercel settings and env vars), `docs/64_SUPABASE_SETUP.md`
(database), `docs/68_REQUIREMENT_MATRIX.md` (MVP-001/MVP-002 — the founder decisions).

> **Secrets:** never paste a provider token into a chat, an issue, or a commit. If one is exposed,
> rotate it (Railway → Account → Tokens) and update wherever it is stored. This document contains
> **IDs and names only, never keys or connection strings.**

---

## 1. What exists today (verified 2026-10-03)

### Railway — project `modest-bravery`

| Thing | Value |
|---|---|
| Project | `modest-bravery` — id `d0563501-934c-4954-b787-3e141715c7f5` |
| Environment | `production` — id `80e26797-8424-4083-b2ac-791ef893feb9` |
| Service | `@orq8/api` — id `18f607e5-5dce-4db6-a86d-3d3f43a00655` |
| Service | `@orq8/web` — id `fbb818fa-32a6-4e44-812e-42a5fd72e521` |
| Source (both) | GitHub `Joshua-Onyekachukwu/orq8` |
| Application env vars | **none set** — both services carry only Railway's auto-injected `RAILWAY_*` variables |

So the project is created and GitHub-linked, but **nothing has been configured or deployed with real
configuration**. That is the whole of what remains.

### Supabase — two different projects, and they are not the same one

| Where | Project | Ref | Notes |
|---|---|---|---|
| The connected Supabase account (API token in this workspace) | `CapitalOS` | `tvekoojdilkjptjzpvqo` | org `wdvmbmdikhtplripurox`, region `eu-west-1`, Postgres **17.6**, `ACTIVE_HEALTHY` |
| This repository's `apps/api/.env` | *(unnamed here)* | starts `gttk…` | the project the app is currently pointed at; **not visible to the connected account** |

This is **MVP-002** in `docs/68` and it is a real fork in the road, not a formality: the API cannot
boot against a database it has no credentials for, and the two refs are different projects. **Do not
create a third project.** Pick one of the two (see §4) — the account's `CapitalOS` is the concrete,
reachable option.

### Vercel

Not verifiable from here (no Vercel token). The project settings and the exact env-var list are in
**`docs/81 §6`**; they do not change.

---

## 2. What is missing (the blockers, in order)

1. **Decide the production Supabase project** (§4): `CapitalOS` (reachable now) or the `gttk…` project
   (needs its credentials). Until this is answered, there is no `DATABASE_URL`.
2. **The database connection string** (with the DB password) for the chosen project.
3. **Core secrets** for the API service — `SESSION_SECRET`, `ENCRYPTION_KEY` (+ `ENCRYPTION_KEY_KID`),
   `INTERNAL_TOKEN`, `PLATFORM_ADMIN_EMAILS`, `ALLOWED_ORIGINS`, `APP_URL`. New ones can be generated;
   `ENCRYPTION_KEY` must be **stable** (it encrypts stored provider keys).
4. **Model keys** — `OPENROUTER_API_KEY` and `NVIDIA_API_KEY`/`NVIDIA_API_KEYS` already exist in
   `apps/api/.env`; copy the same values to the API service.
5. **Service build config** — neither service declares a root directory or build/start command yet
   (`apps/api/railway.json` and `start-railway.sh` mentioned in older docs **do not exist**). See §3.
6. **Migrations applied** to the chosen Supabase project (§4.3).
7. **Mail** (`RESEND_API_KEY` + `EMAIL_FROM`, or SMTP) so signups verify — deferred by request but
   required before real users.

---

## 3. Railway — exact configuration

### 3.1 Per-service settings

Set these in the Railway dashboard (Service → Settings), or via the project API/CLI.

**`@orq8/api`**
- **Root Directory:** `apps/api` (it is a pnpm monorepo; the build context needs the repo root).
- **Build:** use the Dockerfile — `apps/api/Dockerfile` (build context = repo root, `..`). If Railway's
  builder config is present, set Builder = **Dockerfile** and Dockerfile path = `apps/api/Dockerfile`.
  Add a small `apps/api/railway.json` (or `nixpacks.toml`) to make this explicit and reproducible:
  ```json
  { "$schema": "https://railway.app/railway.schema.json",
    "build": { "builder": "DOCKERFILE", "dockerfilePath": "apps/api/Dockerfile" },
    "deploy": { "startCommand": "pnpm --filter @orq8/api start", "restartPolicyType": "ON_FAILURE" } }
  ```
- **Deploy:** `JOB_QUEUE_MODE=enqueue` (the API must not run the worker when a worker service exists),
  or `inline` for a single-service setup with no worker.

**`@orq8/web`**
- **Root Directory:** `apps/web`. Framework Next.js; build `pnpm --filter @orq8/web build`; start
  `pnpm --filter @orq8/web start`.
- **Or** run the web on Vercel as `docs/81 §6` describes (either is fine; pick one).

**Worker (optional but recommended)**
- A third Railway service from the same repo, root `apps/worker`, Dockerfile `apps/worker/Dockerfile`,
  with `JOB_QUEUE_MODE=workers`. Without it, keep the API on `inline`.

### 3.2 Environment variables — `@orq8/api`

Required (see `docs/58 §58.5`, §58.11b, and `apps/api/.env.example` for the full annotated set):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the chosen Supabase connection string (with `?sslmode=require`) |
| `SESSION_SECRET` | ≥32 chars — `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | ≥32 chars, **stable forever** — `openssl rand -base64 32` |
| `ENCRYPTION_KEY_KID` | `v1` |
| `INTERNAL_TOKEN` | ≥32 chars (cron + `/v1/internal/*` + readiness probes) |
| `PLATFORM_ADMIN_EMAILS` | the founder's login email |
| `ALLOWED_ORIGINS` | `https://<web origin>` |
| `APP_URL` | `https://<web origin>` |
| `OPENROUTER_API_KEY` | from `apps/api/.env` |
| `NVIDIA_API_KEY`, `NVIDIA_API_KEYS` | from `apps/api/.env` (optional fallback) |
| `JOB_QUEUE_MODE` | `enqueue` (with a worker service) or `inline` |
| `PORT` | Railway injects `PORT`; the app reads it |

Recommended: `REDIS_URL` (Upstash) so the layered rate limits are correct across replicas;
`RESEND_API_KEY` + `EMAIL_FROM` (deferred); `PLATFORM_ADMIN_EMAILS`; `CREDIT_*` overrides only if you
want non-default reservation ceilings.

`loadConfig` refuses to boot in production while `SESSION_SECRET`/`ENCRYPTION_KEY` hold dev defaults —
so a half-configured deploy fails loudly rather than running insecure.

### 3.3 Environment variables — `@orq8/web` (if hosted on Railway)

`API_URL=https://<api-domain>`, `NEXT_PUBLIC_API_URL=` same, `NODE_ENV=production`,
`REGISTRATION_OPEN=`; optional `NEXT_PUBLIC_EA_NAME`, PostHog, Supabase public keys. **Never** put API
secrets on the web service.

### 3.4 How to set variables and deploy

- **Dashboard:** Service → Variables → *Raw editor* → paste the block → Deploy.
- **API/CLI:** the Railway project token authorises the GraphQL API (`backboard.railway.app/graphql/v2`)
  and the `railway` CLI (`RAILWAY_TOKEN=<project token> railway up --service @orq8/api`). Store the
  token in a secret manager, not in the repo.

A deploy pulls the configured branch of `Joshua-Onyekachukwu/orq8`, builds, and runs. Watch the build
logs in the dashboard.

---

## 4. Supabase — choose the project, then finish it

### 4.1 Decide

- **Option A — `CapitalOS` (`tvekoojdilkjptjzpvqo`)**: reachable now, `eu-west-1`, Postgres 17.6.
  This is the least work and the recommended default *if* it is meant to be production.
- **Option B — the `gttk…` project** the app already points at: use it only if you can provide its
  credentials/project access; it is not visible to the connected account.

Either way: **one project, applied with both migration lineages, and its connection string in Railway.**

### 4.2 Get the connection string

Supabase → Project → Settings → Database → *Connection string* → **URI** (use the pooled
`...pooler.supabase.com:6543` form for serverless, or direct `db.<ref>.supabase.co:5432` for a
long-running Railway container). Append `?sslmode=require`. Also copy the project URL, `anon` key and
`service_role` key if a web/API path needs them.

### 4.3 Apply migrations (both lineages)

Run with `DATABASE_URL` set to the chosen project:

```bash
pnpm --filter @orq8/db migrate            # drizzle lineage: packages/db/migrations
pnpm --filter @orq8/db migrate:supabase   # supabase lineage: supabase/migrations
```

Verify: `pnpm exec tsx scripts/lineage-parity.ts` and the RLS e2e
`pnpm exec tsx scripts/rls-security-e2e.ts` (55 checks). The two lineages are designed to be
idempotent and to be applied in either order.

### 4.4 GitHub secret for CI

Store `SUPABASE_DATABASE_URL` (repo → Settings → Secrets) so the `DB Migrate` workflow can apply
migrations on push, and `PRODUCTION_API_URL` once the API has a public domain.

---

## 5. Vercel

Unchanged: see **`docs/81 §6`** for the project settings and the exact environment-variable list. If
the web is hosted on Railway instead, use §3.3 here.

---

## 6. Moving to another host later (portability)

The stack is deliberately portable. To stand the whole thing up anywhere:

1. **The database**: apply both migration lineages from §4.3 to any Postgres 16+/17 with `pgvector`.
   There is no host-locked feature; the SQL is plain and idempotent.
2. **The API + worker**: [`apps/api/Dockerfile`](../apps/api/Dockerfile) and
   [`apps/worker/Dockerfile`](../apps/worker/Dockerfile) build from the repo root with no host
   assumptions. Start commands come from each `package.json` (`pnpm --filter @orq8/api start`,
   `pnpm --filter @orq8/worker start`). The worker refuses to start unless `JOB_QUEUE_MODE=workers`.
3. **The web**: any Next.js host (`vercel.json` at the repo root carries the security headers and — if
   the project root is the repo root — the install/build commands; `apps/api/vercel.json` exists for a
   serverless API variant).
4. **Configuration is environment-only.** The complete, authoritative list is
   [`apps/api/.env.example`](../apps/api/.env.example) (enforced by `env-surface.test.ts`, which fails
   if a config key is undocumented) plus [`apps/web/.env.example`](../apps/web/.env.example). There are
   no host-specific files to rewrite.
5. **Secrets to carry over**: `SESSION_SECRET`, `ENCRYPTION_KEY` (+KID — keep it stable or stored
   provider keys become unreadable), `INTERNAL_TOKEN`, the model keys, `DATABASE_URL`, mail keys,
   `REDIS_URL`. Everything else is defaults.
6. **Domains**: point `APP_URL`/`ALLOWED_ORIGINS`/`API_URL` at the new origins; nothing else is
   origin-locked.

---

## 7. Verification after deploy

| Question | Command / endpoint |
|---|---|
| Process alive, deps reachable | `GET /healthz`, `GET /readyz` |
| What is unconfigured and what it blocks | `GET /v1/readiness` (auth or `INTERNAL_TOKEN`) |
| Would mail actually send? | `GET /v1/readiness/mail-check` |
| Is this release shippable? | `node scripts/release-gate.mjs --api-url … --web-url … --internal-token …` |
| Lineage applied and in parity? | `scripts/lineage-parity.ts`; RLS e2e |
| Layered rate limits live? | 4th `POST /v1/business-imports/analyze` in a minute → `429`, `policy_ref: docs/80 §3.3` |

---

## 8. Open decisions (need the founder)

**Status 2026-10-05 — all four are resolved:**

1. Supabase project: the **`gttk…`** project (`gttkaxbcdtpsusmconxm`, ACTIVE_HEALTHY) is the one in use; `CapitalOS` was never used — §4.1's Option A/B framing is stale.
2. Web: **Railway `@orq8/web`** is the live web for now (Vercel has no valid token); switch to Vercel when a token/project access exists.
3. Worker: a **separate `@orq8/worker` service** is deployed with `JOB_QUEUE_MODE=workers`; the API runs `enqueue`.
4. Railway token: still to rotate (it was pasted in chat). Store the replacement in `secrets.env` like the current one.

---

## 9. Live deployment — 2026-10-05

| Piece | Railway service | URL |
|---|---|---|
| API | `@orq8/api` `18f607e5-5dce-4db6-a86d-3d3f43a00655` | https://orq8api-production-062a.up.railway.app |
| Web | `@orq8/web` `fbb818fa-32a6-4e44-812e-42a5fd72e521` | https://orq8web-production.up.railway.app |
| Worker | `@orq8/worker` `5ac011c6-5cbf-4244-b961-fd201328f605` | no domain (no HTTP listener by design) |

- All three build from branch `feat/ai-cost-guardrails-and-worker-soak` via their Dockerfiles (`apps/api/Dockerfile` → `/start-railway.sh`; `apps/web/Dockerfile`; `apps/worker/Dockerfile`), configured through the Railway GraphQL API (`dockerfilePath`, `startCommand`, healthcheck) — `apps/api/railway.json` is not needed by this setup and remains untracked.
- API env: `DATABASE_URL` = Supabase session-pooler URL; `SESSION_SECRET`/`ENCRYPTION_KEY`/`INTERNAL_TOKEN` from `secrets.env`; `JOB_QUEUE_MODE=enqueue`; `PLATFORM_ADMIN_EMAILS` set; LLM/S3/SERP keys copied from `apps/api/.env`; `ALLOWED_ORIGINS=https://orq8.vercel.app,https://orq8web-production.up.railway.app`; `RATE_LIMIT_ENABLED=false` (kept).
- Web env: `API_URL=http://orq8api.railway.internal:3001` (private network), `NEXT_PUBLIC_API_URL=https://orq8api-production-062a.up.railway.app`, `PORT=3000` — **the service domain's target port must match the container port** (Railway injects `PORT=8080` otherwise, which produced a 502 until pinned to 3000).
- Supabase `gttkaxbcdtpsusmconxm`: supabase lineage **45/45 applied**; legacy hosted drift repaired 2026-10-05 (`users.password_hash`, `users.id` default, `webhook_events.title`, `plan_revisions` + indexes, 8 perf indexes; **dropped `users_id_fkey` → `auth.users`**, which the app-owned auth flow requires — the embedded lineage never has it because the drizzle lineage creates `users` first).
- The DB password in `secrets.env` was reset on 2026-10-05 via the Management API; the vault holds the current value.
- Verification: `/healthz`, `/readyz` (ready 7 / configuration-required 7 / blocking: email), live register → session, web `/api/auth/login` proxy → API — all proven.

**Known launch gaps:**
- ~~Verification escape hatch uncommitted~~ **RESOLVED (2026-10-05, commit `9065189`)**: `REQUIRE_EMAIL_VERIFICATION=false` is shipped and live-verified — register returns `email_verified:true` and re-login succeeds without mail.
- Pending: mail keys (Resend/SMTP — the only red release-gate item), OAuth client ids/secrets for Google/GitHub, Vercel token, `REDIS_URL` (optional).

**Hardening evidence (2026-10-05, live)** — full detail in docs/83 §hardening addenda:
- Tenant isolation: 16/16 cross-org attacks rejected (404/403, zero leaks, org-switch membership guard).
- Authority model: L1 `recommend` blocked at `awaiting_approval` → founder approve → work resumed and completed; L0 `observe` refused outright. Server-enforced from the DB row.
- Credits: agent-level `creditsUsed` attribution fixed (`de5c425`) and re-proven live (cost 2 → counter 2); org ledger, audit chain and SSE all carry the same measured cost.
- Audit chain independently re-hashed (84 rows / 7 orgs, all valid) with a rollback tamper test proving detection.
- Prompt-injection containment: poisoned memory produced no autonomy escalation, no credit drain, no exfiltration.
- Enqueue race fixed (`2c00bb4`): one open job per (org, type, task), proven with concurrent executes.

**Hardening evidence (2026-10-06, live)** — session of 2026-10-06; detail in docs/83 §2026-10-06 addendum:
- Decision tokens: every approval binds `call_hash = sha256(tool_id + canonical_json(params))`; a mismatched call on resume is a **denial, audited** (`tool.denied` / `task.execution_denied`, reason `decision_token_mismatch`). Task gates bind `taskDecisionToken`. Integration-proven: `apps/api/test/decision-token.integration.test.ts` (mismatched call denied, grant unspent) and `test/audit-chain-parity.integration.test.ts` (SQL `append_audit_event` ↔ TS `buildPayload` byte parity).
- Gate release is queue-based: an approval PATCH returns 202-shaped `{resumed:{status:'queued'}}` and enqueues `task.execute`; the PATCH fires one immediate `claimAndRunOne` drain (extracted shared ladder in `services/job-worker.ts`), the gateway never runs a model call on the request path. Gate expiry: open gates past `gate_expires_at` (7d) end `paused`, never approved — silence never approves (`services/approvals.ts expireOpenGates`, swept every worker tick).
- Credits: `reconcileLedger` reconciles each side of the balance against its own ledger sum (used ← usage+refund; purchased ← purchase+adjustment+rollover); charges, grants and refunds audit **inside** the ledger transaction (no unaudited money); `credits.integration` + `credit-reservations` suites green (41 tests).
- RLS: `agent_jobs` ENABLE+FORCE, zero client policies (0041) re-attested by migration `0048` and by `scripts/rls-security-e2e.ts` §3.7 — **59 passed / 0 failed** including "B (own org owner) cannot READ agent_jobs either (FORCED)". Idempotency keys scoped to (authorization hash, method, path) + header, and require auth.
- Release gate (2026-10-06): web `/healthz` 200, api `/healthz` 200, `/readyz` ready, public/named views agree — **blocked only on mail** (missing `RESEND_API_KEY`/`SMTP_*`, the known pending keys; not a regression).
- Probe cleanup (XT Alpha / XT Beta deleted per the retention policy in docs/83): `scripts/verify-audit-chain.cjs` re-hashed all rows of every org **VALID before** (3 orgs / 19 rows) and **VALID after** (1 org / 5 rows); sole survivor `Oddly` (owner membership intact); live API green after deletion.

### 10. Ops tools (2026-10-06)

| Tool | Purpose |
|---|---|
| `node scripts/release-gate.mjs --api-url … --web-url … --internal-token $(grep '^INTERNAL_TOKEN=' secrets.env \| cut -d= -f2-)` | The pre-promotion gate: serving, ready, no blocking capability, mail delivers. Exit 0 required. |
| `node scripts/verify-audit-chain.cjs "$(grep '^SUPABASE_DATABASE_URL_SESSION=' secrets.env \| cut -d= -f2-)"` | Independent audit-chain re-hash (docs/34.4 formula, recomputed from row columns — never trusts stored hashes). `ALL CHAINS VALID` expected. Run before/after any org deletion or manual DB surgery. |
| `pnpm exec tsx scripts/rls-security-e2e.ts` | RLS matrix as the real PostgREST roles; asserts `agent_jobs` service-role-only (§3.7) among 59 checks. |

**Probe-data retention** (policy in docs/83): probe orgs are deleted at the end of the evidence session or within 7 days, whichever is sooner; audit chains are per-org, so deleting an org takes its chain with it and every surviving chain stays independently verifiable. Record the evidence in docs/83 **before** deleting anything.
