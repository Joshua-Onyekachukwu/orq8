# 81 — Service setup checklist (what to provision, in order)

**Status: ACTIVE (2026-10-02).** This answers one question: *what do I still need to set up?*
It is a checklist, not a runbook — the runbooks stay authoritative: `docs/58_DEPLOYMENT.md`
(deployment authority), `docs/64_SUPABASE_SETUP.md` (database), `docs/51_ENVIRONMENT_SETUP.md`
(local), `docs/23_PROVIDER_API_KEYS.md` (model keys), `docs/37_SECURITY_ARCHITECTURE.md` (secrets).

Two facts drive everything below:

- **The product runs end-to-end locally with zero accounts**: `pnpm exec tsx scripts/review-stack.ts`
  boots an embedded Postgres with the full production migration lineage, the API, the web build, the
  worker child and (when keys exist) live models. Nothing in this list is needed to review the
  product — all of it is needed to *run* it.
- **Production is configured but not finished** (see `docs/82_DEPLOYMENT_RUNBOOK.md`, verified
  2026-10-03): a Railway project **`modest-bravery`** now exists, GitHub-linked to
  `Joshua-Onyekachukwu/orq8`, with services `@orq8/api` and `@orq8/web` — but **zero application
  environment variables are set on either**, so nothing runs yet. **MVP-002** is still open and is the
  real blocker: the repository's `apps/api/.env` points at a Supabase project ref starting `gttk…`,
  while the connected Supabase account holds only `CapitalOS` (`tvekoojdilkjptjzpvqo`). Choose one
  project (do not create a third) and finish §4 of the runbook.

---

## 1. P0 — required before a public URL works

| Service | What it is for | What to set up | Keys / values | Without it |
|---|---|---|---|---|
| **Supabase** (or any managed Postgres 16 + pgvector) | the system of record | pick/create the production project, apply both migration lineages (§58.6), store the connection string | `DATABASE_URL` (API), `SUPABASE_DATABASE_URL` (GitHub `DB Migrate` secret) | the API cannot boot; no data survives a restart |
| **API host** — choose one (see below) | serves `/v1/*` | deploy `apps/api` | `PORT`, plus the core secrets row below | the web's server-side calls fail; the product is a shell |
| **Worker host** (may be the same machine) | drains `agent_jobs`; Vercel serverless cannot run a loop | deploy `apps/worker` (`pnpm --filter @orq8/worker start`) or run the API with `JOB_QUEUE_MODE=workers` | `JOB_QUEUE_MODE=workers`, `JOB_*` | queued work never runs (the API stays responsive; tasks sit `pending`) |
| **Vercel — `orq8-web`** | product shell + `/api/*` proxies | import the repo, root `apps/web`, framework Next.js | `API_URL` → the API host | the web cannot reach the API |
| **Vercel — `orq8-landing`** | marketing site + waitlist proxy | import the repo, root `apps/landing` | none | no marketing site |
| **GitHub secrets** | CI deploy + release gate | repo → Settings → Secrets | `SUPABASE_DATABASE_URL`, `PRODUCTION_API_URL`, optional `MAIL_PROBE_TO` | migrations do not apply on push; the release gate prints *NOT RUN* |

**API host options** (the code supports all three):

| Option | Fit | Notes |
|---|---|---|
| **Railway** (recommended, and already provisioned) | one Dockerfile, long-running process, worker in the same project | Project `modest-bravery` exists and is GitHub-linked; services `@orq8/api` and `@orq8/web` are unconfigured. Only `apps/api/Dockerfile` and `apps/worker/Dockerfile` exist — there is **no** `railway.json` or `start-railway.sh`. Set the env from `docs/82 §3` (which supersedes the old §58.11b list) and trigger a deploy. |
| **Fly.io / Render / any container host** | same shape as Railway | `apps/api/Dockerfile` + `apps/worker/Dockerfile`; scale independently |
| **Vercel Functions** (`apps/api/api/index.ts`) | serverless API only | code and tests exist (`bundle.prod`, `boot.prod`, `apps/api/vercel.json`); **the worker still needs a persistent host**, and two serverless instances without `REDIS_URL` mean two independent rate-limit windows |

**Core secrets** (set on the API host — §58.5): `SESSION_SECRET`, `ENCRYPTION_KEY` (≥32 chars,
`openssl rand -base64 32`), `ENCRYPTION_KEY_KID=v1`, `ALLOWED_ORIGINS=https://<web origin>`,
`APP_URL`, `INTERNAL_TOKEN` (≥32 chars — cron + `/v1/internal/*` + readiness probes),
`PLATFORM_ADMIN_EMAILS` (the founder's login), `NODE_ENV=production`. `loadConfig` refuses to boot
in production while `SESSION_SECRET`/`ENCRYPTION_KEY` hold dev defaults.

---

## 2. P0/P1 — the product is actually usable

| Service | Powers | Keys | Without it | Priority |
|---|---|---|---|---|
| **Mail (Resend or SMTP)** | email verification, password reset, notifications | `RESEND_API_KEY` + `EMAIL_FROM`, or `SMTP_HOST/PORT/USER/PASS` + `EMAIL_FROM` | new accounts cannot verify (the app gates on it); the release gate **blocks** on `email` | **P0** |
| **OpenRouter** | the primary model route (one key fronts many vendors) | `OPENROUTER_API_KEY` (`sk-or-...`), optionally `OPENROUTER_API_KEYS`, `OPENROUTER_MODEL`, `OPENROUTER_MODEL_FALLBACKS` | no AI work runs; tasks fall back to the structured no-model path | **P0 for the demo** |
| **NVIDIA NIM** (optional fallback) | first fallback when OpenRouter fails | `NVIDIA_API_KEY` / `NVIDIA_API_KEYS`, `NVIDIA_MODEL(_FALLBACKS)` | OpenRouter becomes a single point of failure | P1 |
| **Redis** (Upstash/Railway, optional) | cross-replica rate-limit windows, session cache, realtime fan-out | `REDIS_URL` | layered limits work but are **per instance** (documented in docs/80 Appendix C); a second replica has its own windows; sessions re-check the DB | P1 (P0 once you run >1 replica) |

**The model keys already exist locally** in `apps/api/.env`: `OPENROUTER_API_KEY` (`sk-or-v1-…`) and
`NVIDIA_API_KEY` + `NVIDIA_API_KEYS` (`nvapi-…`). Copy those values to the API host — they do not
need to be re-issued. (`infra/.env`'s `NVIDIA_API_KEY` is only the placeholder `nvapi-...`; it is the
docker-compose default, not a live key.) With BYOK shipped (docs/80 Phase 4), a company can also
connect its own key under Settings → Providers and that key serves its calls.

Model-key rules: verify a key with a real completion before trusting it (the NVIDIA probe is in
§58.11b); LiteLLM and Ollama are **development-only** and deliberately ranked last, so do not set
them in production. The review stack uses them (or its stub gateway) automatically.

---

## 3. P1/P2 — revenue and optional capabilities

| Service | Powers | Keys | Notes |
|---|---|---|---|
| **Stripe** | subscriptions + credit packs | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FOUNDER_MONTHLY/ANNUAL`, `STRIPE_PRICE_TEAM_MONTHLY/ANNUAL`, `STRIPE_PRICE_COMPANY_MONTHLY/ANNUAL`, `STRIPE_PRICE_CREDITS_STARTER/GROWTH/SCALE` | `POST /v1/credits/purchase` exists and is role-gated and rate-limited, but the **purchase UI is docs/80 Phase 5** — nothing in the web calls it yet. Webhook handling is hardened (docs/80 Phase 0). Point the Stripe webhook at `https://<api>/v1/billing/webhook`. |
| **SerpAPI** | real web search for research tools | `SERPAPI_KEY` | optional; research degrades to no-search |
| **Embeddings** | semantic memory/search upgrades | `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL` | optional; keyword paths keep working |
| **S3-compatible storage** | file uploads beyond the local dir | `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | optional; `LOCAL_STORAGE_DIR` is the dev fallback |
| **OAuth sign-in** | "continue with Google/GitHub" | `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | optional; email/password is the primary path |
| **PostHog** | product analytics on the web | see `docs/50-posthog-setup.md` | optional |
| **OTel collector** | traces beyond pino logs | `OTEL_EXPORTER_OTLP_ENDPOINT` | optional; logs stand alone |

---

## 4. What I would do next, in order (≈ one focused session)

1. **Answer MVP-002** — create/choose the production Supabase project, apply the lineage
   (`pnpm --filter @orq8/db migrate` + `migrate:supabase` with `DATABASE_URL` set), then store the
   connection string as the GitHub secret. This unblocks everything else.
2. **Finish the API host** — the Railway project and services already exist (§ `docs/82`); set the
   API service's env vars (core secrets + `DATABASE_URL` + model keys), point it at
   `apps/api/Dockerfile`, deploy, and set `PRODUCTION_API_URL` so the release gate becomes blocking.
3. **Mail** — one Resend key, then run `node scripts/release-gate.mjs --api-url ... --web-url ...`
   to prove the deployment really sends.
4. **OpenRouter** — one key with a small balance; watch `llm_performance` on `/admin/ai-usage`.
5. **Redis** (Upstash free tier) — worth having before the first real demo traffic, because the
   layered rate limits are only correct across replicas with a shared store.
6. **Stripe** — only when the purchase UI (docs/80 Phase 5) is on the demo script.

**You do not need to set anything up to keep reviewing locally.** The review stack now also runs the
layered rate limits for real (`RATE_LIMIT_FORCE=true`), so the 429 behaviour can be demonstrated
without any account: four `POST /v1/business-imports/analyze` calls inside a minute trip the
per-user import bucket.

---

## 5. Verification shortcuts

| Question | Where the answer is |
|---|---|
| Is the process alive and are dependencies reachable? | `GET /healthz`, `GET /readyz` |
| Which capabilities are unconfigured, and what do they block? | `GET /v1/readiness` (authenticated, or with `INTERNAL_TOKEN`) |
| Would the deployment really send mail? | `GET /v1/readiness/mail-check` |
| Is this release shippable? | `node scripts/release-gate.mjs --api-url … --web-url … --internal-token …` |
| Did migrations land and match? | `scripts/lineage-parity.ts`, RLS e2e `scripts/rls-security-e2e.ts` |
| What is missing for the product itself? | `docs/68_REQUIREMENT_MATRIX.md` (MVP-001…), `docs/80` Appendix B |

---

## 6. Vercel — the exact settings and environment variables

There is one web app (`apps/web`). **There is no `apps/landing` in the repository** (§1 lists one as
planned; it does not exist yet), so a second Vercel project is optional/future.

### Project settings (Vercel → Project → Settings)

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** |
| Root Directory | **`apps/web`** |
| Include files outside the Root Directory | **On** (pnpm workspace) |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm --filter @orq8/web build` (or leave the default `next build`) |
| Output Directory | default (`.next`) |
| Node.js Version | **22.x** |
| Regions | `iad1` (matches the root `vercel.json`) |

The repo root has a [`vercel.json`](../vercel.json) whose `installCommand`/`buildCommand` and security
`headers` assume the project root sits one level below the repo (`cd ../..`). If you set Root
Directory to `apps/web`, Vercel reads `apps/web/vercel.json` (which does not exist), so set the
install/build commands in the dashboard as above, or copy the `headers` block into
`apps/web/vercel.json`. [`apps/api/vercel.json`](../apps/api/vercel.json) can run the API as Vercel
Functions, but the **worker still needs a persistent host** and two serverless API instances without
`REDIS_URL` would run two independent rate-limit windows (see §1).

### Environment variables to upload (web project — Production and Preview)

Required:

| Variable | Value | Why it matters |
|---|---|---|
| `API_URL` | `https://<api-host>` | server-side SSR and the `/api/*` proxies reach the API |
| `NEXT_PUBLIC_API_URL` | same as `API_URL` | browser-side API calls |
| `NODE_ENV` | `production` | production behaviour |
| `REGISTRATION_OPEN` | `true` or `false` | the signup gate |

Optional — set only if the feature is wanted:

- `NEXT_PUBLIC_EA_NAME` — Executive Agent display name (defaults to Atlas).
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` — analytics (`docs/50`).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — only if the web talks to Supabase directly.
- `REDIS_URL`, `S3_ENDPOINT`, `SMTP_HOST` — only if a web route needs them.
- `STRIPE_SECRET_KEY` — **deferred** (only the future purchase UI needs it; `docs/80` Phase 5).

**Do NOT put on Vercel** (these belong on the API/worker host only): `SESSION_SECRET`,
`ENCRYPTION_KEY`, `ENCRYPTION_KEY_KID`, `DATABASE_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_API_KEYS`,
`NVIDIA_API_KEY`, `NVIDIA_API_KEYS`, `INTERNAL_TOKEN`, `PLATFORM_ADMIN_EMAILS`.

> `AUTH_SECRET` is listed in `apps/web/.env.example` but **nothing in the code reads it** (verified by
grep across `apps/web`). Setting it is harmless but unnecessary.

The model keys already exist locally in `apps/api/.env` (`OPENROUTER_API_KEY`, `NVIDIA_API_KEY` +
`NVIDIA_API_KEYS`); the same values go on the **API host**, not on Vercel.
