# ORQ8 — Current State & Remaining Work

Living operational document. Update after **every** task, phase, work session, or interruption.
Companion to `docs/ORQ8_PROJECT_HISTORY.md`. Priority legend: **P0** production blocker/security,
**P1** critical feature/blocker, **P2** important, **P3** nice-to-have, **Future** later.

---

## 1. What is complete

- **Org management**: Founder can create/edit/archive/delete Departments (UI + API + audit);
  Teams are first-class (table, API, UI, RLS migration `0003_add_teams.sql`); AI Employees can
  be hired with department + team, reassigned, paused/resumed (audited). Executive Agent
  resolves team membership automatically (`agent-context`).
- **Navigation/mobile**: correct sidebar groups (AI Employees / Departments / Teams / Goals &
  Tasks / Org Explorer); mobile toggle lives in the sticky TopBar (event-driven), no bottom FAB.
- **Contrast**: `.text-muted` design-system fix committed + **verified live**
  (`rgb(115,115,115)` on the live page in a real browser; deployed bundle hash
  `3654d1140b58dbde.css`).
- **Security foundation**: AES-256-GCM encryption at rest for integration credentials
  (`services/crypto.ts`); org-scoped queries everywhere in the new code; PR lookup org-scoped;
  SSE org-isolated with auth + per-user caps.
- **Phase 8/9/15 code compiles and is registered**: integrations (providers/capabilities/
  agent-access/enforcement), engineering (repos/branches/files/PRs/tasks), simulation
  (heuristic engine, draft→proposed→reviewed→applied, apply gated), analytics events.
- **AI runtime**: NVIDIA multi-key pool + failover, OpenRouter, Ollama, model fallbacks,
  timeout budgets; quality pipeline / QA / learning system (prior sessions).
- **Tests**: 192 API unit tests passing (25 files); web typecheck + production build pass.

## 2. What is partially complete

| Item | State | Gap |
|---|---|---|
| OAuth/integrations | Schema + capability model + encrypted storage real | **OAuth exchange is a stub** — callback validates but doesn't exchange; no authorize URL, no state, no health/refresh/reconnect |
| Engineering | Full data layer, org-scoped CRUD, PR flow | **No command executor** — sandbox runs are records only; no Monaco UI |
| Simulation | Engine works, apply gated + audited | **Apply does not materialize org changes** (no named proposal spec) |
| SSE | Real, org-isolated, heartbeats, caps | No event replay after reconnect; no load test |
| Reporting | Weekly report + admin reporting | No daily/monthly PA layer |
| Workforce optimization | QA/learning pipeline exists | Full evaluate→diagnose→improve→replace loop UI missing |

## 3. What is broken / risky (verified)

- **`orq8.com` is a parked registrar page** — NOT the product. Live site: `orq8.vercel.app`.
  No custom domain configured.
- **`supabase/migrations/0003_add_teams.sql` NOT yet applied to production** — teams API
  returns 503 until it is.
- **`vercel.json` asset fix NOT yet deployed** — `/images/*` still 404 live until the next
  deploy (source fix committed).
- **Pre-existing (other session)**: untracked route files are now type-clean; nothing else
  known-broken in my change set. Web + API typecheck clean; build passes.

## 4. What is blocked (credentials / deployment / external config)

| Blocker | What is required | Where | Human action |
|---|---|---|---|
| Real GitHub OAuth | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (OAuth App on GitHub, callback URL) | `apps/api/.env` (untracked) + Vercel env | Create GitHub OAuth App; set env vars; redeploy |
| Gmail/Linear/Jira OAuth | `GOOGLE_CLIENT_ID/SECRET`, `LINEAR_CLIENT_ID/SECRET` | same | Create provider apps |
| Teams live | Run `supabase/migrations/0003_add_teams.sql` | Supabase SQL Editor | Apply migration |
| Deployment | Vercel CLI auth or dashboard deploy from `main` | — | Deploy; verify `/images/*` → 200 and teams API |
| Stripe billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs | Vercel env | Configure Stripe |
| Email | `RESEND_API_KEY` or `SMTP_HOST/USER/PASS` | Vercel env | Configure |
| PostHog live receipt | valid `NEXT_PUBLIC_POSTHOG_KEY` (has local value) | — | verify events in PostHog |

## 5. What remains to build (prioritized)

- **P1 — Task 1: Real GitHub OAuth** — **CODE COMPLETE + TESTED** (see §5.1). Remaining:
  live credentials + end-to-end against real GitHub.
- **P1 — Task 4: Sandboxed engineering command executor** (isolated subprocess runner with
  strict timeouts, output caps, exit codes, audit; true container isolation is Future).
- **P2 — Task 2: Connector health/refresh/reconnect lifecycle** (states: connected/healthy/
  degraded/expired/revoked/disconnected + UI).
- **P2 — Task 3: Webhook receivers** (HMAC verify, idempotency, event persistence, async
  processing via existing DB-as-queue/cron).
- **P2 — Task 5: Simulation apply** (formal proposal spec; idempotent materialization of
  departments/agents/goals after approval).
- **P2 — Task 6: Team/department integration test suite** (API + RLS; cross-org rejection).
- **P2 — Task 7: Executive Agent team awareness** (structured, minimal team context injection;
  cross-org safe). *Partially done* — agent-context resolves team membership; prompt injection
  layer still to add.
- **P2 — Task 8: Team-scoped goals/tasks** (`team_id` on goals/tasks, RLS, API, team pages).
- **P2 — Task 11: Business Import / Voice / Monaco** — only after P1/P2 foundational tasks
  are stable; no speculative infra.
- **P1 — Task 9/10: Production deployment + smoke test** (requires credentials — see §4).
- **Future — Task 12**: k6 load tests, DR runbook, gVisor evaluation, concurrent-command
  production test, PostHog live receipt, more connectors.

## 5.1 Task 1 — GitHub OAuth (COMPLETE: code + unit tests; blocked: live creds)

Built: stateless HMAC-SHA256 OAuth state (`signOAuthState`/`verifyOAuthState`, bound to
org + provider, 10-min TTL, timing-safe compare); authorize URL builder (scope `repo read:user`);
server-side authorization-code exchange (`exchangeGitHubCode`); token health check against
`api.github.com/user` (`githubHealthCheck`); redirect-URI validation against `APP_URL`
(loopback allowed in dev). Routes: `GET /v1/integrations/:id/oauth/authorize`,
`POST /v1/integrations/:id/oauth/callback` (verify state → exchange → **encrypt via
`setCredentials`** → health probe → status + audit `integration.connected`),
`GET /v1/integrations/:id/health`, `POST /v1/integrations/:id/oauth/disconnect` (deletes
credentials, audit `integration.disconnected`). Config: `GITHUB_CLIENT_ID`/
`GITHUB_CLIENT_SECRET` added to core schema + `.env.example`. No secrets in responses.
Tests: `apps/api/test/oauth.test.ts` — 19 tests (state round-trip/tamper/expiry/wrong-key/
swap, authorize URL, redirect-URI validation, exchange success/error/no-config, health,
no-token-leak). **Verification**: API typecheck 0 errors, full suite **211 passed / 0 failed**,
web typecheck clean. **Blocker**: `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` not set (need a
GitHub OAuth App with callback `<APP_URL>/api/integrations/callback/github`); live E2E not run.

## 6. Environment Audit (presence as of last audit — values never recorded here)

Status: **PRESENT** (local untracked env), **MISSING**, **PROD-REQUIRED**, **UNUSED**.

| Variable | Used by | Secret | Local | Prod required | Notes |
|---|---|---|---|---|---|
| `DATABASE_URL` | core config | yes | PRESENT (api/.env) | yes | — |
| `SUPABASE_URL` | API supabase client | no | PRESENT | yes | — |
| `SUPABASE_SERVICE_ROLE_KEY` | API admin ops | yes | PRESENT | yes | — |
| `SESSION_SECRET` | core config | yes | PRESENT | yes | — |
| `AUTH_SECRET` | web cookie signing | yes | PRESENT (web/.env.production) | yes | — |
| `ENCRYPTION_KEY` | crypto.ts / core | yes | PRESENT | yes | must be stable across restarts |
| `SECRET_KEY` | crypto.ts fallback | yes | MISSING | no | fallback only |
| `REDIS_URL` | sessions/cache | yes | MISSING | optional | in-memory fallback works |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `RESEND_API_KEY` | email | yes | MISSING | optional | dev mode logs instead |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | files | yes | PRESENT (api/.env) | optional | local MinIO |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` + price IDs | billing | yes | MISSING | when billing enabled | — |
| `APP_URL` | links/emails | no | MISSING | yes | set to live URL on deploy |
| `API_URL` / `NEXT_PUBLIC_API_URL` | web | no | PRESENT | yes | — |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | web auth | no/yes | PRESENT | yes | anon key is public by design |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | web analytics | no | PRESENT | yes | — |
| `NVIDIA_API_KEY` (+`_KEYS`) | model router | yes | PRESENT | yes | pool rotates/fails over |
| `OPENROUTER_API_KEY` (+`_KEYS`) | model router | yes | PRESENT | optional | — |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | fallback | no | PRESENT | optional | — |
| `SERPAPI_KEY` | research tool | yes | PRESENT | optional | — |
| `LLM_TIMEOUT_MS` / `LLM_HEADERS_TIMEOUT_MS` | llm | no | default | recommended | defaults 90s/30s |
| `REGISTRATION_OPEN` | web gate | no | PRESENT (web/.env.production) | yes | "true" to allow signups |
| `INTERNAL_TOKEN` | internal endpoints | yes | MISSING | yes (prod) | unset disables endpoints |
| `PLATFORM_ADMIN_EMAILS` | admin bootstrap | no | MISSING | optional | prefer DB `platform_role` |
| `ALLOWED_ORIGINS` | CORS | no | default | yes | — |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Task 1 OAuth | yes | **MISSING** | when OAuth enabled | add to config schema + `.env.example` |
| `GOOGLE_CLIENT_ID`/`SECRET`, `LINEAR_CLIENT_ID`/`SECRET` | future connectors | yes | MISSING | when added | — |

Also present locally: `NEXT_PUBLIC_POSTHOG_KEY` in web/.env.production; `NODE_ENV`, `PORT`,
`LOG_LEVEL` via core defaults. Secret values are NOT committed anywhere (`.gitignore` protects
`.env`, `.env.*`; only `.env.example` files are tracked). **Never print real values into docs.**

## 7. Next tasks (ordered)

1. ~~Task 1 — GitHub OAuth~~ **DONE** (commit `f588380`); remaining: live creds + E2E.
2. Task 6 — Team/department integration test suite.
3. Task 7 — Executive Agent team awareness prompt layer.
4. Task 4 — Sandboxed command executor.
5. Task 5 — Simulation apply.
6. Task 9/10 — Apply migration, deploy, smoke test (needs credentials).
7. Task 2/3 — Connector health + webhooks.
8. Task 8 — Team-scoped goals/tasks.

**Pending**: push `f588380` to origin/main (deferred — see final report; triggers Vercel
deploy). Uncommitted in the working tree (not part of this task): teams/org-management work,
`vercel.json` asset fix, admin/execution contrast fix, and the untracked engineering/
simulation/analytics phase files — these should be reviewed and committed deliberately.