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

1. **Production Supabase project**: `CapitalOS` or the `gttk…` project? (§4.1)
2. **Where the web runs**: Vercel (per `docs/81 §6`) or the Railway `@orq8/web` service.
3. **Worker**: a separate Railway service (`JOB_QUEUE_MODE=workers`) or API `inline` to start.
4. **Rotate the Railway project token** that was shared in chat, then store the new one outside the repo.
