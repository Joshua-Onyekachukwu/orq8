# 87 — Build inventory: done, in flight, and what is left

Measured from the repository on **2026-10-10**. Every count was read out of the tree, not
recalled. Where a line is an inference it says so; where it is a plan it names the doc that
owns it.

| Scale | Count |
|---|---|
| Web pages (`page.tsx`) | **87** |
| Web API proxies (`app/api/**/route.ts`) | **159** |
| API route modules | **60** |
| Supabase migrations | **54** (through `0054`) |
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

### Done in this session — responsive verification, and the two defects it exposed

| Item | Result | Evidence |
|---|---|---|
| Responsive walk at 375 / 768 / 1280 (`docs/87` §4 item 8) | **Run for the first time**, against the built stack (`next start`), not `next dev` | `scripts/route-sweep.mjs --width …`: **37/37** at all three widths after the fix below |
| Both console themes on every `/app` route | 74/74 route-theme pairs clean, including the two dynamic workspaces discovered from the app's own API | `scripts/theme-walk.mjs` |
| The one responsive defect found | `/app/departments` scrolled the document 33px sideways at 375. Its card grid (`grid gap-4 md:grid-cols-2`) has one implicit `auto` track below `md`, and that track is sized by its items' contributions, not the container: **392px inside 326px**, measured in the live DOM. Fixed by naming the mobile track `grid-cols-1` (`minmax(0, 1fr)`) | pre-fix `36/37`, post-fix `37/37`; the diagnosis was proved by forcing the template column in the browser before editing |
| A real 500 the 768 walk caught | `GET /v1/capabilities` threw `duplicate key value violates unique constraint "capability_registry_org_id_name_key"` — `ensureBuiltInCapabilities` is check-then-act and all three capability routes seed lazily, so concurrent readers both inserted. Now `onConflictDoNothing({ target: [orgId, name] })` | new race test in `mcp-capability.test.ts`: **fails without the fix** (`1 failed / 12 passed`), passes with it; live: 12 concurrent reads → 12 × 200, 15 capabilities |
| The API test gate could not fail | Offline runs printed `Test Files 1 failed` and exited **0**. `embedded-postgres` registers `async-exit-hook` on import, which force-exits on `beforeExit` with a hardcoded `0`, discarding the `process.exitCode = 1` vitest had set. `scripts/lib/api-test-db.ts` now removes exactly the `beforeExit` listeners that import adds | failing probe → exit **1**, green file → exit **0**, full suite → **120 files passed / 1 skipped, 989 passed / 3 skipped, exit 0** |
| `docs/87` §5 item 3 — credential-shaped files in the root | **Resolved**: `.review-token.txt`, `.review-kid.txt`, `.railway-api-env-names.json`, `all prompt.txt`, `.dept-e2e-data/` were untracked *and unignored*; now ignored by name | `git check-ignore` on all five |
| §5 item 5 — focus panels unverified in a browser | **Resolved for the models that have data**: the Growth page renders its real pipeline (2 open deals, $19,300, $10,860 weighted, 50% win rate, stage breakdown, per-deal rows) and Customer Success its support queue, at 375px with a founder session and zero overflow | browser DOM read on the live stack |
| §4 item 5 — employee → department back-link | **Half done, and the missing half is the UI's**: `GET /v1/agents/:id` already returns `departmentId`, `departmentName`, `teamId`, `teamName` (verified live), and the employee page prints the department name — but as plain text, with no link to `/app/departments/<id>`. Not touched here: `components/work/employee-workspace.tsx` is in another thread's uncommitted changes | live API + DOM read |

---

## 2. Tree state after this session

**Committed** (see §1): the department OS work through `b93d128` — migrations `0050`–`0054`,
the focus read-models and their panels, the org-scoped job claims and the `agent_jobs.locked_at`
repair — plus this session's responsive fix, the capability-registry race fix, the embedded-DB
exit-code fix, the `.gitignore` additions and this file.

**Not applied to production**: `0053` and `0054`. The rest of this list — the EA display-name
rename (`executive-agent-context` and its consumers), `orgs`/`attention`/`plan-revisions`, a new
admin organizations page, `scripts/verify-ci-lineage.ts`, `weekly-report-byline.test.ts`,
`email/*`, and page edits across usage/teams/tasks/strategy/settings — was already in the working
tree, belongs to other threads, and was neither staged, committed nor overwritten. The one
exception is `/app/departments`' card grid, where a two-word responsive fix was staged from a file
another thread is editing; their hunks in that file were left uncommitted.

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
| 1 | Apply `0053` to production, then land `0051`–`0053` + this session's work | **latent outage** | **production half done** (2026-10-11): `0053` and `0054` are live in the Supabase project, confirmed by a fresh production fingerprint — and **`0055` is now owed there too**: it is the migration that closes the client write surface §5 item 13 describes, so production is the one environment that still has the hole until it runs — `agent_jobs.locked_at` is `timestamp with time zone | YES | no default`, and `deals` (16 columns) + `tickets` (15) carry their `*_org_member` policies. Landing the repo side is separate (see §5 item 4) |
| 2 | Make the drift detector able to report *clean*, then put it in CI | debt that hid a defect | **done** (2026-10-11) — `--check` boots the lineage with no database and diffs it against the committed `supabase/lineage-baseline.json`; it is a blocking CI job (`lineage` in `.github/workflows/ci.yml`), exit 0 clean. The half that could not report clean is fixed too: expectedness is now **provenance-based** (function ownership + five documented environment extensions + the three Supabase bootstrap functions), so fresh vs live production reports **0 unexpected out of 164 documented differences, exit 0** — and four injected drifts (including the pre-`0053` `agent_jobs.locked_at` shape) still exit 1. The production comparison runs over the Management API (`--supabase`), so it needs no database password |
| 3 | P3: executive dashboard department strip, per-department health, workflow run history | product | **done** (`b26e62d`) |
| 4 | Sales/customer-success get real `deals` and `tickets` tables so their boards stop sharing one read-model | product + schema | **done**: `0054` + the two read-models + their panels (`b26e62d`); sales now reads deals, success reads tickets, and each page says which rows are its own |
| 5 | Employee → department back-link (`departmentId` on `GET /v1/agents/:id`) | small gap | **done** (`67f00b2`): the employee workspace's identity header links its department label to `/app/departments/<id>`, guarded on a real department FK so a legacy text-only agent stays plain text instead of a 404 link. `scripts/verify-employee-dept-link.mjs` proves the round trip in a browser against the running stack (8/8), and the department workspace's roster already links back |
| 6 | Bulk page migration, worst-first (§3b): `business-import`, `teams`, `onboarding`, `squads`, `agents`, `simulation`, `performance`, `roi`; plus a decision on the admin console per `docs/78` | UI | **started (2026-10-11)** — `business-import` and `teams` are on the shared layer (`PageContainer`, `OsSection`/`OsPanel`/`OsDataTable`/`OsFacts`/`OsToolbar`/`OsPagination`/`OsModal`, column builders, the state vocabulary), with the width decisions and evidence recorded in the migration table in `docs/76` Phase 3. The two migrations paid for themselves twice: they exposed **40 proxy routes caching authenticated reads** (§5 item 11) and they forced two additive shared primitives (`OsModal`, `OsEmptyPanel` action). Next worst-first: `onboarding`, `squads`, `agents`, `simulation`, `performance`, `roi` |
| 7 | Ledger leftovers: Monaco browser (`T-08`), Stripe upgrade UI (`T-07`), Playwright in CI (`docs/84`), worker Dockerfile scale demo (`docs/79`), launch-checklist Vercel/domain/`REGISTRATION_OPEN` | mixed | **Playwright in CI: done (2026-10-11)** — the two browser sweeps were steps in the `audits` job, which installs no browser and boots no stack, so they failed on every run; and `route-sweep`'s default base is **production**, which has no demo account to log in with, so even with a browser they would have reported 37 failures that said nothing about the commit. They are now proofs (`routes-375`, `themes`) in the `founder-loop` job, which already builds the web app, boots the review stack and installs chromium. The other four items are still not started |
| 8 | Responsive verification at 375/768/1280 on the migrated pages; charts deferred until a real series exists | verification | **done** for the three widths and both themes (§1); charts still deferred |
| 9 | `GET /v1/agents/:id` and the department page's rendered output verified in a browser with a founder session | verification | **done**: 37 routes plus both dynamic workspaces walked at three widths and in both themes with a founder session, the Growth department's deal board and Customer Success's ticket queue read back from the live DOM, and `GET /v1/agents/:id` read live |

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
| 1 | `0053` not applied: production's `agent_jobs.locked_at` is `NOT NULL DEFAULT now()` while `jobs.ts` writes `locked_at = null` on every terminal transition and the reaper. Any claimed job wedges in `running`. Latent **only** because production's `agent_jobs` is empty | **outage on first real job** | **resolved in production (2026-10-11)** — a live fingerprint shows `agent_jobs.locked_at` nullable with no default; the hand-applied `0053` is in place |
| 2 | The parity tool cannot report clean: 163 unexpected differences (pgvector + ~110 functions + embedding index, `pg_stat_statements`, `supabase_vault`, `uuid-ossp`, pgcrypto, and 3 production-only functions `0049` already names). `isExpected` whitelists 2. **No CI workflow runs it.** It diffs prod against a fresh build *of the same migrations*, so a migration contradicting `packages/db` is invisible by construction — how `0048` survived | high | **resolved (2026-10-11)** — three transports, one classifier: `--check` (committed baseline, no database, CI), `--diff` (two fingerprints), and `--supabase` (production over the Management API, no DB password). Expected differences are attributed by function ownership to five documented environment extensions plus the three Supabase bootstrap functions `0049` names, so nothing else is absorbed. Live proof: fresh vs production = 0 unexpected / 164 documented, exit 0; four injected drifts — the pre-`0053` `agent_jobs.locked_at` shape, a permissive policy, an unowned prod-only function, and a dropped lineage function — are flagged, exit 1 |
| 3 | Credential-shaped files untracked in the repo root: `.review-token.txt`, `.review-kid.txt`, loose `.railway-api-env-names.json`, `all prompt.txt`, `.dept-e2e-data/` | high | **resolved** — ignored by name, verified with `git check-ignore` |
| 4 | Nothing is committed or pushed; `0051`–`0053` and this session's work sit in the working tree alongside other threads' edits | medium | **partly resolved** — `67f00b2` lands the employee → department link while the drift-detector work (baseline mode, CI job, classification) sits in the tree uncommitted, interleaved between two sessions; other threads’ edits remain uncommitted by design, and nothing is pushed |
| 5 | The new focus panels are **unverified in a browser** — they need a founder session. API tests, API tsc and the web build/tsc are the evidence today | medium | **resolved** for the panels that have real rows: the Growth pipeline and the Customer Success queue were read back from the live DOM at 375px (§1). Templates with no data still show their honest empty state |
| 6 | `pageConfig.sections` is **declared but not rendered**: the API returns a per-template section order and `resolvePageConfig` exposes it, yet no page consumes it — only `metrics` drives the render. So "the differential is expressed as `pageConfig`" is true for metric emphasis and not for section order, and adding `focus` to a template's `sections` is contract metadata, not a layout change | medium | **resolved (2026-10-11)** — `resolveBlockOrder` (pure, in `department-focus.ts`) maps a blueprint's `sections` onto the four blocks the workspace can move (`now`, `needsFounder`, `focus`, `workflows`) and the department page renders them in that order; the header, Charter and the tab group stay pinned because every shipped template places them after those four. The rule is stated in code and pinned by five new tests: the blueprint's list is an **order, never a filter** (an unlisted block is appended, so a stale blueprint cannot hide work), unknown and duplicate ids are ignored, `focus` leads when a blueprint does not place it (docs/86 §6), and "no blueprint" falls back to `CANONICAL_SECTIONS` rather than a second hand-written list. Read back live: Engineering (declared `now, needsFounder, focus, …, workflows`) renders Now → Engineering focus → Workflows; Communications (marketing, declared `now, focus, queued, needsFounder, …`) renders Now → Marketing output → Needs founder → Workflows; Research (no blueprint) renders Now → Needs founder → Workflows, the canonical shape. The old hardcoded stack was `focus, needsFounder, now, workflows` for every department |
| 7 | ~~`approval-gated-work.integration.test.ts`'s "resumes the gated task" can miss its 15s settle window~~ — **root cause found and fixed.** The PATCH answers by enqueuing and firing *one* claim; unscoped, that claim could take a different org's older pending job, and tests run no background worker (`JOB_QUEUE_MODE` defaults to `inline`), so the just-released job sat `pending` until the deadline. The `orgId` narrowing makes the drain take its own org's job. The 15s window was left as-is — it was never the problem | resolved | fixed |
| 8 | Responsive verification owed; charts deferred | low | **resolved** at 375/768/1280 and in both themes (§1); charts remain deferred |
| 9 | The API suite prints "something prevents Vite server from exiting" and pays the full 60s `teardownTimeout` on every offline run — a handle the embedded-Postgres teardown leaves open. The **exit status is now correct** (this is cosmetic), but a 289s suite spends a minute of it waiting | low | open |
| 10 | The bare-`grid`-with-responsive-columns pattern (~30 call sites, e.g. `grid gap-4 sm:grid-cols-2`) leaves an implicit `auto` track at small widths; an `auto` track is sized by content, not the container, so a wide card can push the page sideways — which is exactly what `/app/departments` did. Every other occurrence fits at 375 today, so none was changed speculatively; the sweep is what would catch the next one | low | open |

| 11 | **40 of the 159 web proxy routes cache an authenticated, per-session read** (`fetch(upstream, { next: { revalidate: N } })`). Reproduced on `/api/business-imports`: after a founder created an import the API returned 1 row while the page showed 0 for the cache window — the page's own copy promises the result "is kept here with its decision". Two routes (`/api/business-imports`, `/api/business-imports/[id]`) are fixed to `cache: "no-store"`; the other 38 are the same pattern and need the same sweep. Whether Next's data-cache key includes the session header decides if this is also a cross-session read risk — not yet probed, and it does not need to be probed to justify `no-store` (docs/78 A7 asks for exactly this on authenticated reads) | high | **open — 2 of 40 fixed** |

| 12 | Every scheduled job depends on the same two secrets (`API_URL`, `INTERNAL_TOKEN`) and **nothing checked them**. When the Railway application they named was deleted, `orq8-jobs` (six jobs), `waitlist-drip` and the nightly rehearsal went red for days, each failure naming its own endpoint, so one stale secret read as a pile of unrelated product bugs. The workflows also *skipped silently* (`::warning` + `exit 0`) when the secrets were absent, so a cron that did nothing was indistinguishable from a cron with nothing to do | high | **resolved (2026-10-11)** — `scripts/jobs-canary.mjs` asks the one question all of them share: does `API_URL` still answer as `orq8-api` (`/healthz`), and does it still accept `INTERNAL_TOKEN` (`/v1/readiness`)? Three verdicts, each naming the secret to change: 0 pass, 1 configured-but-broken, 2 not armed. It gates `orq8-jobs` and `waitlist-drip` (a `canary` job every other job `needs`), runs first in the nightly rehearsal, and is a job in `ci.yml` — where the not-armed verdict is a visible notice rather than a failure, so a fork pull request is not failed for a secret it cannot see. The silent skips are gone: they are hard failures naming the secret. Two proofs hold it: the offline self-test (13 cases — the API envelope, the web app's envelope, a deleted Railway edge, HTML, a refused token, nothing at all, and that every failure verdict carries a non-zero exit code) and the live proof that reads the running API's real envelopes. Measured 2026-10-11: the deleted host exits 1, the live API exits 0 reporting `5 ready, 9 configuration-required, 1 blocking`. Identity is read from the `service` field, never a bare top-level `status`: the first version keyed on `status` and so *passed* `orq8-web` while *failing* `orq8-api` — the exact inversion of its job, caught by running it against a live stack |

| 13 | **`0052` re-opened the client write surface `0033` had closed.** `0052` backported seven org-member policies "that exist only on production" — and those seven are exactly the policies `0033` had dropped: `approvals_org_member`, `credit_{balances,transactions,alerts}_org_member`, `subscriptions_org_member`, `password_reset_tokens_own` (all `FOR ALL`) and `memberships_insert_self`. RLS is permissive and OR'd, so a `FOR ALL` policy can only *grant*: on any database built from this lineage a plain member could self-approve their own `approvals` row, `INSERT` a pre-approved one, rewrite `credit_balances.used_credits` and `INSERT` `credit_transactions`, set their own `subscriptions.plan` to `enterprise`, `DELETE` their subscription, rewrite their own reset token and insert their own `memberships` row — the escalation `0033` §2–§5 documents closing, and the behaviour `docs/82` recorded as 59/59. The drift itself is real; the *direction* of the repair was the one thing `0052` did not check `0033` for | **critical, security** | **fixed in code (2026-10-11); production apply owed** — `0055_reclose_client_write_surface.sql` drops the seven, re-asserts `0033`'s narrow surface (member read on approvals/balances/transactions/alerts/subscriptions, member `INSERT` of a *pending* approval only, own read of reset tokens) and adds the leading FK indexes `0054` omitted for `deals`/`tickets`. The proof that found it is the proof that clears it: `scripts/rls-security-e2e.ts` went from six failures to **59 passed, 0 failed**, and re-recording `lineage-baseline.json` changed exactly those 11 catalog entries and nothing else (`--check` clean). No client path used the writes — the API reaches all of them through its BYPASSRLS pool, and nothing in `apps/` touches them via PostgREST or supabase-js — so reads are unchanged. **Until `0055` is applied to production, the deployment still accepts those writes** |

### Corrections to the 2026-10-09 version of this file

| Claim then | Truth now |
|---|---|
| "Two pre-existing job-suite failures: skip verdict does not fire, tool summary missing" | **Neither was a product defect at the point first assumed, and both had one shared cause.** The skip verdict fires; the tool summary is written for the single-tool path. What *was* broken is that any process may claim any pending job: on the shared test database a neighbouring test file took this file's job and ran it under its own module registry, which reads as "the skip counter never moved" and "the tool never ran" — the second failure printed another file's stubbed answer as proof. `claimJob`/`claimAndRunOne`/`startJobWorker` now take an optional `orgId` narrowing, the approval-release drain uses it, and the job tests scope their workers. The one real code gap was the chained case (a tool that ran before a later gate), fixed and pinned by a test that fails without the fix. **Full API suite green: 979 passed, 3 skipped, 118 files, exit 0 — zero failures.** |
| "One column difference after 0053" | 163 differences; exactly one (`agent_jobs.locked_at`) is ours, the rest are pre-existing environment artifacts (§5 item 2). |
| "Focus models for the other four departments do not exist" | marketing, finance, and the shared accounts model now exist — but sales/customer success share one, for the schema reason in §4. |
| Admin console "17 pages, 15 legacy" | 17 pages, **14** legacy, 0 on the shared layer. |

### Update — 2026-10-11 (later in the day)

- **The bulk page migration started** with its two worst pages, `business-import` and `teams`, each
  verified live in both themes (`docs/76` Phase 3 migration table). §4 item 6 is no longer
  "not started".
- **`pageConfig.sections` renders** — §5 item 6 is resolved, with the order read back from three
  departments.
- **A new, larger risk was found while verifying the first migration**: 40 proxy routes cache
  authenticated reads, and the reproduction on `business-import` is in §5 item 11. Two are fixed.

### Update — 2026-10-11

- **The drift detector is no longer the repository's blind spot.** `pnpm check:parity`
  (`--check`) diffs a from-scratch lineage against the committed baseline and runs as a
  blocking CI job; the live production comparison over the Management API reports **0
  unexpected differences out of 164 documented ones**, and injected drift still fails it.
  See §4 item 2 and §5 item 2.
- **`0053` and `0054` are in production and confirmed there** by a fresh fingerprint:
  `agent_jobs.locked_at` nullable with no default, `deals`/`tickets` present with their
  org-member policies. See §4 item 1 and §5 item 1.
- **`67f00b2`** commits the employee → department back-link together with the browser proof
  that drives it. See §4 item 5.
