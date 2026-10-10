# 87 — Build inventory: done, in flight, and what is left

Measured from the repository on **2026-10-10**. Every count was read out of the tree, not
recalled. Where a line is an inference it says so; where it is a plan it names the doc that
owns it.

| Scale | Count |
|---|---|
| Web pages (`page.tsx`) | **87** |
| Web API proxies (`app/api/**/route.ts`) | **159** |
| API route modules | **60** |
| Supabase migrations | **53** (through `0053`) |
| API service lines / route lines | ~41.4k / ~13.3k |
| API tests | **982** (979 passed, 3 skipped) across 119 files |

---

## 1. Done and committed

| Area | What shipped | Where | Verified by |
|---|---|---|---|
| Department OS P1 | migration `0050` (`departments.settings jsonb`); blueprint persisted on activation; `findDetail` enrichments (queued/done/metrics/workflows/head); `components/os/*`; department page rebuilt for **all** templates with the differential as `pageConfig` | `99c5661` | API suites + live run (docs/85 §12) |
| Department OS P2 | template catalog `/app/departments/templates` (blueprint preview + idempotent one-click establish); hire-from-template ordered by the department's own roles; event-rule workflow editor against `PUT\|DELETE /v1/event-rules` | `f6ffcc5` | API suites + web proxies |
| UI foundation | `os/structure.tsx` (15 layout components), nine-state vocabulary with `failed` split out of `blocked`, missing failed-status token, `department-focus.ts`, 12 regression tests | docs/86 §4 | `department-focus.test.ts` |
| Engineering focus + page rebase | `department-focus.ts` engineering read-model (member-scoped work/reviews, workspace-wide repositories/sandbox); employee workspace migrated onto the shared layer; roster→employee link; engineering page rebased, three status mappers exported so pages cannot disagree | `d18e4f3` | `department-focus.integration.test.ts` |
| Decision tokens, queue-based gate release | founder decisions release work through the queue, single-use grants against a decision token | `d213da1` | decision-token + approval suites |
| RLS attestation + `0049` lockdown | security-definer functions locked down; RLS attestation; DR drill | `d213da1`, `8332099` | RLS e2e |
| Credits economics | measured cost rolled into `creditsUsed`; budget enforcement + bound delegation; LLM cost recording + margin; race-proof enqueue dedup; credits purchase page | `de5c425`, `bbd621b`, `914f722`, `2c00bb4`, `52f13dc` | credit + budget suites |
| Admin console bits | admin user-detail page + read-only admin Executive Agent | `0a62752` | admin suites |

### Done in this session (uncommitted — see §2)

| Item | Result | Evidence |
|---|---|---|
| `0052` org-member policies | 7 prod-only policies + the identity `id` `0001` declares; **byte-identical to production, 0 policy/column diffs**, applying it changed nothing | lineage parity tool, ledger checksum recomputed |
| `0053` `agent_jobs.locked_at` nullable | Restores nullability; without it every terminal job transition (complete, dead-letter, fail/retry, skip, reap) raises a constraint violation, so the first claimed job wedges | 3 suites: 9 failures/12 passing → green |
| Engineering page compression | 1153 → 1081 lines via four column builders + shared `formatDate`. **The 840-line target is not met** — residual length is the render, not column repetition | build + tsc |
| Job-suite item 1 — pre-dispatch skip verdict | **The verdict was never broken; the harness was.** `claimAndRunOne` runs preflight for every consumer including the gate-release path, so a completed task is `skipJob`'d. What actually failed is that any process can claim *any* pending job: on the shared test database a neighbour test file's worker took this file's job, so `thisWorker.stats.skipped` stayed 0 while the job still settled to `done`. Fixed at the source (see the next row) and the either/or assertion tightened to `skipped ≥ 1` **and** `deadLettered === 0`, which can tell a skip from a dead-letter | cluster repro: fail → pass; `agent-jobs.integration.test.ts` 8/8 |
| Job-suite item 2 — tool summary on the approved path | **Two distinct things.** (a) The single-tool approved path was already correct; it only ever failed when a *foreign* process ran the resumed job with its own module registry (no LLM stub → fallback → no tool). (b) The real code gap was the chained case: a tool that ran before a *later* tool stopped for approval was discarded, so the task row said nothing ran while the ledger had already charged it. `stopForToolApproval` now records the tools that ran and the credits they cost | cluster repro + 5/5 after the queue fix; chain test **fails without the fix** |
| Queue claims are scopeable — the root cause of both | `claimJob` takes an optional `orgId` narrowing (the production worker stays global); the approval-release drain scopes to the org whose founder just said yes, and the job tests scope their workers to their own org. This is the fix that makes the two rows above deterministic instead of load-dependent | cluster (6 files) **1/3 → 5/5** |
| Four focus read-models | marketing, finance, and a shared accounts model for sales + customer success, template-gated exactly like engineering | `department-focus.integration.test.ts` 6/6 |

---

## 2. In flight (uncommitted)

| File(s) | State |
|---|---|
| `supabase/migrations/0052_*.sql`, `0053_*.sql` | written, verified against the harness; **not applied to production** |
| `apps/api/src/services/department-focus.ts` | +3 read-models (finance, marketing, accounts) |
| `apps/api/src/services/departments.ts` | template→model switch, `focus` type, `pageConfig` `focus` for 4 more templates |
| `apps/api/src/services/task-executor.ts` | stop-for-approval keeps the tools that ran + their charged credits |
| `apps/api/src/services/jobs.ts` | `claimJob` optional `orgId` narrowing |
| `apps/api/src/services/job-worker.ts` | `claimAndRunOne` / `startJobWorker` pass the narrowing through |
| `apps/api/src/routes/approvals.ts` | release drain claims only its own org's queue |
| `apps/api/test/agent-jobs.integration.test.ts` | workers scoped to the file's org; skip assertion tightened |
| `apps/api/test/{task-tools,department-focus}.integration.test.ts` | new chain test, 3 new read-model tests |
| `apps/web/components/work/department-focus-panel.tsx` | +3 panels (marketing, finance, accounts) |
| `apps/web/components/work/department-workspace.tsx` | renders whichever model the template ships |
| `docs/87_BUILD_INVENTORY.md` | this file |

Other threads (untouched here — do not assume ownership): EA display-name rename,
`orgs`/`attention`/`plan-revisions`, a new admin organizations page,
`scripts/verify-ci-lineage.ts`, `weekly-report-byline.test.ts`, `email/*`, and page edits
across usage/teams/tasks/strategy/settings.

---

## 3. Pages

### 3a. Done — on the shared `os/` layer (5)

| Page | How it inherits |
|---|---|
| `/app/departments/templates` | direct `os/*` + `work/template-catalog` |
| `/app/engineering` | direct `os/*` + the column builders |
| `/app/departments/[id]` | via `work/department-workspace`, `work/department-focus-panel` |
| `/app/agents/[id]` | via `work/employee-workspace` |
| `/app/tasks` | via `work/work-board` |

### 3b. Not started — still on the legacy palette (51)

Real code hits for `bg-white` / `text-muted-foreground`, comment lines excluded. The tail is
cheap: **21 have ≤4 hits**.

| Hits | Effort | Pages |
|---|---|---|
| 25 | heavy | `/app/business-import` |
| 24 | heavy | `/app/teams` |
| 20 | heavy | `/onboarding` |
| 18 | heavy | `/app/squads`, `/app/agents` |
| 15 | heavy | `/app/simulation` |
| 14 | heavy | `/app/performance` |
| 12 | medium | `/app/roi`, `/app/goals/[id]` |
| 10 | medium | `/app/report`, `/app/mcp`, `/admin/users/[id]` |
| 9 | medium | `/app/profile`, `/app/members`, `/admin/model-router` |
| 8 | medium | `/app/org`, `/app/decisions`, `/app/activity` |
| 7 | light | `/app/usage`, `/app/learning`, `/admin/execution`, `/admin/ai-usage` |
| 6 | light | `/app/lineage`, `/admin`, `/admin/health`, `/admin/errors` |
| 5 | light | `/app/tasks/[id]`, `/app/strategy`, `/app/health`, `/admin/users` |
| 4 | light | `/settings/cookies`, `/invite/[token]`, `/app/council`, `/admin/settings`, `/admin/security`, `/admin/organizations` |
| 3 | trivial | `/verify-email`, `/app/quality`, `/app/jobs`, `/app/credits` |
| 2 | trivial | `/settings/change-password`, `/app/company/overview` |
| 1 | trivial | `/settings/terms-conditions`, `/settings/providers`, `/settings/privacy-policy`, `/settings/connections`, `/app/memory`, `/app/files`, `/admin/commands`, `/admin/agents`, `/admin/activity` |

**Admin console is the special case: 17 pages, none on the shared layer**, 14 of them still
legacy (`/admin/approvals`, `/admin/jobs`, `/admin/organizations/[id]/intel` are not). Its plan
is `docs/78`; none of it has been migrated.

### 3c. Not console pages — their own visual language (out of scope)

| Group | Pages |
|---|---|
| Landing | the 8 `(landing)` pages |
| Auth | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/check-email` |
| Internal | `/skin-preview` |

---

## 4. What is left, in the order that pays

| # | Item | Type | State |
|---|---|---|---|
| 1 | Apply `0053` to production, then land `0051`–`0053` + this session's work | **latent outage** | not started |
| 2 | Make the drift detector able to report *clean*, then put it in CI | debt that hid a defect | not started |
| 3 | P3: executive dashboard department strip, per-department health, workflow run history | product | not started |
| 4 | Sales/customer-success get real `deals` and `tickets` tables so their boards stop sharing one read-model | product + schema | not started |
| 5 | Employee → department back-link (`departmentId` on `GET /v1/agents/:id`) | small gap | not started |
| 6 | Bulk page migration, worst-first (§3b): `business-import`, `teams`, `onboarding`, `squads`, `agents`, `simulation`, `performance`, `roi`; plus a decision on the admin console per `docs/78` | UI | not started |
| 7 | Ledger leftovers: Monaco browser (`T-08`), Stripe upgrade UI (`T-07`), Playwright in CI (`docs/84`), worker Dockerfile scale demo (`docs/79`), launch-checklist Vercel/domain/`REGISTRATION_OPEN` | mixed | not started |
| 8 | Responsive verification at 375/768/1280 on the migrated pages; charts deferred until a real series exists | verification | not started |
| 9 | `GET /v1/agents/:id` and the department page's rendered output verified in a browser with a founder session | verification | never run |

### Focus read-models — the P3 sub-table (docs/86 §6)

| Model | State | Grounding |
|---|---|---|
| engineering | **done** (`d18e4f3`) | repositories, engineering_tasks, repository_prs, sandbox_runs |
| marketing | **done this session** | `files` produced by members (member-scoped) + `briefings` (workspace-wide) |
| finance | **done this session** | `departments.budget` + `credit_transactions` + `credit_reservations` + `credit_alerts` |
| sales | **done this session, shared** | one `accounts` model over knowledge-graph `customer` entities |
| customer success | **done this session, shared** | the same `accounts` model, framed per department |

**Why sales and success share a model — read this before calling it a shortcut.** ORQ8 has no
`deals` table and no `tickets` table. A sales page showing a "pipeline" and a success page
showing a "ticket queue" would print numbers nobody wrote, which docs/85 §11 and docs/86 §5
both forbid. What the schema does have is one first-class customer record, written by business
import and by agents. Both departments read that; the page frames it for its own job. Item 4
above is what turns them into genuinely different boards.

---

## 5. Known defects and risks

| # | Risk | Severity | State |
|---|---|---|---|
| 1 | `0053` not applied: production's `agent_jobs.locked_at` is `NOT NULL DEFAULT now()` while `jobs.ts` writes `locked_at = null` on every terminal transition and the reaper. Any claimed job wedges in `running`. Latent **only** because production's `agent_jobs` is empty | **outage on first real job** | fixed in repo, not in prod |
| 2 | The parity tool cannot report clean: 163 unexpected differences (pgvector + ~110 functions + embedding index, `pg_stat_statements`, `supabase_vault`, `uuid-ossp`, pgcrypto, and 3 production-only functions `0049` already names). `isExpected` whitelists 2. **No CI workflow runs it.** It diffs prod against a fresh build *of the same migrations*, so a migration contradicting `packages/db` is invisible by construction — how `0048` survived | high | open |
| 3 | Credential-shaped files untracked in the repo root: `.review-token.txt`, `.review-kid.txt`, loose `.railway-api-env-names.json`, `all prompt.txt`, `.dept-e2e-data/` | high | open |
| 4 | Nothing is committed or pushed; `0051`–`0053` and this session's work sit in the working tree alongside other threads' edits | medium | open |
| 5 | The new focus panels are **unverified in a browser** — they need a founder session. API tests, API tsc and the web build/tsc are the evidence today | medium | open |
| 6 | `pageConfig.sections` is **declared but not rendered**: the API returns a per-template section order and `resolvePageConfig` exposes it, yet no page consumes it — only `metrics` drives the render. So "the differential is expressed as `pageConfig`" is true for metric emphasis and not for section order, and adding `focus` to a template's `sections` is contract metadata, not a layout change | medium | open |
| 7 | ~~`approval-gated-work.integration.test.ts`'s "resumes the gated task" can miss its 15s settle window~~ — **root cause found and fixed.** The PATCH answers by enqueuing and firing *one* claim; unscoped, that claim could take a different org's older pending job, and tests run no background worker (`JOB_QUEUE_MODE` defaults to `inline`), so the just-released job sat `pending` until the deadline. The `orgId` narrowing makes the drain take its own org's job. The 15s window was left as-is — it was never the problem | resolved | fixed |
| 8 | Responsive verification owed; charts deferred | low | open |

### Corrections to the 2026-10-09 version of this file

| Claim then | Truth now |
|---|---|
| "Two pre-existing job-suite failures: skip verdict does not fire, tool summary missing" | **Neither was a product defect at the point first assumed, and both had one shared cause.** The skip verdict fires; the tool summary is written for the single-tool path. What *was* broken is that any process may claim any pending job: on the shared test database a neighbouring test file took this file's job and ran it under its own module registry, which reads as "the skip counter never moved" and "the tool never ran" — the second failure printed another file's stubbed answer as proof. `claimJob`/`claimAndRunOne`/`startJobWorker` now take an optional `orgId` narrowing, the approval-release drain uses it, and the job tests scope their workers. The one real code gap was the chained case (a tool that ran before a later gate), fixed and pinned by a test that fails without the fix. **Full API suite green: 979 passed, 3 skipped, 118 files, exit 0 — zero failures.** |
| "One column difference after 0053" | 163 differences; exactly one (`agent_jobs.locked_at`) is ours, the rest are pre-existing environment artifacts (§5 item 2). |
| "Focus models for the other four departments do not exist" | marketing, finance, and the shared accounts model now exist — but sales/customer success share one, for the schema reason in §4. |
| Admin console "17 pages, 15 legacy" | 17 pages, **14** legacy, 0 on the shared layer. |
