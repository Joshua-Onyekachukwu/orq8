# ORQ8 Changelog

## 2026-10-03 — Worker soak: the queue's safety properties are now proven, not asserted

- **`scripts/worker-soak.ts`** boots an isolated embedded Postgres, runs N real `startJobWorker`
  loops against a producer that keeps the queue deep, injects a deliberately leaked lock, and
  asserts at the end that the queue **drains** (no pending/running), that **no job is claimed
  twice** (`attempts` stays 1), that **no lock leaks** (no lock outside `running`), that the leaked
  lock is reaped, and that only the intended jobs are dead-lettered. It uses completed tasks so the
  worker preflight skips them — deterministic and credential-free, while exercising the exact
  claim/complete/reap path under concurrency. Exit code 1 on any failed check.
- **Verified:** a full five-minute run — 4 workers, **23,226 jobs**, all drained, `attempts > 1` = 0,
  leaked locks = 0, dead = the 5 seeded on purpose. This closes the last abuse-suite todo (concurrent
  claim); the suite is now `12 tests, 0 todo`.

## 2026-10-03 — Plan tier caps, a recorded routing reason, and the dead ModelRouter is gone (docs/80 Phase 4 remainder)

- **Plan model-tier caps (decision 5).** Routing is now bounded by the org's plan — `trial ≤ 0`,
  `founder ≤ 1`, `team ≤ 2`, `company/enterprise ≤ 3` — via `PLAN_TIER_CAP`/`planTierCap` in
  `model-intelligence.ts` and a `maxTier` on `selectTierModel`; the live `selectMeasuredModel`
  reads `organizations.plan` and clamps candidates to it. The cap routes *down*: when a task's own
  risk/complexity (or calibration) floor is higher than the plan allows, the cap wins, so a
  low-revenue plan cannot burn a flagship model — exactly the negative-margin risk the plan names.
- **Recorded routing reason.** Selection returns a human-readable `reason` beside `source`; a
  cap-bound pick reports `source: 'plan_cap'`. `llm_performance` gained `routing_reason`
  (migrations `0021` / `0045`), the trace carries it, and the task executor, routed chat and
  Executive Agent all pass it through — so a veto is always explainable.
- **The dead `ModelRouter` stack is deleted.** The 1,955-line module's `ModelRouter` class and four
  provider adapters were never instantiated (only re-exported by `llm.ts`); they and their test are
  gone, leaving the live `MODEL_REGISTRY` + the types real code imports. That removes a large false
  surface an agent or a reader could mistake for the routing path.
- **Verified:** `test/model-plan-cap.test.ts` (5 tests); the full API suite **948 passed / 3 skipped
  / 1 todo**, 0 failed; `pnpm -r typecheck` clean (8 projects).

## 2026-10-03 — Budgets, the approval bridge, the recursion guard and the org kill switch (docs/80 Phase 2)

- **The stored `budgetPolicy` is enforced, not just stored.** The constitution's
  `budgetPolicy` (`dailyLimit`, `monthlyLimit`, `requiresApprovalAbove`, all in credits) was written
  by every playbook and read by nothing. A new `services/ai-budget.ts` resolves it and
  `reserveCredits` enforces it at the one boundary every spend path passes through, so a task and an
  Executive Agent command are both covered. A daily or monthly ceiling that would be crossed, or a
  per-agent cap, refuses the work before it starts and charges nothing (`BudgetExceededError`).
- **`requiresApprovalAbove` opens a real approval.** A reservation over the threshold no longer
  runs: the task executor raises a gated approval and moves the task to `awaiting_approval`, and the
  founder's grant is consumed once on resume (`BudgetApprovalRequiredError` → `findGrantedGate` →
  `approved: true`). The same bridge catches the estimator's own per-task ceiling.
- **Per-agent budgets** live in `agents.config.budget` (`dailyCredits`, `monthlyCredits`,
  `perTaskCredits`) with no migration, and are enforced from measured agent spend. The org kill
  switch is `organizations.settings.aiSpend.paused`; owner/admin can flip it and every reservation
  refuses while it is on.
- **The delegation recursion guard** bounds the tree three ways — `maxDepth`, `maxChildrenPerTask`,
  `maxTasksPerCommand` — closing abuse-suite todo #2. Sub-tasks now record their parent
  (`tasks.parent_task_id`, migrations `0020` / `0044`), which is what the depth walk reads; a
  delegation loop terminates instead of fanning out. `delegateTask` merges its limits over the
  defaults so a partial override cannot silently disable a cap.
- **New surface:** `GET /v1/budgets` (policy + measured spend + per-agent budgets + kill-switch
  state), `PUT /v1/budgets/agents/:agentId` (owner/admin), and `POST /v1/budgets/kill-switch`
  (owner/admin). Config: `DELEGATION_MAX_DEPTH` (3), `DELEGATION_MAX_CHILDREN_PER_TASK` (10),
  `DELEGATION_MAX_TASKS_PER_COMMAND` (50).
- **Verified:** `test/ai-budget.test.ts` (13 tests — pure resolution, org/per-agent ceilings, the
  approval threshold, the kill switch, the HTTP surface, and depth/sibling/command recursion caps);
  `pnpm -r typecheck` clean (8 projects); focused suites green. The recursion `it.todo` in the abuse
  suite is now a pointer to the real assertions rather than a hidden gap.

## 2026-10-03 — BYOK: the company's own provider key now serves its model calls

- **Org provider keys are used for real calls, with the platform keys as the fallback.** A new
  `services/org-provider-keys.ts` is the one place a stored `user_provider_keys` row becomes usable
  credentials: it loads active+enabled rows, decrypts the AES-256-GCM payload (a payload that fails
  to decrypt is skipped, never fatal), and sums each key's month-to-date spend from
  `llm_performance.provider_key_id`. `services/llm.ts` loads that map once per call and, for each
  provider, prefers the org key through the pure, unit-tested `selectProviderKeys` — the org key
  wins only when it is within its `monthly_spend_ceiling` and its `allowed_models` permits the model;
  otherwise the platform env keys serve the call and the reason is recorded.
- **Attribution lands in the data.** `llm_performance` gained `key_source` (`'org'` | `'platform'`)
  and `provider_key_id` (migrations `0019` / `0043`, mirrored in the Drizzle schema, with per-key and
  per-agent indexes), and the trace carries both — so BYOK spend can finally be separated from
  platform spend, which is the whole point: a customer who brings a key has a different cost base.
- **`monthly_spend_ceiling` is now enforced**, not just stored: the gateway falls back to platform
  keys the moment a key's month-to-date spend reaches the ceiling. It is read as USD dollars (the
  stored integer had no documented unit).
- **Verified:** `test/llm-byok.test.ts` (8 tests — policy unit tests + decrypt/ceiling integration);
  `pnpm -r typecheck` clean (8 projects); full API suite **954 passed / 3 skipped / 2 todo**, 0 failed.

### Abuse-suite status (docs/77 P3/A9/A10)

- **Trial day cap** — now a real assertion (Phase 1): abuse suite §5 and `credit-reservations`.
- **Provider exhaustion** — asserted at the gateway in `llm-fallback.test.ts` (all-providers-fail →
  null, no hang; saturated gate fails over); an API-level proof would be the next step.
- **Concurrent job claim** — `claimJob` uses `FOR UPDATE SKIP LOCKED`, but a deterministic two-worker
  assertion needs an isolated database because workers are global; kept as a documented todo rather
  than a flaky test.
- **Recursion / self-hire depth guard** — **closed (docs/80 Phase 2):** asserted in
  `ai-budget.test.ts` (depth, sibling-per-task and per-command caps).

## 2026-10-03 — Credit reservations: work holds its credits before it runs, and the margin invariant is a test

- **docs/80 Phase 1 shipped — reserve → execute → settle/release.** A task now takes a reservation
  for its estimated cost before it starts (the estimate comes from the p90 of measured tokens for
  that org and phase, priced at the published 1-credit-per-1K formula, floored and capped by the
  per-task ceiling), settles the *measured* actual capped at that estimate, and releases the
  remainder. Concurrent work can no longer over-commit the same credits: `available = included +
  purchased − used − reserved` and both `reserveCredits` and `consumeCredits` guard in the UPDATE's
  WHERE. New `credit_reservations` table + `credit_balances.reserved_credits` +
  `tasks.estimated_credits` (`packages/db/migrations/0018`, `supabase/migrations/0042`).
- **Failure rules are real:** a failed task measured no model work, so its whole hold is released
  with no charge; a hold swept mid-task (crashed worker, timeout, expiry) falls back to charging the
  measured actual so real work is never unbilled; `refundCredits` returns a settled charge
  idempotently and `reconcileLedger` counts refunds, so drift stays 0. The worker tick now runs the
  stale-reservation sweep next to the lock reaper.
- **The task executor and the Executive Agent both reserve** — the task at its pre-execution credit
  check (recording `estimated_credits` on the row), the command at its step-3 check (settled at
  step 7). `POST /v1/credits/estimate` returns the pre-run estimate with `approvalRequired` for the
  execute surfaces.
- **The margin invariant is now a test** (`test/margin-invariants.test.ts`): for every revenue-bearing
  plan (founder/team/company, monthly and annual) × every registry model within the plan's tier cap
  × mixes 50/50, 20/80 and 0/100, credits charged strictly exceed provider cost — and any workflow
  where cost would meet or exceed revenue is flagged. No negative-margin workflow exists in the
  current registry; a sentinel $15/$75 model proves the detector can fail, so the suite is not
  vacuous. Training the alarm now is what stops a premium model silently starving a low-margin plan.
- **Trial orgs get a per-day ceiling** (`CREDIT_TRIAL_DAILY_CAP`, default 20, enforced at
  reservation): a trial account has no card, so the cap bounds what one account can burn per day
  regardless of its starting allotment; paid plans are exempt. This closes abuse-suite todo #3, now
  a real assertion in both the abuse suite and the reservations suite.
- **Verified:** `pnpm -r typecheck` clean (8 projects); full API suite **946 passed / 3 skipped /
  3 todo**, 0 failed (`credit-reservations` 13, `margin-invariants` 5 new; abuse suite now 3 todo);
  both migration lineages apply cleanly on a fresh embedded database. Config:
  `CREDIT_RESERVATION_TTL_MS`, `CREDIT_TASK_CEILING`, `CREDIT_ESTIMATE_FLOOR`,
  `CREDIT_ESTIMATE_LOOKBACK_DAYS`, `CREDIT_TRIAL_DAILY_CAP`.

## 2026-10-02 — Layered rate limits and provider gates: the platform can no longer be outspent by one session, one company or one looping employee

- **docs/77 P1 §8 is closed — four layers, each at the boundary where its identity is known.**
  *User*: an `onRequest` hook maps the request to an endpoint class (task execution 10/min,
  analysis 10/min, business import 3/min, credits 60/min, purchase 3/min) and counts it against a
  session bucket. *Org*: handlers enforce the company bucket after auth (60/120/30/300/5 per hour),
  so N sessions of one company share one ceiling. *Agent*: a task execute or an execute-pending
  batch asks how many jobs that AI employee has generated in the last hour (default 60) and
  throttles only that employee — the rest of the batch still goes out, and the response says who
  was throttled. *Provider*: `chatCompletion` acquires one global and one per-provider slot (12 / 6)
  around every attempt; a saturated gate fails over to the next provider instead of hanging. A
  fifth, job-level layer caps one org at 10 concurrently running jobs in `claimJob`.
- **Storage is Redis when `REDIS_URL` is set, in-memory otherwise — and the AI classes fail closed.**
  If Redis is configured but unreachable (or drops mid-call, or throws), AI-spend classes answer
  429 rather than opening the valve; a Redis outage cannot become an unbounded-spend incident. With
  no `REDIS_URL` the in-memory window is single-instance only, stated in code. `RATE_LIMIT_ENABLED=false`
  disables the whole layered system; under `NODE_ENV=test` it is off unless `RATE_LIMIT_FORCE=true`,
  which the review stack sets so the demo shows the real limits.
- **Every 429 is explainable.** Every layer answers the shared envelope `{ error: { code:
  'rate_limited', policy_ref: 'docs/80 §3.3' } }` with `Retry-After`. The legacy `/v1/commands`
  10/min IP bucket was removed so commands are one bucket in the layered system, not two that can
  disagree.
- **The abuse suite's first `it.todo` became four real tests** (`test/abuse-suite.integration.test.ts`
  §5): per-user class 429 with policy_ref + Retry-After, per-org fan-out across two sessions of one
  company with another company untouched, the per-agent hourly quota (single execute 429 plus the
  batch path's `throttled` list), and the `RATE_LIMIT_ENABLED=false` kill switch. A new unit suite
  (`test/rate-limits-layered.test.ts`, 14 tests) pins the class table, window expiry, the fail-closed
  paths (Redis down, Redis dropping mid-call, Redis throwing) and the gate FIFO/timeout/disable
  behaviour; `test/llm-fallback.test.ts` proves a saturated provider fails over without a call.
- **Verified:** `pnpm -r typecheck` clean (8 projects); full API suite **927 passed / 3 skipped /
  4 todo**, 0 failed; review stack restarted with `RATE_LIMIT_FORCE=true` and the live 429 walked
  (4th import call in a minute → `429`, `retry-after: 59`, `policy_ref: docs/80 §3.3`).
- **docs/79 phases 5–7 were already in the tree** (admin commands dashboard, standalone
  `apps/worker`, compose service) and remain uncommitted pending review; docs/81 (service setup
  checklist) was written so the founder knows exactly what to provision.

## 2026-10-01 — The plan becomes a living document: revisions, ratify, and the diff you sign off on

- **Plan revisions + ratify is live (`/app/strategy`) — the last §R backend gap closed.** The Strategy page now opens with the mock's plan composition (§W item 4 / `screen-plan`): a **revision rail** (rev number, author, when, "what changed" line, and a state chip — direction / unratified / rejected / past), the **ratify banner** when a draft awaits the founder ("This is the team's working plan — ratify to make it direction. Revision 2 by Atlas is awaiting your ratification. Until then, rev 1 is direction"), a collapsible **diff card** ("What changed in rev 2 (unratified draft)") rendering − / + lines per plan section against the previous revision, the plan document itself (five sections — what we're building, who it's for, how it makes money, current focus, KPIs — under a "Rev 1 · ratified … by … · authored by …" header), and a **Draft a plan revision** modal. Ghost decision pair on the banner: Reject (red outline) / ratify (the one warm CTA).
- **The backend is a real revision model, not a flag.** Migration `0013_add_plan_revisions.sql` adds `plan_revisions` (additive; unique `(org_id, rev)` index — rev numbers are per-org monotonic with a unique-violation retry, so two drafters can never split a rev). `POST /v1/plan-revisions` drafts with auto rev and audits **`plan.revised`**; `POST /v1/plan-revisions/:id/ratify` is transactional — the previously ratified revision steps down to *superseded* (past direction still on the rail), the chosen one becomes direction, and **`plan.ratified`** lands in the append-only trail; re-ratifying the current direction is idempotent. `POST …/:id/reject` refuses anything that is not a draft. Web proxies `/api/plan-revisions` (+ `/[id]/ratify`, `/[id]/reject`) keep the browser cookie-path only.
- **Verified live in the review stack:** the stack now seeds a ratified rev 1 (authored by the founder, direction) and an unratified rev 2 by Atlas with real section text, so the banner, rail, diff and document render on first login. Nine new integration tests (draft numbering + audit, org-scoped rev counters, ratify/supersede, idempotent re-ratify, reject guards, cross-org 404, auth + validation) bring the suite to **1,174 passing / 0 failing**.

## 2026-10-01 — Departments joins the console, a founder guide, and light mode walked page by page

- **Departments is the mock's department board (`/app/departments`).** Card per department: tile initial, lead line, a state chip computed from live member states (working count / needs-you / blocked / idle), description, then the mock's member rows — avatar, name, role · state, Cr/wk — from real `/api/agents` rows grouped by each employee's *current* department (FK wins over the legacy text column). Capacity / teams / utilization come from workforce. The dashed "**Ask Atlas to hire into X**" row hands off to the Employees hire modal with the department preselected (sessionStorage handoff); "Hire from template", the stage-filtered catalog, create / edit / archive / delete, search and paging all survive, console-styled. The mock's new-department tile ends the grid.
- **Founder return guide** ([FOUNDER-GUIDE.md](../FOUNDER-GUIDE.md)) — boot, login, a five-minute click-through of what changed, health checks, and the honest open list. The changelog's final test total is corrected to **1,165** (was 1,140).
- **Light mode walked page by page.** New `scripts/theme-walk.mjs` visits all 37 routes in **both** themes and fails on white blocks (dark), black text, white-on-light ink, and dark-canvas bleed (light): **74/74 route-theme pairs clean**. It caught one real defect: the top-bar attention badge labelled its warm fill `text-ink-surface`, which the console light block re-points to white — white on orange at 3.4:1. The badge now uses the designed `text-on-warm` / `text-on-error` pairs (5.4:1 in light, correct in dark).
- **Verified:** typecheck clean; web build green; route sweep 37/37 (1440 + 375); both content audits clean; contrast audit pass; the badge fix verified live in light mode.

## 2026-10-01 — The last mock screens: budgets, memory, files, briefings, notifications, integrations, constitution, settings

- **Budgets is the mock's two ledgers (`/app/budgets`).** The reservation policy stated where the meters are, the company meter, then by-goal (spend derived from real `task:<id>` usage lines) and by-employee rows with used/cap figures. Along the way defect 15 fell out: the usage summary's `byAgent` was never populated and the page read a `daily` field the API never returned — the 7-day chart had never once rendered. Both fixed in `credits.ts`.
- **Memory and Files take the mock's compositions (`/app/memory`, `/app/files`).** Memory is the two-pane list + detail with category chips; Files is the folder-by-department grid (Company / Growth chips from real department rows) with an explained empty state.
- **Briefings gets the card shell** — stats row, sections, status footer — over the real briefings data.
- **Notifications is the mock's inbox (`/app/notifications`).** Unread-count strip up top, rows with trigger chips and relative time, and a **Mark read** that works — it needed the previously missing web proxy for `PATCH /v1/notifications/:id/read`. Verified live: 1 unread → 0.
- **Integrations becomes the mock's connection cards (`/app/integrations`).** Each provider card: state dot (lime connected / orange degraded / red broken / grey off), connection + real server-side health, login identity, token expiry, last operation; then the append-only **connector activity** table; then the **event rule** ledger with enable toggles and the action sentence ("Creates a task for Iris → “Review PR #42”"). OAuth authorize/disconnect, health probes and rule CRUD all kept. The page's white-card/teal utilities are gone for console primitives.
- **Constitution is the mock's articles (`/app/constitution`).** Numbered article cards §1–§8 (purpose, values, can-decide, needs-approval, never-allowed, risk tolerance, budget policy, communication policy) each with the Active chip, the "binds Atlas too" banner with last-amended line, and the single warm **Amend constitution** CTA. All editing, list add/remove and save flows intact.
- **Settings joins the console (`/settings`).** The settings area sat **outside** the `.console` scope, so dark mode stopped at its edge and the page painted light blocks. Its layout now reads the same server-side theme cookie as the app and renders inside the console; profile, export, mail self-diagnosis and notification cards are `console-card`s; toggles use the state lime; the CTAs are the mock's single warm accent; tab pills get the quiet active style.
- **Verified per batch:** typecheck clean, web build green, review stack rebooted, page walked in the live browser (zero white blocks, zero black text, console bg `#0B0F14`), route sweep **37/37 at 1440px and 375px**, both content audits clean, RSC scan at baseline, `pnpm test` **1,165 passing / 0 failing** on the final tree (api 855 + core 213 + web 72 + db 20 + auth 5, 3 skipped).

## 2026-10-01 — Goals and Audit join the mock, and the console finally owns its own colours

- **Goals is the mock's commitments list (`/app/goals`, docs/71 §H).** One expandable row per goal — status chip (On track / Needs you / At risk / Overdue / Paused / Planned, derived from the goal's own state and the work under it), title, progress meter, "N steps · due date" — and inside: the **lineage chain** as crumb chips and the **plan steps** as chips carrying each task's real status and owner. A step an open gate is holding says "Paused" (the same `gatedWork` resolution the approvals queue uses); live work sorts first; the row a gate touches opens by default. "Add task" and "New goal" are the console's one primary CTA per screen, not the old teal band.
- **The lineage chain is derived, never asserted — because the schema has no other path.** `goals` carries no strategy columns; the only edge from a goal up into the strategy tree runs through its tasks' `initiative_id`. New `GET /v1/goals/lineage` (web proxy `/api/goals/lineage`, declared before the `:id` uuid lookup) joins tasks → initiatives → key results → objectives → strategies in three bounded lookups, resolves the objective through the key result when the initiative has none, and returns per goal the **most complete chain** its tasks carry (a chain that reaches a strategy says more about why the goal exists than a bare initiative; ties go to the newest task — the plan actually being executed). A goal whose steps carry no initiative is simply absent, and the page says "No strategy link yet — none of this goal's steps sit under an initiative" instead of inventing a parent.
- **Audit became the trail it claims to be (`/app/audit`, mock `screen-audit`).** The page used to read `/v1/activity`, whose rows have no `action` or `outcome` at all — two blank columns on every load. The real trail is `audit_events` (docs/34.4: append-only, hash-chained), and nothing read it org-scoped anywhere. New `GET /v1/audit` returns this org's rows newest-first with actor resolution (human / AI / system, name where one exists), payload refs, and the **domains that actually exist in this org's trail** as the filter chips — plus `GET /v1/audit/verify`, which walks the whole chain from the genesis hash and reports intact or the first broken id. Each row expands to the JSON with `hash` and `prev_hash`; CSV/JSON export carries the hashes so an exported file is self-verifying; the header says "verification unavailable — check the hashes yourself" rather than pretending when the API is down. Four new integration tests cover the org scoping (a rival org's rows never appear, even through the domain filter) and the chain verification.
- **Defect 14 — the console did not own its own colours, and every un-styled element inherited near-black.** The shadcn alias layer (`--foreground`, `--muted`, `--border`, `--card`, `--popover`…) is declared at `:root`, where Tailwind substitutes each `var()` against the *light* palette — the same defect family as the `.text-muted` teal, one layer out, and therefore invisible to the token-measuring audit. `<body>` carries `.text-foreground`, so every element inside `.console` without its own text colour inherited near-black on `#0B0F14`; `bg-muted` (108 call sites) painted `#F7F9F9` blocks; `text-brand-deep` (30 files) measured 2.85:1. `.console` is now **self-contained**: it sets `color` itself, re-points the whole alias layer, and folds brand weight into the raised-neutral ladder (`--orq-brand/-deep` → tile/hover neutrals, `--orq-brand-soft` → the hover surface, a new `--console-tile` that stays dark in *both* themes so the 56 `bg-brand-deep text-white` avatars and icon squares keep their label contrast); the 30 legacy `text-brand-deep` call sites became `text-ink`. Verified in a live browser: zero light-background elements and zero black-text elements remain inside the console (the one dark label left is the on-orange badge, correct by design).
- **The contrast audit now measures what actually resolves.** Five new console pairs: the inherited `--foreground` on the page, body text on `--muted` and on `--orq-brand-soft` (the two washes legacy pages lean on), and the tile-label pair in both themes. `pnpm audit:contrast` passes all of them in both console themes.
- **Verified:** `pnpm typecheck` clean across 7 packages; `pnpm test` **1,165 passing / 0 failing** (api 855 + 3 skipped — including the new goal-lineage suite of 5 and audit-trail suite of 4 — core 213, web 72, db 20, auth 5); web build green (181 routes); route sweep **37/37 clean at 1440px and 375px**; both content audits clean; RSC boundary scan at its 2-legitimate-hits baseline; `pnpm audit:contrast` pass. Walked live on the review stack: goals rows render the seeded goal with honest "no strategy link" + empty-step states, audit shows "Hash chain intact — 14 events re-computed from the genesis hash" with real domain chips (auth, task, credits…).

## 2026-10-01 — The Company HQ is the canvas the mock promised: the live organization, not a wall of widgets

- **The dashboard is now the mock's composition, implemented against real data.** Greeting with the founder's own stage, the four-state strip (active goals, employees active, credits, company health — each with a real meter), the banner that **morphs with company state** (approvals waiting → work blocked → all caught up, one primary action each), **the live organization** — departments as cards with their lead, every member's status derived from their own rows, and each department's real task progress — and **the live-activity terminal** (`[HH:MM:SS] TAG — who: what`, tags DONE / GATE / FAILED / RUN / TOOL). Everything is a real endpoint; nothing is a placeholder.
- **The dashboard stopped being a wall of overlapping widgets.** Health score, goal execution, reliability, model performance, department activity, the activity feed and the command bar were each duplicated surfaces of pages that already exist (`/app/health`, `/app/goals`, `/app/performance`, `/app/quality`, `/app/activity`, and the EA dock's own composer). They are now **linked, not duplicated**; the dashboard's job is the one screen the mock defined. `/app/performance` and `/app/quality` already carry the reliability and model content, so nothing was lost.
- **Employee status on the canvas is derived, never asserted.** Retired / Paused / **Needs you** (a pending approval addressed to them) / **Blocked** (only when their *newest* event is a failure, so one old failure cannot label someone blocked forever) / Working / Idle. A department's chip is the loudest true thing about it, and its meter is the API's own task-completion percentage.
- **Approvals is the gate queue the mock drew.** The policy is stated where the decision happens ("Silence is never consent… gates never auto-approve"), Open/Decided are real tabs over the real rows, each gate card names its trigger, its id, its risk, **what it blocks** (the task, linked) and **what approving does** (the task resumes / the tool runs), the exact tool call is one click away, and the decision is the console's ghost pair — `Reject` in a transparent red outline, `Approve` in white. The decided view is a table with the founder's note.
- **The demo company no longer greets its founder as a stranger.** The review stack never wrote an onboarding state, so a company with four live employees, a goal and work in flight was greeted with "Welcome to ORQ8 — tell me what you are building". The stack now marks the seeded founder's onboarding complete, so the HQ dashboard shows the operating view it should.
- **Verified:** `pnpm --filter @orq8/web typecheck` clean; web tests 7 files / 72 passing; route sweep **37/37 clean** at 1440px and 375px; both content audits clean; walked live on the review stack (dashboard: 4/4 employees, 1 needs-you department, 46% department progress, real terminal lines; approvals: 1 open gate naming the task it blocks, plus the decided table).

## 2026-10-01 — A department becomes a workspace, and the console audit finds the palette leak under it

- **The department workspace exists (`/app/departments/<id>`, docs/71 §G).** A department owns exactly one row, so every zone is scoped through its **members** — the people are the scope, and the legacy free-text `agents.department` column is deliberately not consulted (it drifts; that drift is what made employees read as "Unassigned"). One new endpoint, `GET /v1/departments/:id`, returns the department with its members, teams, live work, the founder's pending approvals, decided approvals, activity, decisions, files and memory — six queries in bounded passes, each independently guarded so a missing/older table degrades to an empty zone instead of a 500. Every zone answers with real records, and the page says why an empty zone is empty.
- **The workspace's Authority tab is a roll-up, not a second opinion.** Can-do counts, the highest member spend limit, the approval gates, the forbidden actions and the autonomy distribution are all derived from the members' own `agents.authority` / `autonomy_level` rows — the same columns the execution path enforces. "No employee in this department may spend without approval" is not copy; it is `spendingLimitCents: 0` on all four.
- **Tools come from the runtime's resolver, not a page copy.** The Tools tab is the union of `getToolsForRole(member.role)` — the function the executor itself calls — grouped by category with risk level, credit cost and the roles that may call each one. The screen and the runtime cannot disagree about what a department may run, for the same reason the employee workspace reads it.
- **The audit caught a leak it was blind to: `.text-muted` was the marketing-light teal inside the dark console.** The shadcn alias `--muted-foreground` is declared at `:root` with its `var(--orq-text-secondary)` already substituted *there*, so inheriting it into `.console` bypassed every console token: every muted label — page subtitles, metadata, table captions — rendered `#356267` on `#0B0F14`, measured live at **2.85:1**. That is below even the 3:1 a drawn mark needs, and it applied to the console's most-used secondary text, on every page. The contrast audit could not see it because it measures tokens, and this utility resolves through a different alias. `.console` now re-points `--muted-foreground`; measured live: dark `#97A3B4` (**7.52:1**), light `#5C6878` (**5.67:1**). The audit gained that exact pair, and now treats an *unmeasurable* pair as a failure — a token that moves out of the maps is how this palette went unchecked in the first place.
- **Four screens scrolled sideways on a phone, and the sweep can now see it.** `route-sweep.mjs` gained `--width` and an overflow check — the document itself may never scroll horizontally, however dense the page. At 375px it found four real overflows: the departments header button row, the approval card's Approve/Reject pair, the engineering registry grid (a `truncate` description gives its grid item a large `auto` min-width until `min-w-0` is set) and the quality tab strip. Each now wraps or shrinks, and the sweep is **37/37 clean at 375px** — the same sweep that proves the desktop walk.
- **A time label read as six months.** The needs-founder card uppercased its metadata, so six minutes rendered `6M AGO`; the age now stays lowercase in an uppercase line.
- **Verified on the final build:** `pnpm test` **1,156 passing / 0 failing** (api 846 + 3 skipped, core 213, web 72, db 20, auth 5) — including a new integration test asserting the detail endpoint's member scope, that another department's pending approval does not leak in, and that the tool list equals the runtime resolver for the members' roles; `pnpm typecheck` clean across all 7 packages; `pnpm audit:contrast` **pass** with both console themes and the new alias pair; the route sweep **37/37 clean**, now discovering one real department and one real employee so both dynamic workspaces are swept; both content audits clean. Walked live: the Growth workspace (4 members, 1 needs-you card, 26 resolved tools, 2 memory entries, 7 activity events, real decisions/approvals states) and a throwaway empty department, which explained each empty zone and was deleted afterwards.

## 2026-10-01 — Four employees finally say which department they are in, and an AI employee becomes a workspace you can govern

- **Every employee's department and team name was silently `null`.** The batch name lookup in `agents.ts` resolved ids with a raw `= ANY(${ids})` interpolation: the driver types a JS array `text[]`, both columns are `uuid`, and Postgres has no `uuid = text[]` operator — so the whole lookup threw and the surrounding `catch` returned `null` for every row. The `departments` page kept showing correct counts because it counts in SQL, so the failure only ever appeared as "Unassigned" on the screens that name a *person's* department, and no test caught it because the catch was silent. Both lookups now use `inArray`, which binds each id against the column's own type. Verified live on the review stack: before, `departmentName: null` for all four seeded employees; after, `"Growth"` for all four and `"Acquisition"` for the two on the team.
- **A governance-blocked execution never counted as a failure.** `persistPreExecutionBlock` (an autonomy refusal, a paused agent, an authority denial) persists the failed task and writes its activity event, but skipped the employee's own counter — which the ordinary failure path increments. An `observe`-mode employee therefore read **"Blocked · Last task failed — Publish the launch post"** beside **"TASKS FAILED 0"**, two numbers the founder has no way to reconcile, on the screens that judge an employee's reliability. The block now increments `tasksFailed` and touches `lastActiveAt` the same way step 7 does. Verified live: Iris reports `TASKS FAILED 1`.
- **The employee workspace (`/app/agents/<id>`, docs/71 §H) is real, and every control writes a record.** Identity with the live status vocabulary derived from the employee's own rows (Working / Needs you / Blocked / Paused / Retired / Idle) — and it only calls the *newest* task failed, so one historical failure cannot label an employee blocked forever; **Authority** as the four bands (Can do / Can spend / Requires approval / Cannot do) plus the five-level autonomy ladder, saved to `agents.authority` and `autonomy_level` through the same `PATCH` the execution path reads; **Abilities** as the employee's skills plus `GET /v1/tools/role/:role`, the runtime's own resolver, so the screen and the runtime cannot disagree; **Memory** from `GET /v1/agent-memory?agentId=` — the same store the employee is handed before a task — with the founder able to teach it directly; **Work & cost** as its tasks and activity with reasons. Two new proxy routes (`/api/tools`, `/api/agent-memory`) keep the browser off the API directly. Walked live: toggling "Execute tasks" off and saving moved the server row to `canExecuteTasks: false` (and back), and a founder-authored memory returned `201` and read back with its category and importance.
- **`usePageContext` froze any page that used it.** The hook called `setPageContext` during render and its guard (`ctx.route !== null`) is true for every real page, so registering context meant render → provider state → re-render → provider state, forever; the first caller locked its own main thread solid. It now registers in an effect keyed on the flattened context content (callers build the object inline, so identity would re-fire it every render). Found because the new workspace was the first caller — the same class of defect as the dashboard's RSC crash: code that shipped with no caller, waiting for the first one to break.
- **Also fixed:** the activity feed stuttered the block reason twice (`Execution blocked: Execution blocked by autonomy level: …`) and now uses the ordinary failure vocabulary (`Failed: <title>` + why in `reason`); the "Can spend" band was captioned "in company credits" while the field is dollars.
- **The console now has a written standard.** `docs/73_ORQ8_CONSOLE_UI_SKILL.md` records the mechanics that actually exist — the `.console` token scope, the compatibility shims, `state-dot` / `.console-card` / `.console-composer` / the ghost decision pair, the one-primary-CTA and colour-as-state rules, the honesty rules, and a six-step pre-ship checklist — plus three audit scripts (`scan-rsc-boundary.mjs`, `content-audit.mjs`, `content-audit-browser.mjs`) that enforce parts of it automatically.
- **Light mode was chosen, written, and then thrown away on every request.** `app/app/layout.tsx` is a server component, and it imported the cookie *name* from `components/theme-toggle.tsx` — a `"use client"` module. Across that boundary a plain value is not the value: the server received a client reference, `cookies().get(reference)` matched nothing, and the shell fell back to dark no matter what the toggle had just written. Nothing looked wrong — the toggle worked, the cookie was set, the server read a variable named after the same string. The constant now lives in `lib/console-theme.ts`, a plain module both sides can import, and `scripts/scan-rsc-boundary.mjs` — which existed to catch client *functions* imported into server components — now also flags SCREAMING_SNAKE *constants*, because that is the shape this defect took. Verified: the server-rendered HTML carries `data-console-theme="light"` after the switch; before, it was always `dark`.
- **The console's own contrast rule did not apply to the console.** The palette in `docs/73` insists every state colour survives on white — which is why the light theme has a deeper lime, orange and red at all — but `color-contrast-audit.ts` measured only `:root`, and `.console` re-points every `--orq-*` token at `--console-*` primitives it never saw. Measuring both themes found three real failures in light mode: the orange **state dot** was `#E8761A` at **2.81:1** (a drawn mark needs 3:1 — the "needs you" signal fading on white), the **white-on-orange primary CTA** was **2.98:1** (the one button the design says to find, failing AA), and the dark **label on a destructive red fill** was **3.43:1**. Fixes: orange → `#DC6D14` (3.17:1, indistinguishable as a fill), the CTA label → `#231206` (5.38:1, matching dark), and a new `--console-on-red` (`#FFFFFF` in light, `#231206` in dark) because one shared "on-warm" value cannot label both a pale dark-theme red and a deep light-theme red. The audit now prints every pair for both themes on one line, so a future accent that only fails on white fails loudly. `pnpm audit:contrast` passes.
- **Verified:** `pnpm typecheck` clean across all 7 packages; `pnpm test` **1,155 passing / 0 failing** (api 845 + 3 skipped, core 213, web 72, db 20, auth 5); `pnpm audit:contrast` passes with both console themes measured; route sweep **35/35 clean**; both content audits clean; the web build green at 180 static pages. Review instructions, credentials and the honest remaining list are in [docs/74 (now archived)](archive/history/74_ORQ8_AUTONOMOUS_RUN_REVIEW.md).

## 2026-09-29 — The gate sends the mail, and the price the founder approves is the price they pay

- **The release gate no longer takes the environment's word for mail (`POST /v1/readiness/mail-check`).** Step 4 asks `/v1/readiness`, which reports that `email` is *configured* — that `SMTP_HOST` or `RESEND_API_KEY` is present. That is a claim about the environment, not about the network: a correct-looking key the provider rejects, or a blocked port, passes every capability check while nobody in the company can confirm an account. The gate now fires the deployment's own three-verdict mail check and sends one real message. The endpoint is machine-only (`x-internal-token`, constant-time) because the send is a real side effect and a pipeline has no founder to attribute it to; the founder-facing path stays `/v1/settings/mail/test`, which is a session and writes `mail.delivery_checked`. `200` means *the check ran*, never *mail works* — a failed diagnosis is the answer, carried in the body with the broken step, the cause the provider's own words classified into, and the fix. The probe goes to the address in the deployment's own `EMAIL_FROM`; `--mail-to` (or `ORQ8_MAIL_PROBE_TO`) aims it at a mailbox you read, and `--no-mail` skips it loudly. A `404` — an API build older than this endpoint — is a **failed** check, not a skip: a green tick for a check that did not run is how "verified" stops meaning anything. `vercel-deploy.yml` passes its optional `MAIL_PROBE_TO` secret through.
- **Watched failing and passing, on two live stacks.** No provider: `FAIL no blocking capability — blocking: email` **and** `FAIL mail delivers — No provider is configured… — Set RESEND_API_KEY (recommended), or SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS`, exit 1. Provider + local SMTP sink: `PASS mail delivers — smtp accepted a message for review@orq8.test`, 6 capabilities ready, exit 0. The gate proof gained the matching assertions — the check must have *fired*, with a provider it must have passed by delivering, without one it must have failed naming the keys — and passes on both stacks. "why this is not a release" now prints once, however many checks failed.
- **A founder was quoted one price and charged another.** `executeTool` consumed credits with `consumeCredits(db, orgId, 'tool.<id>', …)` and no amount, so the charge came from `OPERATION_COSTS['tool.<id>']` — a key that does not exist in that table, which therefore fell through to its `default: 2`. Everything the founder sees is `tool.creditCost`: the spending-limit check, the affordability check, and the number the approval card quotes before they agree to the call. **Found live:** the card said `ESTIMATED COST $0.01` (1 credit), the ledger row said `Tool: Write Email by Ember -2`, and the task record said `write_email: ran in 0.1s, 2 credits`. The registry now passes `{ amount: tool.creditCost }`, so the advertised price, the pre-flight check and the charge are one number — re-proved live on a fresh stack: quoted 1, ledger `-1`, record `1 credit`, task cost 4 = 3 + 1. The old test asserted `=== 2` for `analyze_data`, whose real cost is **also** 2, so it passed for the wrong reason and hid this completely; the new assertion compares the charge against the *quoted* cost, which is the invariant, and the record must report the same number.
- **The approval card named the requesting agent by uuid.** `REQUESTED BY: Agent #1f80cc03` — on the one screen whose entire job is to say who is asking to do what, while the card's own description already said `Agent "Ember"`. `GET /v1/approvals` now resolves the agent's name in the same batched pass that resolves `gatedWork`, and the card renders it (falling back to the id when an agent has been deleted). Verified live: the budget approval reads **Nova** and the gated tool approval reads **Ember**.
- **Walked by hand on a stack with a real SMTP sink, and what the pages still get wrong.** Mail check works against a real socket (`SMTP DELIVERING, from ORQ8 Review <review@orq8.test>, through 127.0.0.1:61634`; “Send a test email to me” → all three steps green with the provider's message id). The gated task walks end to end: **Run now** → `awaiting_approval` (the page renders the state after the `next.config.ts` cache fix, which had made every authenticated GET serve a 30-second stale body) → the card names the blocked task, the tool and the exact arguments → **Approve** → the task resumes, really calls `write_email`, and records `Tools used:`. Three things the pages still get wrong, reported and not yet changed: (1) the task page's status chip reads **PENDING** while the task is `awaiting_approval`, because the chip reads the task's status column and the waiting state lives in the result text and a *Waiting on your decision* link — defensible, but a founder scanning the chip sees "pending"; (2) retrying an observe-mode agent's task toasts **"The task is now failed."**, which is true and reads like a crash; (3) **Run queued work** reports counts (`Ran 1 task: 1 completed, 0 failed, 0 still waiting on you`) but never which task it ran.
- **Verified:** `readiness-mail-check.test.ts` **6/6** (no token and a wrong token both refused; the check runs and reports the failing step without erroring; the fix names the keys; the recipient falls back to the address inside `EMAIL_FROM` and a malformed one is rejected rather than sent), `readiness.test.ts` 7/7, `health.test.ts` 11/11, `email-diagnostics.test.ts` 13/13, `task-tools.integration.test.ts` 3/3 on the embedded database, `task-tools.test.ts` 11/11; the release gate and its proof run against two live stacks, both ways. Typechecks clean for `@orq8/api` and `@orq8/web`; the web app was rebuilt and the card re-checked in a browser.

## 2026-09-29 — An AI employee's work can call a tool, and a release can be blocked for a real reason

- **A task can use a tool, through the EA's gate (MVP-030).** `executeTool` carried the whole tool contract — role, authority, the approval gate, an idempotency key, the credit charge and an audit row for a denial as well as an execution — and had **no caller in task execution**: the executor raised an approval and then had nothing to run. It now calls the same registry the Executive Agent does. The model is offered exactly its role's tools and one strict, machine-readable way to ask for one (an unreadable block is treated as a normal answer, never guessed at, because a guessed call would run real work), bounded at three rounds. What the work used is on the task's record (`Tools used: analyze_data: ran in 1.2s, 2 credits`); the task row's cost equals every charge in the ledger against it while only the model's share is billed here, because the registry already charged `tool.<id>`; a refused tool is refused for real — audited as `tool.denied`, nothing charged, the refusal on the record instead of hidden behind a plausible answer; and a tool that needs the founder stops the task in `awaiting_approval` naming the tool and its exact arguments, with the grant consumed when the halted run resumes. **Found while verifying:** task-scoped tool audits carried no `task_id`, so tool activity could not be traced back to the task; executed, denied and grant-consumed rows now name it.
- **The release gate exists, and has been watched failing (MVP-021, MVP-034).** `scripts/release-gate.mjs` asks a running deployment four questions — web `/healthz`, API `/healthz`, `/readyz`, and `/v1/readiness` — and exits non-zero while a production-critical capability is unconfigured, printing the missing key names, the impact and the docs. `/v1/readiness` gained a machine read (`x-internal-token`, constant time) because a gate has no session and a red deploy that cannot say *why* is a red deploy nobody fixes; `/readyz` stays public and nameless. `--require billing` raises the floor for a stage that needs more. `scripts/release-gate-proof.mjs` is a `proofs.mjs` proof (so CI runs it) asserting the verdict follows the deployment's own report, that the public count and the named report agree, that the gate refuses to guess without its token, and that `--require` fails for the reason it is given.
- **Proven against the local review stack, both ways.** The gate **refused** the default stack — `blocking: email`, naming `RESEND_API_KEY`/`SMTP_HOST` and the founder impact — and **cleared** a stack whose mail capability is genuinely activated (`REVIEW_MAIL=1` attaches a local SMTP sink: a real socket that answers SMTP, the mail twin of the local model gateway), reporting *6 capabilities ready*. Two stacks ran side by side to do it, which required two fixes to the harness: the data root is now scoped by port (`.review-stack-data-3113` is not a substring of `.review-stack-data-3115`), and both ports are checked **before** anything starts — the port preflight used to run after the database was up, so booting a second stack killed the first one's Postgres and took a live stack down to report its own mistake.
- **The deploy is verified; the release now has a gate too.** `vercel-deploy.yml` runs the gate after it verifies the web deployment. With no `PRODUCTION_API_URL` secret it records **Release gate: NOT RUN** in the job summary and warns that the release is unproven rather than showing a green check for a check that did not run; the moment the API has a host, that step is blocking. `.github/workflows/ci.yml` runs the gate proof on the review stack in the `founder-loop` job (advisory, like the route sweep it shares a boot with, until the stack proofs have held on GitHub runners).
- **Also fixed while here:** the gate's own exit was aborting inside libuv on Windows (`process.exit()` racing a closing socket → exit 127, which would have turned a *passing* deployment red), so the scripts use a dependency-free JSON GET that leaves no handle behind and set `process.exitCode` instead.
- **Verified:** `task-tools.integration.test.ts` **3/3** on the embedded database (a role's tool runs, is charged and audited as `tool.executed`; a forbidden action is refused, audited as `tool.denied` and charged nothing; a gated tool stops the task and runs when the approval is granted) and `task-tools.test.ts` **11/11**; **42/42** on the executor-adjacent suites (executor, block-persist, approval-gated work, approvals); `health.test.ts` **11/11** including the machine read, the refused token and `/readyz` agreeing with the named report, and `readiness.test.ts` 7/7. The release gate was run live against two review stacks and the gate proof passed on both. Typechecks clean for `@orq8/api` and `@orq8/web`.

## 2026-09-29 — Mail is self-diagnosing, and the founder can move work without curl

- **Mail delivery is now a check the founder can run, not a log line they have to read.** `GET /v1/settings/mail` reports the configured provider, the sending address, which keys are missing (names only, never values) and what delivery costs the product while it is unconfigured; `POST /v1/settings/mail/test` sends one real message and returns three verdicts — *a provider is configured*, *the provider accepts these credentials*, *a real message was accepted* — with the failing step classified into a cause and the change that fixes it (an invalid Resend key, an unverified sending domain, a rate limit, an unreachable SMTP host, rejected SMTP credentials, a TLS mismatch, or a refused recipient) and the provider's own words kept alongside. The settings page renders all of it, including “not delivering”, instead of claiming success. Owner/admin only for the send, audited as `mail.delivery_checked`.
- **Execute, retry and run-queued-work are reachable from the product.** `POST /v1/commands/tasks/:id/execute`, `…/retry` and `…/tasks/execute-pending` existed with no caller in the app, so a founder whose task was stuck needed a developer with curl. The task page now runs a pending task (“Run now”), retries a failed one, and shows *Waiting on your decision* with a link to the approvals page when that is the actual state. The Founder's Attention queue gained **Run queued work** with a plain-language result (“Ran 3 tasks: 2 completed, 1 failed, 0 still waiting on you”), and its per-item **Retry** now calls the real retry endpoint — it re-runs the work and reports the outcome, instead of patching the status to `pending` and leaving the founder to trigger the run a second time.
- **An approval card shows the exact tool call.** The gated task, its status, the tool, and now the argument-by-argument payload (`toolParams`, stored by migration 0036 precisely so “do the thing” is never approved blind) — long values are cut at a readable limit, not summarised.
- **Verified:** `mail-and-work-controls.integration.test.ts` **5/5** on the embedded database (unauthenticated refusal, an unconfigured deployment reported honestly with no credential in the payload, the three-step diagnosis plus its audit row, one task executed on demand, and the batch runner reporting its counts while completing the queued task); `email-diagnostics.test.ts` **18/18** including the failure classifications and “a rejected key means nothing is sent”; `attention.test.ts` **13/13** with the retry-endpoint assertion. Typechecks clean for `@orq8/api` and `@orq8/web`.
- Not walked live: ports 3111/3112 are held by an older review stack, so the three new surfaces are verified through the API they call (the web routes are passthroughs) and by typecheck, not by clicking them in a browser.

## 2026-09-29 — An approval names what it blocks, in every surface the founder reads

- **Gap A reached the product, not just the API.** The columns (`task_id`, `tool_id`, `tool_params`, `released_at`) and the resume/stop wiring landed earlier; what had not landed was the naming. `GET /v1/approvals` returned the raw row, the Founder's Attention item was built from the `action` sentence, and both cards rendered `action` + `description` — so a founder still pressed approve without seeing what moved. The list and single-get now resolve a `gatedWork` object per row (the gated task's title and status, and the tool when the gate came from a tool call) in batched queries; the attention item leads with the blocked work and its authority line says that approving resumes it while rejecting stops it and keeps the reason; `/app/approvals` and the dashboard Decision Center render *Blocks <task> · status* with a link to the task, and stay silent on rows that predate migration 0036 rather than inventing one.
- **Verified on the embedded database:** `approval-gated-work.integration.test.ts` is now **10/10** (the new case asserts the list hands the founder the blocked task by name and status), `attention.test.ts` gained a named-work case and a tool case, and `attention.integration.test.ts` stays green — 23/23 across the two attention suites.
- **The model gateway decision is recorded and enforced.** Re-verified this cycle: `PROVIDER_PRIORITY` is `openrouter → nvidia → litellm → ollama` in `apps/api/src/services/model-router.ts`, `buildProviderChain()` in `services/llm.ts` pushes the same four in the same order, and `model-router.test.ts` asserts the declared order, OpenRouter first, NVIDIA second, and that only LiteLLM/Ollama are development providers (`llm-fallback.test.ts` 14/14 on the fallback walk). **[ADR-023](adr/ADR-023.md) supersedes ADR-004** and is linked from `docs/22_MODEL_ROUTING.md §22.9` under "Record", with ADR-004 marked Superseded in its own header and in the index (`docs/56`).
- Typechecks clean for `@orq8/api` and `@orq8/web` after the payload and card changes.

## 2026-09-29 — Full ecosystem reconciliation: one plan, one map, one activation model

- **The documentation is reconciled against the product.** Four documents claimed to be the plan and
  two of them said so in their own headers. `docs/66` is now the master guide and
  `docs/68_REQUIREMENT_MATRIX.md` is the matrix; the other four are archived. `docs/00_INDEX.md`
  maps every document with its purpose, its action (KEEP / UPDATE / MERGE / ARCHIVE / REMOVE) and
  the seven conflicts that were found and how each was resolved. Twenty documents and three
  prototype surfaces moved to `docs/archive/` or `archive/prototypes/`, with the reason and the
  successor recorded per file in `docs/archive/README.md`. **Nothing was deleted.**
- **The deployment story conflicted with itself.** `docs/58` is headed "Supabase + Vercel + GitHub"
  and carried a section titled "Railway — API host (current)"; `docs/43` described a third
  pipeline; `.github/workflows/vercel-deploy.yml` stated "the API deploys to Railway separately",
  a host that no longer exists. `58.11b` is now marked historical with the real status (the API has
  no host), the workflow no longer documents the impossible path, and the code side of a
  replacement is named precisely: `build:bundle` + `apps/api/vercel.json` + the `bundle.prod` /
  `boot.prod` tests for a Vercel function, or `apps/api/Dockerfile` for a container host.
- **The deployment can now say what it cannot do.** `capabilityReadiness(config)` in `@orq8/core`
  declares each capability's required keys (or its alternatives), whether it is production-critical,
  and what the founder loses while it is unconfigured. `GET /readyz` (public) reports dependency
  health plus activation counts; `GET /v1/readiness` (authenticated) names every unconfigured
  capability with its impact and its documentation. Key names only — never a value. Seven tests
  pin the four properties that make it trustworthy (a minimal deployment is not reported complete;
  a configured one has nothing blocking; a local substitute reports `dev_only` and never `ready`;
  nothing leaks), plus a drift guard tying every named key to `envSurface()`; three more cover the
  routes themselves.
- **The audit's sharpest finding is a missing feature, not a messy repository.** `task-executor.ts`
  enforces the approval gate and imports no tool registry: an AI employee's work is stopped for a
  decision and then has nothing to run. `executeTool` is reachable only from the Executive Agent's
  own path. That is MVP-030, the one P0 row that needs no founder input, and it is where
  implementation resumes.
- **Two prototype surfaces were compiled into the product.** `/dashboard-prototype` and
  `/design/colors` were reachable URLs in any build of this working tree, referenced by no source
  file; they are now in `archive/prototypes/` with the restore command documented. `.recovery/` is
  gitignored so it stops polluting `git status`.
- **Founder-blocked state, stated plainly:** `origin/main` is at `3b559b9` (2026-09-12) while local
  `main` is 33 commits ahead with 246 uncommitted files, so production cannot be running this code;
  the API has no host; and the Supabase project the repository targets
  (`gttkaxbcdtpsmconxm` as configured locally) is not visible to the connected tooling, which sees
  only `CapitalOS` — a different product with 48 investor-intelligence tables. Nothing was
  committed or pushed.

## 2026-09-29 — ADR-023: OpenRouter is the production gateway; approvals audit both outcomes

- **ADR-023 — OpenRouter Is the Production Model Gateway** supersedes **ADR-004** (LiteLLM as the
  model gateway). It keeps ADR-004's central rule — domain code never calls a vendor SDK directly —
  and changes which service sits at the head of the chain: OpenRouter primary (one key, many vendors,
  no self-hosted hop we have to operate), NVIDIA NIM the first fallback, LiteLLM and Ollama
  development-only and last. `PROVIDER_PRIORITY` in `apps/api/src/services/model-router.ts` is the
  single declaration every chain derives from; `apps/api/test/model-router.test.ts` (24 tests) pins
  the order, the first entry of a configured chain, and that only the dev providers report as
  development. ADR-004 is marked superseded (never deleted); the index (docs/56), 06 §6.6 and 22 §22.9
  all link to the new record.
- **Both approval outcomes are audited symmetrically.** An approved gate wrote
  `approval.resumed_work` naming the task it released; a rejection wrote only that a question was
  answered. It now writes `approval.stopped_work` too, and both rows carry `approval_id` and
  `task_id` as structured references, so the trail answers "what did this decision move?" without
  parsing prose. `approval-gated-work.integration.test.ts` is now 9/9, with the audit assertions
  added.

## 2026-09-29 — Members are manageable in the product, and removal removes access

- **The member surface now exists in the app** (`/app/members`, in the existing operational shell):
  invite a teammate with a role, see the accept link with a copy control and an honest delivery
  verdict, list pending invitations with **New link** / **Revoke**, change a member's role, and remove
  someone. `/invite/[token]` is what the teammate opens — sign in or create the account with the
  invited address, one click to accept, then the session moves into the company that invited them.
  Every rule stays in the API; the page shows its refusals verbatim.
- **Invitations are emailed through the existing transactional transport**
  (`invitationEmail()` + auth's `createEmailTransport`), carrying the company, role, inviter, a
  single-use link and its expiry. Mail never fails the invitation, and `SendResult.delivered`
  distinguishes "a provider accepted it" from "the transport returned ok because it only logged the
  message" — so the UI says "emailed" or "no mail provider configured here, send them this link"
  instead of pretending.
- **One-time links are one-time:** only a token hash is stored, so a lost link cannot be shown again.
  `POST /v1/members/invitations/:id/renew` mints a fresh token (killing the old one, restarting the
  expiry) and re-sends the email.
- **Fixed: removing a member did not remove their access.** The live loop removed a teammate, they
  vanished from the list, and their session still answered 200 on `/v1/agents` — `findSessionByToken`
  joined `memberships` without checking `status`. The join now requires an active membership, and
  `removeMember` revokes that person's sessions in that organization (cache entries first, so a
  cached session cannot outlive the removal). Verified live: the removed teammate gets 401 with
  `revokedSessions: 1` reported.
- **Tests:** `apps/api/test/members.integration.test.ts` now 20/20 on the embedded database, adding
  the delivery verdict, renewal (fresh link works, the old one is dead), renewal refused on a settled
  invitation, cross-tenant renewal refusal, and removal revoking access.

## 2026-09-29 — The founder loop runs end to end, and the harness stops lying

- **The loop was driven through the product's own routes** (register → confirm →
  company → hire → ask the Executive Agent → approve → work resumes) against the local review
  stack, not the API directly. After the fixes below: every step passes, route sweep 33/33 clean,
  vertical slice 44/44, gated task resumed on approval and completed.
- **"Ask the Executive Agent for work" failed in the product**: `/api/commands` returned 415
  Unsupported Media Type because the proxy named `Content-Type` twice (once literally, once via
  `proxyAuthHeaders`), so fetch sent `application/json, application/json`. The identical request to
  the API worked, so every diagnostic said the backend was fine while the product's core action
  looked dead.
- **Signup could not be completed without a mail provider.** The dev transport logged only
  recipient and subject — the confirmation link existed nowhere — so every page answered 403
  `email_not_verified` pointing at a link that could never arrive. Outside production the message
  body (link included) is now printed; in production with no provider the send fails loudly instead
  of reporting a phantom success.
- **A gated command reported success.** With a `recommend`-level employee the work stopped at the
  approval gate while the command answered `status: completed` and "0/1 tasks completed". The
  command now reports `awaiting_approval` and says the task is waiting on a decision.
- **Harness defects fixed, each of which made the loop unprovable:** the route sweep logged in as
  `demo@orq8.test` while the stack seeded `founder@orq8.test` (all 33 routes "redirected to
  /login" on a healthy app) — both now read one credential source; the stale-postmaster cleanup
  stopped every embedded Postgres on the machine, killing the review stack's database mid-review —
  it is now scoped to the harness's own data root; and the stack announced "ORQ8 IS UP" while its
  own web child had died with EADDRINUSE, so it now refuses an occupied port and treats a dead web
  child as fatal.
- **Still open:** hiring a fourth employee is refused by the trial cap with an upgrade path that
  does not exist in the MVP, and there is no web route for execute / retry / execute-pending, so
  the founder can approve work but cannot start or re-run it from the product.

## 2026-09-29 — Approvals gate real work, memory is provably used

- **Gap A — an approval now names the work it gates.** Before, a decision carried an `action`
  sentence and nothing else: approving released nothing, rejecting stopped nothing, and the task sat
  in `pending` while the Command Center reported the request handled. Migration `0036` links an
  approval to its `task_id` and the tool it gates, and stamps `released_at` so a yes is single-use.
  The executor now honours the autonomy model's `requiresApproval` instead of dropping it on the
  floor; approving resumes that exact task, rejecting requires a reason (400 `reason_required`) and
  cancels the task for good with the reason kept on the record; `tool-registry` no longer reports
  `success: true` for work it just blocked.
- **Gap C — the orphaned runner has a caller.** `executePendingTasks` was exported with no callers
  anywhere in the API. `POST /v1/commands/tasks/:taskId/retry` re-runs work the system stopped and
  refuses work a person has not settled (409); `POST /v1/commands/tasks/execute-pending` runs the
  org's queued work and never touches work waiting on a human. Both paths are driven by the approval
  decision too.
- **Verified**: `apps/api/test/approval-gated-work.integration.test.ts` — 8/8 on the embedded
  database, only the LLM boundary stubbed.
- **Gap D — the acceptance test exists and it found two real defects.**
  `apps/api/test/memory-acceptance.integration.test.ts` (4/4) proves teach → store → retrieve → use,
  with the LLM stub echoing the knowledge it was given so the result can only contain the taught
  fact if it genuinely travelled storage → retrieval → prompt → output. Defects fixed: (1) the
  keyword fallback matched the whole task description as one substring of the memory content, so
  with no embedding provider — the default — a task could never find what the founder taught it;
  retrieval is now term-matched and ranked by how many of the query's salient terms an entry
  contains. (2) `useCount`/`lastUsedAt` were hardcoded to `0`/`null`, so "was this knowledge ever
  used?" was unanswerable; migration `0037` adds both columns and the context builders stamp the
  entries they hand to an employee, while `/v1/memory` reads alone leave the counters alone.

## 2026-09-28 — OpenRouter leads the provider chain

- **What changed**: provider priority was `nvidia → openrouter → litellm → ollama` in two places that
  each had their own copy of the list. OpenRouter is now first, NVIDIA NIM is the documented first
  fallback, and LiteLLM and Ollama are development-only and last. The order is declared once, as
  `PROVIDER_PRIORITY` in `apps/api/src/services/model-router.ts`; `getProviderChain()` derives its
  walk from it and `buildProviderChain()` in `llm.ts` pushes the same four ids in the same order.
- **Why**: an unpinned call used to land wherever a workspace happened to hold credentials, so the
  destination of a production request was decided by environment rather than by policy — and a pinned
  model id could be answered by a different vendor without the caller knowing. One OpenRouter key
  fronts many vendors, honours a pinned id exactly, and makes the default destination a single
  predictable path. NIM is demoted rather than deleted because it is a genuinely useful second
  attempt; a stray local LiteLLM/Ollama URL is now structurally unable to lead a call.
- **A silent gap in the old chain**: `ModelRouter.getProviderChain()` skipped every provider whose key
  pool was empty, which quietly removed Ollama — the one provider that needs no credentials — so the
  declared four-provider chain was really three. Providers now declare whether they need auth
  (`requiresAuth`), and the chain mirrors the declared priority exactly.
- **Verified**: `@orq8/api` typecheck clean; the full API suite green at **467 passed / 0 failed**,
  including new assertions that OpenRouter heads the chain when both keys are present, that NVIDIA is
  the first fallback, that the development providers stay last, that a real call is served from
  OpenRouter without touching a fallback, and that `PROVIDER_PRIORITY` is the source of truth.
  OpenRouter was also exercised end to end through ORQ8's own `getModelRouter(config).complete()` —
  `provider: openrouter, model: openai/gpt-4o-mini`, usage and cost metadata returned, zero fallbacks
  used.
- **Written down**: §22.9 of `docs/22_MODEL_ROUTING.md` records the decision and amends §22.8, which
  had LiteLLM as the production gateway (ADR-004). The order is now consistent in the deployment
  guide, the system audit, the master plan, the MVP master, the product-experience spec, the current
  state of the code, and both `.env.example` templates.

## 2026-09-28 — The hero keeps its light when the OS turns animations off

- **What changed**: `HeroLightField` read `prefers-reduced-motion` and, when it matched, detached
  entirely — leaving the hero with no light at all. It now keeps the light and removes only the
  movement: the field parks at rest (`REST_LIGHT` / `REST_WARM`, opacity 1), installs no pointer
  listeners and starts no animation frame. A coarse pointer still gets no light, because a touch
  device has no hover to respond to.
- **Why**: this machine reports `prefers-reduced-motion: reduce` — Windows client-area animations are
  off (`SPI_GETCLIENTAREAANIMATION = 0`, `MinAnimate = 0`) — so the hero rendered unlit here for
  anyone with the same setting, which is a large and entirely ordinary group of users. Reduced motion
  asks for less movement, not for a missing visual.
- **Also fixed on the landing surface**: `btn-press` was referenced by four components but had never
  been defined anywhere, so it did nothing; it is now a real 120ms scale-on-press rule with a
  reduced-motion opt-out. The five elevation shadows used Tailwind arbitrary values containing literal
  spaces (`rgb(53 98 103 / 0.08)`), which Tailwind split into separate classes so no shadow ever
  applied; they are normalized to the underscore form (`rgb(53_98_103_/_0.08)`) and confirmed in the
  browser to generate real CSS.
- **Verified**: with reduced motion in force the live DOM reports `--hero-light-opacity: 1` with the
  light at 38% / 42%, and the hero is visibly lit in a screenshot. With the media queries overridden to
  simulate a desktop pointer, the field eases toward the pointer (opacity 0.000 → 0.221 → settled
  0.936) and its coordinates track the cursor, with the warm layer lagging behind it.

## 2026-09-28 — One ORQ8 lockup, and the product stops saying Trezo

- **What changed**: `components/branding/logo-mark.tsx` rendered the template's letterforms. The
  wordmark path spelled T-r-e-z-o, so every authenticated page carried another company's name in its
  most prominent brand position. The letterforms are replaced with real ORQ8 geometry: a geometric
  O-R-Q-8 drawn in a 100 x 26 viewBox at cap height 18 and stem weight 3.5, so it holds its own next
  to the heavy four-tile mark. The mark itself, the prop API and every call site are unchanged.
- **Why**: the sidebar is the one surface a customer looks at every day. A wrong name there is worse
  than a wrong colour anywhere.
- **How it is built**: letters are filled paths — counters cut with `fillRule="evenodd"`, and the
  parts that must merge (the R leg, the Q tail, the two loops of 8) kept as separate elements so
  their overlap paints solid. No font and no network request, so the name cannot drift or 404.
- **One lockup everywhere**: the landing navbar had been a raster PNG with a neon green/blue
  gradient glyph and a different wordmark, and the admin sidebar a generic `Zap` icon — a second and
  third identity. Both now render the shared `LogoMark`. The wordmark follows `currentColor` and the
  mark takes the brand tone, so the same component reads white-on-black over the hero, ink-on-white
  in the sticky bar, and ink-on-white in the admin console.
- **Icons too**: every raster brand asset — `favicon.png`, `app/icon.png`, the apple touch icon and
  the wide navbar PNGs — was that same neon gradient glyph, which meant the browser tab, the app
  icon and the iOS home screen all showed it. They are regenerated from the four-tile mark
  (`public/favicon.svg` vector plus `favicon.png` and `apple-touch-icon.png`), and the retired
  neon/Trezo files are deleted along with the unreferenced `logo.svg` and `white-logo.svg`.
- **Verified**: geometry checked at 620px, 300px and at the real 32px size on white and inside a
  black band; the shipped sidebar, the landing navbar in both states and the tab icon at 16 - 48px
  rendered and inspected; typecheck and production build green.
- **Not verified**: the `/admin` shell itself needs `users.platform_role = 'admin'`, which the local
  founder account does not have. The logo block is verified as the same component under the same
  white-bar/ink-wordmark treatment that the sticky navbar renders.

## 2026-09-28 — White page, two live accents, and a cleaner How it works

- **What changed**: the page is white, not `#EFFEFB`. Cards are white too and are separated by a
  hairline and a shadow; controls, hovers and quiet panels sit on a 4% neutral wash. Lime `#B8FF66`
  and orange `#E86A33` return as **touches** — a lime rule over each How-it-works step, a lime tick
  beside each section eyebrow, a lime dot on the black hero, CTA and footer, the orange pricing
  ribbon, the lime annual toggle, an orange marker on the Testimonials pill. The How-it-works
  section is rebuilt: three columns divided by hairlines with a short lime rule and a mono step
  number, instead of three pale rounded cards with circular badges.
- **Why**: the tinted page made the whole product feel like one colour and left nothing for the
  hierarchy to rise above, and the How-it-works cards read as generic template furniture. The brief
  was a clean white interface with two points of vivid life in it.
- **Teal's area, not its role**: teal stays the brand — primary buttons, brand text, borders, marks,
  the black bands and the focus ring — but the large pale-teal areas are gone. `--orq-surface-secondary`
  is a neutral wash rather than `#C2F2F2`, and the section titles that were teal are ink.
- **A regression the audit caught**: the neutral wash took tertiary text to 4.42:1, so
  `--orq-text-tertiary` deepened to `#487279` and the wash softened to 4%. The audit gained pairs for
  the accents in both scopes.
- **Also fixed**: the Testimonials quote glyph was a bundled SVG with a hard-coded indigo `#757FEF`.
  It is inlined with `currentColor` now, the asset is deleted, and the two unreferenced logo SVGs that
  still carried `#605DFF` were recoloured. No indigo remains anywhere in the source or the assets.
- **Verified**: contrast audit green in both scopes, web typecheck, production build, and a
  rendered-DOM scan with zero failures on landing, auth, dashboard, health and Company Hub.

## 2026-09-28 — One colour system across the whole product

- **What changed**: every surface — marketing, auth, onboarding, the dashboard,
  the Company Hub, the Executive Agent, agents, tasks, approvals, settings,
  charts, modals, tables, empty and error states — now reads one semantic token
  system declared in `apps/web/app/globals.css`. The palette is the official one:
  brand `#356267` / `#41737C`, the light interface `#C2F2F2` / `#EFFEFB` /
  `#FFFFFF`, structural `#000000`, warm `#F1C095`, error `#D55053`. Light is the
  default product; `.ink` is the deliberate black band (marketing hero and CTA,
  auth shell, onboarding, the hub canvas).
- **Why**: colour had become decoration. Four "greens", three warm hues, a neon
  lime and a borrowed indigo were all saying "positive", and the marketing site,
  the auth shell and the app each had their own palette. One system now carries
  meaning: brand is the product, warm is attention, error is trouble.
- **Two passes to retire the bridge.** The historical names — the Tailwind
  default palette, the landing's editorial set (`void`, `abyss`, `parchment`,
  `fog`, `ember`, `panel`, `navy-*`) and the `orq8-*` brand utilities — first
  resolved onto semantic tokens so the product stayed reviewable mid-migration,
  then were moved call site by call site: 668 + 44, then 1,937 across 136 files,
  plus 32 hand corrections. The compatibility block itself is gone, so a stray
  `bg-gray-100` now fails visibly instead of quietly choosing a colour.
- **Defects the migration exposed and fixed**: `bg-orq8-dark` carried the ink
  band with it (renaming it to a plain fill would have made every label inside a
  black chip invisible); `bg-success-50`, `border-orq8-green-200` and
  `hover:bg-orq8-green-300` were dead classes that emitted no CSS; the sidebar
  and hub cores sat on a literal `bg-white` inside a band and rendered
  white-on-white; `text-orq8-orange` was an eyebrow at 1.59:1; a 2px `#C2F2F2`
  status dot on a white bar was 1.17:1.
- **New**: `--orq-mark-active` / `--orq-mark-warm`, a context-aware status-mark
  pair, because a mark has no text to carry it and the pale chip tones vanish on
  the page. Ten AA failures were corrected with derived tones
  (`--orq-text-warm`, `--orq-text-error`, `--orq-error-fill`, `--orq-disabled-text`,
  two chart marks, the focus ring and the band's text tones).
- **Docs and tooling**: `docs/65_COLOR_SYSTEM.md` rewritten, `/design/colors`
  renders the system live, and `pnpm audit:contrast`
  (`scripts/color-contrast-audit.ts`) reads the values out of `globals.css` and
  exits non-zero on regression. The superseded in-app `test:contrast` script was
  deleted with the bridge it depended on.
- **Verified**: contrast audit green in both scopes, web typecheck, production
  build, and a rendered-DOM contrast scan across the landing, auth, dashboard,
  health and Company Hub surfaces.

## 2026-09-27 — Company Hub rebuilt as a single orbital surface

- **What changed**: `/app/company/overview` is now one diagram instead of seven
  stacked sections — the ORQ8 core, two orbit rings and six satellites
  (Executive Agent, Audit Trail, AI Workforce, Company Memory, Approval Gates,
  Goals & Tasks). Every satellite carries a figure read from the backend, so the
  diagram is an operating console, not an illustration.
- **Why**: the first hub buried the organisation under detail. The founder asked
  for the hub to be the focus and for everything else to be minimal.
- **First run**: the welcome now appears only while the company has no employees,
  goals or departments. A running company goes straight to the hub. The
  onboarding stage still reaches the Executive Agent unchanged, so its greeting
  matches the dashboard at `/app`, and `/app` itself was not touched.
- **Removed**: `company-hub/{organization-hub,ea-rail,hub-ui}.tsx`, left over from
  the first hub and imported by nothing else. One hub implementation remains.
- **Verified**: web typecheck, production build, and a browser pass over three
  states — a running company, a brand new company (first run), and the tablet
  layout — with zero console errors.

## 2026-09-27 — Supabase reached, applied and recorded (34/34, with a ledger)

- **Access**: the ORQ8 project is `gttkaxbcdtpsusmconxm` (eu-west-1, Postgres
  17.6, healthy). The connected MCP server only exposes `CapitalOS`
  (`tvekoojdilkjptjzpvqo`), a different product, so the Management API and the
  pooler are the working path. The database password was rotated and both pooler
  modes (session 5432, transaction 6543) were verified; the direct
  `db.<ref>.supabase.co` host does not resolve on this network (IPv6 only).
- **Vault**: credentials live in `.supabase-setup.json` (gitignored). The vault
  the earlier session expected was missing, so it has been recreated; it now
  holds the rotated password. A long-lived token in a file is a local
  convenience, not a secret manager.
- **0034 could not apply, and the reason was a real bug**: the catalog-driven gap
  query had no schema filter, so on real Supabase it walked `auth.*` and tried to
  index `auth.mfa_challenges`, which the `postgres` role does not own
  (`ERROR: 42501: must be owner of table mfa_challenges`). Local and CI passed
  because the embedded `auth` shim has no foreign keys. 0034 and the
  `scripts/rls-security-e2e.ts` invariant are now both scoped to `public`, and
  production is 34/34 applied.
- **Ledger**: `supabase_migrations.schema_migrations` with our `checksum` column,
  keyed on the migration file stem. The lineage uses `0002` twice, so a numeric
  prefix keyed two files to one row and made one read as permanently "changed" —
  the exact drift this ledger exists to expose. `migrate:supabase:status` reads it
  without writing; CI now reports status before applying.
- **Parity, measured** (`scripts/lineage-parity.ts`): fresh lineage 801 columns /
  261 indexes / 79 policies / 44 functions / 26 triggers versus production 828 /
  264 / 87 / 128 / 26. Three groups explain all of it: expected environment
  extras (pg_stat_statements, supabase_vault, uuid-ossp, pgvector), four legacy
  tables that exist only in production (`agent_memory`,
  `notification_preferences`, `platform_admins`, `user_org_mapping`), and the
  drizzle half production never received (eight performance indexes,
  `users.password_hash`, `webhook_events.title`, several column defaults).
  Production has 0 rows, so this is cheap to fix now — but it needs a decision:
  converge the two lineages into one, or apply the drizzle lineage to production
  as well.
- **Removed as dead**: `railway.json` and the unreferenced, Railway-based
  `DEPLOY.md` that contradicted `docs/58_DEPLOYMENT.md`.
- **Setup documented**: `docs/64_SUPABASE_SETUP.md`.
- **Not changed on purpose**: the landing privacy and security pages still name
  Railway as the application host. That copy is user-facing, so it needs a
  decision rather than a silent edit.

## 2026-09-27 — Migration apply blocked: production plumbing drift (0033/0034 still unapplied)

- **Attempted**: 0033 and 0034 live only in local commit `4f7f1d6` (`origin/main`
  tops out at `0032_routing_source.sql`), so the DB Migrate workflow cannot see
  them. A throwaway branch `apply-0033-0034` carried the pending commits and the
  workflow was dispatched against it (run `36327065646`). It failed at its first
  query with `read ECONNRESET`, the same signature the local credentials produce
  (TCP connects to the Railway proxy, then the handshake is dropped on plain and
  TLS). The `SUPABASE_DATABASE_URL` secret is therefore a dead target. No
  database was touched; nothing was applied.
- **Fresh lineage verified**: both lineages apply from scratch to an embedded
  Postgres (801 columns, 261 indexes, 79 policies, 44 functions, 26 triggers),
  and the RLS security matrix passes 55/55 including the FK-index invariant 0034
  asserts. The fresh side of parity is correct; the production side is
  unreadable from here.
- **Production is down, and the drift hid it**: `orq8.vercel.app` serves the web
  shell, but every proxied API call returns Railway's own
  `{"code":404,"message":"Application not found"}` (probed `/api/org`,
  `/api/departments`, `/api/credits/balance`, `/api/agents`, `/api/notifications`,
  `/api/dashboard`), so the web has no backend at all. The deployed build also
  predates the current login error handling and masks the outage as
  `401 Invalid email or password`; `/api/health` and `/api/auth/me` answer 401
  from the web's own guard, not from an API. No founder can use production today.
  The automation points at the same deleted infrastructure. The GitHub `API_URL`
  secret is the removed Railway app, so the scheduled production jobs fail with
  Railway's
  `{"code":404,"message":"Application not found"}` (memory consolidation,
  anomaly scan, waitlist drip; e.g. run `36318465160` today). `docs/58` documents
  `orq8-api.vercel.app` as the API, which returns Vercel `DEPLOYMENT_NOT_FOUND`.
  The local credential vault is stale in the same way: the Railway token is not
  authorized, the Vercel token is 401, the Supabase keys are 403 and
  `SUPABASE_DB_URL` is a placeholder.
- **No staging exists**: docs/58 §58.11 states it and there are no staging
  secrets or databases, so the requested fresh/staging/production comparison is
  fresh versus production until a staging project is created.
- **New tool**: `scripts/lineage-parity.ts` fingerprints a catalog (columns,
  indexes, policies, RLS enablement, functions, triggers, extensions), diffs two
  fingerprints and classifies each difference as expected (documented
  environment differences such as the pgvector skip) or drift. Read-only; every
  query is a SELECT, and it can boot the fresh lineage for the comparison side.
- **Next**: put a live production connection string into the GitHub secret (or
  hand it over locally) — then re-dispatch the branch run and re-run the parity
  diff to prove the drift is closed.

## 2026-09-27 — First vertical slice proven end to end

- **Slice proof**: `scripts/vertical-slice-e2e.ts` runs the whole slice against
  real infrastructure and asserts every hand-off: embedded Postgres with the
  production migration lineage, a local OpenAI-compatible model gateway reached
  over HTTP through the real provider chain (`OPENROUTER_BASE_URL`), the real
  API, a founder who registers, confirms the address and hires an AI employee,
  then asks the Executive Agent for work. 44/44 checks pass: the gateway served
  intent analysis, task execution and QA (traces name provider `openrouter` and
  the served model), the task completed under the hired employee, the authority
  and credit gates both passed on the happy path and blocked real tasks with
  their reasons persisted when the agent lost `canExecuteTasks` or the balance
  was emptied, the credit ledger carries the measured amount per task, the audit
  hash chain verifies, the admin activity/audit/ai-usage surfaces reflect the
  run, and the realtime stream delivered `task.started`, `task.completed`,
  `task.qa_passed`, the measured `credits.consumed`, both blocked `task.failed`
  events and `attention.changed`.
- **Credits measure the work**: the task executor now bills the cost the run
  measured (`consumeCredits` accepts an explicit amount), so the ledger row, the
  task row, the audit trail and the SSE event carry one number instead of a flat
  rate disagreeing with the work. A balance at zero pauses execution before any
  model call (the promise the credit alert copy makes), a billing failure is
  recorded as `credits.unbilled` rather than swallowed, and a run that produced
  no work is charged nothing.
- **Shared harness**: the embedded-Postgres boot (migrations, auth/role shims,
  scoped drops, stale-process cleanup) moved into `scripts/lib/embedded-db.ts`;
  `scripts/integration-suite.ts` and the new slice script both use it.
- **Fixed**: the attention integration suite seeded its org fixtures with
  `Promise.all` and pushed them from inside the factory, so `fixtures[0]` was a
  random org per run; the fixtures are now recorded in a fixed order. This was
  the source of the intermittent attention failures in the full suite.
- **Verified**: `pnpm typecheck` clean, `pnpm test` 453 passed, integration suite
  69 files / 637 tests passed, vertical slice 44/44 checks passed.

## 2026-09-27 — Founder's Attention (Phase 3): real queue, real actions

- **API**: `GET /v1/attention` (`routes/attention.ts`, `services/attention.ts`)
  aggregates real rows only: pending approvals split into business decisions and
  tool permission requests, high or urgent work blocked past the blocked
  threshold, recent failed work, unacknowledged Work Credit alerts, goal
  deadlines overdue or inside the at-risk window, and council escalations with
  no founder verdict. Each item carries what / why / who / authority / impact /
  next plus actions that name the real endpoint, so no client invents state.
  Ordering is severity, then decisions before information, then oldest first;
  every source is capped and `truncated` says so.
- **Realtime**: new `attention.changed` SSE event, emitted from the real
  mutations (approval created or decided, task status change, task failure,
  credit alert, founder verdict). The badge and the page refetch on it, with a
  60 second poll only as a fallback for a dropped stream.
- **Web**: `/app/attention` renders the queue grouped by severity with actions
  wired to the existing endpoints (approve, reject, retry, pause, cancel,
  acknowledge) and an ask-the-EA action that opens the panel with a prompt built
  from the item. An honest empty state offers real next steps instead of
  padding. Top-bar badge shows the live count, the sidebar gains Attention, and
  the dashboard attention section links into the queue.
- **Audit**: task status changes are now audited (`task.status_changed`), the
  one action the queue exposed that previously left no trail.
- **Tests**: 16 unit tests for classification, ordering and summary; an
  integration suite covering the aggregate, both directions of org isolation, a
  quiet company, and every action end to end (including that a second decision
  is refused and that rows stay untouched across orgs); three new auth E2E
  journeys (quiet empty state, queue reachability, page rendering).
- **Verified**: `pnpm typecheck` clean, `pnpm test` 453 passed, integration suite
  69 files / 637 tests passed, web production build clean, auth E2E PASS
  (journeys 1-5), RLS E2E 55/55, plus a live browser pass against a local stack
  (badge 7 to 6 to 5 as items were cleared, approval visible as Approved on
  Command Center afterwards).

## 2026-09-27 — Auth close-out, dashboard welcome hub, Supabase RLS audit, Phase 0 baseline

- **Auth**: email-confirmation gate (403 `email_not_verified`), OAuth sign-in for
  GitHub and Google, dark auth surfaces with their own metadata, resend from
  `/check-email`. Verified by `scripts/auth-e2e.ts` against a real API and a real
  production build (API + web phases), including the four dashboard journeys.
- **Dashboard**: the Executive Agent now has a configurable name (default Atlas)
  and a first-run stage derived server side from persisted company-builder state:
  a new founder is welcomed and pointed at onboarding, a founder partway through
  sees the exact steps that remain, and a completed company sees oversight only.
- **Supabase audit**: `0033_rls_hardening` and `0034_fk_indexes` (34 indexes) plus
  the six missing org composites in `0031`; `scripts/rls-security-e2e.ts` runs 55
  adversarial checks as the real PostgREST roles. Neither new migration is applied
  to any environment yet: the DB Migrate workflow applies on push to `main`.
- **Web reliability**: `fetchWithAuth` timeouts, read retries and real error
  surfaces; goal and task actions no longer fail silently.
- **Launcher**: collision engine fixed, so both floating launchers stay apart and
  clear of the top bar at desktop and mobile widths.
- **Phase 0 baseline**: API + web typecheck clean, `pnpm -r test` green,
  `scripts/integration-suite.ts` runs the 36 database-gated API suites against an
  embedded Postgres (67 files pass, 18 skipped), web production build clean, auth
  E2E PASS, RLS E2E 55/55. 99 files committed in 10 logical commits.

## 2026-09-08 — Final polish round (profile, auth UX, legal, EA engineering delegation)

- **Legal & compliance**: `/privacy`, `/terms`, `/security`, `/ai-disclosure` pages with
  footer links; EU cookie-consent banner + `/settings/cookies` preferences page backed by a
  shared `lib/cookie-consent.ts` module (banner and page use one source of truth).
- **Auth fixes**: password visibility toggle preserves value/focus/cursor (uncontrolled
  input was the root cause); logout 405 fixed — POST form + session-invalidating GET
  fallback replaced the `<Link>` that sent GET to a POST-only route; sidebar user icon is a
  real account menu (Profile/Settings/Admin/Logout), consistent with the top-bar menu.
- **Admin governance**: Access Denied page (no silent redirect); server-side
  `admin.access_denied` audit events with hashed IP + request id; platform-role gating
  unchanged (`PLATFORM_ADMIN_EMAILS` or DB `platform_role`).
- **EA → Engineering Manager**: new `plan_engineering` tool delegates software objectives
  (capability search → team assembly → idempotent task creation) from the EA conversation.
- **Profile personalization**: `job_title`/`timezone`/`avatar_url` columns (migration
  `0022`, CI-applied) exposed via `/v1/auth/me` GET/PATCH; editable in Settings; one avatar
  identity rendered across Profile, TopBar, AppSidebar (initials fallback).
- **Registration UX**: client-side password-strength meter (advisory; local-only scoring;
  server policy unchanged).
- **Profile banner overlap fix**: cover made purely decorative, identity row moved into
  normal document flow, avatar overlap capped at half its height — no content can be
  obscured at any viewport; long names/titles wrap via break-words.
- **Assets**: sidebar/admin logo is an inline SVG `LogoMark` component, immune to the
  Vercel `/images/*` static 404s.
- **CI stability**: vitest excludes Playwright E2E specs (previously failing the CI unit
  run); 28 E2E specs parse via `playwright test --list` (browser install still blocked by
  CDN in the dev environment).

## 2026-09 — Company Health (T-01..T-04)

- New `services/company-health.ts`: deterministic 0-100 composite score from 6
  weighted live factors (goals, tasks, workforce, approvals, credits,
  connectors), each with explainable reasons ordered critical > warning > positive > info.
  Pure helpers (scoreGoals/scoreTasks/scoreWorkforce/scoreApprovals/scoreCredits/
  scoreConnectors/computeHealth) are unit-tested; the live aggregate
  getCompanyHealth() is org-scoped on every query and reuses anomaly-detector
  thresholds + reliability profiles + org-state aggregation.
- New `GET /v1/health` (requireAuth, org-scoped) + web proxy `/api/health`.
- New `/app/health` founder page: score ring, "why this score" reasons, factor
  breakdown with weights; sidebar entry under Command.
- 25 unit tests (thresholds, spikes, determinism, weighting, reason ordering).
- Master plan created: docs/ORQ8_IMPLEMENTATION_MASTER_PLAN.md (resumable ledger).