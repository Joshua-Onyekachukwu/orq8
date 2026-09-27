# ORQ8 Changelog

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