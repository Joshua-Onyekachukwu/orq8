# ORQ8 Security Audit — Baseline (Phase 0)

Date: 2026-10-12. Status: living document. Evidence over claims: every PASS below
names the test or file that proves it; anything unverified is marked PARTIAL.

## 1. Scope inspected

- `apps/api/src/routes/*` (all route files), `plugins/auth.ts`, `plugins/rate-limit.ts`
- `apps/api/src/services/*`: sessions, members, agents, autonomy, approvals,
  emergency-stop, task-executor, tool-registry, ea-execution-budget, audit, llm,
  model-router, providers, provider-health, webhooks
- `packages/db/src/schema.ts`, `supabase/migrations/*` (RLS lineage 0033/0049/0052/0053)
- `apps/api/api/index.ts` (serverless entry), `apps/api/vercel.json`, `apps/web` API proxies
- `.github/workflows/*` (ci, vercel-deploy, orq8-jobs, data-path-canary, nightly-rehearsal)
- `apps/api/test/*` (~60 files), `scripts/rls-security-e2e.ts`, `scripts/data-path-canary.mjs`

## 2. Authentication — PASS (verified by code + `auth.integration.test.ts` convention)

- Server-side sessions (ADR-007): Bearer token or `orq8_session` httpOnly cookie,
  looked up in DB, Redis-cached with revocation eviction (`plugins/auth.ts`,
  `services/sessions.ts`). Expiry + `revokedAt` checked per request.
- Email-verification gate enforced server-side in `requireAuth` for every route
  except an explicit allowlist (me/logout/verify/change-password). Not a page-level
  gate — verified in code; regression-covered in `auth.integration.test.ts`.
- Brute-force lockout on login with Retry-After (`routes/auth.ts` + `checkLoginAllowed`).
- Logout revokes server-side AND evicts Redis (documented 30-day cache TTL hazard).

## 3. Authorization — PARTIAL (one HIGH fixed this session, sweep incomplete)

- Convention `owner/admin` gates verified on: settings, credits, approvals admin,
  business-import apply/reject, member invitations/role changes, org details.
- **FIXED 2026-10-12 — R-001 agent-governance escalation (was: FAIL, now: PASS):**
  any org member could PATCH an agent's `authority` (spending limits, resource
  modification, approval exemptions), set `autonomyLevel: autonomous`, pause/archive
  agents, hire pre-authorized agents, run performance-action governance, and resume
  paused agents. Root cause: `routes/agents.ts` had zero role checks (authN only).
  Fix: owner/admin gates on POST custom authority/autonomy, PATCH
  authority/autonomy/status, performance-action, resume/resume-all.
  Proof: `test/agent-governance-gate.integration.test.ts` (2 tests) — failed 200
  before, passes 403/200-matrix after. Adjacent suites green: autonomy (28),
  approvals/jobs/focus (26), `tsc --noEmit` clean. Kill switch (emergency-stop)
  deliberately left open to all members.
- SWEEP 2026-10-12 (Phase 1.3, R-002): enumerated every mutating route (~120
  endpoints, 60 route files). Found 12 member-reachable privileged sites with no
  role check — provider API keys ×5, integrations ×3, agent-integration-access
  grant/revoke, integration-capability policy, MCP servers ×3, event-rules ×2,
  constitution, plan ratify/reject, company-builder activate, autonomous-template
  hire (R-001 bypass: `autonomous` sets requiresApproval=false), billing
  checkout/portal, ROI rate. All gated owner/admin, same `forbidden()`
  convention. Proof: `test/role-matrix-gates.integration.test.ts` 4/4 — 3 tests
  failed pre-fix (member got 400/200/201), pass post-fix; owner probes pass
  (no lockout) without touching Stripe/providers. Regressions: 136/136 across
  15 suites (governance, autonomy, abuse, approvals, jobs, providers, plans,
  templates, billing, entitlements, rate-limits); `tsc --noEmit` clean.
  Deliberately ungated (collaborative): dept/team/squad structure, capability
  register, connector-outcomes, notification seed, all daily-work endpoints.

## 4. Tenant isolation — PASS (two layers, both re-verified 2026-10-12)

- App layer: `orgId` always taken from the server session, never the client.
  Abuse-suite foreign-id sweep + role-matrix gates (R-001/R-002) prove denial.
- DB layer: `scripts/rls-security-e2e.ts` re-run 2026-10-12 — 59/59 PASS: full
  CRUD denial Company A→B (tasks, approvals, memory, departments, agents,
  audit, credits, memberships, jobs), anon default-deny, no self-escalation via
  membership writes. RLS verified on the migration lineage (embedded Postgres,
  real `authenticated`/`anon` roles) — prod applies the same lineage
  (0053/0054 confirmed live per docs/87; full prod-dashboard confirmation is
  R-005). Files: org-scoped reads + signed URLs/streaming, no public bucket.
  Residual: matrix extended 2026-10-12 to 69 checks covering
  files/invitations/organizations cross-org + unauthenticated + own-read
  sanity (`scripts/rls-security-e2e.ts`, wired into CI proof gate) — first
  green CI run pending next push; local run environment-blocked (orphaned
  machine SHM, sibling harnesses active).

## 5. AI execution governance — PARTIAL (server enforcement verified, injection untested)

- Authority model (can/spend/requires-approval/cannot) + autonomy levels enforced
  in `task-executor`/`autonomy.ts`, not in prompts. Approval policy for financial,
  external, irreversible, high-impact actions. EA execution budget + kill switch
  (`emergency-stop`). Audit trail via `appendAudit` on governance mutations.
- LAYERED DEFENSES ADDED 2026-10-12 (Phase 3.1, R-003→PARTIAL):
  `stripToolBlocks()` (`services/task-tools.ts`) neutralizes fenced tool-call
  blocks exactly mirroring what the executor parser reads; applied to tool
  outputs (`formatToolResultForPrompt`, + untrusted-data framing), memory /
  agent-memory / knowledge / recent-task / activity context
  (`buildContextPrompt`, + subordinate-to-system framing), and webhook
 Interpolated values (`interpolateTemplate` — attacker issue titles → task
  titles). Server registry (authority→approval→credits→audit) was already
  sound and is now pinned against smuggled params. Proof: unit battery 9/9
  (8 fail pre-fix) + echo-model end-to-end 2/2 — pre-fix the injected output
  forced the task to `awaiting_approval` with an attacker-address approval row;
  post-fix the task completes with zero attacker trace. 67/67 incl. task-tools,
  events, webhook-e2e, memory, approval suites; tsc clean.
- EA PATH CLOSED 2026-10-12 (R-003 residual narrowed): the EA built its own
  prompt in `executive-agent.ts` buildContextPrompt/formatOrgStructure from
  the same attacker-influenceable rows (memory via business imports, task
  titles via webhooks, agent/goal/team names via hire flows) with NO
  stripping — verified leaking on HEAD code (```tool block in EA prompt
  pre-fix, red check). Fix: stripToolBlocks on every DB-sourced
  interpolation (agents, goals, tasks, memory, founder analysis,
  decision/lineage/workforce/capability/strategy blocks, org-structure
  names) + memory-as-data framing; buildContextPrompt exported for testing.
  The EA dispatches tools only from structured intent.toolCalls (never by
  parsing prose), so stripping removes the smuggling channel with no
  capability change. Proof: `test/prompt-injection-ea.test.ts` 6/6 green
  (red on HEAD for the structure case); regressions 29/29 (layer-1 battery,
  task-tools, ea-budget) + 12/12 (echo-model e2e, approval-gated); tsc
  clean. REMAINING: persuasion without tool blocks (model judgment, needs
  LLM red-teaming), uploaded-document channel.

## 6. Infrastructure — PARTIAL

- Vercel hosts web + api; serverless entry `apps/api/api/index.ts` with prod-bundle
  guards (`boot.prod.test.ts`, `bundle.prod.test.ts`). CI lineage guard
  (`verify-ci-lineage.ts`), data-path canary, jobs workflow + worker fallback.
  Railway is legacy. Phase 2 must verify prod env separation, TLS, preview
  isolation, and secret scoping from live dashboards — NOT done from code alone.

## 7. Secrets — PASS with one founder setting (R-006 MITIGATED 2026-10-12)

- History (521 commits): no private keys, no live tokens — `ghp_` hit is a
  redacted placeholder in a setup doc, `eyJ` hits carry no values,
  `service_role` hits are SQL grants/docs. No `.env`/`.pem`/`.key` tracked.
- Worktree: no key patterns (`sk-live/ant`, `ghp_`, AWS, JWT) in source.
- Bundle: only public-safe `NEXT_PUBLIC_*` (URLs, anon/publishable keys,
  PostHog); service-role confined to API routes; `STRIPE_SECRET_KEY` appears
  only as a boolean presence check in server components.
- Logs: no credential/token/password logging in API source.
- Closed 2026-10-12: `.github/workflows/secret-scan.yml` runs gitleaks over
  full history + worktree on push/PR/weekly (YAML validated; `.gitleaks.toml`
  allowlists test fixtures by shapes a live key cannot match); existing
  `ci.yml` grep check left untouched. Rotation procedure at
  `docs/ORQ8_SECRET_ROTATION_PROCEDURE.md` (triage, per-credential blast
  radius/ordering, ENCRYPTION_KEY dual-read warning, rotation log).
  Residual: enable GitHub secret scanning + push protection (founder setting).
  No secrets are reproduced in this document.

## 8. Monitoring, response, recovery — PARTIAL (2026-10-12, R-009)

- Detection: `services/security-monitor.ts` aggregates the audit trail into
  typed signals (failed-login spike, lockout, tool-denial spike,
  approval-rejection spike; conservative thresholds) — 5/5 tests (1 red
  pre-fix). Scheduled via `POST /v1/internal/security/scan` (token-guarded,
  per-org loop, high signals written back as `security.signal_raised` audit
  rows) + daily cron in `orq8-jobs.yml`. Blind spot closed: lockouts now audit
  `auth.account_locked` (previously invisible). `auth` suite 30/30 after;
  events/webhook/boot 31/31; tsc clean.
- Response: `INCIDENT_RESPONSE.md` v1.1 — NDPA 72h track, breach decision log
  template, Vercel/Supabase/S3 escalation (Railway removed), rotation link.
  Contacts still founder-blank → plan is DRAFT until filled.
- Recovery: `docs/ORQ8_BACKUP_RESTORE.md` covers the REAL arch (Supabase PITR,
  Vercel rollback, S3 versioning) with RPO/RTO targets + drill template;
  `docs/53` (VPS/MinIO) marked superseded. First drill unrun (founder).
- Testing programme (Phase 8 started): CodeQL SAST (`security-extended`)
  on push/PR/weekly; secret scanning (gitleaks) same cadence; dep audit in CI.
  Missing: DAST, SBOM, pentest scope.
