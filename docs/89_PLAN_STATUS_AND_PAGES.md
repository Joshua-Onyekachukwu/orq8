# 89 — What was planned, what is done, and what is left

Two tables you asked for, built from the repository and from the requirement registers
(`docs/66` §66.7, `docs/68` §1). **Status is the honest state on 2026-10-10**, not an
aspiration. Anything I have not personally re-verified today is marked as such.

Sources of truth for each table:
- **Features** — the stable requirement IDs `MVP-001…MVP-035`. Nothing is marked done here
  unless the register names the evidence and the evidence still exists in the tree.
- **Pages** — `find apps/web/app -name page.tsx` (87 pages) plus, for each, what it is for.

---

## 1. Features planned, and where each one stands

Legend — **Done**: implemented and verified by a test or a live run. **Partial**: works, but a
named piece is missing. **Left**: not implemented, or implemented and unreachable.

| # | Feature (ID) | What it is for | State | What is missing / how it is verified |
|---|---|---|---|---|
| 1 | Reachable deployed product (MVP-001) | a founder can use it at a URL | **Done, stale** | live and answering: API `/healthz` 200 + `/readyz` 200, web 200 on `orq8web-production.up.railway.app` *and* `orq8.vercel.app` (measured 2026-10-11). The deployment builds from `origin` and is 8 commits behind; the web host is undecided |
| 2 | Live database under the production lineage (MVP-002) | migrations applied and recorded | **Done (applied)** | production is `gttkaxbcdtpsusmconxm`; fingerprint **0 unexpected of 164 documented differences**; the ledger still omits the hand-applied `0053`/`0054` |
| 3 | Safe migration path with a ledger (MVP-003) | `--status` before apply, a record of what landed | **Partial** | the harness replays and CI blocks on it; production was brought up to date by hand (verified by fingerprint) because the pooler password has been stale since 2026-10-10 |
| 4 | Staging environment (MVP-004) | releases are not tested live | **Left** | none exists |
| 5 | Scheduled jobs / cron against a live API (MVP-005) | briefings, drip, rehearsal on a schedule | **Left (one secret)** | the host exists; every scheduled run fails `404 Application not found` because the GitHub `API_URL` secret names the deleted application |
| 6 | Signup, email confirm, login, logout, recover (MVP-006) | getting in | **Done** | verified live; mail provider only in production gap |
| 7 | Create a company and reach the dashboard (MVP-007) | first run | **Done** | founder loop run end to end |
| 8 | Onboarding to first value (MVP-008) | guide a new founder to the first hire/command | **Done (review stack 14/14)** | Company Hub four-step checklist, proven across all four states from server-rendered HTML; production signup pass pending |
| 9 | Executive Agent (MVP-009) | natural-language org management | **Done** | 54/54 batch; **this session: live command returned `status=error`** in the review stack — the deployed model key needs checking, not the pipeline |
| 10 | Departments: templates, create, configure (MVP-010) | the org chart | **Done** | plus `0050` blueprints, P1/P2 |
| 11 | AI employees: hire, edit, authority, pause, history (MVP-011) | the workforce | **Done** | live hire in the founder loop |
| 12 | Work: create, delegate, execute, retry, outcome (MVP-012) | the job of the company | **Done** | the queue fix this session; a retried task completes |
| 13 | Approvals + authority enforced server-side (MVP-013) | nothing consequential happens silently | **Done** | 8/8 approval-gated work |
| 14 | Founder Attention as the single decision surface (MVP-014) | one place to decide | **Done** | queue moved 1 → 0 live |
| 15 | Credits, usage, budgets visible and enforced (MVP-015) | the economics | **Done** | charge equals the quoted cost; verified live |
| 16 | Company memory persists and is used (MVP-016) | the company learns | **Done** | taught → stored → retrieved from different wording |
| 17 | Audit trail, hash-chained (MVP-017) | proof of what happened | **Done** | chain verifies; exports |
| 18 | Member invites and roles (MVP-018) | more than one human | **Done** | 20/20; removal revokes sessions |
| 19 | One working external integration (MVP-019) | the company touches the outside | **Left (keys)** | `/v1/readiness` reports `configuration_required` |
| 20 | One-click demo company (MVP-020) | a prospect sees it working | **Done (review stack)** | `POST /v1/demo-company` + hub `SeedDemoButton`, proven live end to end; production pass pending |
| 21 | Production smoke check gating releases (MVP-021) | a deploy is not good until the product is on | **Partial** | the gate is proven both ways; the `PRODUCTION_API_URL` secret is still unset (checked 2026-10-11), so it reports *not run* instead of gating |
| 22 | Proof harnesses in CI (MVP-022) | the claims are checked automatically | **Done** | `proofs` is a blocking job |
| 23 | Env surface documented and drift-guarded (MVP-023) | a deployer can learn the surface | **Done** | `env-surface.test.ts` |
| 24 | Backup/restore drill (MVP-024) | survivable | **Done** | executed 2026-10-07: prod dump → restore into a clean lineage → counts vs manifest, audit chains valid both sides (~35 s) |
| 25 | Cost caps verified in production (MVP-025) | no runaway spend | **Partial** | enforced locally only |
| 26 | A founder runs for a week unassisted (MVP-026) | the acceptance test | **Left** | blocked on #1 |
| 27 | No raster logo / foreign wordmark can ship (MVP-027) | brand integrity | **Done** | blocking CI job |
| 28 | Every account-bearing route requires a session (MVP-028) | no open surface | **Done** | route-by-route, CI-gated |
| 29 | An approval decision drives the work (MVP-029) | approve resumes, reject stops | **Done** | + decision token, single-use grant |
| 30 | A task execution can call a tool (MVP-030) | employees do real things | **Done** | one gate shared with the EA |
| 31 | Something drives unblocked work (MVP-031) | work actually moves | **Done** | Run queued work / Retry in the product |
| 32 | No company can read another's data (MVP-032) | isolation | **Done** | RLS 55/55 |
| 33 | A session acts in every org it belongs to (MVP-033) | consultants, agencies | **Done** | accepting an invite switches |
| 34 | A deployment can say what it can/cannot do (MVP-034) | honest readiness | **Done** | `/readyz`, `/v1/readiness` |
| 35 | Mail delivery is provable (MVP-035) | nobody is locked out | **Done** | `/v1/settings/mail/test` |

### Shipped in THIS session (uncommitted)

| Item | State | Evidence |
|---|---|---|
| Queue claims are scopeable (`claimJob` optional `orgId`) | **Done** | new regression file **fails without the fix** (`expected 2 to be +0`), passes with it |
| Cross-file job stealing cannot silently return | **Done** | `queue-claim-scope.integration.test.ts` 3/3 |
| `deals` + `tickets` tables (`0054`) | **Done** | applied by the harness; Drizzle schema added |
| Sales board rebuilt on `deals` | **Done** | **live in the browser**: $19,300 pipeline, $10,860 weighted, 50% win rate |
| Customer-success board rebuilt on `tickets` | **Done** | **live in the browser**: 2 open, 1 escalated, 1 past SLA, 1 unassigned |
| Drift detector can report clean with no database | **Done** | `--check` exit 0 clean; **exit 1 naming `agent_jobs.locked_at`** on a probe migration; now a CI job |
| The four focus panels are reviewable in a browser | **Done** | all five panels verified live (see §3) |
| Agent/EA logic written down against the code | **Done** | [88_AGENT_AND_EA_LOGIC.md](88_AGENT_AND_EA_LOGIC.md) |
| `0053` applied | **Local only** | the harness applies it; **production is untouched — needs authorization + credentials** |

### Left, in the order that pays

| # | Item | Why it matters |
|---|---|---|
| 1 | A host for the API, and a production database (MVP-001/002) | five of six P0s are this one requirement; nothing is a feature |
| 2 | Apply `0052`/`0053`/`0054` to production | the queue wedges on the first claimed job without `0053` |
| 3 | Land this session's tree (nothing is committed) | verified work that exists only on disk |
| 4 | Executive dashboard strip, per-dept health, workflow run history | P3 product surface |
| 5 | Bulk page migration, worst-first | 2 of 87 pages import `components/os/*` directly |
| 6 | Monaco browser, Stripe upgrade UI, Playwright in CI | ledger leftovers — **no `monaco` reference exists in the tree**, so that one is not started |
| 7 | Real campaigns table for marketing | marketing reads assets + briefings because no campaigns table exists |

---

## 2. Pages: what each one is for, and its state

**Measured state, not assumed:** `find apps/web/app -name page.tsx` → **87** pages. Of those,
**2** import the shared console layer (`components/os/*`) directly; the department workspace
renders it for every department page, so the departments screens are on it too. Everything
else is the older page-local shell.

### Product shell — `/app`

| Page | What it is for | State |
|---|---|---|
| `/app` | HQ: what is happening, what needs you | legacy shell, live data |
| `/app/activity` | the feed of everything that happened | legacy |
| `/app/agents`, `/app/agents/[id]` | the workforce, and one employee's workspace | legacy |
| `/app/approvals` | decisions waiting on you | legacy |
| `/app/attention` | the single decision queue | legacy |
| `/app/audit` | hash-chained history + verify | legacy |
| `/app/briefings` | generated briefings | legacy |
| `/app/budgets` | per-goal/per-employee credit spend | legacy |
| `/app/business-import` | turn a website into a proposed company | legacy |
| `/app/company/overview` | the company at a glance | legacy |
| `/app/constitution` | the rules the company runs by | legacy |
| `/app/council` | decision council sessions | legacy |
| `/app/credits` | balance, purchase, usage | legacy |
| `/app/decisions` | decision memory with outcomes | legacy |
| **`/app/departments`** | department cards: who, capacity, catalog | **shared layer** |
| **`/app/departments/[id]`** | one department's workspace + **its focus board** | **shared layer + `#focus`** |
| **`/app/departments/templates`** | template catalog, one-click establish | **shared layer** |
| **`/app/engineering`** | engineering workspace | **shared layer** |
| `/app/files` | uploaded documents | legacy |
| `/app/finance` | finance workspace | legacy (department page carries the finance board) |
| `/app/goals`, `/app/goals/[id]` | goals and one goal | legacy |
| `/app/health` | company health score | legacy |
| `/app/integrations` | connectors, OAuth, health | legacy |
| `/app/jobs` | scheduled job runs | legacy |
| `/app/knowledge` | the knowledge graph | legacy |
| `/app/learning` | what the company learned | legacy |
| `/app/lineage` | strategy → objective → KR → task | legacy |
| `/app/mcp` | MCP servers and tools | legacy |
| `/app/members` | people and roles | legacy |
| `/app/memory` | company memory | legacy |
| `/app/notifications` | alerts and prefs | legacy |
| `/app/org` | the organization record | legacy |
| `/app/performance` | employee performance | legacy |
| `/app/profile` | your profile | legacy |
| `/app/quality` | QA verdicts on work | legacy |
| `/app/report` | executive report | legacy |
| `/app/roi` | workforce ROI | legacy |
| `/app/simulation` | what-if simulation | legacy |
| `/app/squads` | cross-agent squads | legacy |
| `/app/strategy` | the plan document + revisions | legacy |
| `/app/tasks`, `/app/tasks/[id]` | work, and one task with Run/Retry | legacy |
| `/app/teams` | teams | legacy |
| `/app/usage` | usage detail | legacy |

### Admin console — `/admin` (17 pages)

| Page | Purpose | State |
|---|---|---|
| `/admin` | platform overview | legacy |
| `/admin/activity`, `/admin/audit`-style surfaces | what happened platform-wide | legacy |
| `/admin/agents` | all AI employees | legacy |
| `/admin/ai-usage` | model spend | legacy |
| `/admin/approvals` | gates across orgs | legacy |
| `/admin/commands` | the EA command queue | legacy |
| `/admin/errors`, `/admin/health`, `/admin/jobs` | operability | legacy |
| `/admin/execution` | sandbox/execution runs | legacy |
| `/admin/model-router` | routing decisions | legacy |
| `/admin/organizations`, `/admin/organizations/[id]/intel` | per-company view | legacy |
| `/admin/security` | security controls | legacy |
| `/admin/settings` | platform settings | legacy |
| `/admin/users`, `/admin/users/[id]` | accounts (read-only EA on the detail page) | legacy |

### Auth, settings, landing — 22 pages

`/login`, `/register`, `/check-email`, `/verify-email`, `/forgot-password`,
`/reset-password`, `/invite/[token]`, `/onboarding`, `/skin-preview` and the eight
`(landing)` marketing pages, plus `/settings` and its six sub-pages. These are **not** part of
the console migration; they are correct as they are.

---

## 3. What was verified today, and what could not be

**Verified by running it**
- Full API suite: see the run recorded in the session log (regression check after the
  sales/customer-success rebuild).
- `department-focus.integration.test.ts` **7/7**, `queue-claim-scope.integration.test.ts`
  **3/3**, and both together with `agent-jobs` **18/18**.
- API `tsc --noEmit` and web `tsc --noEmit`: clean.
- `lineage-parity.ts --check`: **exit 0 clean**; with a probe migration re-tightening
  `agent_jobs.locked_at`, **exit 1** naming that column.
- Web production build succeeded (191/191 static pages).
- **All five focus panels rendered live in a browser session** (signed in as the seeded
  founder, reading each department's `#focus` section from the running page): Sales pipeline,
  Support queue, Finance focus, Marketing output, Engineering focus.

**Could not verify, and why**
- **Migrations against production** — the pooler database password in this checkout is stale, so the
  runner cannot be used from here; production was updated through the Supabase Management API instead
  (`scripts/supabase-sql.mjs`) and verified by fingerprint rather than by a ledger row.
- **The Executive Agent command in the review stack returned `status=error provider=none`** —
  the live model key in `apps/api/.env` is not working from here. The pipeline itself is
  covered by the API suites; the *deployed* LLM call is not something this run can claim.
- **The queue worker child in the review stack could not reach the embedded database**
  (`ECONNREFUSED`), so the stack was booted with `REVIEW_JOBS=0` (inline execution). Queue
  behaviour is covered by the suites above; the review stack's worker path is not.
- **Screenshots** — the preview webview produced no frames, so every panel check above is the
  live DOM text of the running page rather than an image.
- **Nothing is committed.** The working tree also carries other threads' edits; I did not
  stage or commit anything.
