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
- **Event ingestion (Phases 5–8)**: webhook receivers for GitHub + Linear (HMAC-SHA256
  timing-safe verification, replay-window timestamps, repo→org resolution for GitHub,
  URL-embedded org for Linear, raw-body capture via a JSON parser override); durable
  `webhook_events` table (idempotent via `external_event_id` unique index); org-scoped
  `event_rules` (notify / create_task / ignore, optional agent assignment, `requiresApproval`
  → pending approval row behind the existing gate); bounded retry + dead-letter processing
  (`POST /v1/internal/events/process-pending`); structured `connector_outcomes` capture
  (`recordOutcome`/`listOutcomes`); per-org webhook secrets stored encrypted in org settings
  (generated via `POST /v1/integrations/:id/webhook-secret`, owner/admin only).
- **Semantic memory (Phase 9–10)**: `company_memory.embedding` pgvector(768) column (HNSW
  index, ADR-012); OpenAI-compatible embedding client (`services/embeddings.ts`) with graceful
  fallback (unconfigured/failed provider → keyword search, writes never break); cosine
  retrieval wired into `findByOrg`/`createMemory`; consolidation job merges exact duplicates
  (importance folded, provenance audited) and promotes near-duplicates (embedding ≥ 0.95).
- **Executive briefing (Phase 11–12)**: `briefings` table (idempotent per org+kind+period),
  deterministic daily briefing from REAL system data (tasks, approvals incl. aging, goals +
  overdue, connector outcomes, webhook volume, paused agents, anomalies), quiet-orgs skip
  delivery, delivered via in-app notification + email (Resend/SMTP/dev-log) when prefs allow.
- **Contrast regression protection (Phase 13–16)**: `apps/web/scripts/contrast-check.mjs`
  (token-resolution math + banned faint-text class scan, `test:contrast` script); faint-token
  sweep (`text-ink-faint`, `text-gray-200/300/400` on light surfaces → semantic tokens);
  `docs/ORQ8_STYLE_GUIDE.md` documents tokens + WCAG AA rules.
- **Scheduler**: `.github/workflows/orq8-jobs.yml` — events every 5 min, consolidation
  ‎06:30 UTC, briefings ‎07:00 UTC (same `INTERNAL_TOKEN` pattern as waitlist drip).
- **Phase 8/9/15 code compiles and is registered**: integrations (providers/capabilities/
  agent-access/enforcement), engineering (repos/branches/files/PRs/tasks), simulation
  (heuristic engine, draft→proposed→reviewed→applied, apply gated), analytics events.
- **AI runtime**: NVIDIA multi-key pool + failover, OpenRouter, Ollama, model fallbacks,
  timeout budgets; quality pipeline / QA / learning system (prior sessions).
- **Tests**: 192 API unit tests passing (25 files); web typecheck + production build pass.

## 2. What is partially complete

| Item | State | Gap |
|---|---|---|
| GitHub OAuth | Real flow (state/exchange/encrypt/health/disconnect) — Task 1 | Needs live `GITHUB_CLIENT_ID/SECRET` for live E2E |
| Gmail/Linear connectors | Generic OAuth architecture + Linear webhook receiver | No Gmail/Linear OAuth apps configured; no connector ACTION implementations yet |
| Engineering | Full data layer, org-scoped CRUD, PR flow | **No command executor** — sandbox runs are records only; no Monaco UI |
| Simulation | Engine works, apply gated + audited | **Apply does not materialize org changes** (no named proposal spec) |
| SSE | Real, org-isolated, heartbeats, caps | No event replay after reconnect; no load test |
| Reporting | Weekly report + admin reporting + **daily briefing (new)** | Briefing email respects prefs; no monthly PA layer yet |
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
- **P2 — Task 3: Webhook receivers** — **DONE (this session)** for GitHub + Linear: HMAC
  verify, idempotency, durable events, rule-based processing, internal cron endpoint.
- **P2 — Task 5: Simulation apply** (formal proposal spec; idempotent materialization of
  departments/agents/goals after approval).
- **P2 — Task 6: Team/department integration test suite** (API + RLS; cross-org rejection).
- **P2 — Task 7: Executive Agent team awareness** (structured, minimal team context injection;
  cross-org safe). *Partially done* — agent-context resolves team membership; prompt injection
  layer still to add.
- **P2 — Connector actions (new)**: implement real GitHub/Gmail/Linear ACTION handlers
  (list repos, create PR, send email …) behind `canAgentUseCapability` + `recordOutcome`;
  wire into tool-handlers so agents can actually use connectors.
- **P2 — Task 8: Team-scoped goals/tasks** (`team_id` on goals/tasks, RLS, API, team pages).
- **P2 — Task 11: Business Import / Voice / Monaco** — only after P1/P2 foundational tasks
  are stable; no speculative infra.
- **P1 — Task 9/10: Production deployment + smoke test** (requires credentials — see §4).
- **Future — Task 12**: k6 load tests, DR runbook, gVisor evaluation, concurrent-command
  production test, PostHog live receipt, more connectors.

## 5.1 Task 1 — GitHub OAuth (COMPLETE: code + unit tests; blocked: live creds)

**Note**: §2's stale "OAuth exchange is a stub" row is superseded — Task 1 replaced the stub.

## 5.2 This session — event pipeline, semantic memory, briefing, contrast protection

Built (all verified below): webhook receivers (GitHub repo-resolved + Linear org-embedded)
with timing-safe HMAC, replay window, raw-body capture; `webhook_events`/`event_rules`/
`connector_outcomes`/`briefings` tables + pgvector `company_memory.embedding`
(migration `supabase/migrations/0004_add_events_rules_outcomes_briefings.sql` — idempotent,
RLS org-member policies on every new table); rules processing (notify / approval-gated task /
ignore, bounded retries, dead-letter); structured outcome capture; semantic retrieval with
keyword fallback; consolidation job; daily briefing (real data, idempotent, in-app + email);
cron workflow `.github/workflows/orq8-jobs.yml`; contrast regression test + faint-token sweep
+ `docs/ORQ8_STYLE_GUIDE.md`. Env additions: `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` /
`EMBEDDING_API_KEY` (optional; unset → keyword fallback). Webhook secrets are generated
per-org at runtime — no env var.

**Verification**: API typecheck 0 errors; API tests **266 passed / 0 failed** (55 new); web
typecheck clean; web production build passes; `test:contrast` PASS. **Not done**: live
provider E2E (no creds), connector action handlers, briefing email needs SMTP/Resend in prod.

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
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Task 1 OAuth | yes | **MISSING** | when OAuth enabled | added to config schema + `.env.example` |
| `GOOGLE_CLIENT_ID`/`SECRET`, `LINEAR_CLIENT_ID`/`SECRET` | future connectors | yes | MISSING | when added | — |
| `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` / `EMBEDDING_API_KEY` | semantic memory | yes (key) | MISSING | optional | unset → keyword fallback; model default `nomic-embed-text` (768-dim) |

Also present locally: `NEXT_PUBLIC_POSTHOG_KEY` in web/.env.production; `NODE_ENV`, `PORT`,
`LOG_LEVEL` via core defaults. Secret values are NOT committed anywhere (`.gitignore` protects
`.env`, `.env.*`; only `.env.example` files are tracked). **Never print real values into docs.**

## 7. Next tasks (ordered)

1. ~~Task 1 — GitHub OAuth~~ **DONE** (`f588380`); remaining: live creds + E2E.
2. ~~Task 3 — Webhook receivers~~ **DONE (this session)**; remaining: live provider
   configuration + connector ACTION handlers.
3. **Connector action handlers** — implement GitHub/Gmail/Linear actions behind
   `canAgentUseCapability`, recording `connectorOutcomes` (unblocks the agent→connector loop).
4. Task 6 — Team/department integration test suite.
5. Task 7 — Executive Agent team awareness prompt layer.
6. Task 4 — Sandboxed command executor.
7. Task 5 — Simulation apply.
8. Task 2 — Connector health/refresh/reconnect UI.
9. Task 8 — Team-scoped goals/tasks.
10. Task 9/10 — Apply migrations (`0003`, `0004`), deploy, smoke test (needs credentials).

**Pushed**: `530ff60` is on `origin/main` (verified — fetch + rev-parse match). Pushing triggers
a Vercel build of `main`. Remaining untracked (intentionally not committed):
`docs/strategy/PRODUCT_DIFFERENTIATION_AUDIT.md` (separate strategy doc) and
`packages/db/src/migrations/` (drizzle journal is out of sync with prod by design — prod
migrations live in `supabase/migrations/`). Before/after deploy: apply `supabase/migrations/0003`
and `0004` to the Supabase DB, then smoke-test teams + `/images/*` + webhook endpoints live.

**Pending**: push `f588380` to origin/main (deferred — see final report; triggers Vercel
deploy). Uncommitted in the working tree (not part of this task): teams/org-management work,
`vercel.json` asset fix, admin/execution contrast fix, and the untracked engineering/
simulation/analytics phase files — these should be reviewed and committed deliberately.