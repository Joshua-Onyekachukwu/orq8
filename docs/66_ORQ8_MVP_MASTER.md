# 66. ORQ8 MVP master record

Opened: 2026-09-28. Branch `main`, HEAD `d2402be`, working tree carrying
uncommitted work (see 66.3).

This is the working record for the run to MVP: the specification, the audit
delta, the canonical architecture, the MVP boundary, the requirement register,
the phase plan and the live status. It is updated as work lands.

Its authority is second to the original requirements. Before each phase, re-read
the phase's requirements; before completion, re-read the whole brief.

Status vocabulary, used the same way everywhere below:

| Mark | Meaning |
| --- | --- |
| **REAL** | Implemented, and verified by executing it (evidence named) |
| **PARTIAL** | Implemented, but a workflow in it cannot complete |
| **BROKEN** | Implemented, was working, does not work now |
| **MISSING** | Not implemented |
| **DUPLICATE** | Implemented twice, one copy dead |
| **EXTERNAL** | Complete in code; blocked on a credential, account or host |
| **POST-MVP** | Deliberately out of MVP scope |

Every claim carries one of: **verified today**, **verified earlier** (with the
command), **by inspection** (code read, not run). A claim with no mark is a
question, not a fact.

---

## 66.1 The product, in one paragraph

ORQ8 is an AI-native operating system for running a company with AI employees.
The founder holds authority; the Executive Agent coordinates; departments
organise; AI employees execute; work produces outcomes; decisions are
approvable, auditable and remembered. The loop that has to work:

```
FOUNDER → EXECUTIVE AGENT → COMPANY → DEPARTMENTS → AI EMPLOYEES
        → TOOLS + DATA → WORK → DECISIONS → OUTCOMES
        → COMPANY MEMORY → CONTINUOUS OPERATION
```

Anything that does not strengthen that loop, or the safety, reliability,
usability and infrastructure needed to operate it, is not MVP work.

---

## 66.2 Verdict, 2026-09-28

**The engine is real. There is still no running product anywhere.**

Confirmed today, by execution:

1. `https://orq8.vercel.app/` → **200** (the web shell serves).
2. `https://orq8api-production.up.railway.app/healthz` → **404
   `{"status":"error","code":404,"message":"Application not found"}`** — that is
   Railway's own edge answering, not ORQ8. The production API host no longer
   exists.
3. `https://orq8.vercel.app/api/healthz` → **404**, so the web app's own proxy
   path to the API is dead too.
4. Nothing is listening on this machine that could serve the product: only two
   Next.js servers (ports 3112 and 3114). No API, no Postgres, no Redis.

Consequence: every product capability below is real **code** with no runtime.
The MVP blocker is not a feature — it is a host, a database and a deploy.

---

## 66.3 What changed since docs/62, and what is stale

`docs/62` (dated 2026-09-27) remains the most complete inventory and is still
worth reading for the status matrix, security findings and module-level detail.
Four of its statements are superseded, which is why this record exists:

| docs/62 said | Reality today | Evidence |
| --- | --- | --- |
| "There is no applied-migration ledger anywhere" | The ledger exists: `packages/db/src/migration-ledger.ts`, wired into `migrate-supabase.ts` with `--status` and `--force`, writing `supabase_migrations.schema_migrations` (version = file stem, plus a content checksum) | files read today; commit `ebe4ad7` |
| "CI applies lineage 2 then lineage 3" | CI applies the drizzle base lineage, then reconciles with the supabase lineage (`pnpm --filter @orq8/db migrate:supabase`) | `.github/workflows/ci.yml` lines 75–79 |
| Railway references in code | Removed from code comments; remaining references are the marketing privacy/security pages, `tools/railway-nvidia-apply.sh`, `scripts/*journey*.mjs` (all defaulting to the dead host) and `all prompt.txt` | commit `d2402be`, grep today |
| "33 nav items / one 1,001-line dashboard" | The sidebar was rebuilt around six primary areas and the Company Hub became a single orbital surface | commits `e87257c`, `26cca6b` |

**The uncommitted working tree is part of the current state.** 153 files carry
real text changes (2,751 insertions, 2,558 deletions) beyond HEAD: 43 `/app`
pages, 15 admin pages, 11 dashboard components, 21 landing components, plus
docs. A deploy from a clean checkout of `main` would ship none of it. Before any
release, the tree has to be reviewed and committed deliberately — not swept in.

Also verified today: `@orq8/core` (and the other packages) map `"."` to
`./src/index.ts`, so consumers need no build step, and `dist/` is gitignored.

---

## 66.4 Classification, condensed

The full matrix is docs/62 §62.4. This is the MVP-relevant reduction, with the
items whose status moved or that gate the MVP called out.

| Area | Status | Note |
| --- | --- | --- |
| Postgres schema + supabase lineage (36 files) | REAL (verified earlier: fresh apply, 65 tables, 79 policies; RLS matrix 55/55) | Single source of truth for the schema |
| Applied-migration ledger | REAL (by inspection today) | Never exercised against a live production database |
| Deploy path for the API | **MISSING** | No host. This is blocker #1 |
| Production database reachability | **EXTERNAL** | The old Supabase/Railway host is gone; a live connection string is needed |
| Auth (email+password, sessions, verification, lockout, CSRF, rate limit) | REAL (verified earlier: `scripts/auth-e2e.ts`) | |
| Supabase client auth path on web (7 files) | DUPLICATE | Nothing imports it |
| Authorization, authority, modes, autonomy | REAL (verified earlier: RLS matrix, vertical slice) | |
| Executive Agent loop | REAL (verified earlier: `scripts/vertical-slice-e2e.ts` 44/44) | |
| Task execution, governance, quality, credits, audit, SSE | REAL (verified earlier, same harness) | |
| Model gateway (OpenRouter → NVIDIA → LiteLLM → Ollama) | REAL locally; **EXTERNAL** in production | Production provider keys unverifiable |
| Integrations (GitHub, Gmail, Linear, MCP, webhooks) | PARTIAL | Code complete, no live credentials exercised |
| Background jobs / cron | **BROKEN** | GitHub schedules call the dead `API_URL` |
| Staging environment | **MISSING** | Every release would be tested live |
| Member management | PARTIAL | Read endpoints only: no invite, no role change, no removal |
| Onboarding to first value | PARTIAL | Company builder, playbooks, import exist; not proven end to end |
| Frontend information architecture | PARTIAL | Rebuilt nav + Company Hub in the working tree, uncommitted |
| Env surface documentation | **REAL as of today** | 23 of 59 keys were documented nowhere; now all 59, guarded by a test (66.9) |
| Simulation, council, lineage, knowledge graph, constitution, squads, ROI, engineering sandbox | REAL or PARTIAL | **POST-MVP** |

Still honest and worth preserving: no `TODO`/`FIXME`/stub markers in API source,
and the surfaces that could invent numbers refuse to (model recommendations need
20 recorded calls; `company-progress` has no fake progress).

---

## 66.5 Canonical architecture, and the Railway replacement

Railway is gone (deleted project). Nothing was running there that needs Railway
specifically — but two things did run *somewhere*, and that somewhere is gone.

| Railway responsibility | Where it lives in code now | Replacement | MVP | Status |
| --- | --- | --- | --- | --- |
| Hosting the API | `apps/api` (Fastify, 242 endpoints) | One always-on host for the API container, or a container platform | Yes | MISSING |
| Hosting Postgres | `supabase/migrations` lineage, RLS | One managed Postgres (Supabase, Neon, RDS) with pgvector | Yes | EXTERNAL |
| Model routing | In-process: `services/model-router.ts` + provider chain in `services/llm.ts` | Nothing — it was never a separate service. Env-driven keys | Yes | REAL locally |
| Background jobs (queue/worker) | None. Jobs are HTTP endpoints + `job_runs` rows | Keep. Trigger via scheduler against the deployed API | Yes | BROKEN (no host) |
| Scheduled jobs | GitHub Actions cron (`orq8-jobs`, `waitlist-drip`, `nightly-rehearsal`) | Repoint at the new host; or move to the host's native scheduler | Yes | BROKEN |
| Long-running execution | In-process task executor inside the request | Bound request time; move to a worker only when measured | Yes | PARTIAL |
| Retries and circuit breaking | `services/circuit-breaker.ts`, retry budgets in executor/LLM | Keep | Yes | REAL |
| Tool execution | `services/tool-registry.ts`, `services/tool-handlers.ts` | Keep, in-process | Yes | REAL |
| Webhooks (GitHub/Linear/Stripe) | Public HTTPS routes on the API host | Needs the API host (Stripe signing secret needed) | Yes | EXTERNAL |

Decisions taken (reversible, recorded here rather than asked):

- **No new infrastructure class.** One API host plus one managed Postgres. No
  queue, no worker, no message bus, no second database, until measurement
  demands it. The code is already written that way (in-process jobs, DB-backed
  `job_runs`), and adding a broker now would add operational burden with no
  demonstrated need.
- **Redis stays optional.** Cross-instance rate limiting degrades to the
  in-process limiter, which is correct for one instance.
- **Trigger.dev stays dropped** from the MVP: zero code references.
- **One migration lineage.** `supabase/migrations` is the schema. The drizzle
  lineage is a local/CI base only and is never composed in production.
- **Storage falls back to the filesystem** until a bucket exists.

### The one decision that needs the founder

Where the API and Postgres run. This is the only true blocker, it needs accounts
I cannot create, and every other P0 item waits on it. See 66.11 for exactly what
is needed.

---

## 66.6 MVP boundary

A founder must be able to do this, alone, with no developer in the loop:

```
sign up → confirm email → create company → reach the dashboard
→ hire AI employees (template or custom), into departments
→ ask the Executive Agent for work
→ watch it execute within authority, or stop at an approval they own
→ approve / reject / pause / resume
→ see results, usage and credits, and what happened in the audit trail
→ ask the EA what is going on and get an answer drawn from real state
```

Out of MVP (POST-MVP): decision council and deliberation, simulation apply at
scale, knowledge graph, strategic lineage, constitution editing, MCP
marketplace, engineering sandbox and PR automation, ROI analytics, squads,
business-import enrichment, routing optimisation, BYO provider keys, portability
export, waitlist growth surfaces.

Non-goals for this cycle: rewriting the engine, replacing the design system,
migrating the `/dashboard-prototype` route into production (it stays isolated
until explicitly approved), and unrelated refactoring.

---

## 66.7 Requirement register

IDs are stable; each maps to a phase and carries its status. This is the list
that must not quietly lose members.

| ID | Requirement | Phase | Status |
| --- | --- | --- | --- |
| MVP-001 | A reachable deployed product (API + web) | 1 | **MISSING** — the web serves an older commit and there is no API host (69 §7–8) |
| MVP-002 | A live database under the production lineage, migrations applied and recorded | 1 | **EXTERNAL / FOUNDER** — the repository targets `gttkaxbcdtpsusmconxm`; the project visible to tooling is a different product (69 §9) |
| MVP-003 | A safe migration path (`--status` before apply, ledger records what landed) | 1 | REAL (code), never run against production |
| MVP-004 | A staging environment, so releases are not tested live | 1 | MISSING |
| MVP-005 | Scheduled jobs and cron run against a live API | 1 | BROKEN |
| MVP-006 | Sign up, confirm email, log in, log out, recover password | 2 | REAL |
| MVP-007 | Create a company and reach the dashboard | 2 | REAL (prove end to end after deploy) |
| MVP-008 | Onboarding to first value (first hire, first command) | 2 | PARTIAL |
| MVP-009 | Executive Agent: context, intent, plan, delegation, honest refusal | 3 | REAL |
| MVP-010 | Departments: templates, create, configure, pause/resume | 4 | REAL |
| MVP-011 | AI employees: templates, hire, custom, edit, rename, authority, mode, tools, pause/resume, history, delete | 5 | REAL |
| MVP-012 | Work: create, delegate, execute, states, failures, retry, outcome | 6 | **REAL** (66.19): a retried task completes |
| MVP-013 | Approvals and authority enforced server-side, not only in the UI | 6 | REAL |
| MVP-014 | Founder Attention as the single decision surface | 6 | REAL |
| MVP-015 | Credits, usage, budgets visible and enforced | 6 | REAL |
| MVP-016 | Company memory persists and is used by agents and the EA | 8 | **REAL** (66.20): taught → stored → retrieved from different wording → shapes the output → the use is recorded |
| MVP-017 | Audit trail: hash-chained, inspectable, complete | 8 | REAL |
| MVP-018 | Member invites and roles (a company is more than one person) | 5 | **REAL** (66.18, 66.22): 20/20 tests, and the surface is in the product |
| MVP-033 | A session can act in every organization its user belongs to | 5 | **REAL** (66.18) |
| MVP-034 | A running deployment can say what it can and cannot do, by configuration rather than by a developer reading the source | 1 | **REAL** — `capabilityReadiness` in `@orq8/core`, `GET /readyz` (counts, public, nameless) and `GET /v1/readiness` (named, by session or by `x-internal-token` in constant time); 7/7 + 11/11 tests (68 §1) |
| MVP-019 | One working external integration end to end | 7 | EXTERNAL |
| MVP-020 | One-click demo company for a prospect | 7 | PARTIAL |
| MVP-021 | Production smoke check gating releases | 13 | **PARTIAL** — `scripts/release-gate.mjs` checks web + API `/healthz`, `/readyz`, `/v1/readiness` **and `/v1/readiness/mail-check`** (which sends one real message, so *mail delivers* is proven rather than inferred from `SMTP_HOST` being set) and fails the release on a blocking capability, naming what to set; proven on the local review stack both ways (red on a stack with no mail provider — the mail step naming `RESEND_API_KEY`/`SMTP_HOST` — green on one whose mail capability is genuinely activated and accepts a message), and wired into `vercel-deploy.yml` where it goes blocking the moment `PRODUCTION_API_URL` exists. It waits only on the host (MVP-001) |
| MVP-022 | The proof harnesses run in CI (slice, auth, RLS, routes) | 13 | **REAL / PARTIAL** — `proofs` is a blocking job that names the MVP id each proof protects; the stack proofs stay advisory (69 §12) |
| MVP-023 | Env surface documented and guarded against drift | 1 | **REAL** (this cycle) |
| MVP-027 | No brand surface can ship a raster logo, a hardcoded logo path or a foreign wordmark | 1 | **COMPLETE** (this cycle) |
| MVP-028 | Every account-bearing route requires a session (no unauthenticated settings surface) | 1 | **COMPLETE** (this cycle) |
| MVP-029 | An approval decision drives the work it gated: approve resumes it, reject stops it | 7 | **REAL** (66.19): 8/8 — approval resumes and spends the grant, rejection stops it and keeps the reason |
| MVP-030 | A task execution can call a tool, under the same authority gate as the EA | 6 | **REAL** — the executor calls `executeTool`, so a task and the EA share one gate (role → authority → approval → credits → audit). 3/3 integration on the embedded database, 11/11 unit, 42/42 regression (68 §1) |
| MVP-031 | Something drives unblocked work (a runner with a caller, not just an exported function) | 6 | **REAL** (66.19): the decision drives the runner, and `POST /v1/commands/tasks/:id/retry` drives it explicitly |
| MVP-032 | No company can read or write another company's data (RLS matrix) | 10 | **COMPLETE** (verified earlier: 55/55), now gated in CI |
| MVP-024 | Backup and restore drill documented and exercised | 10 | MISSING |
| MVP-025 | Cost caps and alerts verified in production | 10 | PARTIAL |
| MVP-026 | Founder can operate for a week without developer intervention | 13 | MISSING (acceptance) |

---

## 66.8 Phase plan and gates

Each phase follows: read the requirements → inspect the implementation → compare
→ plan → implement one task → verify → reconcile → phase review → regression
check → next.

| Phase | Content | Gate to pass |
| --- | --- | --- |
| 0 | Discovery and audit | This record + docs/62 agree with the code (done, 2026-09-28) |
| 1 | Runtime, database, migrations, deploy, jobs, staging, env | `curl <api>/healthz` returns healthy from the deployed host, from a fresh database, with the ledger recording the lineage |
| 2 | Company foundation: sign-up → company → dashboard | The founder path runs on the deployed host |
| 3 | Executive Agent on real state | A command creates real work that executes and reports back |
| 4–5 | Departments, AI employees, members | Lifecycle tests in the brief (§33) pass on the deployed host |
| 6 | Work, approvals, attention, credits | Vertical slice passes against the deployed host |
| 7 | One integration + demo company | A real GitHub or Gmail action completes and is audited |
| 8 | Memory, audit, lineage | Memory persists across sessions; the audit chain verifies |
| 9–10 | Founder control, security and reliability passes | RLS matrix, permission-bypass and failure tests pass |
| 11–12 | Product QA, full company simulation | One fictional company operated end to end |
| 13 | MVP acceptance | 66.6 flow completes with no developer intervention |

---

## 66.9 Verified this cycle (2026-09-28)

Work completed and verified in this session:

**MVP-023 — the environment surface.**

- The surface was measured, not assumed: **23 of the 59** keys in
  `packages/core/src/config.ts` appeared in no example file at all, even
  commented out (`APP_URL`, `REDIS_URL`, `RESEND_API_KEY`, `SMTP_*`,
  `EMAIL_FROM`, `OTEL_EXPORTER_OTLP_ENDPOINT`, the eight Stripe keys,
  `S3_REGION`, `LOCAL_STORAGE_DIR`, `BUSINESS_IMPORT_ENRICHMENT`,
  `ENCRYPTION_KEY_KID`, `LOG_LEVEL`, `NODE_ENV`). A deployer could not learn the
  surface, and the first symptom would have been a deployment that boots and
  then silently loses email, storage, embeddings and billing.
- All 59 are now documented in `apps/api/.env.example`, each with what it does
  and whether the default is safe, grouped by concern.
- `envSurface()` and `envRequiredInProduction()` are exported from
  `packages/core`, so the schema is the single source of truth rather than a
  second hand-maintained list.
- `apps/api/test/env-surface.test.ts` guards it: canonical coverage, no
  duplicates, deploy-critical keys present and uncommented, no key documented
  that no runtime reads, and the compose file still interpolating real keys.
  Run with `pnpm verify:env`.
- Found and fixed by the guard itself: my own prose line began `NODE_ENV=` and
  read as a commented setting, and a key documented twice would read as two
  settings.
- Verified: `pnpm --filter @orq8/core typecheck` and
  `pnpm --filter @orq8/api typecheck` clean; `pnpm verify:env` 6/6 passing.

**MVP-027 — the brand surface audit.**

- `scripts/brand-audit.mjs` (dependency-free, so CI never skips it for want of an
  install) fails on four things: a raster logo asset in `apps/web/public`, a
  hardcoded logo path in source, a foreign company name (or a `ORQ 8` / `ORQ-8`
  spelling) in a rendered wordmark, and a wordmark surface that draws its own
  lockup instead of importing `components/branding/logo-mark`.
- Comments are exempt on purpose: the tree still carries honest provenance notes
  ("Trezo Finance landing styles") that are history, not a brand leak.
- Reported but never failing: raster app icons (`favicon.png`,
  `apple-touch-icon.png` are legitimate) and 14 places that hand-type the brand
  name where the lockup exists — visible as debt rather than silently tolerated.
- Wired as its own CI job (`.github/workflows/ci.yml`, `brand`, no install step)
  and as `pnpm audit:brand`.
- Verified: `--self-test` 9/9 (including the case that proves importing the
  lockup is not a "hardcoded path"); the audit passes on the current tree; and a
  temporary probe file produced 3 failures and exit 1, with its `// Trezo`
  comment correctly ignored. Found and fixed by the self-test: my first rule
  reported one hardcoded path twice.

**Phase 0 — the audit delta (66.2, 66.3):** production liveness re-tested rather
than assumed; the applied-migration ledger and CI's lineage handling confirmed in
the tree; the uncommitted working tree recorded as part of the current state.

Not verified this cycle, and therefore not claimed: the production database's
contents, live provider keys, whether any client depends on the Supabase auth
routes, and whether the current production web deployment can be repointed
without a rebuild.

---

## 66.10 Live checklist

**Completed (verified):** the engine — auth, authority, EA loop, task execution,
credits, audit, attention, SSE, admin; the schema lineage and RLS; the
applied-migration ledger; the env surface and the brand surface audit (66.9).

**In progress:** Phase 1 foundation.

**Blocked (needs the founder, 66.11):** MVP-001 host, MVP-002 database, MVP-004
staging, MVP-019 integration credentials, MVP-025 production cost caps.

**Broken:** MVP-005 scheduled jobs (dead `API_URL`); the production API upstream.

**Remaining for MVP:** MVP-001, 002, 004, 005, 008, 018, 019, 020, 021, 024, 026.

**Post-MVP:** council and deliberation, simulation at scale, knowledge graph,
lineage, constitution editing, MCP marketplace, engineering sandbox, ROI,
squads, import enrichment, routing optimisation, BYO keys, portability, waitlist.

**Housekeeping (not MVP, do not let it block):** retire the Supabase client auth
path (7 files) and the unused `supabase/rls-policies.sql` /
`storage-setup.sql`; decide the fate of `all prompt.txt`; commit or discard the
153-file working tree before any release.

---

## 66.11 Founder actions required

Nothing below can be done from this machine, and each one is exact.

### 1. Decide where the API runs — **the only true blocker**

*What I need to do:* choose one option and create the account/instance.
*Where:* the provider's console.
*Why:* today there is no host; every other P0 item waits on it.
*Options:* (a) **one small VPS with the existing `infra/docker-compose.yml`** —
cheapest, fewest moving parts, and the compose file already exists; (b)
**Google Cloud Run** using `infra/cloudrun/*` — scales to zero, configs are
written but never deployed; (c) **a container PaaS** (Render/Fly/App Platform).
*What is required either way:* a public HTTPS URL for the API and the ability to
set environment variables there.

### 2. Decide where Postgres lives, and confirm what survived

*What I need to do:* confirm whether the old Supabase project still exists. If it
does, grant the connection string. If it does not, create one (Supabase, Neon or
RDS with **pgvector**).
*Why:* migrations cannot be applied and the catalog cannot be read without it;
and I must know whether existing production data exists before anyone deploys
over it.
*Exact values needed:* the Postgres connection string (host, port, database,
user, password), and whether it needs a TLS/SSL parameter.

### 3. Set the deploy-critical secrets on the new host

*What I need to do:* set `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`
(the API refuses to boot in production with the dev-only values, by design), plus
`ALLOWED_ORIGINS` and `APP_URL` once the web URL is fixed.
*Why:* without the first three there is no boot; without the last two there are
no working OAuth redirects or email links.

### 4. Repoint the operational secrets

*What I need to do:* replace the `DB Migrate` workflow's
`SUPABASE_DATABASE_URL` secret with the live connection string, and set
`API_URL` (used by `orq8-jobs`, `waitlist-drip`, `nightly-rehearsal`) to the new
host.
*Where:* GitHub → repository → Settings → Secrets and variables → Actions.
*Why:* both point at deleted hosts and fail today.

### 5. Choose one integration to make real

*What I need to do:* create GitHub OAuth app credentials (client id + secret,
callback `<APP_URL>/api/integrations/callback/github`), the same for Google if
mail is the chosen one, and authorise the OAuth app.
*Why:* MVP-019 needs one integration proven end to end.

### 6. Decide about the uncommitted work

*What I need to do:* review the 153-file working tree (the rebuilt nav, the
Company Hub, the dashboard components) and tell me whether to commit it as the
current state.
*Why:* a deploy ships a commit, not a working tree; this decision gates the
first release.

---

## 66.13 Functional system inventory

Status vocabulary: **COMPLETE** (workflow works, verified), **PARTIAL** (works
until a specific step), **BROKEN**, **MISSING**, **SIMULATED**, **POST-MVP**.

### Verified by execution on 2026-09-28

`pnpm exec tsx scripts/vertical-slice-e2e.ts` → **44/44 checks passed** against a
real embedded Postgres carrying the production migration lineage and a real API.
The engine is real. What that run proves, in order: the Executive Agent accepted
a command (HTTP 200, completed); intent analysis went through the model gateway
(provider recorded as `openrouter`, model recorded, 3,145 tokens); the credit
gate ran before any model call (2 charged, 97 remaining); the plan produced one
real task; the hired employee executed it to completion with the measuring cost
recorded (1 credit, not a flat fee); an authority check blocked a task with the
reason persisted and **zero cost**; credit exhaustion blocked work before the
model call, also at zero cost; the ledger, the task row and the SSE event carried
the same measured number; the audit chain verified across 13 hash-chained rows;
realtime delivered `task.started`, `task.completed`, `task.qa_passed`, two
`task.failed`, `credits.consumed` and `attention.changed`; and the admin
traces/showed the same LLM calls and credit spend.

### The twenty systems

| # | System | Status | Evidence / where it stops |
| --- | --- | --- | --- |
| 1 | Company foundation (signup, auth, company, workspace) | COMPLETE | `scripts/auth-e2e.ts` (API + web journeys), vertical slice registers and confirms |
| 2 | Executive Agent | COMPLETE | Slice: command → intent → plan → task → result. Real model calls, real rows |
| 3 | AI employees (hire, configure, execute) | COMPLETE | Slice hired an employee whose role matched the suggested role and executed the task |
| 4 | Authority (can do / can spend / requires approval / cannot do) | **PARTIAL** | `cannot do` and `requires approval` block correctly; but the approval half dead-ends (MVP-029) |
| 5 | Operating modes (manual / assisted / autonomous) | PARTIAL | Enforced in the pre-execution governance check; not verified per mode in this cycle |
| 6 | Agent states (8 canonical states) | PARTIAL | States exist and the slice drove several; WAITING-on-approval is unreachable because 029 is missing |
| 7 | Work / execution engine | **PARTIAL** | Complete/review/failed all real; no `waiting` state, no retry-after-failure driver (MVP-029, MVP-031) |
| 8 | Delegation (EA → department → agent) | COMPLETE | Slice: the plan became a task owned by the right role |
| 9 | Approval system | **BROKEN end to end** | The record is written, notified and broadcast; nothing replays the gated work (MVP-029) |
| 10 | Founder Attention | COMPLETE | Aggregated queue; `attention.changed` verified on the wire |
| 11 | Tools and integrations | **PARTIAL** | Tool registry, capability registry, MCP, connector actions exist, and task execution now reaches them through `executeTool` (MVP-030 closed); no live third-party credential has been exercised |
| 12 | Model routing | PARTIAL | Real provider chain, real recorded cost and tokens; routing optimisation needs 20 recorded calls and says so |
| 13 | Company memory | PARTIAL | Rows, retrieval and optional embeddings exist; the "teach it today, use it tomorrow" test is not yet run (66.14 gap D) |
| 14 | Departments | COMPLETE | Templates, create, members, pause/resume; consolidated into the Company Hub in the working tree |
| 15 | Execution context assembly | PARTIAL | `agent-context.ts` assembles company, role, task and memory; not verified for bounded size |
| 16 | Audit trail | COMPLETE | Hash chain verified across the slice's 13 rows; `scripts/integration-suite.ts` covers the append path |
| 17 | Failure handling | PARTIAL | Blocks and failures persist with reasons and zero cost; retry/recovery after failure has no driver (MVP-031) |
| 18 | Realtime | COMPLETE | SSE verified end to end for eight event types |
| 19 | Security (auth, RLS, tenant isolation, approval bypass) | PARTIAL | RLS matrix 55/55 earlier; the settings gate was missing until today (MVP-028); approval bypass is untestable while 029 is missing |
| 20 | Railway replacement | see 66.5 | Model routing and tool execution were never Railway's; jobs/cron are BROKEN (no host); hosting/database MISSING |

Also verified today, by inspection: `apps/api/src/routes/goals.ts` owns `/v1/tasks`
(CRUD at lines 223–402) — the work surface has no route module of its own — and
the web proxies `/api/tasks` to it, which is why the API has no `routes/tasks.ts`.

## 66.14 MVP gap analysis

### Gap A — an approval decision gates nothing (MVP-029) — *critical path*

The founder journey in the brief says:
`agent reaches approval requirement → founder approves → agent continues`.

Today that step cannot happen, for two independent reasons, both structural:

1. **The approval cannot name what it gates.**
   `supabase/migrations/0002_add_all_missing_tables.sql:158` defines `approvals`
   with `org_id, agent_id, action, description, cost, risk_level, status,
   decision_note, decided_at, created_at` — no `task_id`, no `tool_id`, no
   payload. There is no link from a decision back to the work.
2. **Nothing acts on a decision.** `apps/api/src/routes/approvals.ts` records
   `approved | rejected | modified`, advances a linked PR for the one
   `Merge PR:` action, broadcasts and notifies the founder. No code path resumes,
   re-queues or replays the gated work (grep for resume/requeue across
   `approvals.ts`, `task-executor.ts`, `executor.ts` returns nothing).

And the tool path makes it worse: `apps/api/src/services/tool-registry.ts:318`
creates the pending approval and then returns `success: true` with
`"Approval required for X. Request sent to founder."` The agent is told it
succeeded, and the tool call is never recorded, so there is nothing to replay.

**Design decided (no founder input needed):**

- Migration `0035`: add nullable `task_id`, `tool_id`, `decision_by` to
  `approvals` (`add column if not exists`, so it is safe on an applied database).
- `tool-registry.ts`: record `task_id` and `tool_id` when raising the approval,
  and return `approvalRequired: true` so a caller can stop rather than report
  success.
- `routes/approvals.ts`: on `approved` → clear the task's block reason, return it
  to a runnable state, audit `approval.approved`, then invoke the executor for
  that task. On `rejected` → mark the task stopped with the founder's note as the
  reason, audit `approval.rejected`.
- Tests: two new checks in the vertical slice — approve → the task completes;
  reject → the task stops with the reason persisted.

### Gap B — the task executor cannot use a tool (MVP-030) — *closed*

`apps/api/src/services/task-executor.ts` contains no reference to `executeTool`
or the tool registry. Tools are reachable only through the EA path
(`ea-tools.ts`) and MCP. So "an AI employee uses a tool while doing the work" is
not wired into task execution, which is exactly the step the brief puts between
"agent executes" and "approval if required".

**Design decided:** give the executor the same tool-calling loop the EA already
has, resolving each tool through `tool-registry` so the credit check, the
authority check and `needsApproval` all apply unchanged. This is Phase 6 work and
depends on Gap A landing first (otherwise an approval raised mid-task still
dead-ends).

**Landed, as designed.** `services/task-tools.ts` offers the model exactly its
role's tools and one machine-readable way to ask for one (`tool-tools.ts`'s
`parseToolRequest`, strict — an unreadable block is treated as a normal answer,
never guessed at, because a guessed call would run real work). `task-executor.ts`
resolves every request through `executeTool`, bounded at three rounds per task.
The registry's approval branch already wrote `task_id`/`tool_id`/`tool_params`,
so a gated tool stops the task in `awaiting_approval` with the work named, and the
grant it leaves behind is consumed when the halted run resumes. Two things
changed in the registry itself: a task-scoped tool audit now names its task
(executed, denied and grant-consumed alike — a denial nobody can trace back to
work is not an audit trail), and the task row's recorded cost is the model's
tokens plus the tool charges, while only the model's share is billed here because
the registry already charged `tool.<id>` as it ran.

### Gap C — nothing drives unblocked work (MVP-031) — *critical path*

`executePendingTasks` is exported from `task-executor.ts:536` and **has no
callers anywhere in the API**. There is no worker, no cron and no endpoint that
picks up runnable work. Combined with Gap A, this is why "continue execution"
has no mechanism at all: not only does the approval not resume the task, there is
no runner to resume it with.

**Design decided:** make the runner explicit and give it a caller — the approval
decision (Gap A) and a `POST /v1/tasks/:id/execute` for the founder's own retry
button, plus the existing GitHub-scheduled job endpoint once a host exists. Keep
it in-process; do not add a queue for one runner.

### Gap D — memory has never been tested across sessions

The brief's test is: "if the founder teaches ORQ8 something today, can it use it
in future work?". Memory rows, retrieval and the embedding-degradation path all
exist (docs/62 §62.4), but no harness exercises teach → store → retrieve → use.
That is the next acceptance test to write after Gaps A–C.

### Gap E — no runtime (unchanged)

Production API host and database remain the only founder-blocked items; see
66.11. Nothing else can be released until they land, but every gap above can be
built and proven locally first, which is the order this plan now takes.

## 66.15 Plan revision: functionality first

Priority changed on 2026-09-28: **functionality → reliability → execution →
permissions → integrations → memory → observability → QA → UI later.**

The interface is now an operational shell. UI work is limited to what is needed
to operate, observe and debug the system: execution state, approvals, failures,
results, and controls the founder needs. The following are **deferred**, not
cancelled:

- the settings redesign (settings stays where it is; only its missing auth gate
  was fixed, MVP-028);
- moving the legal pages out of settings into their own pages with fuller copy;
- the `/dashboard-prototype` migration (stays isolated, unapproved);
- visual polish, brand work, marketing surfaces.

Revised order for the credential-free track (all of it provable locally):

| Step | Work | Depends on |
| --- | --- | --- |
| 1 | Gap A: approval → execution link, migration 0035, resume/stop, audit | — |
| 2 | Gap C: a named runner with a caller (approval decision + retry endpoint) | 1 |
| 3 | Gap B: the executor's tool path under the existing authority gate | 1, 2 |
| 4 | Gap D: the teach → store → retrieve → use acceptance test, then fix | — |
| 5 | Failure/retry acceptance test (running → failed → retry → success) | 2 |
| 6 | Member invites and roles (MVP-018) | — |
| 7 | Wire the proof harnesses into CI (MVP-022) | — |
| 8 | Host, database, deploy, jobs, staging (Phase 1 proper) | founder credentials |

Status (2026-09-29): steps 1, 2 and 4 are built and proven — see 66.19 and
66.20. Step 6 is proven server-side (66.18) with no web surface yet. Step 7 is
wired (66.17). Steps 3, 5 and 8 are open.

## 66.16 Verified this cycle #2 (2026-09-28)

**MVP-029-adjacent discovery work.** The vertical slice was re-run by me, not
taken from a report: 44/44. The two critical-path gaps (A and B) and the orphaned
runner (C) were found by reading the code after that run, and each is evidenced
by file and line above. No claim here rests on docs/62.

**MVP-028 — the settings gate.** `/settings`, `/settings/connections`,
`/settings/cookies` and `/settings/change-password` served **HTTP 200 to an
unauthenticated client** while `/app` redirected to login: `middleware.ts`
protected only `["/app"]`, and only `/settings/providers` guarded itself. Fixed
by adding `/settings` to `PROTECTED_ROUTES`. Verified live against the running
dev server: every `/settings/*` path now returns
`307 → /login?next=<original path>` with `next` preserved, while `/`, `/login`
and `/privacy` still return 200 and `/app` is unchanged. Accepted consequence:
the legal pages under `/settings` now require a session; their public
equivalents remain at `/privacy`, `/terms`, `/security` and `/ai-disclosure`.

## 66.17 The proof gate (MVP-022)

Five harnesses existed and passed locally, but nothing ran them on the way in:
CI has not run since 2026-09-12, and the 24 commits after it never passed
through any gate. That is how broken work reaches production.

`scripts/proofs.mjs` is the gate. It holds the manifest — harness, what it
proves, and the requirement ids it protects — and runs the proofs the same way
locally and in CI:

| Proof | Protects | Runs in |
| --- | --- | --- |
| `vertical-slice` | MVP-002, 009, 012, 013, 014, 015, 017 | `proofs` job |
| `auth` | MVP-006, 028 | `proofs` job |
| `rls` | MVP-032, 013 | `proofs` job |
| `routes` | MVP-007, 021, 026 | `founder-loop` job (builds web, boots the stack) |

Commands: `node scripts/proofs.mjs` (everything that needs no live stack),
`--with-stack`, `--only <id>`, `--list`. A failure prints the requirements it
broke, so a red job names what regressed instead of which script exited 1.

The stack-dependent proof is `continue-on-error: true` for now, deliberately:
it is the only one needing a full Next.js build plus a live stack, and it has
never run on a GitHub runner. An advisory gate that is honest about its status
is better than a blocking gate that goes red for environmental reasons and gets
ignored. It becomes blocking once it has held on a few real runs.

### Verified

`node scripts/proofs.mjs --list` prints the manifest; the three stack-free
proofs run and pass locally; `vertical-slice` was independently re-run this
cycle at 44/44.

## 66.18 Member management (MVP-018, MVP-033)

A company of one cannot delegate anything to a human, and docs/62 §62.4 recorded
this surface as "read endpoints only: no invite, no role change, no removal".

**Built (server-side, enforced in the API because memberships are writable only
by the service role):**

| Route | Behaviour |
| --- | --- |
| `POST /v1/members/invitations` | Invite an address as owner/admin/member/viewer; returns a single-use accept link |
| `GET /v1/members/invitations` | Pending and past invitations for the org |
| `POST /v1/members/invitations/:id/revoke` | Withdraw a pending invitation |
| `POST /v1/members/invitations/accept` | Accept with the signed-in account; creates the membership |
| `PATCH /v1/members/:userId` | Change a member's role |
| `DELETE /v1/members/:userId` | Deactivate a membership (kept for the audit trail) |
| `POST /v1/org/switch` | Move the session into another org the user belongs to |

Rules, each enforced in `services/members.ts` and not in the UI: only an owner or
admin may manage members; only an owner may grant or revoke owner; nobody may
change their own membership; an invitation belongs to an address, so a forwarded
link cannot seat someone else; tokens are stored as sha256 hashes, single-use and
expire after 14 days; every mutation is audited (`member.invited`,
`invitation.accepted`, `invitation.revoked`, `member.role_changed`,
`member.removed`, `org.switched`) and recorded in the activity feed.

**Migration 0035** adds `invitations` with role/status check constraints, an FK
index for each reference, a partial unique index so only one *pending* invitation
per address exists, and org-scoped RLS mirroring approvals. Verified: the
integration suite applies the lineage from scratch and passes on it.

**Found while testing, and fixed: accepting an invitation was unusable.**
`requireAuth` takes the organization from the session, login binds a new session
to `memberships[0]`, and no org-switch endpoint existed anywhere. So an invited
teammate gained a membership they could never act in — the invite → accept →
operate flow dead-ended at the last step. `POST /v1/org/switch` verifies an
active membership before moving the session, and audits the move. This is the
kind of "the button exists" completion the brief warns about: the row was there
and the workflow was broken.

**Verified:** `apps/api/test/members.integration.test.ts`, **17/17 passing** on
the embedded database — invite, hashed token storage, duplicate-pending refusal,
unknown-token refusal, wrong-account refusal, acceptance and membership creation,
second-accept refusal, org switch and `/v1/auth/me` reflecting it, switch refusal
for a non-member, non-admin invite refusal, self-change refusal, role change,
invalid-role refusal, removal leaving the member list, and five cross-tenant
refusals. Wired into the proof gate as the `members` proof. `@orq8/api`
typecheck clean.

**Not done, deliberately (at the time):** the web UI for invitations and roles,
and an invitation email template. Both have since landed — see 66.22 — with one
decision kept: the accept link is still returned to the inviter, because mail
delivery is environment-dependent and an invitation that silently never arrives
is worse than one the founder can paste into a message.

## 66.22 The member surface, in the product (2026-09-29)

A company of one could not delegate to a human: the API could invite, accept,
change a role and remove, and the only way to reach any of it was curl. This
closes that, in the existing operational shell rather than as a redesign.

| Surface | What it does |
| --- | --- |
| `/app/members` → Invite a teammate | Email + role (owner/admin/member/viewer). The `owner` option is only offered to an owner, because the API refuses it for anyone else and a control that always fails is its own kind of lie |
| `/app/members` → the issued link | Shown once, in a read-only field with **Copy link**, plus a delivery verdict from the API: *emailed*, *no mail provider configured — send them this link*, or *the email could not be sent* |
| `/app/members` → Invitations | Every invitation with role, status, sent and expiry dates; **New link** re-issues a token (and re-sends the email), **Revoke** withdraws it |
| `/app/members` → Members | Role dropdown per human member and **Remove**, with the API's refusal shown verbatim (only an owner grants owner; you cannot change your own membership; the last owner cannot be removed) |
| `/invite/[token]` | What the teammate opens. Signed out → sign in or create the account with the invited address and come back; signed in → one click accepts, then the session is switched into the company that invited them |

**The invitation is emailed through the existing transactional transport**
(auth's `createEmailTransport`), with `invitationEmail()` in
`email/transactional.ts`: company, role, inviter, single-use link, 14-day expiry.
The send never fails the invitation — the row is the product object, the email is
a convenience — and `SendResult.delivered` distinguishes "a provider accepted it"
from "the transport returned ok because it only logged the message", so the UI can
state which happened instead of claiming the teammate was emailed.

**One-time links are one-time.** Only a sha256 of each token is stored, so a lost
link cannot be displayed again; `POST /v1/members/invitations/:id/renew` mints a
fresh one (killing the old, extending the expiry) and the page says so rather than
pretending an old link is recoverable.

### Found while walking it, and fixed: removal did not remove access

The live loop removed a teammate, they disappeared from the member list, and their
session kept answering **200 on `/v1/agents`**. `findSessionByToken` joined
`memberships` without checking `status`, so any membership row — including a
removed one — authenticated with the role it used to hold. Two changes:

- the join now requires an **active** membership, so a deactivated membership
  cannot authenticate on any path;
- `removeMember` revokes that person's sessions **in that organization**
  (`revokeOrgSessions`, cache entries deleted first so a cached session cannot
  outlive the removal), which is what makes the removal take effect immediately
  rather than at the next cache re-check.

Verified live: after removal the removed teammate's session answers 401 while
`revokedSessions: 1` reports exactly what was cut, and their own company is
unaffected — a fresh sign-in binds a session to a membership that is still active.


## 66.19 Approvals gate work, and the work moves (Gaps A and C, MVP-031)

An approval carried an `action` sentence and nothing else, so the founder ruled
on a description and the product did nothing with the answer: approving released
nothing, rejecting stopped nothing, and the task sat in `pending` while the
Command Center reported the request as handled. Separately
`executePendingTasks` was exported with **no caller anywhere in the API**.

**Migration 0036** links the decision to the work: an approval names its `task_id`
and the tool it gates, and a `released_at` stamp makes the grant single-use.

| Path | Behaviour |
| --- | --- |
| gate | autonomy says `requiresApproval`; the executor now honours it instead of running the work anyway — the task stops in `awaiting_approval`, costs nothing, and an approval naming it is raised once (never stacked) |
| approve | the decision **resumes that exact task** and spends the grant |
| reject | the decision stops it for good; a reason is required (400 `reason_required`) and is kept on the task record the agent and the next reader both see |
| retry | `POST /v1/commands/tasks/:taskId/retry` re-runs work the system stopped, and refuses work a person has not settled (409) |
| runner | `POST /v1/commands/tasks/execute-pending` runs the org's queued work and never touches work waiting on a person |
| audit | both decisions name the work they moved, as structured references (`approval.resumed_work` / `approval.stopped_work` carrying `approval_id` + `task_id`) rather than only as prose |

`tool-registry.ts` no longer reports `success: true` for work it just blocked.

**A gate now says what it blocks.** The columns existed, but every surface the
founder actually reads still showed only the `action` sentence: the approvals
list returned the raw row, the attention item was built from `action`, and both
cards rendered `action` + `description`. "An approval card can honestly name what
it blocks" was still false after the wiring landed.

| Surface | Now names |
| --- | --- |
| `GET /v1/approvals` (list and single) | a resolved `gatedWork` object per row — `taskId`, the gated task's `taskTitle` and `taskStatus`, plus `toolId`/`toolParams` when the gate came from a tool call. Resolved in batched queries, not one lookup per row |
| Founder's Attention queue | the approval item leads with the blocked work ("…is stopped on *<task title>* until you decide") and its authority line states that approving resumes it while rejecting stops it and keeps the reason; a tool gate names the tool |
| `/app/approvals` and the dashboard Decision Center | both render "Blocks *<task title>* · status" with a link to the task, the tool when there is one, and the argument-by-argument payload of the tool call (`toolParams`, cut at a readable limit rather than summarised) — and render nothing extra when the row predates migration 0036 |
| Founder's Attention queue | **Run queued work** runs the org's `pending` tasks through the batch runner and reports the counts in plain language; per-item **Retry** calls the real retry endpoint instead of patching the status to `pending` |
| Task page | **Run now** for a `pending` task, **Retry this task** for a failed one, and *Waiting on your decision* linking to the approvals page when that is the actual state |

**Verified:** `apps/api/test/approval-gated-work.integration.test.ts`, **10/10
passing** on the embedded database — gate, no duplicate question, the list
handing the founder the blocked work by name, approve →
resume → grant spent, reject without a reason refused, reject → cancelled with the
reason kept and the manual path unable to undo it, retry → completed, retry of
unsettled work refused, the batch runner skipping gated work, and both decisions
naming the task they moved in the audit trail, and the attention classifier naming
the blocked work (`attention.test.ts`, 2 new cases). Only the LLM
boundary is stubbed (without it the executor reports `failed`, and "resumed"
would be indistinguishable from "failed").

## 66.24 Mail is self-diagnosing (MVP-035)

Mail is the integration whose failure is invisible until someone is locked out:
signup succeeds, the page says "confirm your email", and no link ever arrives —
while the product looks healthy. An invitation reports its own delivery verdict
(66.18), but nothing could answer the deployment-level question: *is the
configured provider working at all, and if not, what exactly is wrong?*

Two endpoints, one of which sends a real message:

| Route | What it answers |
| --- | --- |
| `GET /v1/settings/mail` | Which provider this deployment chose, the sending address, which keys are missing (names, never values), and what delivery costs the product while it is unconfigured. Static: it reads configuration and sends nothing. |
| `POST /v1/settings/mail/test` | Three verdicts — a provider is configured, the provider accepts these credentials, a real message was accepted for delivery. Owner/admin only; audited as `mail.delivery_checked`. |

A failure is classified rather than echoed: an invalid Resend key, a sending
domain that is not verified, a rate limit, an unreachable SMTP host, rejected
SMTP credentials, a TLS mismatch, and a refused recipient are seven different
fixes, and the provider's own words are kept alongside the classification. The
check stops before sending when the credentials are rejected — a send would only
repeat the failure — and the API's key names are the only thing that crosses the
boundary.

The settings page renders the same thing: provider, delivering or not, the
missing keys, the notes, and after a check the three steps with the cause and the
fix. It says "not delivering" in an environment with no provider instead of
implying success.

**Verified:** `apps/api/test/mail-and-work-controls.integration.test.ts` (5/5,
including that an unauthenticated request is refused and that no credential
appears in the payload) and `apps/api/test/email-diagnostics.test.ts` (18/18:
the classifications, the stubbed provider paths, and that a rejected key means
nothing is sent).

## 66.25 The release gate, and the tool path work shares with the EA (MVP-021, MVP-030)

### A deploy is not good until the product is switched on

Nothing asked a running deployment whether it could do its job. A release could
ship with no model key and no mail provider: `/healthz` 200, `/readyz` 200, and a
founder who can never confirm an address. `scripts/release-gate.mjs` asks the
five questions that decide it — web `/healthz`, API `/healthz`, `/readyz`,
`/v1/readiness`, and `/v1/readiness/mail-check` — and fails when a
production-critical capability is not activated, naming the missing keys, the
impact and the docs rather than only the verdict.

The fifth question exists because the fourth is a claim about the environment.
`email` being *configured* means `SMTP_HOST` or `RESEND_API_KEY` is present; it
does not mean the provider accepts the credentials, or that the port is
reachable. A deployment in that state passes every capability check while nobody
can confirm an account. So the gate fires the deployment's own three-verdict mail
check and sends one real message, so the release is proven by the deployment
*doing* the thing rather than by it describing how it is configured.
`POST /v1/readiness/mail-check` is machine-only (`x-internal-token`,
constant-time) because the send is a real side effect and a pipeline has no
founder to attribute it to — the founder path stays `/v1/settings/mail/test`,
which is a session and writes `mail.delivery_checked`. `200` means *the check
ran*, never *mail works*; a failed diagnosis is the answer, in the body, with the
broken step and the fix in the check's own detail so a pipeline reading JSON gets
the actionable part. The probe targets the address inside the deployment's
`EMAIL_FROM` unless `--mail-to` / `ORQ8_MAIL_PROBE_TO` aims it elsewhere,
`--no-mail` skips it loudly, and a `404` from an older API build is a **failed**
check rather than a skip — a green tick for a check that did not run is how
"verified" stops meaning anything.

Two ways in to `/v1/readiness`, on purpose: a founder's session, or
`x-internal-token` compared in constant time (the same secret the cron hooks
use). A gate has no session, and a red deploy that cannot say *why* is a red
deploy nobody fixes. `--require billing` (and so on) lets a stage raise the floor
above the default production-critical set. `/readyz` stays public and nameless —
it publishes counts, never the deployment's soft spots.

**The stack gained what proving it needs.** `REVIEW_API_PORT` / `REVIEW_WEB_PORT`
boot a second stack beside a live one, and its data root is scoped by port —
`.review-stack-data-3113` is not a substring of `.review-stack-data-3115`, which
is what stops the stale-postmaster sweep from killing the other stack's database
(it did, before this: booting a second stack killed the first one's Postgres and
*took a live stack down to report its own port mistake*, because the port
preflight ran after the database was up). Both ports are now checked before
anything starts. `REVIEW_MAIL=1` attaches a local SMTP sink, so "mail is
configured" is true rather than claimed — the mail twin of the local model
gateway.

**Verified, on two live stacks side by side.** The gate refused the default
stack (`blocking: email`, with the two missing key names and the impact, and the
mail step reporting *No provider is configured* with the keys that fix it) and
cleared the mail-enabled stack (`6 capabilities ready`,
`smtp accepted a message for review@orq8.test`), with `/readyz` and
`/v1/readiness` agreeing in both. `scripts/release-gate-proof.mjs` runs as a
`proofs.mjs` proof and asserts the verdict follows the deployment's own report,
that the surfaces agree, that the gate refuses to guess without its token, that
`--require` fails for the reason it is given, and that the mail check *fired* —
passing by delivering where a provider is configured, failing and naming the keys
where none is. It passes against both stacks.

### The price the founder approves is the price they pay

The tool path made a billing bug visible that configuration could not. `executeTool`
consumed credits with `consumeCredits(db, orgId, 'tool.<id>', …)` and no amount,
so the charge came from `OPERATION_COSTS['tool.<id>']` — a key that does not exist
in that table, and therefore its `default: 2`. Everything the founder sees is
`tool.creditCost`: the spending-limit check, the affordability check, and the
number the approval card quotes **before they agree to the call**. So a founder
could approve `$0.01` and be charged two credits, and a tool could pass every
pre-flight check and then fail mid-execution on credits.

Found by walking, not by reading: the card said `ESTIMATED COST $0.01`, the
ledger row said `Tool: Write Email by Ember  -2`, and the task record said
`write_email: ran in 0.1s, 2 credits`. The registry now passes
`{ amount: tool.creditCost }`, so the advertised price, the pre-flight check and
the charge are one number; re-proved live on a fresh stack (quoted 1, ledger
`-1`, record `1 credit`, task cost 4 = 3 + 1). The old test asserted `=== 2` for
`analyze_data`, whose real cost is **also** 2 — it passed for the wrong reason and
hid this completely. The new assertion compares the charge against the *quoted*
cost, which is the invariant, and the record the founder reads must report the
same number.

### An AI employee's work can call a tool, through the EA's gate

`executeTool` carried the whole tool contract — role, authority, the approval
gate, the idempotency key, the credit charge, the audit row for a denial as well
as an execution — and had **no caller in task execution at all**, so work asked
for approval and then had nothing to run. The executor is now the caller
(`services/task-tools.ts` + `task-executor.ts`): the model is offered exactly its
role's tools and one strict, machine-readable way to ask for one, bounded at
three rounds, and everything it asks for is resolved by the registry rather than
by the prompt.

The task's record says what the work used — `Tools used: analyze_data: ran in
1.2s, 2 credits` — and the task row's cost equals every charge in the ledger
against it, while only the model's share is billed by the executor because the
registry already charged `tool.<id>`. A refused tool is refused for real: it is
audited as `tool.denied`, nothing is charged, and the refusal reaches the record
instead of hiding behind a plausible answer. A gated tool stops the task in
`awaiting_approval` naming the tool and its exact arguments, and the grant left
by the founder's approval is consumed when the halted run resumes.

**One real defect found while verifying:** tool audit rows carried no `task_id`,
so a task's tool activity could not be traced back to the task (executed, denied
and grant-consumed alike now name it). **Verified:**
`task-tools.integration.test.ts` 3/3 on the embedded database (charged and
audited; forbidden and uncharged; gated, then run on approval), `task-tools.test.ts`
11/11, and 42/42 on the executor-adjacent suites (executor, block-persist,
approval-gated work, approvals).

## 66.20 Memory is used, and provably so (Gap D)

The brief's test was: "if the founder teaches ORQ8 something today, can it use it
in future work?" The acceptance test is
`apps/api/test/memory-acceptance.integration.test.ts`, **4/4 passing** on the
embedded database: teach → stored and read back → a task phrased in **different
words** retrieves it → it reaches the model's prompt and shapes the result → the
memory row records that it was used → another company's knowledge never appears
in this company's search or work. Only the LLM boundary is stubbed, and it echoes
the company knowledge it was given, so the result can only contain the taught
fact if the fact genuinely travelled storage → retrieval → prompt → output. No
embedding provider is configured, so the file exercises the keyword path — the
path a self-hosted company actually gets.

**Two defects found by writing it, both fixed:**

1. **A founder's knowledge could never reach a task.** The keyword fallback
   matched the entire task description as one substring of the memory content
   (`ilike(content, '%<whole query>%')`), so with no embedding provider — the
   default state — retrieval found nothing unless the memory happened to contain
   the task's wording verbatim. Fixed in `services/memory.ts`: the query is split
   into salient terms (stopwords and short words dropped, capped at 12),
   OR-matched, and ranked by how many of them an entry contains, with importance
   and recency as tie-breakers. A query made only of noise words degrades to
   importance+recency rather than matching nothing.
2. **Nothing recorded that knowledge had ever been used.** `AgentMemoryEntry`
   promised `useCount`/`lastUsedAt` and both were hardcoded to `0`/`null`, so
   "does the company use what I taught it?" was unanswerable in the product and
   in the data. **Migration 0037** adds `use_count` and `last_used_at`; the
   context builders stamp the entries they hand to an employee
   (`stampMemoryUsage`), and reads through `/v1/memory` alone leave the counters
   alone — browsing is not using.

## 66.21 The founder loop, run end to end (2026-09-29)

The review stack (embedded Postgres on the production lineage, a local
OpenAI-compatible gateway so the Executive Agent really runs, the real API on
3111, the built web app on 3112) was booted and the loop was driven through the
**product's own routes**, not the API directly:

register → confirm → the company exists with three AI employees → hire → ask the
Executive Agent for work → the work stops on the founder's autonomy gate →
approve → the task resumes and completes → the route sweep walks all 33 `/app`
pages with a live session.

**Result after the fixes below: every step passes.** `scripts/route-sweep.mjs`
33/33 clean; the vertical slice 44/44; the gated task resumed on approval and
completed for 1 credit.

### What broke, and what each break cost the founder

| # | Break | Founder cost | Status |
| --- | --- | --- | --- |
| 1 | **Asking the Executive Agent for work failed in the product** — `/api/commands` answered 415 Unsupported Media Type. The proxy named `Content-Type` twice (once literally, once via `proxyAuthHeaders`, in two cases), so fetch sent `application/json, application/json` and Fastify rejected it; the identical request to the API succeeded | The one action the product exists for appeared broken, while every diagnostic said the backend was fine | **Fixed** |
| 2 | **Signup could not be completed without a mail provider.** The dev transport logged only recipient and subject — the confirmation link existed nowhere — and every page then answered 403 `email_not_verified` telling the founder to open a link they never received. The review stack itself worked around it with `update users set email_verified_at = now()` | A self-hosted company could not onboard a single account, and no screen said why | **Fixed** (the message, link included, is printed outside production; production without a provider now fails loudly instead of reporting a phantom success) |
| 3 | **The route sweep logged in as the wrong founder.** The stack seeded `founder@orq8.test` while the sweep read `demo@orq8.test` from `scripts/.env.demo.local`, so all 33 routes reported "redirected to /login" on a working app | The release smoke check was pure noise, and the advisory CI job stayed red for a healthy app — so nobody would notice it going red for a broken one | **Fixed** (one credential source, one default) |
| 4 | **Running the tests killed the review stack's database.** The stale-postmaster cleanup stopped *every* embedded Postgres on the machine; mid-review the API began answering 500 `ECONNREFUSED` with no visible cause | Reviewing while testing was impossible; the failure looked like a product bug, not a tooling one | **Fixed** (the cleanup is scoped to the harness's own data root) |
| 5 | **The stack announced "ORQ8 IS UP" with a dead web child.** Readiness only asked whether *something* answered on 3112, so a stale `next start` from an earlier run satisfied it while the stack's own web had just exited with EADDRINUSE | The reviewer reviews an old build and concludes their change did nothing | **Fixed** (refuses to start on an occupied port; a non-zero web exit is fatal) |
| 6 | **A gated command reported success.** With a `recommend`-level employee the work stopped at the approval gate, but the command still answered `status: completed` and "0/1 tasks completed" — the plan's own `requiresApproval` was the only thing consulted | The founder is told their request is done while it is sitting in a queue waiting for them; the work then looks lost | **Fixed** (the command reports `awaiting_approval` and says the task is waiting on a decision) |
| 7 | **Hiring a fourth employee is refused** by the trial cap of three, with "upgrade your plan" and no upgrade path in the MVP | A founder cannot build their own team; the message points at a door that does not exist | **Open** |
| 8 | **There is no web route for execute / retry / execute-pending.** Gap A resumes work and Gap C retries it, but only an API client can drive them | The founder can approve work and cannot start or re-run it from the product | **Open** |

Items 7 and 8 are the remaining product gaps; 1–6 were harness and product defects
that made the loop unprovable, and each was fixed in place rather than worked
around, because a review harness that lies is worse than none.

## 66.12 Definition of complete, applied to this document

A row is **REAL** only when the implementation exists, the backend behaviour
exists, permissions are enforced, error and empty states exist, real data flows
through it, a user can complete the workflow, it has been tested, and it did not
regress anything. A page is not complete because it renders; an integration is
not complete because the OAuth button exists; a task system is not complete
because rows can be inserted.
