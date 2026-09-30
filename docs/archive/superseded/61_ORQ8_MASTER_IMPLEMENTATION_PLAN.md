# ORQ8 Master Implementation Plan

Deliverable for PART 1 of `ORQ8_ALL_PROMPTS_WITH_PLAN.md`. This is the reconciled,
dependency-aware plan for the whole ORQ8 requirement base (Parts 2, Sections 1-9),
written against the repository as it actually is on 2026-09-27, not against what
the source prompts assume exists.

Companion documents (not replaced by this one):
- `docs/ORQ8_IMPLEMENTATION_MASTER_PLAN.md` - subsystem status ledger (updated per phase).
- `docs/ORQ8_CURRENT_STATE.md` - detailed subsystem state.
- `docs/60_PRODUCT_REDESIGN_AUDIT.md` - IA + redesign audit and migration map (Section 7 work).
- `docs/58_DEPLOYMENT.md`, `docs/59_CLOUDRUN_DEPLOYMENT.md` - deploy runbooks.
- `docs/ORQ8_CHANGELOG.md` - per-session log.

Global rules apply to every phase in this document (sentence case, no em dashes in
user-facing copy, no hype, no exclamation marks, Company / Credits / Hire /
Employees terminology, dark green + orange, 4/8/12/16/24/32 spacing, real data
only, fix root causes, no duplicate systems, never expose secrets, never remove
functionality).

---

## 1. Executive Summary

ORQ8 is already a working system, not a greenfield build. The repository contains a
Fastify API (55 route modules, 92 services, 85 API test suites), a Next.js 15 App
Router web app (39 authenticated pages, 14 platform-admin pages, 131 proxy route
handlers), 34 Supabase migrations over 63 tables, a model router with provider
adapters and per-call tracing, an
Executive Agent with intent analysis and approval gating, credits, autonomy
enforcement, audit, memory, a knowledge graph, an engineering workspace with a
sandboxed executor, a connector layer, an SSE realtime layer, a scheduler with
nightly CI, and two purpose-built E2E harnesses (auth + RLS security).

Therefore this plan is a **consolidation and completion plan**, not a rebuild. Of the
requirements in the source prompts, the large majority are either implemented and
verified, implemented and partially wired, or blocked only on credentials. The real
remaining work is concentrated in seven places:

1. **An uncommitted 98-file working tree** (66 modified, 32 untracked) on `main`,
   including verified auth work, the dashboard hub work, the floating-launcher fix
   and the Supabase RLS audit. Nothing downstream is reviewable until this is
   committed in logical commits.
2. **Information architecture**: the sidebar is still the old 4-group / ~30-item
   admin sitemap (Command, Organization, Systems, Governance). The sixth-section
   navigation model in Section 7 does not exist yet, including redirects.
3. **Founder's Attention** is still derived ad hoc inside the dashboard page. There
   is no `/v1/attention` aggregation, no attention page, no attention badge.
4. **Company Overview** is still a stacked card wall, not the 75/25 company hub with
   a persistent, queue-based Executive Agent required by Sections 5, 7 and 9.
5. **Execution infrastructure**: there is no unified execution abstraction
   (`executions` / `execution_steps` / `execution_events`), no durable execution
   engine (Trigger.dev is not installed), and no usage ledger with request IDs or
   credit reservations. Execution today is `tasks` + `job_runs` + `sandbox_runs`
   driven by an in-process executor and a GitHub Actions cron.
6. **Cloud Run**: Kubernetes-free containers are prepared (`infra/cloudrun/*`,
   `docs/59`) but not deployed; Railway is the live API host. Cutover is gated on
   Google Cloud details only the founder can provide.
7. **Security program and scale evidence**: the in-repo RLS/adversarial suite exists
   (55 checks), but the full Strix-led find-fix-retest program, a recorded load-test
   baseline/current comparison, and a browser QA battery over the new IA are still
   outstanding.

The plan below turns those seven areas into 19 phases with explicit dependencies,
acceptance criteria, rollback and credential requirements. Phases 0-9 need no new
credentials and can start immediately. Phases 10-16 are gated on founder-supplied
access (Trigger.dev, Google Cloud, provider keys). Two decisions are genuinely the
founder's and are called out in section 6 and section 30.

## 2. Source Requirements

Requirement base, from `ORQ8_ALL_PROMPTS_WITH_PLAN.md` (Part 2):

| Src | Name | Nature |
|---|---|---|
| §1 | Strix security + UX testing program | Operational mandate: adversarial test, fix, retest, report. Not a feature. |
| §2 | Model infrastructure + OpenRouter + admin usage control | Platform work: gateway, catalog, routing, usage ledger, credits, admin console, limits. |
| §3 | Unified AI execution infrastructure (Vercel + Supabase + Trigger.dev + OpenRouter + agent runtime) | Architecture work: execution abstraction, durable execution, realtime, approvals, credits, observability. |
| §4 | Next-generation execution infrastructure (Cloud Run + Trigger.dev + Supabase + OpenRouter) | Architecture work: Cloud Run compute layer, agent runtime, execution graph, event-driven operation, migration off Railway. |
| §5 | Implementation execution brief (auth, founder attention, navigation, company hub, load scale, Cloud Run prep) | Ordered delivery brief with commit strategy. |
| §6 | Decision Command Center hardening (workstreams A-D) | Hardening: SSE deliberation stages, routing-consequence UI, reaper visibility, hire default, QA-to-reliability loop, rehearsal evidence, showcase org. |
| §7 | Navigation and information architecture redesign | IA work: six primary areas, route mapping, redirects, mobile, permissions. |
| §8 | Trigger.dev project setup | Infrastructure: SDK, config, one task running in dev. |
| §9 | Dashboard welcome hub + EA first-run experience | Product work: oversight hub, EA identity, stage detection, real data, empty states, journeys. |

Cross-cutting requirement groups extracted from the above: product vision and UX
(hub, EA, honest states), architecture (responsibilities, sources of truth), database
(execution, usage, credits reservation), AI/agent (runtime, authority, autonomy,
routing), integrations (GitHub, Gmail, Linear, MCP, Stripe, calendar, CRM),
infrastructure (Vercel, Supabase, Railway, Cloud Run, Trigger.dev, OpenRouter,
LiteLLM), security (tenant isolation, secrets, tool authority, cost abuse), realtime,
credits/billing, audit, admin/observability, performance/load, migration, QA, browser
testing, deployment, git strategy, and the "no fake activity" honesty rule that
appears in every section.

## 3. Current System Understanding

Verified by reading the repository (routes, services, migrations, workflows, scripts,
docs) on 2026-09-27. Sources: `docs/ORQ8_IMPLEMENTATION_MASTER_PLAN.md`,
`docs/60_PRODUCT_REDESIGN_AUDIT.md`, `docs/ORQ8_CURRENT_STATE.md`, and direct
inspection of the code below.

### 3.1 Runtime shape (as built)

| Layer | Reality |
|---|---|
| Web | Next.js 15 App Router on Vercel (`vercel.json`), rootDirectory `apps/web`. Never touches Postgres; all data via route handlers under `apps/web/app/api/*` proxying to the API with a bearer session. |
| API | Fastify 5 + TS on Railway (`railway.json`, `orq8api-production.up.railway.app`). Cloud Run kit prepared but undeployed. |
| DB | Supabase Postgres, project `gttkaxbcdtpsusmconxm`. 34 migrations in `supabase/migrations` plus a Drizzle lineage in `packages/db/migrations`; ~63 tables in the `public` schema. |
| Realtime | API SSE (`/v1/events`, org-scoped) via the same-origin web proxy `/api/events`, with a 60s poll fallback. Two consumers today (department activity widget, notifications). |
| Cache/limits | Redis with in-memory fallback (`services/redis.ts`), circuit breakers, rate limits. |
| Scheduling | `orq8-jobs.yml` GitHub Actions cron + internal token; `job_runs` table; nightly rehearsal workflow; boot + 10-minute orphaned-execution reaper. |
| Model access | `services/model-router.ts` (~1.8k lines): capability registry, provider adapters for NVIDIA NIM, OpenRouter, LiteLLM and Ollama, key pools with cooldown, provider health, calibration routing, retries/fallback. `services/llm-tracer.ts` records per-call phase/model/provider/tokens/latency/success. `security/crypto`, `provider-health`, `circuit-breaker` support it. |

### 3.2 Implemented and verified (keep, do not rebuild)

Auth (Supabase JWT + sessions, email-confirmation gate, OAuth GitHub/Google),
organizations/memberships with RLS, departments/teams/agents CRUD with entitlement
enforcement, entitlement engine, goals + goal intelligence, tasks lifecycle with cost
and audit, company builder + business import, playbooks, simulation v2, agent
reliability + performance reviews, knowledge graph + decision memory, approvals +
audit trail, capability registry, company health, credits/budgets/alerts, briefings,
workforce ROI, engineering workspace (repos/branches/files/PRs/sandbox), connectors
with health lifecycle, MCP registry, event rules, autonomy enforcement (5 levels x
action classes) wired into the task executor, orphaned-execution reaper, failure
analyzer, SSE command center, admin console (13 pages incl. model-router, ai-usage,
execution, errors, security, health), CI workflows, RLS/adversarial suite, auth E2E.

### 3.3 Implemented but partially wired (extend)

| Subsystem | Gap |
|---|---|
| Model gateway | Routing/fallback/health are real, but there is no request ID, no usage ledger table with cost/credits per request, no credit reservation, no per-org/user/agent/department rollups beyond `llm_performance` (which lacks request id, cost and credits). |
| Admin observability | 13 admin pages exist; there is no execution trace view, no request inspector keyed by request ID, no anomaly-to-execution correlation, no time-series filters. |
| Realtime | Only 2 consumers; the company hub does not subscribe to task/approval/agent/workstream events. |
| EA | Intent analysis, delegation, approvals and command streaming work. The panel is single-request (send is disabled while a stream runs) and there is no founder-message queue. |
| Attention | Derived ad hoc in `app/app/page.tsx`; no API, no page, no badge. |
| Decision Council | Async sessions exist (202 + poll), and `deliberation.ts` emits real stage progress via `onProgress`, but the council page does not render live stages (Section 6 A1) and routing-consequence explanation is missing (A2). |
| Connectors | GitHub live; Google/Gmail/Linear blocked on OAuth credentials. |
| Integration credentials | Connector actions are audited; per-department embedding of integrations does not exist. |
| Demo org | `isDemo` labelling exists on orgs; showcase-org plan limits (Section 6 D1) are not provisioned. |

### 3.4 Missing (build)

| Missing | Required by |
|---|---|
| Unified execution abstraction (`executions`, `execution_steps`, `execution_events`, `execution_dependencies`) | §3 §5/§6, §4 §10/§11 |
| Durable execution engine (Trigger.dev SDK, config, tasks, queues, durable waits, schedules) | §3 §9, §4 §42, §8 |
| Usage ledger (`ai_requests` / `ai_usage_events`) with request IDs, provider cost, credits, retry/fallback flags | §2 §28-§31, §3 §18 |
| Credit reservations + settlement (`credit_reservations`) | §2 §12, §3 §16/§17, §4 §16 |
| Founder's Attention API + page + top-bar badge | §5 §5/§6, §7 §4 |
| Six-area IA with nested nav, collapsed mode, redirects, mobile pattern | §7 §2/§3/§13/§16 |
| Company Overview 75/25 hub with persistent queue-based EA | §5 §7/§8/§9, §7 §24, §9 |
| Workstreams as first-class pages (over the existing strategy stack) | §7 §4, audit §11 |
| Task board (Backlog/To do/Doing/Review/Blocked/Done) + dependency surfacing | §4 §32, §7 §4 |
| Department workspace frame + per-department capability modules | §4 §33/§34, §7 §5 |
| Agent authority UI (CAN / REQUIRES APPROVAL / CANNOT) | §4 §8, §7 §8 |
| Events table + event router + correlation IDs + idempotent consumers | §4 §18/§19 |
| Runaway protection beyond current budgets (max iterations/model calls/tool calls/child executions, kill switches, cancellation propagation) | §2 §23, §3 §39, §4 §22/§25 |
| Model/provider admin controls (enable/disable model, routing config, fallback config, replay) | §2 §24 |
| Cost/margin analytics (provider cost vs credits vs revenue) | §2 §20/§57 |
| Load-test baseline/current report | §2 §45, §5 §13/§14 |
| Strix-led security program, or equivalent in-repo adversarial program with retest evidence | §1 |
| Browser QA battery over the new IA | §5 §15, §7 §25, §9 §22 |
| Cloud Run deployment (services, secrets, health, verification) | §4 §41, §5 §17/§18/§19 |
| Railway-to-Cloud-Run migration map + cutover/rollback | §4 §50, §5 §17 |

### 3.5 Layer classification (strict, per PART 1 §7)

- **PRODUCTION READY**: auth, orgs/RLS, entitlements, tasks, goals, approvals, audit,
  credits ledger, company health, engineering sandbox/PRs, connectors (GitHub),
  scheduler/jobs, admin console core, model routing.
- **PARTIAL (UI without full chain)**: attention (UI derivation only), department
  workspaces (identical CRUD pages), council live stages, memory surfacing,
  per-dimension credit rollups, workstreams, task board, billing UI.
- **BACKEND ONLY**: billing checkout/portal (no web proxy/UI), portability export
  (no import), capability registry (no founder door), some event rules.
- **FRONTEND DERIVED (must be replaced by API)**: dashboard attention items,
  "recommended priorities" surfaced only as dashboard cards.
- **MISSING**: execution abstraction, usage ledger, credit reservations, events
  table/router, durable execution, Cloud Run runtime, workstream pages, department
  workspace frame, authority panel, attention API, IA shell, load/security evidence.

## 4. Target Architecture

Final responsibilities. Nothing may overlap without an explicit reason.

| Component | Owns | Explicitly does not own |
|---|---|---|
| Vercel (web) | Founder interface, RSC pages, lightweight route proxies, streaming entry points, realtime subscription client | Long-running work; provider keys; business state |
| Supabase/Postgres | Durable source of truth: users, orgs, departments, teams, agents, goals, workstreams, tasks, approvals, decisions, executions, usage ledger, credits, memory, events, audit, integrations, schedules | Execution orchestration; model access |
| ORQ8 API (Railway today, Cloud Run later) | Auth, org scoping, REST/SSE surface, agent runtime, model gateway, tool gateway, event ingestion, webhooks | Durable waits; long-running orchestration |
| Cloud Run | Fast stateless compute: execution API, agent runtime, model gateway, tool gateway, webhooks/events | Durable company state (must survive instance death) |
| Trigger.dev | Durable orchestration: long-running jobs, retries, schedules, durable waits (approval, time, webhook, dependency), concurrency, cancellation | Company database; permission decisions |
| ORQ8 Model Gateway (`services/model-router.ts` + usage ledger) | Provider abstraction, model catalog, routing policy, credit checks and reservations, usage/cost recording, retries/fallback, request IDs | Agent identity; organizational authority |
| ORQ8 Agent Runtime (`services/executor.ts`, `task-executor.ts`, `agent-context.ts`, `autonomy.ts`, `tool-registry.ts`) | Agent identity, context assembly, authority, planning, tool access, escalation, reporting | Model provider access; credit arithmetic |
| OpenRouter (and NVIDIA/LiteLLM adapters) | External model access and provider-reported usage | Anything else |
| Executive Agent (`services/executive-agent.ts`, web EA shell) | Coordination, intent analysis, delegation, founder interface | Direct model calls outside the gateway; bypassing the runtime |
| Event router (new) | Persisting events, idempotent consumption, correlation IDs, mapping events to work | Owning business state |

Sources of truth: company/agent/task/approval/credit/permission/memory/audit state in
Supabase; run mechanics in Trigger.dev; provider response and provider-reported usage
in OpenRouter; ORQ8 reconciles external execution into Supabase and never lets the
frontend depend on Trigger.dev or OpenRouter directly.

Execution classes: A instant (Vercel → Cloud Run → Supabase/gateway), B active AI work
(Cloud Run → agent runtime → gateway → Supabase, escalate to durable if long), C durable
(ORQ8 → Trigger.dev → Cloud Run → runtime → gateway → providers → Supabase).

## 5. Architecture Decisions

Decisions taken from the source material and the repository, with rationale:

1. **One model gateway, not two.** `services/model-router.ts` already is the gateway
   architecture (provider abstraction, routing, health, keys, tracing). Section 2 §49
   forbids a second. We extend it with request IDs, usage events, credit estimation,
   reservations and admin config rather than creating `ModelRouter2`.
2. **OpenRouter is a provider, not the architecture.** Section 2 §61 in the source is
   explicit: build model infrastructure. OpenRouter stays one adapter (already
   present) alongside NVIDIA NIM and LiteLLM (`infra/litellm/config.yaml` is the
   proxy config, not the source of truth).
3. **Supabase stays the durable source of truth.** No company state in Trigger.dev or
   Cloud Run. Trigger.dev run IDs are foreign keys, never authority.
4. **Execution abstraction is additive.** `executions`/`execution_steps`/
   `execution_events` reference existing `tasks`, `agents`, `departments`,
   `job_runs`, `sandbox_runs`; nothing is duplicated or renamed blindly.
5. **Durable execution is Trigger.dev; cron stays where it is until verified.**
   Existing GitHub-Actions cron + `job_runs` continues to own scheduled deliveries
   until Trigger.dev schedules are live and compared; then schedules migrate and the
   cron entries are retired one by one, with rollback.
6. **Cloud Run is prepared, not cut over.** Railway remains live until Cloud Run
   passes the same smoke and ops-check suites; then traffic moves and Railway is
   retired only after a verification window (`§4 §50`).
7. **Founder-facing usage is Credits. Tokens and provider cost stay admin-only.**
8. **IA is the six-area model** (Section 7): Company, Work, Organization, Decisions,
   Resources, Governance, with Settings outside primary navigation. This supersedes
   the five-area sketch in Section 5 §10 (older).
9. **No page is deleted by the IA change.** Every existing route is re-homed or
   redirected, verified by a route sweep.
10. **Realtime is extended, not replaced.** Existing SSE + poll fallback stays; new
    consumers subscribe to task/approval/agent/workstream/execution events.
11. **Design language: dark shell, dark-green dominant, orange accent.** Lime
    (`#B8FF66`) is retired from new and touched surfaces per the global brand rules
    and audit §9; statuses keep semantic colours only.
12. **Security is enforced server-side, always.** Menu hiding is never authorization.
13. **No fake anything.** Every visible state maps to a database row or provider
    response; empty states say what is missing and offer the next real action.
14. **Idempotency keys on every consequential external action** (email, deploy,
    payment, PR, webhook), keyed by execution + step + action.

## 6. Conflicts / Decisions Required

| # | Conflict | Resolution | Status |
|---|---|---|---|
| C1 | Section 7 proposes six primary nav areas; Section 5 §10 proposes five (Company, Work, Departments, Decisions, Reports) | Newer, more detailed Section 7 wins: six areas | Confirm with founder (Q2) |
| C2 | Section 9 requires a stage-aware EA welcome area on the dashboard; the founder asked to revert that banner to the pre-change "Company at a glance" block | Section 9's requirement and the founder's explicit instruction disagree | REQUIRES DECISION (Q3) |
| C3 | Source prompts assume Railway is legacy to be replaced; repository runs production on Railway with Cloud Run only prepared | Keep Railway live, deploy Cloud Run in parallel, cut over after verification, retire Railway last | Confirm timing with founder (Q5) |
| C4 | Source prompts assume no execution infrastructure; repository has `tasks` + `job_runs` + in-process executor + GitHub cron | Add execution abstraction + Trigger.dev around existing primitives; do not duplicate the scheduler | Acceptance: no second scheduler, no second queue |
| C5 | Section 2 §46 says add `OPENROUTER_API_KEY`; repository already routes via OpenRouter + NVIDIA NIM + LiteLLM with key pools | Keep the existing multi-provider pool; OpenRouter is primary, NVIDIA NIM first fallback (docs/22.9); add nothing blindly | Documented in docs/22.9 |
| C6 | Global rules forbid lime; repository still uses lime in sidebar, plan badge, launcher and status dots | Retire lime from touched surfaces; full sweep in the design phase | Confirm scope (Q4) |
| C7 | Section 1 mandates running Strix; Strix is not present in the repository or this environment | Either the founder provides Strix access, or the security program is delivered as an expanded in-repo adversarial suite (RLS/tenant/tool/cost) with retest evidence | REQUIRES DECISION (Q6) |
| C8 | Section 2 §18 wants an internal admin usage dashboard; repository already has 13 admin pages | Extend existing admin console; no second admin surface | Settled |
| C9 | Section 6 B2 wants new hires to default to `execute_with_approval`; migration 0009 already sets that column default | Already satisfied at DB level; verify the hire UI presents the choice in plain language | Settled; verify in phase 7 |
| C10 | Section 4 §43 lists likely tables including `schedules`, `events`, `tool_calls`; repository has `job_runs`, `activity_events`, `event_rules` but no first-class `events`/`schedules` | Add only what is missing (`events`, `execution_*`, `ai_*`, `credit_reservations`); keep `event_rules` and `job_runs` | Settled |
| C11 | Terminal state handling: source says WAITING/BLOCKED must not be conflated with FAILED; repository task statuses are `pending/in_progress/completed` + blocked flag | Introduce execution-level status enum including WAITING/BLOCKED; map task status upward, do not rewrite task statuses | Settled |

## 7. Complete Phase Plan

Ordering principle: unblock review and trust first, then the surfaces the founder
touches daily, then the execution substrate, then infrastructure, then evidence.

| Phase | Name | Depends on | Needs credentials |
|---|---|---|---|
| 0 | Baseline commit + green verification | - | no |
| 1 | Auth close-out verification | 0 | no |
| 2 | Navigation and IA redesign (six areas + redirects) | 0, 1 | no |
| 3 | Founder's Attention (API + page + badge) | 2 | no |
| 4 | Company Overview hub 75/25 + persistent queue-based EA | 2, 3 | no |
| 5 | Workstreams + task board | 4 | no |
| 6 | Department workspaces + agent authority UI | 2, 5 | no |
| 7 | Decision Command Center + council live stages | 2, 4 | no |
| 8 | Resources, Governance surfaces, Reports, credits rollups | 2, 5 | no |
| 9 | Design-language pass (lime retirement, dark surfaces, spacing) | 2-8 | no |
| 10 | Model gateway completion: request IDs, usage ledger, credits reservations, admin model controls | 0 | OpenRouter key confirmation |
| 11 | Unified execution abstraction + Trigger.dev durable execution + events router | 10 | Trigger.dev login + dev secret |
| 12 | Cloud Run deployment (API, runtime, gateway, webhooks) | 11 | Google Cloud project/billing/region/SA |
| 13 | Admin observability console (executions, request inspector, anomalies, cost/margin) | 11, 12 | no |
| 14 | Runaway protection, concurrency, cancellation, kill switches | 11, 13 | no |
| 15 | Load and scale evidence | 11-14 | no |
| 16 | Security program (Strix or in-repo adversarial) with fix + retest | 2-15 | Strix access if used |
| 17 | Browser QA battery over the new IA + journeys | 2-9 | no |
| 18 | Railway-to-Cloud-Run cutover + docs + launch checklist | 12-17 | Railway token, DNS |

Parallel tracks: 3 and 4 can overlap with 5-8 once 2 lands; 10 can start any time
after 0 because it touches only API internals; 15 and 16 need the execution substrate
but their harnesses can be written earlier.

## 8. Phase-by-Phase Implementation Tasks

Each phase states objective, why now, scope, tasks, frontend, backend, database,
AI/agent, infrastructure, integrations, security, realtime, testing, dependencies,
outputs, acceptance criteria, risks and rollback.

### Phase 0 - Baseline commit and green verification

- **Objective**: turn a 98-file working tree into reviewable, logically separated
  commits and establish the green baseline every later phase diffs against.
- **Why now**: nothing is reviewable or bisectable while verified work (auth, RLS
  hardening, dashboard hub, launcher fix) sits uncommitted on `main`; migration
  0033/0034 are written but not applied anywhere, so environment drift is invisible.
- **Scope**: commit grouping, environment parity check, verification battery run.
- **Tasks**: (1) group the working tree into logical commits (auth, rls/migrations,
  dashboard hub, launcher/collision, docs, tests); (2) confirm 0033/0034 are applied
  in the environments that matter via the DB Migrate workflow; (3) run API + web
  typecheck, unit suites, integration suites, web build, auth E2E, RLS E2E; (4)
  record the baseline (counts, pass rates, timings) in the changelog.
- **Frontend**: none (verification only).
- **Backend**: none (verification only) except removing any stray debug artefacts
  (`tmp-visual-qa.*`, stray logs) from the tree.
- **Database**: verify 0033 (RLS hardening) and 0034 (FK indexes) applied; no new
  migrations.
- **Security**: confirm no secrets staged (`secrets.env` gitignored, `.env` files
  untracked).
- **Testing**: full battery above; capture exact commands and results.
- **Dependencies**: founder approval to commit (Q1).
- **Outputs**: clean-ish tree, green baseline record, list of remaining uncommitted
  intentional work.
- **Acceptance**: `git status` shows only expected files; typecheck/build/E2E green;
  baseline recorded.
- **Risks**: mixing unrelated changes in one commit (mitigate with per-topic
  commits); accidentally committing secrets (mitigate with explicit staging and a
  diff review per commit).
- **Rollback**: commits are local; revert individually.

### Phase 1 - Auth close-out verification

- **Objective**: prove the overhauled auth behaves correctly in every state, so the
  redesign is built on a verified floor.
- **Why now**: Section 5 §3/§4 predates the overhaul; it must be closed out with
  evidence rather than re-implemented.
- **Tasks**: run the auth E2E battery (API + web phases), verify login, signup,
  logout, session restoration, protected routes, redirects, expired/invalid sessions,
  email-confirmation gate, OAuth callbacks, mobile viewport states; confirm the
  banned-word scan on auth copy still passes.
- **Frontend**: fix any copy/state defect found (sentence case, no em dashes).
- **Backend**: fix any session/redirect defect found.
- **Outputs**: pass record with command output.
- **Acceptance**: all auth states verified; zero regressions in the 129 integration
  tests.
- **Risks**: low.

### Phase 2 - Navigation and information architecture redesign

- **Objective**: replace the flat 30-item sidebar with the six-area IA and make every
  existing route reachable or redirected.
- **Why now**: it is the prerequisite for Attention, the company hub, department
  workspaces and the whole Section 7 information architecture.
- **Scope**: route audit, nav shell (nested groups, collapsed mode, active state,
  mobile pattern), permission-aware visibility, redirects, deep-link verification.
- **Tasks**: (1) produce the audited mapping table (current route → purpose →
  components → data source → new location → disposition → redirect) from
  `docs/60_PRODUCT_REDESIGN_AUDIT.md` §11 and re-verify against the current tree;
  (2) build the nav data model from that table; (3) implement nested sidebar with
  COMPANY / WORK / ORGANIZATION / DECISIONS / RESOURCES / GOVERNANCE, Settings
  outside primary nav, notifications in the top bar; (4) add redirects for every
  moved route; (5) update internal links; (6) verify permissions-based visibility
  (admin/simulation hidden for non-admins without weakening server authorization).
- **Frontend**: `app-sidebar.tsx`, top bar, mobile drawer, breadcrumbs, empty
  group states.
- **Backend**: none required; any missing list endpoint for a nav badge is added
  org-scoped.
- **Database**: none.
- **Realtime**: nav badges may subscribe to the existing SSE stream (attention count).
- **Testing**: route sweep script (`scripts/route-sweep.mjs`) extended to assert every
  old route resolves (redirect or 200) and every new route renders.
- **Acceptance**: six primary areas; no functionality unreachable; no redirect loops;
  mobile nav usable; route sweep green.
- **Risks**: broken bookmarks (mitigate with redirects + sweep), hidden functionality
  (mitigate with the audit table), shell rewrite breaking pages (shell wraps routes,
  does not rewrite page bodies).
- **Rollback**: nav data model is one module; revert it and the redirects.

### Phase 3 - Founder's Attention

- **Objective**: one real attention system: `GET /v1/attention` aggregating approvals,
  permission requests, blocked critical work, failures needing review, credit alerts,
  deadline risk, and council escalations, plus `/app/attention` and a top-bar badge.
- **Why now**: highest value per effort, and the company hub is built around it.
- **Tasks**: (1) design the item shape (what / why / who / authority / impact / next /
  actions); (2) implement the aggregation over real tables org-scoped; (3) actions
  that call real endpoints (approve, reject, retry, pause, cancel, ask EA); (4) page
  with dense operational layout, severity ordering, empty state with next action;
  (5) top-bar badge with realtime count.
- **Backend**: `routes/attention.ts`, `services/attention.ts`.
- **Database**: no table (aggregate query); indexes verified under load in phase 15.
- **Realtime**: emit attention-changed events; badge and page subscribe.
- **Testing**: unit tests for classification/ordering, integration tests for
  cross-org isolation, e2e for each action.
- **Acceptance**: every item traces to a row; actions are idempotent and audited; no
  fabricated items when the company is quiet.
- **Risks**: slow aggregate (mitigate with indexes + limit), duplicate sources
  (mitigate with a single service).

### Phase 4 - Company Overview hub and persistent Executive Agent

- **Objective**: 75/25 company hub (attention, workstreams, live org, active work,
  recent outcomes, health) with a persistent, queue-based EA, implementing Section 9's
  first-run and returning-user experience over the existing dashboard work.
- **Why now**: it is the product's centre of gravity and the phase the founder asked
  for.
- **Tasks**: (1) layout shell for the hub; (2) wire live state (agents, tasks,
  approvals, credits, workstreams, activity) with realtime; (3) EA message queue:
  founder messages post immediately, render in order, never block input, progress
  events attach to the causing message; (4) EA identity (configurable name, already
  `EA_DISPLAY_NAME`), persona rules (one adaptive question at a time, grounded
  observations, propose structure, never silently activate); (5) stage detection from
  persisted onboarding state (new / in progress / complete) with honest copy per
  stage and empty states that offer the next real action; (6) resolve C2 with the
  founder and apply the chosen welcome treatment.
- **Frontend**: `app/app/page.tsx` (hub), `executive-agent-panel.tsx` (queue),
  `executive-agent-context.tsx` (queue state), hub blocks.
- **Backend**: `POST /v1/ea/messages`, `GET /v1/ea/messages?since=`, progress events;
  reuse `/v1/commands` internals.
- **Database**: conversation persistence (message rows with org, user, execution link).
- **AI/agent**: EA prompt rules; intent → work creation stays behind the gateway.
- **Realtime**: agent/status/work/an approval events feed the hub.
- **Testing**: four founder journeys (new, partial onboarding, onboarded, returning
  active company) as automated checks; EA queue concurrency test (send while running).
- **Acceptance**: hub shows only real state; EA input never blocks; journeys pass;
  no fabricated activity.
- **Risks**: EA queue touches the live command pipeline (mitigate: keep `/v1/commands`
  intact, add the queue above it, feature-flag the panel).
- **Rollback**: feature flag off returns the current panel.

### Phase 5 - Workstreams and task board

- **Objective**: first-class workstream pages over the strategy stack, plus a task
  board with dependency surfacing.
- **Tasks**: `GET /v1/workstreams`, `/v1/workstreams/:id` with derived health;
  workstream pages (objective, departments, tasks, blockers, deadline, activity,
  outcomes); task board columns over real statuses + blocked flag; dependency links;
  honest empty and insufficient-data states.
- **Database**: reuse `initiatives`/`objectives`/`key_results`; add columns only if
  queries demand; index for board queries.
- **Testing**: derivation tests (no invented health), board filter tests, e2e.
- **Acceptance**: workstream health derives from real tasks; board reflects real
  statuses; dependencies visible.

### Phase 6 - Department workspaces and agent authority UI

- **Objective**: department workspace frame (mission, head, agents, active work,
  goals, approvals, budget, activity, memory, tools) with per-department capability
  modules that render only what exists; agent detail authority panel.
- **Tasks**: workspace assembly endpoint, shared frame component, engineering
  upgrades (repos/PRs/sandboxes already exist), marketing/sales/finance modules with
  honest "planned" states where nothing exists, authority panel derived from
  autonomy + authority + grants.
- **Testing**: per-department render tests, authority derivation tests, cross-org
  isolation.
- **Acceptance**: no identical-CRUD feel; nothing shown that does not exist.

### Phase 7 - Decision Command Center and council live stages

- **Objective**: close Section 6 workstreams A-D and evolve the council into the
  structured decision process view.
- **Tasks**: A1 SSE stage events on the council page (render framing, independent
  analysis, cross-examination, final positions, synthesis from real server events;
  honest reconnecting state); A2 routing-consequence explanation on escalation;
  A3 e2e test for honest progress; B1 reaper reapings surfaced on the jobs page with
  cause and resulting state; B2 verify/repair hire-time autonomy choice defaulting to
  execute_with_approval with plain-language options; B3 QA scores must feed agent
  reliability (bug if they do not); C1 run the nightly rehearsal green once; C2 weekly
  summary of flaky vs hard failures on the rehearsal issue; C3 record rehearsal
  evidence and honest limitations in the launch checklist; D1 provision Finance in the
  showcase org by raising the demo plan limit (demo change, labelled simulated).
- **Testing**: council e2e, reaper visibility test, QA-to-reliability test.
- **Acceptance**: the Section 6 final QA list passes.

### Phase 8 - Resources, Governance, Reports, credits rollups

- **Objective**: complete the surface set: Files, Knowledge, Memory, Integrations,
  Tools & MCP under Resources; Approvals, Budgets, Authority, Usage & Credits, Audit,
  Constitution, Quality & Learning under Governance; Reports (company, departments,
  performance, costs, briefings).
- **Tasks**: re-home existing pages per the audit map; merge overlapping
  memory/learning/quality surfaces; per-department/agent/workstream credit rollups
  from real transactions; merge ROI into Reports/Performance; token strings audited
  out of founder-facing copy.
- **Testing**: rollup arithmetic tests, copy audit (no "tokens" for founders), route
  sweep update.
- **Acceptance**: every existing capability reachable under its new home; credits
  rollups reconcile with the ledger.

### Phase 9 - Design-language pass

- **Objective**: retire lime, land the dark-green + orange language, normalize
  spacing/typography, remove decorative motion, keep status colours semantic.
- **Tasks**: palette tokens; sidebar/plan/launcher/status sweep; spacing scale audit
  (4/8/12/16/24/32); two font weights; sentence case + em-dash scan across touched
  copy; contrast self-check on all changed surfaces.
- **Testing**: contrast diagnostic, visual QA in phase 17.
- **Risks**: regressing contrast (mitigate with the existing self-check pattern).

### Phase 10 - Model gateway completion

- **Objective**: finish the gateway: request IDs, usage ledger with cost and credits,
  credit estimation/reservation/settlement, per-dimension rollups, admin model
  controls, structured logs.
- **Tasks**: request ID format and propagation (API → gateway → provider → ledger →
  logs → admin); `ai_requests`/`ai_usage_events` append-only ledger written
  asynchronously off the streaming path; credit calculator service with configurable
  conversion; `credit_reservations` with settle/release and idempotency; rollups for
  org/user/agent/department/request-type; admin enable/disable model, routing and
  fallback config, replay safe failures; never log secrets or full prompts.
- **Database**: new tables + indexes + RLS; no mutation of history.
- **Testing**: gateway unit tests (routing, fallback, retry, cancellation), usage
  accuracy under concurrency, reservation settle/release, cross-org isolation,
  insufficient-credit rejection.
- **Acceptance**: direct-provider-call audit reads zero outside the gateway;
  ledger reconciles with `llm_performance` and credit transactions; founder surfaces
  show Credits only.
- **Risks**: double counting (mitigate with idempotency keys on settle).

### Phase 11 - Execution abstraction, Trigger.dev, events

- **Objective**: the execution substrate: `executions`, steps, events, dependencies;
  Trigger.dev for durable work; event router with correlation IDs; durable waits for
  approvals; cancellation propagation.
- **Tasks**: Trigger.dev init (Section 8: SDK, `trigger.config.ts` with project
  `proj_frubeqhpsrmvrwpfdegd`, `src/trigger/`, one task running in dev); task set
  (executeAgentTask, executeWorkstream, executeResearch, executeDecision,
  processMemory, generateCompanyReport, processApprovalContinuation); execution
  context passed and validated server-side; fast vs durable routing in the agent
  runtime; approval waits resume from durable state; events table + router +
  idempotent consumers; correlation from execution to run to model requests to tool
  calls; status mapping (CREATED/QUEUED/STARTING/RUNNING/WAITING/APPROVAL_REQUIRED/
  RESUMING/COMPLETED/FAILED/CANCELLED/TIMED_OUT + BLOCKED).
- **Database**: `executions`, `execution_steps`, `execution_events`,
  `execution_dependencies`, `events`; FKs to tasks/agents/departments/job_runs.
- **Testing**: first vertical slice (founder → EA → engineering task → execution →
  runtime → gateway → OpenRouter → Supabase → realtime → dashboard → credits → admin
  trace), long-running research, approval pause/resume, failure/retry, duplicate
  event protection, concurrent agents, company continues while founder is offline.
- **Acceptance**: Section 3 §66 slice green; Section 4 §63 criteria 1-30 addressed
  for the implemented depth.
- **Risks**: durable waits leaking model calls (forbid), Trigger.dev becoming the
  database (forbid), Railway/Trigger split-brain schedule ownership (explicit
  ownership table).

### Phase 12 - Cloud Run deployment

- **Objective**: deploy the fast compute layer and verify it, in parallel with
  Railway.
- **Tasks**: service boundaries (execution API, agent runtime, model gateway, tool
  gateway, webhooks) as one or a few services with clear internal separation;
  Docker/Cloud Build verification; health endpoint; secrets in Secret Manager;
  environment matrix; deploy to staging-like environment; run smoke + ops-check
  suites; document the Railway mapping and cutover plan.
- **Credentials**: Google Cloud project, billing, region, service accounts, Artifact
  Registry, enabled APIs (`docs/59` §59.3).
- **Acceptance**: health check, auth, Supabase, Model Gateway and one agent execution
  verified from Cloud Run; no production cutover yet.
- **Rollback**: Cloud Run is additive; Railway remains authoritative.

### Phase 13 - Admin observability console

- **Objective**: execution/request-level observability and cost analytics.
- **Tasks**: execution list + timeline view; request inspector by request ID (org,
  agent, department, task, execution, model, provider, durations, tokens, cost,
  credits, retries, fallback, error, outcome); provider/model health panels;
  anomaly list with links to executions; cost vs credits vs revenue; CSV export
  behind admin authorization; realtime counters.
- **Testing**: authorization tests (non-admin 403), cross-org isolation, export
  permission tests.
- **Acceptance**: admin can trace organization → department → agent → task →
  execution → model request → tool call end to end.

### Phase 14 - Runaway protection, concurrency, cancellation

- **Objective**: hard server-side limits and real cancellation.
- **Tasks**: max runtime/model calls/tool calls/iterations/retries/credits/child
  executions per execution, agent and org; concurrency levels (global/org/department/
  agent/task type); kill switches (all AI, background AI, premium models, provider,
  model, org, agent); cancellation that propagates to the underlying run; resume from
  durable state; admin-visible limit events.
- **Testing**: limit-exceeded stops and reports; concurrency saturation test; cancel
  mid-run; resume after approval.
- **Acceptance**: no execution can spend unbounded credits or loop indefinitely.

### Phase 15 - Load and scale evidence

- **Objective**: measured throughput/latency for org-scale and mixed workloads, with
  a baseline/current/delta report.
- **Tasks**: run `scripts/load-scale.ts` (120 departments, 10k employees, 15k tasks,
  decoy org) plus concurrency runs; verify the new hot paths (attention aggregate,
  usage ledger writes, execution lists, board queries) under load; record
  `BASELINE / CURRENT / DELTA / BOTTLENECK / RECOMMENDATION`; check no credit or
  usage race conditions.
- **Acceptance**: report exists; regressions identified, not hidden.

### Phase 16 - Security program

- **Objective**: adversarial test → fix → retest with evidence, across auth,
  authorization, tenant isolation, EA prompt injection, tool authority, files,
  API surface, cost abuse, admin, business logic, plus UX findings.
- **Tasks**: run Strix (if provided) or the expanded in-repo suite; triage by
  severity with proof; fix root causes (not payload blocks); search for the same
  pattern elsewhere; retest; regression suite; final posture statement.
- **Acceptance**: no critical/high unresolved; retests recorded; posture declared
  honestly.

### Phase 17 - Browser QA battery

- **Objective**: verify the redesigned auth, navigation and hub in a real browser
  across desktop/tablet/mobile, keyboard and focus states, error/empty/loading states,
  and the four founder journeys.
- **Tasks**: extend the existing harness pattern into a product E2E script; run
  against a local production build and one deployed environment; capture evidence.
- **Acceptance**: journeys pass; responsive and accessibility checks recorded; no
  visual regression on touched surfaces.

### Phase 18 - Cutover, docs, launch checklist

- **Objective**: move production traffic per the migration plan, then document.
- **Tasks**: Railway→Cloud Run mapping executed with a verification window and
  rollback; Trigger.dev schedules compared against cron before retiring cron;
  environment matrices updated; launch checklist updated with this program's evidence
  and honest limitations; changelog and master-plan ledger updated.
- **Acceptance**: production verified on the new topology; docs match reality.

## 9. Database Plan

Additive only, migration-per-concern, RLS on every new table, indexes in the same
migration, no history mutation:

| Migration | Tables | Notes |
|---|---|---|
| 0035 | `ai_requests`, `ai_usage_events` | Append-only ledger: request id, org, user, agent, department, task, execution, request type, provider, model, timings, tokens, provider cost, credits, retry, fallback, error code. Org RLS; admin read via service role. |
| 0036 | `credit_reservations` | Reservation lifecycle with settle/release, idempotency key, links to request/execution. |
| 0037 | `executions`, `execution_steps`, `execution_dependencies` | Execution abstraction with status enum including WAITING/BLOCKED; FKs to tasks, agents, departments, job_runs. |
| 0038 | `execution_events`, `events` | Durable event log with correlation id, actor, entity, payload, consumed-at for idempotent consumers. |
| 0039 | `ea_messages` | Founder-EA conversation rows with execution links and ordering. |
| 0040 | model/provider config + limits | Model catalog entries, provider enable flags, routing/fallback config, org/agent/department limit rows. |

Rules: derive totals from events, never store mutable counters as the only source;
index every FK (see 0034 pattern); verify RLS with the existing 55-check suite
extended per table.

## 10. Agent / AI Runtime Plan

- Keep `services/executor.ts`, `task-executor.ts`, `agent-context.ts`,
  `autonomy.ts`, `tool-registry.ts`, `agent-memory.ts` as the runtime.
- Add: execution lifecycle management, durable/instant classification, authority
  panel data endpoint, per-execution budget tracking, tool call audit rows, child
  execution limits, escalation to WAITING/APPROVAL_REQUIRED instead of FAILED.
- Prompt and context: deterministic context assembly (company + department + agent +
  task + relevant memory/decisions/files/events), never the whole database.
- Authority is server-side only: no model output, prompt or client input can grant
  permission; agents cannot modify their own authority or budget.

## 11. Execution Infrastructure Plan

- Fast path: Vercel → API/Cloud Run → runtime → gateway → response; no durable
  orchestration for simple reads or a single EA reply.
- Durable path: execution row (CREATED) → queue → Trigger.dev run → steps →
  model/tool calls → state updates in Supabase → realtime → founder UI.
- WAITING is durable and costs nothing: approval, time, external event, dependency,
  customer response, human input.
- Cancellation: founder cancels → API marks execution cancelling → propagate to the
  run → final state CANCELLED with completed/remaining work recorded.
- Idempotency: every consequential external action keyed by execution + step + action.

## 12. Cloud Run Plan

Follow `docs/59_CLOUDRUN_DEPLOYMENT.md`. Additions required by this plan: execution
API, agent runtime and tool gateway entry points; health endpoint per service;
Secret Manager for provider keys; concurrency settings aligned with Phase 14 limits;
identity for webhook receivers; structured logs carrying request/execution IDs.

## 13. Trigger.dev Plan

Setup per Section 8 (project `proj_frubeqhpsrmvrwpfdegd`), then: tasks for agent
execution, research, decisions, approvals continuation, memory processing, reports,
and scheduled company work; concurrency limits per level; schedules stored in the
database (not only in Trigger.dev) with an ownership table for cron migration;
project sync creates tasks on deploy (never `trigger.config.ts` in `tsconfig`
exclude; `.trigger` gitignored).

## 14. OpenRouter / Model Gateway Plan

Provider layer stays `model-router.ts`: adapters (OpenRouter, NVIDIA NIM, LiteLLM,
Ollama), key pools, cooldowns, health, calibration routing, fallback. Additions:
logical capability names mapped in a catalog (fast, general, reasoning, coding,
research, vision, background, premium) so agents never name models directly; policy
checks (plan, budget, model permission) before dispatch; usage capture with provider-
reported cost when available plus configured pricing with a version stamp; streaming
without duplicated usage records; explicit error taxonomy surfaced in founder language
("the selected model is temporarily unavailable; no action was taken").

## 15. Executive Agent Plan

Identity (configurable name, default Atlas) with executive-register copy rules;
intent analysis; grounded observations from real state; one adaptive question at a
time during first-run; propose-then-approve organisation changes; strict separation of
recommendation / proposed / awaiting approval / executed; queue-based conversation
that never blocks input; page-context awareness; delegates through the runtime (never
a direct provider call); can answer "what happened, what needs me, what is blocked,
what did X do, what did this cost" from real state only.

## 16. Company / Department / Employee Plan

Company hub as in Phase 4. Departments: shared frame + specialised capability modules
rendering only what exists, with honest planned states; one department cannot block
another. Employees: real identity, authority, tools, budget, current work,
performance, memory; UI says "Hire", "Employees", "Company", "Credits".

## 17. Memory / Decision / Event Plan

Memory: `company_memory` + knowledge graph feed context; provenance shown when memory
influences an answer; outcomes auto-summarised (never raw model output). Decisions:
structured 15-step process; decision history preserved with rationale, evidence,
assumptions, approvals, outcomes; council uses multiple models for analytical
diversity, not theatre. Events: persisted with correlation IDs, idempotent consumers,
mapped to work creation by an event router; DEPLOYMENT_FAILED, LEAD_CREATED,
NEW_FEEDBACK, BUDGET_THRESHOLD_REACHED and friends drive real executions.

## 18. Credits / Billing Plan

Credits are the only founder-facing unit. Ledger is append-only with reservations;
conversion is configurable in one service; retries never double charge; provider
cost, credits and revenue are separate concepts with separate admin views; billing
architecture ready for subscription + included + purchased credits (Stripe checkout
UI deferred until keys and scope are confirmed).

## 19. Security Plan

Server-side enforcement everywhere; org scoping on every query; admin gates;
execution IDs are not authorization; tool authority checked server-side; secrets
never in client bundles, logs, analytics or the database; file uploads validated
(type, size, extension, MIME) and treated as untrusted instruction sources;
cost-abuse limits (rate limits, per-agent/org caps, runaway protection); the security
program in Phase 16 with retest evidence.

## 20. Realtime Plan

Extend existing SSE + poll fallback to: execution status, step progress, task status,
agent status, approvals created/resolved, workstream progress, credits changed,
attention changed. Frontend subscribes to ORQ8 state only, never provider states. No
new polling loops where SSE exists.

## 21. Admin / Observability Plan

One admin console (existing 13 pages extended): overview metrics, organizations,
users, AI employees, departments, executions (list/detail/timeline), model usage,
provider health, credits, costs, requests (inspector), errors, anomalies, models,
providers, limits, audit, system health; filters across org/user/agent/department/
model/provider/type/status/date; CSV export; alerts for provider/model failure
spikes, credit spikes, org usage spikes, runaway agents, timeouts, queue backlog.

## 22. Integration Plan

Keep the provider-agnostic connector layer with encrypted credentials, per-agent
access grants, health lifecycle, connector actions and HMAC webhooks. Live: GitHub.
Blocked on credentials: Google/Gmail, Linear. Stripe (billing), calendar and CRM
(event ingestion) follow the same pattern. Embed integrations inside department
workspaces without creating a second integration registry. MCP: registry exists;
live servers pending credentials, with tool permissions enforced server-side.

## 23. Migration Plan

1. Commit baseline (Phase 0). 2. Apply pending migrations to every environment.
3. Add new tables additively. 4. Introduce the gateway ledger and reservations behind
feature flags with dual-read verification. 5. Introduce executions and map existing
task/job runs to execution records. 6. Stand up Trigger.dev for durable work with
cron parity checks. 7. Deploy Cloud Run alongside Railway; run both smoke suites;
move traffic; keep Railway hot for a verification window; retire last. 8. Never
delete a route, endpoint or table until its replacement is verified in production.

## 24. Testing Plan

Layers: unit (services, derivation logic), integration (DB-backed, org isolation),
API contract (every route auth/authz matrix), agent runtime (authority, budget,
escalation), gateway (routing, retry, fallback, cancellation, usage accuracy),
credits (reserve/settle/release, concurrency, insufficient funds), approvals
(create, approve, reject, timeout, resume), execution (lifecycle, idempotency,
duplicate events, partial failure), realtime (event delivery + fallback), admin
(observability accuracy, authorization), load (Phase 15), security (Phase 16),
browser E2E (Phase 17). Required failure scenarios from the source: model unavailable,
provider failure, Cloud Run unavailable, workflow failure, tool failure, DB failure,
approval rejection, approval timeout, credit exhaustion, agent timeout, duplicate
event, duplicate execution, retry after partial success, founder cancellation,
integration disconnected. Every phase ships tests with the change.

## 25. Load / Scale Plan

Existing `scripts/load-scale.ts` provides the org-scale harness (disposable embedded
Postgres, real API, real auth, synthetic 120-department org, decoy org for isolation,
sequential p50/p95, concurrent mixed workload, EXPLAIN costs, budgets with exit
codes). Add: attention aggregate, usage ledger writes, execution list/detail, task
board queries, and concurrent agent executions; record baseline/current/delta with a
bottleneck analysis; treat regressions as defects.

## 26. Browser QA Plan

Run against a local production build and one deployed environment: auth states,
nav behaviour (collapsed/expanded/mobile/active), redirects and deep links, company
hub, attention page and actions, EA panel (including send-while-running), workstreams,
task board, department workspaces, decisions, resources, governance, reports,
admin console, plus keyboard/focus, error, empty and loading states, and the four
Section 9 journeys. Evidence: console/network clean, screenshots per state, checklist
in the launch doc.

## 27. Deployment Plan

Vercel for web; Railway until Cloud Run passes parity; Cloud Run for fast compute;
Trigger.dev for durable work; Supabase for state; OpenRouter/NVIDIA/LiteLLM behind the
gateway. Every deploy: typecheck, tests, build, migrations, smoke, ops-check. No
destructive cutover without a verification window and a rollback path.

## 28. Git / Commit Strategy

Baseline commits first (auth, rls/migrations, dashboard hub, launcher/collision,
supabase audit docs/tests). Then one logical commit per phase increment, following
the source's examples: `feat(auth): overhaul authentication flow`,
`feat(attention): add founder attention API and workspace`,
`feat(nav): rebuild company operating system navigation`,
`feat(company): rebuild company org hub and persistent EA`,
`chore(infra): prepare Cloud Run execution services`,
`chore(load): resume and document scale diagnostics`. Never mix unrelated changes;
never commit secrets or debug artefacts; migrations intentional and separate.

## 29. Required Access and Credentials

Local (already available): repo, pnpm/tsx, embedded Postgres harnesses, Node 20+.
Present in repo `.env.example` (verify live values): Supabase URL/keys, session
secret, Redis URL, LLM provider keys (NVIDIA/OpenRouter/LiteLLM), Resend, INTERNAL_TOKEN,
platform admin emails, OAuth client ids/secrets (GitHub/Google), Stripe keys (billing).

Needed from the founder (see section 30 for the decisions):

| Item | Used by |
|---|---|
| Trigger.dev login (browser) + development `TRIGGER_SECRET_KEY` | Phase 11 |
| Google Cloud: project id, billing confirmation, region, service account, Artifact Registry, enabled APIs | Phase 12 |
| Production `OPENROUTER_API_KEY` (+ confirmation of NVIDIA NIM/LiteLLM prod keys) | Phases 10, 12 |
| Supabase: confirmation of prod project, pooled DB password, service-role key for migration verification | Phases 0, 9-12 |
| Railway API token | Phases 12, 18 (cutover) |
| Google OAuth client (Gmail) and Linear OAuth credentials | Phase 22 integrations E2E |
| Stripe keys + scope confirmation (web checkout UI) | Phase 18 billing |
| Strix access, or approval to deliver the security program as the in-repo adversarial suite | Phase 16 |
| Test/staging: approval to use a second Supabase project or a seeded staging org for destructive tests | Phases 15, 16 |

Never invent values; never commit secrets; `.env.example` documents placeholders only.

## 30. Human Decisions Required

1. **Implementation order and start signal** (Q1): proceed in the planned order
   starting with the baseline commit, or reprioritise.
2. **IA model** (Q2): six primary areas (Section 7) confirmed, or the five-area
   sketch (Section 5).
3. **Dashboard welcome treatment** (Q3): the founder recently asked to revert the
   Section 9 EA welcome banner. Decide whether to (a) keep the reverted banner, (b)
   restore the stage-aware EA welcome area, or (c) keep the banner and add a compact
   stage-aware setup block below it.
4. **Design scope** (Q4): confirm retiring lime across the app (audit §9 + global
   rules) versus touching only new surfaces.
5. **Railway/Cloud Run timing** (Q5): deploy Cloud Run in parallel now, or keep
   Railway as the only API host until a specific milestone.
6. **Strix availability** (Q6): provide Strix access or accept the in-repo
   adversarial program as the Phase 16 deliverable.
7. **Commit authorisation** (Q7): approve committing the existing verified working
   tree in logical commits (required by Phase 0).
8. **Credential timing**: Trigger.dev and Google Cloud access when the corresponding
   phases start, or defer those phases.

## 31. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Uncommitted verified work lost or entangled with new phases | High (traceability, rollback) | High now | Phase 0 logical commits before any new work |
| Shell/IA rewrite breaking 40 working pages | High | Medium | Nav data model + redirects, route sweep, shell wraps routes |
| Attention aggregate slow at scale | Medium | Medium | Indexes, limits, phase 15 load verification |
| New usage ledger double counting | High (billing trust) | Medium | Idempotency keys, append-only, reconciliation tests |
| Trigger.dev and cron both firing schedules | Medium (duplicate work) | Medium | Explicit ownership table, parity check, retire cron last |
| Durable execution leaking model calls while waiting | Medium (cost) | Medium | No model calls in waits; limit enforcement |
| Cloud Run cutover regression | High | Medium | Parallel run, smoke + ops-check parity, verification window, rollback |
| EA queue redesign breaking the live command pipeline | Medium | Medium | Keep `/v1/commands` intact; queue above it; feature flag |
| Cross-tenant leakage in new tables | High | Low-Medium | RLS on every new table + extended 55-check suite |
| Cost abuse via agent loops | High | Medium | Phase 14 limits + admin kill switches |
| Secrets leaking into bundles/logs | High | Low | Server-only keys, secret scan, log discipline |
| Report-only security posture | Medium | Medium | Phase 16 requires retest evidence, no report-only closure |
| Load evidence faked by synthetic-only runs | Medium | Low | Real API + real migrations in the harness; decoy org isolation assertions |
| Design pass regressing contrast | Medium | Medium | Contrast self-check on changed surfaces |
| Deferred credentials stalling later phases | Medium | High | Phases 0-9 independent of credentials; explicit gating |

## 32. First Vertical Slice

Recommended: **Founder asks the EA to investigate the engineering backlog**, end to end.

`Founder → EA intent analysis → engineering task → execution record (CREATED →
RUNNING) → agent runtime context assembly → authority/budget check → model gateway
(router → provider) → structured result → Supabase state → realtime event → hub
update → credits settled → admin can trace execution → outcome into memory`

Why this slice: every layer this program touches is exercised (execution
abstraction, gateway ledger, credits, realtime, hub, admin trace) while using
capabilities that already exist (engineering tasks, sandbox, repo inspection). It can
ship before Trigger.dev exists by running in-process, then switch to the durable path
in Phase 11 with the same execution records, which proves the abstraction instead of
rewriting it.

## 33. Definition of Done

A capability is done only when the full chain is connected: UI → API → authorization
→ database → execution → external service (where applicable) → state update →
realtime → audit → error handling → tests. Specifically:

- No founder-facing surface shows data that does not come from a real row.
- Every consequential action is authorized server-side, audited and idempotent.
- Every AI call flows through the gateway with a request ID and a usage record.
- Credits are reserved, settled and released correctly; retries never double charge.
- Long-running work survives request termination and resumes from durable state.
- Approvals pause and resume; rejections are never bypassed.
- Realtime reflects real state; no invented progress.
- Admin can trace organization → department → agent → task → execution → model
  request → tool call.
- Railway→Cloud Run migration is verified; no duplicate execution infrastructure.
- Security program evidence exists; no unresolved critical/high findings.
- Load evidence exists; documented bottlenecks are real and addressed.
- Docs (58/59/61, master-plan ledger, launch checklist, changelog) match reality.

## 34. Recommended Implementation Order

Immediate (no credentials): Phase 0 → 1 → 2 → 3 → 4, with 5-9 following, then 10.
Credential-gated: 11 (Trigger.dev), 12 (Google Cloud), 13 → 14 → 15 → 16 → 17 → 18.
The first three deliverables a founder can see: the six-area navigation, the
Founder's Attention page, and the 75/25 company hub with a non-blocking EA.

**Agent context note.** Per the source file PART 1 §16-§17, implementation does not
begin until the founder reviews this plan, answers the decisions in section 30 and
confirms the start signal.
