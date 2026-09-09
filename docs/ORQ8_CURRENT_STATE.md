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
- **Tests**: 301 API tests passing / 0 failing (35 files; 232 DB-gated skips — no local
  Postgres); web typecheck + production build pass; `test:contrast` PASS (9 semantic pairs,
  light + dark). *(Superseded 2026-09-09: API suite is now 391 passing, web 61/61 — see §11.)*

## 2. What is partially complete

| Item | State | Gap |
|---|---|---|
| GitHub OAuth | Real flow (state/exchange/encrypt/health/disconnect) — Task 1 | Needs live `GITHUB_CLIENT_ID/SECRET` for live E2E |
| Gmail/Linear connectors | Generic OAuth architecture + Linear webhook receiver | No Gmail/Linear OAuth apps configured; GitHub action handlers live, Gmail/Linear actions not yet |
| Engineering | Full data layer, org-scoped CRUD, PR flow, **sandboxed executor (Task 4)** | No Monaco UI; container/gVisor isolation is the production boundary |
| Simulation | Engine works, apply gated + audited | **Apply now materializes org changes** (named proposal + approval); what-if inputs still hand-entered |
| Connector actions | **DONE (2026-09-06)** — GitHub (repos/issues/PRs + file reads), Gmail (draft-by-default + approval-gated send), Linear (issue CRUD) as capability-gated agent tools + founder route + outcomes/audit | Live E2E needs GitHub/Gmail/Linear OAuth app creds; no real send until approved |
| Briefings | **Daily + weekly + monthly (2026-09-06)** — shared period engine + real Trends & Spend section | Cron needs `INTERNAL_TOKEN` in prod |
| Delegation orchestrator | **DONE (2026-09-06)** — plan/execute/monitor/feedback routes now expose the multi-agent substrate | No founder-facing squad UI yet |
| Proactive intelligence | **DONE (2026-09-06)** — anomaly detector (goals/tasks/failure/spend) feeds briefing + `GET /v1/analytics/anomalies` | Scheduled runs need `INTERNAL_TOKEN` in prod |
| Portability | **DONE (2026-09-06)** — owner export endpoint + Settings → download | No re-import path yet |
| SSE | Real, org-isolated, heartbeats, caps | No event replay after reconnect; no load test |
| Reporting | Weekly report + admin reporting + **daily briefing (new)** | Briefing email respects prefs; no monthly PA layer yet |
| Workforce optimization | QA/learning pipeline exists | Full evaluate→diagnose→improve→replace loop UI missing |

## 3. What is broken / risky (verified)

- **`orq8.com` is a parked registrar page** — NOT the product. Live site: `orq8.vercel.app`.
  No custom domain configured.
- **Vercel static asset 404s (partially mitigated)** — files under `apps/web/public/images/`
  are committed and the deploy is on the correct SHA, yet `/images/logo.svg` etc. return 404
  live while route handlers work (JPG illustrations serve fine). Root cause is Vercel project
  configuration, not code. Mitigated: the sidebar and admin layout now render an inline SVG
  `LogoMark` component that cannot 404. Remaining impact: landing-page imagery only.
- **`INTERNAL_TOKEN` unset in production** — scheduled jobs (briefings 07:00 UTC, anomaly
  scans, consolidation) auto-skip with a warning. Ops action: set the secret in the GitHub
  workflow environment / Railway.
- **Playwright E2E — RESOLVED 2026-09-09 (see §11)** — browsers installed (chromium 1243),
  and a full authenticated **account-journey spec runs green against production**
  (login → profile edit → refresh → sidebar/top-bar identity → logout). It caught three real
  production auth bugs, all fixed. The remaining 28 legacy specs still need a live-stack run;
  CI does not execute E2E yet.
- **Pre-existing (other session)**: untracked route files are now type-clean; nothing else
  known-broken in my change set. Web + API typecheck clean; build passes.

**Resolved 2026-09-08**: migrations now auto-apply via `.github/workflows/db-migrate.yml`
(push to `main` touching `packages/db/**` or `supabase/migrations/**`) — the manual
`0003 → 0005 → 0004` ordering note above is historical; latest run (`4d8a49d`) applied
`0022_profile_personalization.sql` successfully in CI. Members page now uses the real
`/api/members` endpoint (was sample data).

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
- **P1 — Task 4: Sandboxed engineering command executor** — **DONE** (§5.3): per-org
  scratch workspace, timeout tree-kill, ulimit CPU/memory caps, output caps, env scrubbing,
  path containment, structured results, audit; 22 unit tests. Production container/gVisor
  isolation documented as the remaining boundary (see executor.ts header).
- **P2 — Task 2: Connector health/refresh/reconnect lifecycle** (states: connected/healthy/
  degraded/expired/revoked/disconnected + UI) — health + disconnect routes exist; full
  lifecycle UI still to build.
- **P2 — Task 3: Webhook receivers** — **DONE** for GitHub + Linear: HMAC verify,
  idempotency, durable events, rule-based processing, internal cron endpoint.
- **P2 — Task 5: Simulation apply** — **DONE** (§5.3): structured proposal endpoint
  (`POST /v1/simulations/:id/proposal`), founder-approval gate via the approvals table,
  transactional idempotent materialization of departments/teams/agents/goals with
  provenance + audit. Migration `0007` (proposal jsonb column).
- **P2 — Task 6: Team/department integration test suite** — **DONE** (§5.3): API-level
  create/reassign/pause/archive, cross-org 401/404 rejection, RLS direct-SQL enforcement
  tests (skip-gated on live DB / Supabase auth context).
- **P2 — Task 7: Executive Agent team awareness** — **DONE** (§5.3): compact
  `OrgStructure` block (departments/teams/owners/members/blocked+overdue work) built
  org-scoped and injected into the exec-agent prompt; pure formatter tests + DB-gated
  isolation tests.
- **P1 — Connector action handlers — GitHub DONE (2026-09-06, `2667392`)**: five
  capability-gated action tools (`github_list_repositories/issues`, `github_create_issue`,
  `github_comment_on_issue`, `github_create_pull_request`) behind
  `canAgentUseCapability`, decrypt-token-in-memory-only, every attempt → `connector_outcomes`
  + audit, provider status on 401/429/network errors; founder route `POST/GET
  /v1/connector-actions`; DB-gated tests. Gmail/Linear actions remain (no OAuth apps).
- **P1 — Delegation orchestrator wired (2026-09-06, `be22203`)**: `POST /v1/delegations/plan`,
  `POST /v1/delegations/execute`, `GET /v1/delegations/:taskId`, `POST /v1/delegations/feedback`
  — the built-but-unreachable multi-agent substrate now has doors.
- **P1 — Proactive intelligence (2026-09-06, `ae7da23`)**: anomaly detector (stalled/at-risk
  goals, blocked tasks, failure + spend spikes) → briefing "Needs Attention" +
  `GET /v1/analytics/anomalies`.
- **P2 — Portability (2026-09-06, `09b979d`)**: owner-only `GET /v1/settings/export` JSON
  (secrets excluded) + Settings → "Your company data" download.
- **P2 — Task 8: Team-scoped goals/tasks** — **DONE** (§5.3): `team_id` on goals + tasks
  (migration `0006`), in-org team validation on create/update, `team_id` list filters
  (web proxies now forward params), team cards show goals + tasks.
- **P2 — Task 11: Business Import / Voice / Monaco** — no foundations exist in the
  codebase; remains gated on P1/P2 stability (see §4 — no speculative infra).
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

## 5.3 This session — executor, simulation apply, exec-agent context, org integration tests, contrast self-check

Built (all verified below): **sandboxed executor** (`apps/api/src/services/executor.ts`,
22 tests — containment, env scrub, timeout kill, output caps, structured results; wired into
`POST /v1/sandbox-runs` with audit; `sandbox_runs.working_dir` now records the server-
determined scratch dir; client-supplied working dirs are ignored); **simulation apply**
(proposal endpoint, approval-gated materialization — departments/teams/agents/goals created
in one transaction with provenance `config.sourceSimulationId/sourceProposalId/reportsTo`,
idempotent re-apply, audits at every step; migration `0007_add_simulation_proposal.sql`);
**Executive Agent org structure** (`buildOrgStructure` + `formatOrgStructure` — departments,
teams with owners/members, per-team active/blocked(failed)/overdue work, unassigned agents,
compact deterministic prompt block; org-scoped aggregates); **Task 6 integration suite**
(`test/org-structure-integration.test.ts` — API create/reassign/pause/archive with real
sessions, cross-org 401/404, cross-org departmentId rejected 400, RLS direct-SQL tests via
`request.jwt.claims`, skip-gated); **Team-scoped goals/tasks** (Task 8 — `team_id` column
migration `0006`, API validation + `team_id` filter, web proxy forwards query params, team
cards show goals/tasks); **dashboard contrast self-check** (`components/contrast-self-check.tsx`
— dev-only, computes real computed-style contrast on `data-contrast-check` elements, visible
red alert below 4.5:1, nothing in production); **contrast-check.mjs dark-mode audit** — now
parses `@theme` palette + `:root` + `.dark` blocks and asserts 9 semantic pairs (light:
ink/ink-muted/muted/foreground on card; dark: muted/foreground on card + background,
emerald CTA primary-foreground) all ≥ 4.5:1.

**Verification**: API typecheck 0 errors; API tests **296 passed / 0 failed** (224 DB-gated
skipped — no local Postgres; run against infra compose / Supabase in CI); web typecheck
clean; web production build passes; `test:contrast` PASS (all 9 light+dark pairs ≥ 4.5:1).
**Live probes (2026-09-05)**: web `orq8.vercel.app` HTTP 200; API
`orq8api-production.up.railway.app` — `/healthz` + `/readyz` 200, `/v1/teams` 401
(auth live), GitHub + Linear webhook receivers return 400/404 correctly,
`/v1/sandbox-runs`, `/v1/simulations` (+ proposal/apply), `/v1/engineering-tasks`,
`/v1/connector-outcomes`, `/v1/event-rules` all registered (401 unauth).
**Shipped**: commit `0a3faa0` (22 files) — **pushed and verified on `origin/main`**
(rev-parse matches; Vercel + Railway will build `main`).
**Not done / blocked**: live DB integration tests (no local Postgres here), connector action
handlers, live provider E2E (no creds), briefing email needs SMTP/Resend in prod,
`INTERNAL_TOKEN` unset in prod → cron jobs (events/briefings/consolidation) are not
running in production until the secret is configured (workflow auto-skips with a warning).

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
2. ~~Task 3 — Webhook receivers~~ **DONE**; remaining: live provider configuration.
3. ~~Connector action handlers (GitHub)~~ **DONE** (`2667392`); remaining: Gmail/Linear
   OAuth apps + action handlers, live E2E with real creds.
4. ~~Task 6 — Team/department integration test suite~~ **DONE**.
5. ~~Task 7 — Executive Agent team awareness~~ **DONE**.
6. ~~Task 4 — Sandboxed command executor~~ **DONE**; production container/gVisor isolation
   documented as the remaining boundary.
7. ~~Task 5 — Simulation apply~~ **DONE** (approval-gated materialization); simulation v2
   (live org aggregates as inputs) remains.
8. ~~Delegation wiring / anomaly detector / portability~~ **DONE (2026-09-06)**.
9. **Task 2 — Connector health/refresh/reconnect UI** — health + disconnect routes exist;
   full lifecycle UI to build.
10. Task 9/10 — Apply migrations (`0003`, `0005`, `0004`), deploy, smoke test (needs
    credentials); set `INTERNAL_TOKEN` + `GITHUB_CLIENT_ID/SECRET` in prod.

**Pushed (2026-09-06)**: `b020ed4` is on `origin/main` (verified — fetch + rev-parse match),
containing `2667392` (connector actions), `be22203` (delegation routes), `ae7da23` (anomaly
detector), `09b979d` (export/portability), `f8452f0` (docs), `152e73d` (Gmail + Linear
connector actions, GitHub file reads), `744e6fa` (weekly + monthly briefings with real
trend/spend data + internal endpoints + crons), `bcfdb29` (semantic memory in executive-agent
and task-executor context), `8d49c55` (Integrations page + Event Rules UI + webhook E2E
suite), `e6e3f5f` (Connections page no longer fakes "Planned" statuses), `b020ed4` (docs).
Pushing triggers a Vercel build of `main`. **Prod migration order: 0003 → 0005 → 0004**
(0004 references `integration_providers` which 0005 creates). Remaining untracked
(intentionally not committed): `docs/strategy/PRODUCT_DIFFERENTIATION_AUDIT.md` (separate
strategy doc) and `packages/db/src/migrations/` (drizzle journal is out of sync with prod by
design — prod migrations live in `supabase/migrations/`). Before/after deploy: apply
`supabase/migrations/0003` and `0004` to the Supabase DB, then smoke-test teams +
`/images/*` + webhook endpoints live.

**Live probes (2026-09-06, `orq8api-production.up.railway.app`)**: `/healthz` 200;
auth-gated 401 (route registered) on GET `/v1/integrations`, `/v1/event-rules` and POST
`/v1/connector-actions`; POST `/v1/internal/briefings/daily|weekly|monthly` return the
handler's structured `unauthorized` error with HTTP 404 **by design** — the guard hides the
internal surface until `INTERNAL_TOKEN` is set in prod (unset today; ops gap, not a code
issue). Bogus routes return `not_found` with a `request_id`, confirming the briefing routes
are registered and live. Web `orq8.vercel.app` 200.
---

## 8. Session record — 2026-09-06 (Engineering Department + MCP + Capability Registry)

**Committed** `a8a3a0f`: knowledge graph + decision memory (F6), per-agent autonomy levels
(F12, server-side in task executor + connector actions), squads (F13) with web page, Gmail
OAuth mirroring GitHub (stateless, encrypted credentials), migrations `0008`–`0011`.

**Engineering Department / Software Factory (this session)**:

- **Engineering org model**: all three playbooks now seed a real Engineering department with
  positions — Startup: Engineering Manager, Software Architect, Backend Engineer, Frontend
  Engineer, QA Engineer, DevOps/Security; E-commerce + Agency: Engineering Manager,
  Full-Stack Engineer, QA Engineer. Positions carry real capability strings (incl. connector
  capabilities `github.*`) + tool lists so they participate in the capability model, not just
  personas. Seeding is idempotent via the existing playbook marker; new orgs only.
- **MCP layer** (`services/mcp.ts`, `routes/mcp.ts`, migration `0012`): per-org MCP server
  registry + tool catalog. Connector-backed providers (github/gmail/linear) are seeded with
  real tool catalogs and **execute through the existing connector-action chain** (capability
  check → approval gate → provider call → connector_outcome → audit). Custom servers are
  discoverable but return a structured `transport_unsupported` error — no fake MCP protocol.
  Endpoints: `GET/POST /v1/mcp/servers`, `GET /v1/mcp/discover`, `GET /v1/mcp/permissions/:id`,
  `POST /v1/mcp/execute`.
- **Capability registry (build-vs-buy)** (`services/capability-registry.ts`, migration `0012`):
  per-org registry seeded idempotently with 15 built-ins (connectors, agents, services,
  engineering workspace); engineering completions can register reusable capabilities
  (`source: engineering`). Endpoints: `GET/POST /v1/capabilities`, `GET /v1/capabilities/search`.
- **Engineering memory**: completed/failed engineering tasks write a semantic `lesson` into
  company memory via `recordEngineeringLesson`.
- **Agent context**: agents now receive bounded MCP tool discovery + reusable capability list
  in their prompt (discover before building, search before building).
- **Sandbox runs list**: `GET /v1/sandbox-runs` added (was detail-only).
- **Web**: `/app/engineering` (agents, tasks, repos, sandbox runs, capability registry search,
  MCP summary — all real API data) and `/app/mcp` (register servers, per-agent tool discovery,
  read-tool execution, approval/risk visibility). Sidebar entries added.
- **Tests**: `test/mcp-capability.test.ts` — catalog gating, permission filtering, execution
  rejection paths, capability idempotency + org isolation (DB-gated). Full API suite: **367
  passing**. Web typecheck + production build clean.

**Remaining (unchanged ops gap)**: apply migrations `0003→0005→0004→0008→0012` to prod,
set `INTERNAL_TOKEN` + OAuth/embedding/email config, then live E2E connector tests and
scheduled-job verification. Live probes of the engineering/MCP routes are blocked by the same
prod-credential gap (routes are auth-gated and register cleanly).

---

## 9. Session record — 2026-09-06 (Teams access, capability automation, PR review, EM loop, ops check)

- **Departments → Teams**: Teams strip on the Departments page (count, members, manage link,
  empty state) + per-department team count linking to `/app/teams`.
- **Capability automation**: merged PRs with a linked engineering task auto-register a
  reusable capability (`registerCapabilityForMergedPr`, `deriveCapabilitySlug`) — name
  embeds a short PR id so reprocessing a merge is idempotent; only approved-and-merged work
  qualifies (registration runs on the server-side `merged` transition).
- **PR review gate**: `canTransitionPrStatus` enforces server-side that a PR must be
  `approved` before `merged`; merged is terminal; audit recorded per decision
  (`pr.approved|rejected|changes_requested|merged`). New org-wide `GET /v1/prs` returns PRs
  with repository + linked task (risk/tests/diff/acceptance). Also fixed `createPr` audit
  which wrongly recorded `repositoryId` as `orgId`.
- **PR review UI**: Engineering page now lists PRs with a review modal showing risk
  assessment, tests summary, diff summary and acceptance criteria, plus Approve / Request
  changes / Reject / Merge actions (Merge only surfaces after approval; server re-checks).
- **Engineering Manager loop**: `POST /v1/engineering-manager/plan` — validates request,
  searches the capability registry (build-vs-buy), assembles a team from seeded engineering
  positions, creates executable tasks with acceptance criteria, and reports back. Idempotent
  via a content/requestId fingerprint stored in company memory. `GET
  /v1/engineering-manager/plans` lists recent plans. Founder panel on the Engineering page.
- **Internal anomaly scan**: `POST /v1/internal/anomalies/scan` (INTERNAL_TOKEN-gated)
  records per-org `anomaly.scan_completed` audit evidence.
- **Ops verification**: `apps/api/scripts/production-check.ts` (`pnpm ops:check`) —
  INTERNAL_TOKEN presence, migration 0003–0012 DB probes (tables/columns, plus optional
  Supabase tracker read), GitHub/Gmail OAuth presence, email/embedding warnings, and job
  execution evidence (briefings rows; `anomaly.scan_completed` / `memory.consolidated`
  audit). Prints PASS/FAIL, exits non-zero on failure. Never prints secrets.
- **Tests**: `test/engineering-manager.test.ts` (14 tests: slug derivation, PR gate, team
  assembly, task drafts, idempotency, gaps). Full API suite **381 passing**; web typecheck +
  production build clean. No lint script is configured in this repo — typecheck is the gate.

---

## 10. Session record — 2026-09-08 (final polish round: profile, auth UX, legal, EA engineering delegation)

**Commits** (all pushed to `origin/main`, CI + Vercel deploy green, live-verified):

- `33d24c7` — **Legal & compliance**: Privacy Policy, Terms of Service, Security Practices,
  AI Transparency Notice pages (`/privacy`, `/terms`, `/security`, `/ai-disclosure`), footer
  links, EU cookie-consent banner (localStorage + cookie), 28 Playwright E2E specs across
  landing/auth/dashboard, `docs/INCIDENT_RESPONSE.md`, Hire-from-Template on Departments +
  Teams pages, legacy-table documentation in the Drizzle schema.
- `71647d1` — **Auth fixes**: password visibility toggle no longer clears the field
  (root cause: uncontrolled input; fix: ref-based focus/cursor preservation), logout 405
  fixed (top-bar was a `<Link>` → GET against a POST-only route; now a POST form + GET
  handler for direct navigation, both invalidating the session server-side), sidebar user
  icon became a real account menu (Profile/Settings/Admin/Logout with aria attributes,
  Escape/outside-click close).
- `fb44c85` — **Admin**: Access Denied page instead of silent redirect (authorization stays
  server-side; `PLATFORM_ADMIN_EMAILS` or DB `platform_role` grants access — unset today,
  so even the founder sees Access Denied until configured). Profile page redesign.
- `e4d24a2` — **Cookie preferences page** at `/settings/cookies`: current-choice display,
  three consent levels, reset-to-re-show, shared `lib/cookie-consent.ts` module (single
  source of truth with the banner), 11 unit tests.
- `4d8a49d` — **EA engineering delegation + hardening**: `plan_engineering` EA tool wired
  to the Engineering Manager (system prompt + dispatch; idempotent team assembly + task
  creation); admin access-denied audit logging (route/method/reason/requestId/hashed IP/
  user agent, no secrets); `job_title`/`timezone`/`avatar_url` user columns (migration
  `0022`, auto-applied in CI) exposed via `/v1/auth/me` GET/PATCH and editable in Settings;
  client-side password-strength meter on registration (advisory only; server policy
  unchanged); sidebar uses inline `LogoMark` SVG; vitest excludes Playwright specs (this
  had broken CI).
- `ce17b91` — **Profile banner overlap fix**: root cause was absolute text at the cover's
  bottom corners colliding with the avatar/action row pulled up via negative margins.
  Cover is now purely decorative; identity row in normal flow; avatar overlaps the boundary
  by exactly half its height; `avatarUrl` threaded through the app layout so Profile,
  TopBar, and AppSidebar render one identity; break-words for long names/titles; a11y
  labels + `role="status"`.

**Verification**: web typecheck 0 errors; API typecheck 0 errors; web unit tests 53/53;
API tests 372 passed / 212 skipped (DB- and credential-gated, pre-existing); CI ✅;
DB Migrate ✅ (`0022` live in prod DB); Vercel deploy ✅; live probes — 9 public routes 200,
protected routes 307 → login, API guards 401, `/api/agent-templates` 200.

**Not done / blocked — SUPERSEDED 2026-09-09 (see §11)**: avatar upload pipeline and email
verification are now complete and production-verified; Playwright E2E runs against
production. Still open: `INTERNAL_TOKEN`, Stripe keys, founder admin access config.

---

## 11. Session record — 2026-09-09 (auth hardening, avatar end-to-end, launch readiness)

**Commits** (all pushed to `origin/main`, CI green, live-verified on `orq8.vercel.app`):

- `0f4934b`/`6108904` — **Email verification lifecycle**: migration `0023`
  (`users.email_verified_at` + `email_verification_tokens`, hash-only storage, 24h expiry,
  one-time use, resend limit 3/user/hour from token rows); `POST /v1/auth/verify-email`
  (+`/resend`), `/me` exposes `emailVerified`; branded HTML template; `/verify-email` page
  with full state machine; in-app unverified banner with inline resend. Found + fixed live:
  the page's client component failed the Next 15 build (`metadata` export), and Fastify was
  returning HTTP 200 with `statusCode` in the body — real 400s now.
- `6108904` — **Password-field wipe bug (production login blocker)**: `PasswordField` was
  defined inside `AuthForm`'s render body, so each keystroke re-rendered the parent, React
  remounted the input and **cleared the password** — human login was effectively impossible
  (HTML5 `required` silently blocked submits). Fix: hoist to module scope. Proven by DOM
  node-identity probes.
- `a6bc290` — **`/api/auth/me` Data-Cache staleness**: the proxy cached the upstream `/me`
  fetch 30s, so a GET cached pre-PATCH served the old profile after saving. Now `no-store`.
  Cross-user safety verified live with two accounts (Authorization header is part of the
  fetch cache key — no leak occurred), but self-staleness was real.
- `b8a0fbc` — **Top-bar Sign out dead**: the button's `onClick` closed the dropdown,
  unmounting the `<form>` mid-click, cancelling submission — users stayed logged in.
  Sidebar variant unaffected. Caught by the journey spec; verified fixed on prod.
- `2739e10` — **Avatar upload end-to-end** (+ related commits): picker → MIME/magic-byte/2 MB
  server validation → storage → stable `/api/files/:id/file` URL → profile/sidebar/top-bar.
  Plus **512px client-side downscaling** (EXIF-aware, type-preserving, small images pass
  through untouched; an **11.6 MB photo now uploads as ~614 KB** instead of being rejected).
- `b044783`/`0814897` — **File serving fix (production bug)**: the local-storage backend has
  no servable URL (`file://`), but `/files/:id/file` redirected unconditionally — avatars
  uploaded and **never rendered**. Now the API streams local bytes (correct headers, 404
  when storage is gone) and the web proxy passes binary through untouched. Browser-verified:
  upload → 200 `image/png` → **`<img>` naturalWidth > 0** on sidebar + top-bar after reload.
- `2548c1f`/`f35a637` — **Launch checklist** (`docs/ORQ8_LAUNCH_CHECKLIST.md`): every
  remaining dashboard action with copy-paste verification commands; live-verified §1–§4
  state (API health, register gate already open, admin still needs config).

**Verified account-journey (production, single-run green)**: signup → login (password fix
live) → profile edit → save → refresh persistence → sidebar/top-bar identity consistency →
logout. Demo org seeded through real APIs (Marketing dept, 2 AI employees, 3 tasks in
varied states) for the application Loom.

**Open items discovered this session (now in the README pending table)**: EA
`POST /v1/commands` hangs (LLM provider key unset on Railway — checklist §1); system
agent-template catalog empty on prod (no seed for `is_system=true`); local storage is
ephemeral across redeploys (S3 config needed for durable avatars/files).

**Verification totals**: API tests **391 passing** / 212 skipped (DB/credential-gated,
pre-existing); web tests **61/61**; both typechecks clean; production build clean; all
fixes proven against the live site, not just locally.
