# 62. ORQ8 system audit

Date: 2026-09-27. Repository: `C:\Users\Administrator\Webstrom\ORQ8`, branch `main`,
`origin/main` at `3b559b9` (2026-09-12), local `main` 24 commits ahead.

Method: this audit reads the real implementation and runs it. Every claim marked
"verified" was produced by executing the system on this machine this cycle. Claims
marked "by inspection" come from reading code and were not executable here because a
credential or environment is missing. Nothing in this document is taken from a plan,
a prompt or an earlier summary.

Evidence battery actually run this cycle: `pnpm typecheck` (clean), `pnpm test`
(453 passed), `scripts/integration-suite.ts` (69 files, 637 tests passed),
`pnpm --filter @orq8/web build` (succeeded), `scripts/auth-e2e.ts` (PASS, API and web),
`scripts/rls-security-e2e.ts` (55 passed, 0 failed), `scripts/vertical-slice-e2e.ts`
(44/44), `scripts/route-sweep.mjs` against a local stack (33/33 routes clean), plus a
live browser session against the local review stack.

## 62.1 Verdict

The engine is real. The product is not reachable by a founder today.

What is true right now:

1. The core loop works end to end on a real database. A founder registers, confirms
   the address, hires AI employees, asks the Executive Agent for work, and the work
   passes authority checks, the model gateway, quality review, credits, audit and the
   realtime stream. This is proven by `scripts/vertical-slice-e2e.ts` (44/44 checks
   against real rows and real events, not mocks).
2. The whole app is reviewable on this machine right now. A local review stack runs
   the production migration lineage, a real API, a real built web app and a seeded
   company; all 33 `/app` routes render real content and a real approval action moved
   the queue from 1 to 0 in the browser.
3. Production is down. `orq8.vercel.app` serves the web shell, but every proxied call
   to the API returns Railway's `{"message":"Application not found"}`. The deployed
   build predates the current login error handling, so a founder sees
   "Invalid email or password" for the outage. No one can use production today.
4. The operation layer points at deleted infrastructure. The `DB Migrate` workflow
   reads a `SUPABASE_DATABASE_URL` secret whose host drops every connection
   (`read ECONNRESET`, run `36327065646`), and the scheduled jobs (`orq8-jobs`,
   `waitlist-drip`, `nightly-rehearsal`) call a dead `API_URL`. Migrations 0033 and
   0034, already written, have never been applied. The last apply that worked stopped
   at 0032 on 2026-09-12.
5. The most advanced code (24 commits) has never run in CI, never deployed, and is not
   in production. Production runs older code than the branch it is supposed to serve.

The honest summary: ORQ8 has a working engine and no working delivery path. The next
work is not more features. It is a runtime decision, a restored deployment and
migration path, and a staging environment, followed by the frontend information
architecture the founder wants to direct.

## 62.2 Scale

| Area | Files | Lines |
| --- | --- | --- |
| API source (`apps/api/src`) | 164 | 48,045 |
| Web (`apps/web`) | 444 | 48,069 |
| API tests (`apps/api/test`) | 88 | 15,194 |
| `packages/core` | 22 | 3,227 |
| `packages/db` | 31 | 2,936 |
| `packages/auth` | 7 | 92 |
| `packages/domain` | 7 | 178 |
| `scripts` | 21 | 5,437 |
| `supabase` | 37 | 3,817 |

Tracked files: 1,003. API: 56 route files, 242 endpoints, 93 services, 6 plugins.
Web: 76 page routes, 133 API proxy routes. Database: 65 tables, 34 migration files.
Tests: 111 files (88 API, 7 web, 13 packages, 3 scripts harnesses included above).

## 62.3 Architecture: intended flow and actual implementation

The intended product flow (from the product docs and the code's own contracts):

```
founder
  -> authentication (session cookie on web, bearer token to API)
  -> company (organization + membership + plan + settings)
  -> Executive Agent (intent analysis, plan, approvals, delegation)
  -> departments and teams (org structure, templates)
  -> AI employees (agents with role, autonomy level, authority, capabilities)
  -> tasks (assigned, executed, reviewed)
  -> model gateway (provider chain, tracing, cost)
  -> tools and integrations (webhooks, MCP, connector actions, repo/sandbox)
  -> approvals and permissions (autonomy, authority, attention queue)
  -> results (task result, quality verdict, activity, notifications)
  -> reporting (health, progress, performance, briefings, weekly report)
  -> memory, lineage, audit, credits
```

The actual technical path, verified:

```
browser
  -> Vercel (web: Next.js server components + 133 route handlers)
  -> API_URL (Fastify API, apps/api, 242 endpoints, registered in app.ts)
  -> Postgres (supabase/migrations lineage, 65 tables, RLS on tenant tables)
  -> model gateway: OpenRouter -> NVIDIA -> LiteLLM -> Ollama (env-driven chain, docs/22.9)
  -> SSE GET /v1/events (services/realtime.ts:77) -> web proxy /api/events
  -> rows: tasks, activity_events, llm_performance, credit_* , audit_events
```

Where the implementation differs from the plan documents:

| Planned | Actual |
| --- | --- |
| Trigger.dev for background jobs | Zero references in code. Jobs are HTTP endpoints plus GitHub-scheduled workflows (currently broken). |
| Google Cloud Run for the API | Build configs exist (`infra/cloudrun/*`), never deployed. No service, no URL. |
| Railway for the database and API | The project no longer exists. Railway's own edge answers 404 for the production API upstream. |
| Supabase as the platform | Used as Postgres, and as the `auth.uid()` shim for RLS tests. Web-side Supabase auth routes and libs exist but nothing imports them. |
| Cloudflare R2 or S3 for files | Implemented with a local filesystem fallback (`services/files.ts`). Not verified against a live bucket. |
| Redis for rate limiting and cache | Optional. `plugins/rate-limit-redis.ts` exists; the local stack runs without Redis. |

## 62.4 Status matrix

Status vocabulary: Working (verified), Working (by inspection), Partial, Broken,
Missing, Duplicate, Deprecated, Untested here, Not connected.

| Area | Status | Notes |
| --- | --- | --- |
| Database schema and migrations (supabase lineage) | Working (verified) | Fresh apply clean: 801 columns, 261 indexes, 79 policies, 44 functions, 26 triggers. |
| Database delivery to production | Broken | Workflow secret points at a dead host; 0033/0034 unapplied. |
| Authentication (email and password, sessions, verification) | Working (verified) | Auth E2E passes API and web journeys 1 to 5. |
| Supabase client auth path on web | Deprecated / Duplicate | 4 route handlers, 2 file handlers, 1 hook, nothing imports them. |
| OAuth (GitHub, Google/Gmail) | Working (by inspection) | Routes exist with state and callback handling. No live credentials here. |
| Authorization and permissions | Working (verified) | Autonomy levels, agent authority flags, role checks, RLS matrix 55/55. |
| API surface | Working (verified) | 242 endpoints; integration suite exercises them on a real DB. |
| Executive Agent loop | Working (verified) | Slice: intent analysis, plan, task, QA, credits, audit, SSE. |
| Task execution and governance | Working (verified) | Paused/archived, authority, autonomy and credit gates all block with reasons persisted. |
| Model gateway | Working (verified locally) | Real HTTP provider chain; tracing and per-call cost recorded. Production keys unverifiable here. |
| Model routing optimization | Partial | `model-router.ts` (1,810 lines) plus calibration; needs 20 recorded calls before it recommends anything (it says so honestly). |
| Credits, usage, budgets | Working (verified) | Measured per-task charge, ledger rows, balance equals usage rows, alerts. |
| Billing (Stripe) | Working (by inspection) | Routes and price IDs wired; no live Stripe keys verified. |
| Audit trail | Working (verified) | Hash-chained rows; chain verifies across the slice's 13 rows. |
| Realtime (SSE) | Working (verified) | Task, credits, attention and activity events delivered to the browser. |
| Attention queue | Working (verified) | Aggregates approvals, blockers, alerts, decisions; badge updates live. |
| Notifications | Working (verified) | Unread count and feed render; routes present. |
| Memory | Working (verified) | Rows render; embeddings are optional and degrade to keyword search by design. |
| Knowledge graph, lineage, constitution, decisions, council | Working (by inspection) | Real tables, real endpoints, rendering routes; not exercised in this cycle's proof. |
| Simulation | Working (by inspection) | Live baseline plus projections, explicitly labeled as projections, apply requires approval. |
| Engineering (repos, sandbox runs, PRs) | Partial | Routes and tables exist; depends on GitHub access and a sandbox runner. Not exercised here. |
| Integrations (webhooks, connector actions, MCP) | Partial | Provider catalog, HMAC receivers, rules, outcomes, MCP servers and tools. Requires live provider credentials. |
| Files and storage | Working (by inspection) | S3-compatible with local fallback; no live bucket verified. |
| Email (SMTP, Resend) | Working (by inspection) | Config surfaces exist; no live send verified. |
| Admin surface | Working (verified) | Admin activity, audit and AI usage reflected the slice run. |
| Frontend rendering | Working (verified) | 33/33 `/app` routes clean on the local stack with real data. |
| Frontend information architecture | Unclear / Duplicate | 33 nav items in 4 groups, duplicated concepts, one 1,001-line dashboard page. |
| Production deployment (web) | Partial | Vercel serves the shell; upstream API is gone. |
| Production deployment (API) | Broken / Not connected | No working deploy path. |
| Background jobs and cron | Broken | GitHub-scheduled workflows call a dead API URL. |
| CI | Working (verified historically) | Green through 2026-09-12; the 24 local commits never ran. |
| Staging | Missing | No staging environment or secrets exist anywhere. |
| Member management | Partial | Only two read endpoints. No invite, no role change, no removal. |
| Onboarding to first value | Partial | Company builder, playbooks, business import exist; not proven end to end this cycle. |

## 62.5 Database

- Three migration lineages exist in the tree:
  1. `supabase/migrations/0001..0034` (the production lineage, applied by
     `migrate:supabase` in the DB Migrate workflow and by every local harness).
  2. `packages/db/migrations/0000..0012` (drizzle-kit generated, applied by
     `pnpm --filter @orq8/db migrate`).
  3. `packages/db/src/migrations/0003_engineering_workspace_and_integrations.sql`,
     referenced by nothing.
- CI applies lineage 2 and then lineage 3, so CI's database is a composition that
  matches neither local development nor production. Local development applies
  lineage 2 only. Production applies lineage 1 only.
- Fresh lineage proof: applying `supabase/migrations` from scratch yields 65 tables,
  801 columns, 261 indexes, 79 policies, 44 functions and 26 triggers, and the RLS
  security matrix passes 55/55 including the foreign-key index invariant that 0034
  asserts.
- Every one of the 65 schema tables is referenced somewhere in API code. The thinnest
  usage: `repo_events` (3 references), `secret_records` (5), `analytics_events` (6),
  `team_templates` (6), `repository_file_contents` (9), `job_runs` (10),
  `integration_credentials` (11). `secret_records` and `integration_credentials`
  existing but barely used is a security-relevant question (where do connector
  secrets live today?).
- Deprecated artifacts referenced nowhere: `supabase/rls-policies.sql` (97 lines),
  `supabase/storage-setup.sql` (50 lines).
- Seeds: `packages/db/src/seed.ts` (provider catalog) and `seed-demo.ts`, both
  idempotent, run by the DB Migrate workflow.
- There is no applied-migration ledger anywhere. The catalog is the only evidence of
  what a database has applied, which is why the 0033/0034 drift stayed invisible.
  `scripts/lineage-parity.ts` fingerprints a catalog and diffs two, ready for the
  moment a live connection string exists.

## 62.6 Authentication and permissions

- Session model: `users` and `sessions` tables, `SESSION_SECRET`, httpOnly
  `orq8_session` cookie on the web origin, bearer token to the API. ADR-007 bearer
  choice is documented in `lib/api.ts`.
- Gates verified: unconfirmed email cannot use the app (API 403 plus web redirect to
  `/check-email`), lockout after repeated failures with `Retry-After`, CSRF plugin,
  rate limiting, brute-force protection.
- RLS: 79 policies across tenant tables, verified by the RLS matrix (55 checks,
  including cross-tenant isolation and the FK index invariant).
- Duplicate path: `apps/web/lib/supabase-browser.ts`, `supabase-server.ts`, the four
  `/api/auth/supabase/*` handlers, two `/api/files/supabase/*` handlers and
  `hooks/use-supabase-auth.ts`. Nothing in the UI imports them. They are dead weight
  in the auth story and should be removed or explicitly retired.

## 62.7 API

56 route files, 242 endpoints, 93 services. Largest services: `executive-agent.ts`
(2,153), `model-router.ts` (1,810), `tool-registry.ts` (1,302), `ea-tools.ts` (1,066),
`business-import.ts` (922), `tool-handlers.ts` (905), `llm.ts` (845),
`company-builder.ts` (761), `attention.ts` (750), `task-executor.ts` (637).

No `TODO`, `FIXME` or "not implemented" markers exist in API source. The only
matches for stub-like words are the simulation feature (a real feature), a
documented placeholder limitation in `task-executor.ts` line 356, and comments that
explicitly refuse fake output (for example `company-progress.ts` "No fake progress").
That discipline is real and worth preserving.

## 62.8 Agent execution and the model gateway

- Provider chain, built by `buildProviderChain`: OpenRouter (primary, including
  multi-key rotation and model fallback lists), then NVIDIA NIM (first fallback),
  then LiteLLM, then Ollama (both development-only, always last). Enablement is
  purely environment-driven; the order is declared once by `PROVIDER_PRIORITY` in
  `services/model-router.ts` and documented in docs/22.9.
- Verified locally through a real OpenAI-compatible HTTP server: intent analysis, task
  execution and QA each reached the gateway; provider recorded as `openrouter` with the
  served model; `llm_performance` persisted both phases; the gateway's own log proved
  the dummy key travelled over HTTP.
- Timeouts, header timeouts and per-provider fallbacks are configurable
  (`LLM_TIMEOUT_MS`, `LLM_HEADERS_TIMEOUT_MS`, model fallback lists).
- Cost tracking: tokens and cost recorded per call; the task executor now bills the
  measured cost (1 credit in the slice, not the flat 2), and the ledger, task row,
  audit and SSE carry one number.
- Production provider state is not verifiable from here: the API does not run, and the
  local vault's provider keys are not confirmed live.

## 62.9 Credits, budgets and billing

- `credits.ts` (551 lines): balances, transactions, alerts, `hasEnoughCredits`,
  measured `consumeCredits(amount)`, zero-cost early return.
- Verified in the slice: ledger amount equals measured work, balance equals the sum of
  usage rows, exhausted balance blocks execution before any model call with the reason
  persisted on the task row at zero cost, and a billing failure records
  `credits.unbilled` rather than disappearing.
- Stripe billing routes and price IDs exist. No live keys were verified here.

## 62.10 Realtime, activity, attention and audit

- SSE endpoint: `GET /v1/events` in `services/realtime.ts` (line 77), registered in
  `app.ts` with a rate-limit skip. The web proxy is `app/api/events/route.ts`, which
  keeps the stream same-origin and forwards the session as a bearer token.
- Verified events in the slice: `task.started`, `task.completed`, `task.qa_passed`,
  `credits.consumed` with the measured amount, both blocked `task.failed` events, and
  `attention.changed`.
- Attention aggregation (750 lines) is emitted from approvals, tasks, credit alerts,
  decisions and the task executor. The dashboard badge and the queue were verified in
  a browser, including a real approve/reject moving the queue from 1 to 0.
- Audit is hash-chained; the chain verified across the slice's 13 rows including
  `command.received`, `credits.consumed` and `task.qa_passed`.

## 62.11 Integrations, storage, email, MCP

Implemented by inspection, not exercisable here without credentials:
GitHub OAuth plus HMAC webhook receivers, Gmail OAuth with approval-gated send,
Linear webhook receivers, generic connectors with event rules and outcomes, MCP
servers and tools with a capability registry, engineering repositories and sandbox
runs, Stripe billing, S3-compatible storage with a local fallback, SMTP and Resend
email config.

Risk to note: the integration tables that hold credentials
(`integration_credentials`, `secret_records`) are among the least-referenced tables in
the API. Confirm where live connector credentials would be stored and encrypted before
claiming integrations are production ready.

## 62.12 Infrastructure

| Layer | Status | Evidence |
| --- | --- | --- |
| Vercel (web) | Live but unusable | `orq8.vercel.app` returns 200 HTML; its API upstream is gone. |
| Vercel (API) | Not deployed | Documented `orq8-api.vercel.app` returns `DEPLOYMENT_NOT_FOUND`. |
| Railway (API and Postgres) | Deleted | The API upstream returns Railway's own `Application not found`; `RAILWAY_TOKEN` is Not Authorized. |
| Supabase | Unknown from here | Local vault keys return 403; the project's role in production cannot be confirmed. |
| Cloud Run | Not connected | `infra/cloudrun/api.cloudbuild.yaml` and `web.cloudbuild.yaml` plus a one-time setup script exist; no service is deployed. |
| Trigger.dev | Not used | No code references at all. |
| GitHub Actions | Partly broken | `ci.yml` green through 2026-09-12; `db-migrate.yml` fails on a dead secret; `orq8-jobs`, `waitlist-drip`, `nightly-rehearsal` call a dead `API_URL`. |
| Docker / docker-compose | Local only | `infra/docker-compose.yml` (Postgres+pgvector, MinIO, LiteLLM, Ollama, optional Langfuse) is not used by any environment. |
| Realtime | Working | SSE verified end to end locally. |
| Storage | Implemented | S3-compatible with local fallback; no live bucket. |
| Cron and background jobs | Broken in production | Jobs are HTTP endpoints driven by GitHub schedules that point at a dead host. |

## 62.13 Environment and configuration

- The config schema (`packages/core/src/config.ts`) declares 59 keys. Only
  `DATABASE_URL` is truly boot-critical; everything else is optional or defaulted, so
  the API boots and degrades in a minimal environment. That is good design.
- Production hardening exists in code: `loadConfig` refuses to boot in production with
  the dev-only session secret or encryption key.
- Drift: 35 config keys appear in neither `apps/api/.env.example` nor
  `infra/.env.example` (including `INTERNAL_TOKEN`, `REDIS_URL`, `SMTP_HOST/PORT/USER/PASS`,
  `EMAIL_FROM`, `EA_DISPLAY_NAME`, `APP_URL`, `STRIPE_*`, `S3_REGION`,
  `EMBEDDING_*`, `PLATFORM_ADMIN_EMAILS`, `SERPAPI_KEY`, `RESEND_API_KEY`,
  `OTEL_EXPORTER_OTLP_ENDPOINT`). Some have defaults, but a deployer cannot know the
  full surface from the examples.
- The local vault (`secrets.env`) is stale the same way as CI: Railway token
  unauthorized, Vercel token 401, Supabase keys 403, `SUPABASE_DB_URL` literal
  placeholder text.

## 62.14 Frontend

Routes: 76 page routes (8 landing, 14 admin, 40 `/app`, 14 auth, onboarding and
settings) and 133 API proxy routes. All 33 nav-reachable `/app` routes render clean on
the local stack with real data.

Current primary navigation, 4 groups, 33 items, plus a bottom block:

| Group | Items |
| --- | --- |
| Command (12) | Dashboard, Attention, Company Health, Scheduled Jobs, Command Center (approvals), Weekly Report, Performance, Engineering, MCP & Tools, Simulation, Squads, AI Workforce ROI |
| Organization (7) | AI Employees, Departments, Teams, Strategy, Goals & Tasks, Org Explorer, Business Import |
| Systems (1) | Integrations |
| Governance (14) | Notifications, Company Memory, Strategic Lineage, Decision Memory, Decision Council, Knowledge Graph, Audit Trail, Budgets, Usage & Limits, Files, Constitution, Quality & Learning, Learning, Briefings |
| Bottom | Settings, Provider Keys, Profile (user menu), Admin Dashboard (platform admins only) |

Not in the sidebar: `/app/activity`, `/app/members`, and the detail routes
`/app/agents/[id]`, `/app/goals/[id]`, `/app/tasks/[id]`.

Observations to inform the redesign (no changes made):

1. Duplication: "MCP & Tools" and "Integrations" both exist under two groups with the
   same icon; "Quality & Learning" and "Learning" overlap; "Decision Memory" and
   "Decision Council" split one concept; "Org Explorer", "Departments", "Teams" and
   "Squads" are four entry points into one structure.
2. Governance holds 14 items, mixing founder decisions (Notifications, Budgets,
   Audit) with deep system surfaces (Constitution, Knowledge Graph, Lineage) that a
   founder visits rarely.
3. The dashboard is one 1,001-line page with 17 blocks: welcome banner, system
   status, Executive Agent strip, company overview, needs your attention, active
   work, goals, recent decisions, executive recommendations, daily brief, company
   progress, company health, goal execution, reliability, department activity, model
   performance, command bar and activity feed. Attention, approvals, activity,
   decisions and health each appear more than once across the app.
4. Language is mostly clear and honest ("SYSTEM ONLINE" and a lime pulse are the main
   style debt against the dark green and orange rule).
5. Demo labeling works: an organization flagged `isDemo` renders a "Demo data" badge
   on the dashboard (verified in the browser after flagging the review company).

## 62.15 Testing

- 111 test files. API: 88 files (27 integration suites, 59 unit and route suites),
  453 unit tests and 637 integration tests all passing this cycle. Web: 7 test files.
  Packages: 13.
- Integration harness: `scripts/integration-suite.ts` over the shared boot in
  `scripts/lib/embedded-db.ts` (real embedded Postgres, production lineage, per-run
  data directory, migration shims for `auth.uid()` and roles).
- Strong proof harnesses exist and pass but are manual: `auth-e2e.ts` (API and web
  journeys), `rls-security-e2e.ts` (55 checks), `vertical-slice-e2e.ts` (44 checks),
  `route-sweep.mjs` (33 routes), `lineage-parity.ts`, `load-scale.ts`.
- CI runs typecheck, unit and integration tests against a Postgres service (applying
  both migration lineages), then build, security and docker jobs. It does not run any
  browser journey, the route sweep, the vertical slice or the RLS matrix, and it has
  not run since 2026-09-12 because nothing was pushed.
- Gaps: no tests for simulation apply, council deliberation, engineering sandbox,
  MCP, OAuth callbacks or billing webhooks; no web component tests beyond 7 files; no
  production smoke check in CI (the nightly rehearsal that could be one is red).

## 62.16 Mocked, simulated and synthetic

There is no mocked product path. Specifics:

- The simulation feature is a real feature with real data, and it labels projections as
  projections. Its apply path requires a founder approval.
- The review stack and the vertical slice use a local OpenAI-compatible gateway so the
  pipeline can run without provider keys. Tests only.
- The `Company Progress` and `Model performance` surfaces explicitly refuse to invent
  numbers: model recommendations require at least 20 recorded calls and say so.
- A dev-only contrast diagnostic renders nothing in production.
- The review stack seeds one synthetic company (Northwind Labs) through the real API,
  now flagged `isDemo` so every screen labels it.

## 62.17 Duplicate, deprecated and stray

| Item | Classification | Action later |
| --- | --- | --- |
| `apps/web` Supabase auth routes, libs and hook (7 files) | Duplicate, unused | Delete after confirming no external client uses them |
| `packages/db/migrations` (drizzle lineage) | Duplicate lineage | Keep for dev or delete; never compose both in CI |
| `packages/db/src/migrations/0003_*.sql` | Stray | Referenced by nothing |
| `supabase/rls-policies.sql`, `supabase/storage-setup.sql` | Deprecated | Superseded by migrations |
| `all prompt.txt` at repo root | Stray | Founder's call; still untracked |
| `hooks/use-supabase-auth.ts` | Deprecated | Remove with the Supabase path |

## 62.18 Broken and blocked

1. Production API and database delivery: no path from this repo to a running API.
2. `DB Migrate` secret (`SUPABASE_DATABASE_URL`) targets a deleted host.
3. 0033 and 0034 written but unapplied in production (and unverifiable without a live
   connection string).
4. Scheduled jobs (`orq8-jobs`, `waitlist-drip`, `nightly-rehearsal`) red against a
   dead `API_URL`.
5. No staging environment, so nothing can be validated before production.
6. 24 local commits, including all of Phase 0 to Phase 3, have never been through CI
   and are not deployed anywhere.
7. Cloud Run deployment (the documented API runtime) was never executed and needs
   founder credentials (project, billing, region, service account, Artifact Registry).
8. Member management is read-only: a founder cannot invite a co-founder or teammate.

## 62.19 MVP and future

MVP, the smallest thing a founder can actually operate a company with:

1. A reachable, deployed product with a working API and database, and a way to apply
   migrations safely.
2. Sign up, confirm email, create the company, reach the dashboard.
3. Hire AI employees (templates or manual), assign them to a department and team.
4. Ask the Executive Agent for work, watch tasks execute, approve what needs approval,
   see results arrive.
5. Credits and usage visible, budgets enforced, no runaway spend.
6. The attention queue as the single place where the founder decides things.
7. Audit trail and weekly report for trust.
8. One working external integration (GitHub or Gmail) to prove the loop leaves the app.
9. A demo company a founder can look at in one click.
10. Members: invite at least one teammate.

Future, explicitly out of MVP scope: decision council and deliberation, simulation
apply at scale, knowledge graph, strategic lineage, constitution, MCP marketplace,
engineering sandbox and PR automation, ROI analytics, squads, business import
enrichment, multi-provider routing optimization, BYO provider keys, portability
export, waitlist and growth surfaces, waitlist drip, load and scale tooling.

## 62.20 Remaining work, phased

Legend: P0 blocks functioning, P1 required for a usable MVP, P2 important after MVP,
P3 later. Complexity: S, M, L, XL.

### Phase 0: discovery (this audit, complete)

| Item | Status | Notes |
| --- | --- | --- |
| Codebase, architecture, dependency, environment, infrastructure audit | Done | This document |

### Phase 1: foundation (P0)

| Item | Status | Exists | Missing or broken | Required work | Depends on | Complexity | Blocks product |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Runtime decision for the API and database | Open | Cloud Run configs, docker-compose, Vercel web | A running host | Choose and provision (Cloud Run, VPS, or rebuilt Railway); wire env and secrets | Founder credentials | M | Yes |
| Production database connection and catalog truth | Broken | Supabase lineage, parity tool | Live connection string; applied-migration ledger | Obtain a live URL, run `lineage-parity`, apply 0033/0034 | Founder credentials | S | Yes |
| Migration path (DB Migrate workflow) | Broken | The workflow | A valid `SUPABASE_DATABASE_URL` secret | Repair or replace the secret; add an applied-migrations table | Live URL | S | Yes |
| Deploy path for current main (web plus API together) | Broken | Vercel web project | API deploy; coordinated release | Deploy API, point `API_URL` at it, deploy web | Runtime decision | M | Yes |
| Scheduled jobs and cron | Broken | Job endpoints and workflows | A live `API_URL` | Repair secrets; re-run and confirm green | Live API | S | Yes |
| Staging environment | Missing | Nothing | Environment, DB, secrets | Create a second environment with its own database | Runtime decision | M | Yes (for safe delivery) |
| Single migration lineage | Duplicate | Two lineages plus a stray file | One source of truth | Retire the drizzle lineage or scope it to tests; never compose both | None | M | No |
| Env surface documentation | Partial | 59-key schema, two examples | 35 keys undocumented | Regenerate `.env.example` files from the schema | None | S | No |
| Redis (rate limiting and cache) | Optional | Plugin exists | A running instance | Decide: managed Redis or accept in-memory limits | Runtime decision | S | No |
| Storage bucket | Partial | S3-compatible service, local fallback | A live bucket | Provision R2 or S3, verify upload and signed download | Founder credentials | S | No |
| Email sending | Partial | SMTP and Resend config | Live credentials | Verify one real send path | Founder credentials | S | No |

### Phase 2: core engine (P0 to P1)

| Item | Status | Required work | Depends on | Priority | Complexity |
| --- | --- | --- | --- | --- | --- |
| Company creation and onboarding to first value | Partial | Prove the full path on a real stack: register, verify, builder, first hire, first command | Deployed API | P1 | M |
| AI employee hire and template flows | Working | Verify templates end to end after deploy | Phase 1 | P1 | S |
| Departments, teams, org structure | Working | Verify after deploy; consider merging the four entry points | Frontend direction | P1 | S |
| Task execution and governance | Working | Already proven; keep the slice as a gate | CI wiring | P1 | S |
| Approvals and autonomy | Working | Verify in the deployed environment | Phase 1 | P1 | S |
| Attention queue | Working | Make it the single founder decision surface (frontend work) | Frontend direction | P1 | M |
| Credits, budgets, usage | Working | Verify with live billing keys; set default plan limits | Phase 1 | P1 | S |
| Member invites and roles | Partial | Add invite, accept, role change, removal | Phase 1 | P1 | M |
| Memory and embeddings | Working | Decide the embedding provider for production | Live keys | P2 | S |
| Reporting (weekly report, briefings, health) | Working | Verify after deploy | Phase 1 | P2 | S |
| Audit and lineage | Working | Verify after deploy | Phase 1 | P1 | S |

### Phase 3: user experience (P1, founder-directed)

| Item | Status | Required work | Depends on | Priority | Complexity |
| --- | --- | --- | --- | --- | --- |
| Navigation redesign | Unclear | Reduce 33 items to a founder-shaped IA; the founder provides direction | Founder decisions | P1 | M |
| Dashboard redesign | Unclear | Rebuild the 17-block page around the chosen hierarchy | Founder decisions | P1 | L |
| Company, employees, department pages | Working but duplicative | Consolidate; keep proven data contracts | Nav decision | P1 | M |
| Jobs, tasks, approvals, reports, performance, engineering pages | Working | Fold into the new IA; no data changes needed | Nav decision | P1 | M |
| Settings and providers | Working | Verify in production; document provider keys | Phase 1 | P2 | S |
| Onboarding review | Partial | Founder walks the first-run path on the review stack and directs changes | Founder review | P1 | M |

### Phase 4: integrations (P2)

| Item | Status | Required work | Priority |
| --- | --- | --- | --- |
| GitHub (OAuth, webhooks, repos, PRs) | Partial | Live credentials, one repo connected, one webhook received | P1 for MVP (one integration) |
| Gmail | Partial | Live OAuth client; approval-gated send verified | P2 |
| Linear | Partial | Live webhook signing secret | P3 |
| MCP servers and tools | Partial | Connect one real MCP server and prove a tool call | P2 |
| Engineering sandbox | Partial | A real runner and its credentials | P2 |
| Stripe billing | Partial | Live keys, one checkout, one webhook | P2 |

### Phase 5: reliability (P1 to P2)

| Item | Status | Required work | Priority |
| --- | --- | --- | --- |
| Error handling and retries | Working | Confirm budgets and alerting in production | P2 |
| Observability | Partial | Wire `OTEL_EXPORTER_OTLP_ENDPOINT` or an equivalent; alert on failed jobs | P1 |
| Cost controls | Working | Set production caps; verify alerts reach the founder | P1 |
| Security review | Partial | Confirm `INTERNAL_TOKEN`, secrets at rest, and where connector credentials live | P0 before external users |
| Rate limits | Working | Confirm Redis or accept in-process limits | P2 |
| Recovery | Untested | Backups, restore drill, documented rollback | P1 |
| Production smoke check | Missing | Turn the nightly rehearsal green and make it a gate | P1 |

### Phase 6: testing (P1 to P2)

| Item | Status | Required work | Priority |
| --- | --- | --- | --- |
| Unit and integration suites | Working | Keep green; run on every push | P1 |
| Vertical slice as a gate | Working, manual | Run in CI on every push touching API, executor, credits or realtime | P1 |
| Auth E2E and route sweep as gates | Working, manual | Run in CI against a preview environment | P1 |
| RLS matrix as a gate | Working, manual | Run in CI against the integration database | P1 |
| Browser journeys for the founder loop | Partial | Extend to the redeigned dashboard once the IA lands | P2 |
| Failure and recovery tests | Missing | Provider outage, timeout, partial write, dead job | P2 |

### Phase 7: product readiness (P1 to P3)

| Item | Status | Required work | Priority |
| --- | --- | --- | --- |
| Demo company for prospects | Partial | Promote the review stack's seed into a one-click demo | P1 |
| Billing and credits live | Partial | Live keys, plan limits, top-up path verified | P2 |
| Documentation | Partial | Deployment runbook rewritten around the real runtime | P1 |
| External testing | Missing | Founders outside the team run the MVP loop | P1 |
| Performance | Partial | `load-scale.ts` exists; run against the deployed API | P2 |

## 62.21 Dependency graph and critical path

```
runtime decision (API host + database)
  -> live database connection string
      -> applied-migrations ledger + lineage parity
      -> apply 0033/0034
  -> API deployed and reachable
      -> web API_URL points at it (one coordinated release)
      -> scheduled jobs and cron repaired
      -> staging environment
          -> production smoke check in CI
          -> external testing

local review stack (available now, no dependencies)
  -> founder UX review
      -> navigation and dashboard direction
          -> frontend IA work (parallel to the foundation track)
```

Parallel tracks:

- Foundation track (P0): runtime, database, deploy, jobs, staging. Needs founder
  credentials; nothing else can substitute.
- Frontend track (P1): can start immediately on the local review stack because the API
  contract is proven and the data is real. It only needs the founder's direction.
- Testing track (P1): wire the existing manual harnesses into CI, which needs no
  credentials and protects everything else.

## 62.22 Recommended order and the first task

Answer to the question "stabilise infrastructure first, or redesign the frontend
first": both, in two tracks, with a single ordering rule. Stabilise infrastructure
first for anything a real founder or prospect touches, because today there is no
reachable product. Redesign the frontend in parallel, because the local review stack
already makes the current experience reviewable and the redesign blocks nothing.

Recommended order:

1. Runtime and database decision (P0, founder credentials).
2. Restore the migration path, apply 0033/0034, add an applied-migrations ledger
   (P0).
3. Deploy current main: API first, then web, then jobs (P0).
4. Create staging and make the smoke check a gate (P0/P1).
5. Wire the existing proof harnesses into CI (P1, no credentials, protects everything).
6. Founder UX review on the review stack, then the navigation and dashboard redesign
   (P1, founder-directed).
7. MVP loop hardening: onboarding to first value, member invites, then one live
   integration (P1).
8. Duplicate and deprecated cleanup: Supabase auth path, migration lineages, legacy
   SQL files (P2).

The exact first task: obtain the runtime and database decisions and the credentials
they need (API host, database, Vercel and GitHub secrets), because every P0 item waits
on them and no code change can unblock them. In parallel, the founder can review the
product today on the local stack (section 62.24).

## 62.23 Decisions needed

| # | Decision | Why it matters | Recommendation |
| --- | --- | --- | --- |
| 1 | Where the API and database run | Nothing deploys today | Cloud Run for the API (configs exist) with a managed Postgres; or a single VPS with docker-compose for simplicity |
| 2 | Where the production database actually is, and its credentials | Cannot apply migrations or read the real catalog | Find the live Supabase (or other) host, then run `lineage-parity` |
| 3 | Staging environment: create one, or accept local-only review | Without it every release is tested live | Create one; a second database on the same platform is enough |
| 4 | Frontend direction (nav and dashboard) | Blocks the whole Phase 3 track | Founder to review the stack and direct |
| 5 | Keep or drop the Supabase client auth path | Dead code in the auth story | Drop |
| 6 | Keep or drop the drizzle migration lineage | Two sources of truth for the schema | Keep for tests only, or delete |
| 7 | Trigger.dev: plan or drop | The plan mentions it; no code uses it | Drop from MVP; keep the current job endpoints |
| 8 | Is member invite required for MVP | A real company has more than one person | Yes; it is small |
| 9 | Keep or delete `all prompt.txt` at the repo root | Untracked stray file | Founder's call |

## 62.24 Evidence and artifacts

Commands used repeatedly in this audit:

```
pnpm typecheck
pnpm test
pnpm --filter @orq8/web build
pnpm exec tsx scripts/integration-suite.ts [filter]
pnpm exec tsx scripts/vertical-slice-e2e.ts
pnpm exec tsx scripts/auth-e2e.ts            (AUTH_E2E_WEB=1 for the web phase)
pnpm exec tsx scripts/rls-security-e2e.ts
node scripts/route-sweep.mjs --base <url>
```

Local review: `scripts/review-stack.ts` boots an embedded Postgres with the production
lineage, a local model gateway, the real API and the built web app, seeds one company
(Northwind Labs, flagged as demo) and prints the login. All 33 `/app` routes render on
it, and real actions work.

Tooling added or repaired this cycle:

- `scripts/route-sweep.mjs`: navigation-aborted fetches are now counted, not treated
  as route failures; genuine network failures and 4xx/5xx still fail a route. Before
  this, the sweep reported 8/33 clean because hard navigation cancels in-flight
  polling requests.
- `scripts/vertical-slice-e2e.ts`, `scripts/lib/embedded-db.ts`,
  `scripts/lineage-parity.ts`, `scripts/review-stack.ts`: the proof and parity
  harnesses referenced above.

Open questions this audit could not answer from here, listed so they are not mistaken
for verified facts: the production database's catalog contents, the production API's
deployed version, the live provider keys, whether any external client depends on the
Supabase auth routes, and whether the current production web deployment can be
repointed at a new API without a rebuild.
