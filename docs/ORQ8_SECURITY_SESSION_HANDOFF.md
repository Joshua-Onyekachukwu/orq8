# ORQ8 Security Session Handoff (2026-10-12)

## Current phase

Phase 0 complete (6/6). Phase 1.3 role matrix complete (R-002 MITIGATED
2026-10-12). Phase 3.1 layer-1 + EA path complete (R-003 narrowed
2026-10-12). RLS matrix extended 55→69 (R-004). Phase 4 groundwork + Phase 5 jurisdiction screen done
2026-10-12 (R-008 still OPEN — counsel + founder decisions pending).
Next: Phase 6 drafts, LLM red-team, or Phase 1-rest input/auth sweep.

## 2026-10-12 — Phase 3.1 EA-path closeout (R-003 residual narrowed)

- Found the open hole: EA built its own prompt (`buildContextPrompt` +
  `formatOrgStructure`, `executive-agent.ts`) from attacker-influenceable
  rows with zero stripping. Red-verified on HEAD code (```tool block
  survives into the EA prompt); EA dispatches tools only from structured
  intent.toolCalls, so stripping is capability-neutral.
- Fix: `stripToolBlocks` on all DB-sourced interpolations (agents, goals,
  tasks, memory, founder analysis, decision/lineage/workforce/capability/
  strategy, org-structure names) + memory-as-data framing; exported
  `buildContextPrompt` for tests. One self-caught edit duplication fixed
  before running anything.
- Proof: `test/prompt-injection-ea.test.ts` 6/6 (red on HEAD structure
  case); regressions 29/29 (layer-1, task-tools, ea-budget) + 12/12
  (echo-model e2e, approval-gated); `tsc --noEmit` clean. Scratch red-check
  files removed. `git stash` refused (pre-existing landing merge conflicts)
  — red proven via HEAD-copy scratch test instead; tree verified intact.
- RLS matrix 55→69 (files/invitations/organizations) recorded in AUDIT +
  R-004 (first CI green pending next push; local run env-blocked by
  orphaned SHM). Open: persuasion-without-blocks (LLM red-team), doc
  uploads.

## 2026-10-12 — Phase 4 privacy groundwork (R-008, still OPEN)

- New `docs/ORQ8_PRIVACY_DATA_INVENTORY.md`: 10-category personal-data
  inventory from the schema, controller/processor map, actual retention
  schedule, rights gap analysis, DPIA-trigger screen (DPIA recommended
  REQUIRED pre-pilot).
- Honest corrections to doc-38 claims: NO account/org delete path exists
  (§38.4 workflow unimplemented — only per-resource deletes +
  membership deactivation); NO memory classification column (§38.1
  unenforced — isolation is org-scope + RLS); provider training/retention
  UNVERIFIED (no opt-out headers in `llm.ts`); no DSR intake process.
- No code changes; no legal conclusions drawn (counsel).

## 2026-10-12 — Phase 5 jurisdiction screen (R-008, still OPEN)

- New `docs/ORQ8_JURISDICTION_APPLICABILITY.md`: two researcher passes
  over current sources (NDPC/GAID + DLA Piper/Mondaq; CPPA/EDPB/UK
  statute/state AGs) with verification limits stated inline.
- Outcome: NDPA APPLIES (72h breach, DSR rights now; tier/registration/
  CAR/DPO/DPIA/transfers need counsel — fee and threshold figures from
  secondary summaries marked UNVERIFIED); GDPR/UK GDPR and US states OUT
  OF SCOPE on current facts, with tripwires (EU/UK launch or tracking;
  Texas first-user re-check; ~2.5k-subject counsel tripwire).
- No code changes; jurisdiction conclusions await qualified review.

## 2026-10-12 — Phase 3.1 prompt-injection battery (R-003 → PARTIAL)

- Mapped untrusted paths into employee prompts: webhook payloads → task titles
  (`interpolateTemplate` raw), memory/agent-memory/knowledge excerpts
  (concatenated raw), tool outputs fed back raw each round, prior task results.
  Server registry verified sound (authority→approval→credits→audit per call).
- Defenses: `stripToolBlocks()` mirroring the executor parser; applied to tool
  outputs + memory/knowledge/activity context + webhook interpolation, with
  untrusted-data framing. Load-bearing `succeeded. Output:` marker preserved.
- Battery: unit 9/9 (8 red pre-fix) + echo-model e2e 2/2 — pre-fix the injected
  tool output forced `awaiting_approval` with an attacker-address approval row
  (founder-facing social-engineering surface); post-fix zero attacker trace.
  Caveat found while testing: object-output tools JSON-escape blocks by
  accident — the e2e uses a raw-string tool to test the real channel.
- Regressions 67/67 (task-tools, events, webhook-e2e, memory, approvals); tsc
  clean. NOTE: repo has an unrelated in-progress landing-page merge conflict
  from another thread — untouched; my files verified intact via grep.
- Open: persuasion-without-blocks (needs LLM red-team), EA path, doc uploads.

## 2026-10-12 — Phase 2 (part): secrets + RLS (R-004→MITIGATED, R-006→PARTIAL)

- Secret scan: 521-commit history (no live keys/tokens; ghp hit = redacted
  placeholder), worktree source (clean), bundle surface (public-safe only,
  service-role server-confined), logs (no credential logging). All `.env`
  ignored, none tracked. Gaps: no CI secret scanning, GitHub status unknown,
  no rotation procedure — needs founder decision.
- RLS: `scripts/rls-security-e2e.ts` 59/59 PASS on lineage (real roles,
  A→B CRUD denial, anon deny). Files org-scoped + signed URLs, no public
  bucket. Matrix gap: files/invitations/orgs policies exist, unexercised.
- No code changes; no secrets reproduced anywhere. Production dashboard
  cross-check (R-005) still founder-owned.

## 2026-10-12 — R-006 closeout + Phase 7/8 (R-009→PARTIAL)

- R-006 MITIGATED: `.github/workflows/secret-scan.yml` (gitleaks full-history
  + worktree, push/PR/weekly, YAML-validated) + `.gitleaks.toml` (fixture
  shapes a live key cannot match) + `docs/ORQ8_SECRET_ROTATION_PROCEDURE.md`
  (triage, blast radius/ordering per credential, dual-read warning, log).
  Residual: GitHub push-protection toggle (founder). `ci.yml` untouched.
- Phase 7: `services/security-monitor.ts` (4 signal types, read-only) + 5/5
  tests; `POST /v1/internal/security/scan` + cron in `orq8-jobs.yml` (YAML
  validated; `JobKey` extended); lockout now audits `auth.account_locked`;
  regressions: auth 30/30, events/webhook/boot 31/31, tsc clean.
- IR v1.1: NDPA track, decision log, Vercel/Supabase/S3 escalation, contacts
  flagged founder-blank (DRAFT until filled). DR: new `ORQ8_BACKUP_RESTORE.md`
  for real arch (53 marked superseded); first drill unrun.
- Phase 8 started: CodeQL SAST workflow (`security-extended`, YAML-validated).
  Missing: DAST, SBOM, pentest scope, signal→notification wiring.

## 2026-10-12 — Phase 1.3 role-matrix sweep

- Enumerated ~120 mutating endpoints across 60 route files (mutation count ×
  role-ref count per file). Found 12 privileged sites with authN but no authZ.
- Gated (owner/admin, `forbidden()` convention): provider keys ×5, integrations
  ×3, agent-access grant/revoke, capability policy, MCP ×3, event-rules ×2,
  constitution, plan ratify/reject, company-activate, autonomous-template hire,
  billing checkout/portal, ROI rate. 10 route files, 25 gates.
- Red→green: 3/4 new tests failed pre-fix, 4/4 pass post-fix. `tsc` clean
  (after fixing test-helper payload typing). Regressions 136/136, 15 suites.
- Left open by recorded decision: dept/team/squad structure, capability
  register, connector-outcomes, notification seed (see RISK_REGISTER).

## Work completed

- Inspected: auth plugin, all agent/member/auth routes, sessions/members/agents/
  autonomy/approvals/executor/tool-registry/budget/audit/LLM services, DB schema,
  RLS migrations, Vercel + CI configuration, ~60 test files.
- Found + fixed R-001 (P1): member agent-governance escalation in
  `apps/api/src/routes/agents.ts` — 5 owner/admin gates (hire-with-authority,
  PATCH authority/autonomy/status, performance-action, resume/resume-all).
  Emergency-stop intentionally left open (kill switch).
- Wrote Phase 0 docs: AUDIT, RISK_REGISTER, THREAT_MODEL, DATA_FLOW_MAP,
  ROADMAP, this HANDOFF.

## Tests executed and results

- New `agent-governance-gate.integration.test.ts`: FAILED before fix (member PATCH
  authority → 200, proving vuln), 2/2 PASS after.
- Regressions: autonomy/abuse 28/28 · approvals/jobs/focus 26/26 · `tsc` clean.
- (Pre-existing embedded-postgres teardown warning `done is not a function` —
  cosmetic, after results; not a code issue.)

## Files changed

- `apps/api/src/routes/agents.ts` (gates only, no schema/behavior change otherwise)
- `apps/api/test/agent-governance-gate.integration.test.ts` (new)
- `docs/ORQ8_SECURITY_{AUDIT,ROADMAP,THREAT_MODEL,DATA_FLOW_MAP,RISK_REGISTER,SESSION_HANDOFF}.md` (new)

## Outstanding / blockers

- R-002…R-009 OPEN (see RISK_REGISTER). No secrets touched, none printed.
- Founder/counsel decisions: legal engagement (R-008), rotation auth if live
  secret surfaces (R-006), pilot risk owner (Phase 11).

## Next steps

1. Phase 1.3: enumerate every mutating route × role, add gate tests.
2. Phase 3.1: prompt-injection battery (highest-risk open item).
3. Phase 2: secret scan + RLS re-run vs prod.
