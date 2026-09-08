# ORQ8 Changelog

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