# 58 — Deployment (Supabase + Vercel + GitHub)

**Product:** ORQ8 — AI Organization Operating System
**Status:** Phase 1 · Free-first production path
**Supersedes:** docs/42 free-local stack for anything *online*; the local Docker stack remains the dev environment.

---

## 58.1 Architecture

```
Browser
   │  https://orq8.vercel.app (Marketing landing — apps/landing)
   │  https://orq8-web.vercel.app (Product shell — apps/web)
   │        │  (server-side fetch, API_URL env)
   │        ▼
   │  https://orq8-api.vercel.app (Fastify, one serverless function via apps/api/api/index.ts)
   │        │
   │        ▼
   │  Supabase Postgres 16 + pgvector (managed, free tier)
   ▼
GitHub (source of truth) ── CI (typecheck+tests) ── DB Migrate workflow (migrations+seed)
```

Three moving parts, all free-tier friendly:

| Part | Host | What it runs |
|---|---|---|
| Landing | **Vercel** (project `orq8-landing`, root `apps/landing`) | Marketing site: hero, pricing, waitlist form, testimonials, FAQ |
| Web | **Vercel** (project `orq8-web`, root `apps/web`) | Product shell: pricing + auth pages, `/app` shell, `/api/*` route handlers that proxy to the API |
| API | **Vercel** (project `orq8-api`, root `apps/api`) | Fastify via `api/index.ts` serverless function; all `/v1/*` routes |
| DB | **Supabase** | Managed Postgres 16 + pgvector; Drizzle migrations from `packages/db` |

Design notes:

- **One serverless function, not one per route.** Vercel deploys `apps/api/api/index.ts` as a single function; `vercel.json` rewrites every path to it. Fastify's `inject()` adapts the request, and the app + pg pool are cached at module scope so warm invocations reuse Supabase connections. Free tier scales fine at our Phase 1–3 load (1–5 agents).
- **The web never talks to Supabase directly.** All DB access goes through the API (ADR-007 session model, tenant scoping). The web's `API_URL` env points at the deployed API.
- **Sessions stay server-side.** Browser → web route handler (httpOnly `orq8_session` cookie) → API (`Authorization`/cookie) → Supabase. No JWT, no client-side secrets.
- **Migrations are versioned in git** (drizzle-kit), applied by the `DB Migrate` GitHub Action on push to `main`. Supabase's own dashboard SQL is *not* used for schema changes.

---

## 58.2 Prerequisites

1. **Supabase account** → create a project (name: `orq8`), pick a region near your users.
   - Free tier: 500 MB database, 2 paused-instance limits — plenty for beta (Phase 1–3).
2. **Vercel account** → connect the GitHub repo `Joshua-Onyekachukwu/orq8`.
3. **GitHub repo** — already configured (CI + DB Migrate workflows).

No other services needed. Ollama/LiteLLM stay **local-only** (dev stack, docs/42) — production model calls come later from BYOK keys (Phase 7), so nothing extra is required to boot the online stack today.

---

## 58.3 Supabase setup (one-time, ~5 minutes)

1. **Create the project** at https://supabase.com/dashboard → New project.
2. **Copy the connection string**: Project Settings → Database → *Connection string* → **URI** tab (not the transaction pooler if you want simple TLS). For the free tier use the direct connection (`db.<ref>.supabase.co:5432`). For the pooled one use port **6543**.
3. **Enable pgvector** (built into Supabase; the extension is activated by the first migration that needs it — `CREATE EXTENSION IF NOT EXISTS vector`).
4. **Recommended**: enable *Connection pooling* (Supavisor) once you have concurrent users; the app's `DATABASE_URL` is just the pooled URL — no code change.

> The app needs `postgres://` **with the password** — the dashboard shows the password on first creation; store it in your password manager. The GitHub Action and Vercel get it via secrets (§58.5).

---

## 58.4 Vercel setup (one-time)

### Project 1 — `orq8-api` (root: `apps/api`)
1. Vercel → Add New Project → import the repo.
2. **Root Directory:** `apps/api`.
3. **Framework Preset:** *Other* (Vercel detects the `api/` function automatically).
4. **Environment Variables** (see §58.5 table) — set at minimum `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `ALLOWED_ORIGINS`.
5. Deploy. The URL becomes the value of the web project's `API_URL`.

### Project 2 — `orq8-web` (root: `apps/web`)
1. Vercel → Add New Project → import the repo again.
2. **Root Directory:** `apps/web`.
3. **Framework Preset:** Next.js (auto-detected).
4. **Environment Variables:** `API_URL=https://orq8-api.vercel.app` (or your custom domain), `NODE_ENV=production` (set automatically).
5. Deploy. Visit the URL → `/login` → register → the whole flow is live.

### Project 3 — `orq8-landing` (root: `apps/landing`)
1. Vercel → Add New Project → import the repo again.
2. **Root Directory:** `apps/landing`.
3. **Framework Preset:** Next.js (auto-detected).
4. **Build Command:** `npx next build` (override if Vercel's default includes turbopack).
5. **No environment variables needed** — the landing is a static marketing site with a waitlist API route that proxies to the web project.
6. Deploy. The URL becomes the public marketing site.

> The landing deploy is also triggered by the `vercel-landing-deploy.yml` GitHub Action on every push to `main` that touches `apps/landing/**` or `packages/**`. The scheduled retry (every 2 hours) handles Hobby-plan quota exhaustion.

### Optional — custom domain + CORS
- Point your domain at the web project (Vercel does DNS for you).
- Set the API's `ALLOWED_ORIGINS` to the web origin(s), comma-separated, e.g. `https://orq8.app,https://www.orq8.app`. The CORS plugin (apps/api/src/app.ts) uses it with `credentials: true`.

---

## 58.5 Environment variables & secret generation

### Vercel project `orq8-api`

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase connection string | From §58.3. Pooled (6543) preferred once live |
| `SESSION_SECRET` | random ≥32 chars | `openssl rand -base64 32` — sessions (ADR-007) |
| `ENCRYPTION_KEY` | random ≥32 chars | `openssl rand -base64 32` — AES-256-GCM wrapping key (docs/23.5) |
| `ENCRYPTION_KEY_KID` | `v1` | keep for key rotation (docs/23.5) |
| `ALLOWED_ORIGINS` | web origin(s) | comma-separated, no trailing slash |
| `LOG_LEVEL` | `info` | default fine |
| `NODE_ENV` | `production` | Vercel sets this |

> **Boot guard:** `loadConfig` (packages/core) refuses to start in production while `SESSION_SECRET`/`ENCRYPTION_KEY` still hold their dev-only defaults (docs/37.2). If the API 500s with *"Refusing to boot in production with dev-only secrets"* — you forgot this table.

### Vercel project `orq8-web`

| Var | Value | Notes |
|---|---|---|
| `API_URL` | `https://orq8-api.vercel.app` | server-to-server; never exposed to the browser |

### GitHub repo (Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `SUPABASE_DATABASE_URL` | same connection string as the API |

Used by the `DB Migrate` workflow only.

---

## 58.6 Database lifecycle

| Action | Command | Where |
|---|---|---|
| New schema change | `pnpm --filter @orq8/db generate` | local (drizzle-kit) |
| Commit migration files | `git commit` | migration `NNNN_*.sql` in `packages/db/migrations` |
| Apply to production | push to `main` | **GitHub Action** `DB Migrate` runs `migrate` + `seed` |
| Apply to a scratch DB | `pnpm --filter @orq8/db migrate` with `DATABASE_URL` set | manual |
| Quick schema sync (dev only) | `pnpm --filter @orq8/db db:push` | local, skips migration files |

- Migrations are **idempotent-ish and sequential** — never edit an applied migration; add a new one (drizzle-kit convention).
- The seed is a static, idempotent provider catalog (docs/23.1) — safe to run on every deploy. No demo users or orgs are created.
- **Never run `db:push` against production** — it bypasses the versioned migration files.

---

## 58.7 CI/CD flow

```
push to main ──► CI (typecheck + tests) ──► DB Migrate (migrate + seed) ──► Vercel (web + api) ──► live
feature PR   ──► CI runs on the PR (no DB writes)
```

- **CI** (`.github/workflows/ci.yml`): typecheck + tests on every push/PR. DB-gated integration tests skip when no DB is reachable (they self-skip), so CI stays green without a database.
- **DB Migrate** (`.github/workflows/db-migrate.yml`): runs on main pushes touching `packages/db/**`, and manually via *Actions → DB Migrate → Run workflow*.
- **Vercel** deploys previews for every PR (both projects) — free, and a great way to test with early users before merging.

---

## 58.8 Local parity

The online stack is a superset of the local one:

```bash
# local dev still uses Docker Postgres + pnpm scripts (docs/51):
pnpm dev            # API on :3001 (real DB)
pnpm dev:web        # web on :3000, API_URL defaults to localhost:3001
```

For a near-prod local run (optional):
```bash
DATABASE_URL=<your-supabase-url> pnpm --filter @orq8/api start
```
This is useful for debugging against real data without deploying.

---

## 58.9 Costs (free-first, as designed)

| Item | Free path | When it stops being free |
|---|---|---|
| Supabase | 500 MB DB, 2 paused projects, 50k MAU auth (unused) | >500 MB or always-on requirement (~$25/mo) |
| Vercel | Hobby: 100 GB bandwidth, serverless functions, one project per team… | Two projects is fine on Hobby (per-person limits); heavier use → Pro ($20/mo) |
| GitHub | Unlimited public repo, 2,000 min Actions/mo | far beyond beta |
| Domain | `orq8.vercel.app`/`orq8-web.vercel.app` subdomains | custom domain ~$10–15/yr |

Plan of record: **everything above runs on $0 until early users force paid upgrades**, and each paid step is a config swap (ADR-003/005), not a rewrite.

---

## 58.10 Troubleshooting

| Symptom | Cause / fix |
|---|---|
| API 500 "Refusing to boot in production with dev-only secrets" | `SESSION_SECRET`/`ENCRYPTION_KEY` unset on Vercel (§58.5) |
| `/v1/healthz` ok but auth 500s | `DATABASE_URL` wrong or DB paused — Supabase pauses free projects after 7 days of inactivity; *Connect* in the dashboard resumes it |
| Web 502 "Could not reach the ORQ8 API" | `API_URL` on the web project is stale or missing |
| CORS error on register | `ALLOWED_ORIGINS` on the API doesn't include the web origin (§58.4) |
| Migration "relation already exists" | A migration was edited after being applied — add a new migration instead |
| Empty provider catalog | Seed didn't run — trigger `DB Migrate` manually (Actions) |

---

## 58.11b Railway — API host (current)

Since the repo moved the API to Railway (`railway.json` → `apps/api/Dockerfile` →
`apps/api/scripts/start-railway.sh`), the API's environment variables are set on the
Railway service (Dashboard → Project → Service → Variables, or `railway variables` CLI),
not in Vercel. The web project stays on Vercel with `API_URL` pointing at the Railway
deployment URL. Migrations run in `start-railway.sh` before the server boots, so no
separate migrate step is needed on deploy.

### Railway API service — environment variables

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | managed Postgres (Railway or Supabase) | required; must be `postgres://` with password |
| `SESSION_SECRET` | random ≥32 chars | `openssl rand -base64 32`; boot guard refuses dev defaults (docs/37.2) |
| `ENCRYPTION_KEY` | random ≥32 chars | AES-256-GCM wrapping key (docs/23.5); changing it orphans stored provider keys |
| `ENCRYPTION_KEY_KID` | `v1` | keep for key rotation (docs/23.5) |
| `ALLOWED_ORIGINS` | web origin(s) | comma-separated, e.g. `https://orq8-web.vercel.app` |
| `PORT` | `3001` | Railway injects `PORT`; `loadConfig` also defaults to 3001 |
| `INTERNAL_TOKEN` | random ≥32 chars | enables `/v1/internal/*` cron/process-due endpoints |
| `LOG_LEVEL` | `info` | default fine |

### Model provider vars (set when a working provider key exists)

The provider chain is **NVIDIA NIM → LiteLLM → Ollama** (`apps/api/src/services/llm.ts`);
only configured providers are used, and the first provider in the list that serves a
successful response wins. Set these on the Railway API service once the keys are verified:

| Var | Value | Notes |
|---|---|---|
| `NVIDIA_API_KEY` | `nvapi-...` | primary key; validated **before** applying (see below) |
| `NVIDIA_API_KEYS` | `nvapi-...,nvapi-...` | extra keys pooled with the primary, rotated round-robin + auto-failover (429/401/403/404) |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | default if unset |
| `NVIDIA_MODEL` | `nvidia/llama-3.1-nemotron-70b-instruct` | default if unset |
| `NVIDIA_MODEL_FALLBACKS` | comma-separated models | walked when the primary model 404s for the account, before escalating to LiteLLM |
| `LITELLM_BASE_URL` + `LITELLM_MASTER_KEY` | optional | used when set, after NVIDIA |
| `OLLAMA_BASE_URL` | optional | local-only; do **not** set on Railway unless self-hosted |

> **Verify before applying:** a key whose account lacks the *Public API Endpoints*
> entitlement passes `GET /v1/models` (200) but fails every `POST /v1/chat/completions`
> with `404 "Function not found for account '<accountId>'"`. Probe first:
>
> ```bash
> curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 https://integrate.api.nvidia.com/v1/chat/completions \
>   -H "Authorization: Bearer $NVIDIA_API_KEY" -H "Content-Type: application/json" \
>   -d '{"model":"nvidia/llama-3.1-nemotron-70b-instruct","messages":[{"role":"user","content":"hi"}],"max_tokens":8}'
> ```
>
> Only apply keys that return `200`. If every key 404s under the same Account ID, the
> fix is account-level: log in at build.nvidia.com → accept model terms (**Get API Key**
> on each model card) → regenerate keys **with the Public API Endpoints scope** →
> re-probe → only then set the vars and redeploy. Persistent org-level 404s go to
> `help@build.nvidia.com` with the Account ID from the error body.

---

## 58.11 What's intentionally NOT here (yet)

- **No auth on Vercel** — we use our own session auth (ADR-007); Supabase Auth is not used.
- **No custom domain / DNS** — add once the brand is confirmed.
- **No staging DB** — beta scale doesn't need it; the PR-preview Vercel apps share the same API. When the first paying tier lands, add a `staging` Supabase project + a `staging` branch protection rule.
- **No rate limiting / abuse protection** on the public waitlist endpoint — the waitlist is Phase 1 bait; add honeypot + simple IP throttle when the beta opens (docs/37).
- **No observability SaaS** — pino logs to Vercel's function logs; OTel collector stays local (docs/39) until paid tier.
