# ORQ8 Changelog

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