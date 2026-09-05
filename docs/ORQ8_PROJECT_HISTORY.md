# ORQ8 — Project History

Permanent chronological record of ORQ8's evolution. Companion to `docs/ORQ8_CURRENT_STATE.md`.
A new engineer should be able to read this file (plus CURRENT_STATE and `.env.example`) and
understand how ORQ8 was built, why decisions were made, and what remains — without reading
chat history. Never delete entries; superseded work is documented, not erased.

---

## Foundations (pre-history — captured as known baseline)

- **Architecture**: pnpm monorepo — `apps/web` (Next.js App Router), `apps/api` (Fastify,
  serverless-compatible, deployed as a Vercel serverless function), `packages/core` (env config
  via zod, shared validation), `packages/db` (Drizzle schema; source of truth).
- **Stack**: TypeScript strict, drizzle-orm + node-postgres, Supabase (auth + Postgres), Redis
  (optional; in-memory fallback), pino logging.
- **Domain**: Founder → Executive Agent → Departments → Teams → AI Employees → Goals → Tasks →
  Tools → Approvals → Company Memory → Reporting. 40+ tables, 66+ endpoints.
- **AI runtime**: Model Router (`services/llm.ts`) — NVIDIA NIM (multi-key pool, round-robin,
  failover on 401/403/404/429), OpenRouter (multi-key), LiteLLM, Ollama fallback chain; model
  fallback lists; timeout budgets (`LLM_TIMEOUT_MS`, `LLM_HEADERS_TIMEOUT_MS`).
- **Quality loop**: quality pipeline, QA evaluator, failure analyzer, learning system
  (episodic/semantic/procedural capture), llm-tracer.
- **Real-time**: SSE (`services/realtime.ts`) — `/v1/events` requires auth, per-org connection
  buckets, per-user cap (8), heartbeats, org-scoped broadcast. Web side: shared single
  EventSource via `lib/realtime-client.ts` proxied through `/api/events`.
- **Deployment**: Vercel (`orq8.vercel.app` — the only live URL; `orq8.com` is a parked
  registrar page, `orq8.app` does not resolve). Production DB migrations ship as **idempotent
  SQL in `supabase/migrations/`** (drizzle journal is out of sync with the prod schema — never
  generate-and-run drizzle migrations against prod).

---

## Session Log

### 2026-09-XX — Global text contrast fix (ORQ8-8)

**Original problem**: Secondary text rendered white-on-white across cards/tables/buttons —
dashboard StatCard labels ("AI Employees", "Tasks", …) and subtexts ("1 total", "0 completed",
"0% used", "This week") were invisible.

**Root cause**: Tailwind v4 `@theme inline` mapped `--color-muted: var(--muted)`, so the
generated `.text-muted` utility painted **text** with the near-white **background** token
(`--muted: #f5f5f5`). Same class of bug for opacity variants (`text-muted/30` → color-mix of
the near-white token ≈ 1.2:1).

**Fix (design-system layer)**: `apps/web/app/globals.css` adds **unlayered** overrides that win
over Tailwind's `@layer utilities` rules per the CSS Cascade Layers spec:
`.text-muted { color: var(--muted-foreground, #737373) }`, `hover:`/`group-hover:` variants,
and baked-alpha `/30 /40 /50 /60` variants. `--muted` untouched (bg-muted stays pale); `.dark`
tokens unchanged.

**Verification**: web build passes; compiled bundle contains both rules with the override
unlayered; headless Edge + CDP against the live page computes `rgb(115,115,115)` (4.65:1 AA);
live bundle verified post-deploy. Commits: `a6c1e4e` (fix), `55d8b53` (deployment marker).

**Follow-up live investigation (later)**: user still reported broken text. Re-verified live —
served bundle (hash `3654d1140b58dbde.css`) provably contains the override and a real browser
computes `rgb(115,115,115)` for `.text-muted` on the live page; no competing rules in any of
the 4 served CSS bundles. Conclusion: live fix is genuine; residual reports are stale browser
cache (hard refresh / incognito). Also fixed one genuine remaining faint label
(admin/execution timestamp `text-ink-faint` → `text-ink-muted`). Added a live-site
verification harness (CDP probe) — artifacts removed after use.

---

### 2026-09-XX — Department / Team / AI Employee management, navigation, mobile & logo fixes

**Original problem**: Founder could not manage the org directly; Teams did not exist anywhere
in the backend; sidebar had a mislabeled Departments link pointing at `/app/teams`; mobile menu
toggle was a bottom-pinned FAB (`fixed bottom-4 left-4`); Executive Agent had no team awareness;
production static assets (logos) 404'd.

**Changes**:

- **DB**: `packages/db/src/schema.ts` — `teams` table + `agents.team_id` FK + `Team`/`NewTeam`
  exports. Production migration `supabase/migrations/0003_add_teams.sql` (idempotent; teams
  table, `team_id` column guard, RLS org-member policy, `updated_at` trigger — mirrors the
  departments migration `0002_add_departments_and_authority.sql`). A drizzle-generated migration
  was created and then **discarded** because the drizzle journal is out of sync with prod
  (it would have re-created existing tables).
- **API**: `services/teams.ts` + `routes/teams.ts` — org-scoped CRUD, member/active counts,
  duplicate-name checks, delete guarded when agents are assigned (409), audit events
  `team.created/updated/archived/deleted`; registered in `app.ts`. `routes/agents.ts` — hire
  accepts `teamId` (or team name with auto-create), PATCH reassign validates in-org +
  department/team consistency, audit `agent.reassigned/paused/resumed/renamed/updated`.
  `services/agents.ts` — pre-migration-safe `teamId` + `teamName` attach. `services/agent-context.ts`
  — Executive Agent resolves team membership (name + owning department). Departments: create
  supports `head`; PATCH accepts `status` (archive) — previously zod silently stripped it.
- **Web**: `/api/teams` + `/api/teams/[id]` proxies; `/api/departments` gained POST;
  `/api/departments/[id]` PATCH/DELETE. Real Teams page and real Departments page (create/edit/
  archive/delete with confirmation + member warnings). Agents page: team in hire form + cards.
  Agent detail: team in header + CommandBar context (`teamName` added to `CommandContext`).
  Org Explorer: Founder → Department → Team → Agents grouping.
- **Navigation/mobile**: `app-sidebar.tsx` — correct Organization group (AI Employees,
  Departments, Teams, Goals & Tasks, Org Explorer); removed bottom FAB; listens for
  `orq8:toggle-sidebar` event. `admin-sidebar.tsx` — same listener. `top-bar.tsx` — hamburger
  (`lg:hidden`) in the sticky top bar dispatches the event. Menu control is now always at the
  top of the viewport.
- **Logo/static assets (production)**: root `vercel.json` set `outputDirectory: ".next"`, which
  makes Vercel serve ONLY `.next` — `public/` (logos, hero assets) was never deployed
  (verified: `/images/logo-white.png` → 404 live while `/` and `/_next/static/*` → 200).
  **Fix**: removed `outputDirectory` so the Next.js builder includes `public/`. All referenced
  assets (`logo-white.png`, `logo-dark.png`, `logo.svg`, `icons/quote.svg`, …) exist locally and
  resolve in code. Takes effect on next deploy.

**Verification**: API typecheck clean (my files), web typecheck clean, web production build
passes (92 pages), API tests 186 passed. Deployment NOT performed (no Vercel CLI auth in
environment) — `supabase/migrations/0003_add_teams.sql` must be applied and the app redeployed.

---

### 2026-09-XX — Phase 8–16 foundation completion pass (compilation, security, bug fixes)

**Original problem**: In-progress Phase 8/9/15 code (integrations, engineering, simulation,
analytics) existed but failed typecheck (~30 errors), contained a P0 (plaintext OAuth tokens)
and an IDOR bug, plus a runtime crash in simulation.

**Changes**:

- **P0 — Secrets at rest**: new `apps/api/src/services/crypto.ts` — AES-256-GCM (`aes-256-gcm`)
  encrypt/decrypt; key from `ENCRYPTION_KEY` (sha256-derived; dev fallback warns loudly);
  payload `v1:<iv>:<tag>:<ciphertext>` base64. `setCredentials` now encrypts before storing;
  `decryptCredentialSecret()` helper added. Never logs secrets.
- **P1 — IDOR**: `services/engineering.ts` `getPr` compared `repository_id` to `org_id`
  (wrong). Now resolves PR → verifies its repository belongs to the requesting org.
- **Phase 15 runtime crash**: `services/simulation.ts` referenced undefined `proposedWeekly`
  (was `projectedWeekly`) in the risk check — fixed.
- **Type safety**: `routes/integrations.ts` zod-validated PATCH/oauth-callback/connect bodies;
  `publicRef ?? null`; missing `desc` import; jsonb capability casts; removed leftover Korean
  text. `routes/engineering.ts` `z.record` 2-arg calls, `lastSyncAt` on branches, nullable
  `sha`/`language`, `statusMap[...]!`. `routes/simulation.ts` zod PATCH body + clean typed
  run-input parsing. `routes/analytics.ts` missing `validation` import + `z.record` 2-arg.
- **Tests**: new `apps/api/test/crypto.test.ts` (6 tests — round-trip, IV uniqueness, wrong
  key, tamper detection, malformed payloads, UTF-8).

**Verification**: API typecheck **0 errors**; API tests **192 passed / 0 failed** (25 files;
18 DB-dependent integration files skip without Supabase credentials); web typecheck clean.

**Honest status at this point**: Phases 8–16 are **partially complete**, not complete. Real:
encrypted credential storage, integration capability model + enforcement, engineering data
layer + org-scoped CRUD + PR decision flow, simulation heuristic engine with apply gating,
SSE with org isolation. NOT done: real provider OAuth exchange (needs `GITHUB_CLIENT_ID/SECRET`
etc.), sandboxed command executor, webhooks, business import, voice, Monaco, load tests,
production E2E, deployment.

---

### 2026-09-XX — Task 1: Real GitHub OAuth (code + tests; live creds pending)

**Original problem**: the OAuth callback was a stub — it validated the code but never
exchanged it, never stored tokens, and had no authorize URL, state, health, or disconnect.

**Architecture chosen**: stateless HMAC state (no Redis dependency), server-side exchange,
encrypted storage reusing `services/crypto.ts`, org-scoped routes. Details and verification in
`docs/ORQ8_CURRENT_STATE.md` §5.1.

**Files changed**: `packages/core/src/config.ts` (+`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`),
`apps/api/.env.example` (GitHub OAuth block), `apps/api/src/services/oauth.ts` (new),
`apps/api/src/routes/integrations.ts` (authorize/callback/health/disconnect replacing the
stub), `apps/api/src/services/integrations.ts` (+`deleteCredentials`),
`apps/api/test/oauth.test.ts` (new, 19 tests).

**Verification**: API typecheck 0 errors; full API suite 211 passed / 0 failed; web typecheck
clean. Live E2E blocked on `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (create a GitHub OAuth
App; callback URL `<APP_URL>/api/integrations/callback/github`).

**Also this session**: created `docs/ORQ8_PROJECT_HISTORY.md` + `docs/ORQ8_CURRENT_STATE.md`
(the two permanent records) and completed the environment/secret audit (master inventory in
CURRENT_STATE §6).

---

### 2026-09-05 — Event ingestion, semantic memory, executive briefing & contrast protection

**Original problem**: the roadmap's keystone layers were design-documented but absent — no
webhook receivers or durable events, no event→rule→approval→task pipeline, no structured
connector outcomes, no semantic (pgvector) memory retrieval, no consolidation, no daily
executive briefing, and no automated guard against the class of contrast regression that
broke the dashboard.

**Architecture chosen**: reuse the existing DB-as-queue + `INTERNAL_TOKEN` cron pattern
(waitlist drip) for all scheduled work; store webhook secrets encrypted in org settings
(generated per-org, no env var); org resolution for receivers via repo→org mapping (GitHub)
and URL-embedded org (Linear); JS-side cosine ranking with the HNSW index available for
future SQL-side search; deterministic briefing content (no LLM dependency) from real
operational tables.

**Files changed (this session)**:

- `packages/db/src/schema.ts` — `webhookEvents`, `eventRules`, `connectorOutcomes`,
  `briefings` tables + `companyMemory.embedding vector(768)` (HNSW index) + type exports.
- `supabase/migrations/0004_add_events_rules_outcomes_briefings.sql` — idempotent prod
  migration (pgvector extension, 4 tables, RLS org-member policies, updated_at trigger,
  embedding column guard + HNSW index).
- `apps/api/src/services/webhooks.ts` (new) — `verifySignature` (HMAC-SHA256, timing-safe,
  GitHub prefix), `verifyTimestamp` (replay window, skew-tolerant), `generateWebhookSecret`,
  `normalizeProviderEvent` (GitHub PR/issue/comment/push, Linear Issue), `ingestWebhookEvent`
  (idempotent), encrypted per-org secret store/rotate, `processPendingEvents` (rules →
  notify / approval-gated task / ignore; bounded retries → dead-letter), `upsertRule`,
  `resolveOrgByRepoFullName`.
- `apps/api/src/services/embeddings.ts` (new) — OpenAI-compatible embedding client
  (`EMBEDDING_BASE_URL`/`MODEL`/`API_KEY`) with graceful null fallback, `cosineSimilarity`,
  `parseVector`, `searchSemantic` (org-scoped, threshold + limit).
- `apps/api/src/services/memory.ts` — `findByOrg` semantic-first with keyword fallback;
  `createMemory` best-effort embedding.
- `apps/api/src/services/consolidate-memory.ts` (new) — exact-duplicate merge (importance
  folded, audit record, kept row wins), near-duplicate promotion (≥0.95 cosine), per-org
  isolation, `orgIdsWithMemory`.
- `apps/api/src/services/briefing.ts` (new) — `dayStart`, `isAging`, `isQuietContent`,
  `buildBriefingContent` (real stats: tasks, approvals, goals, outcomes, events, paused
  agents, anomalies), `generateDailyBriefing` (idempotent per org+kind+period; in-app
  notification + email via existing transport when prefs allow), `runDailyBriefings`.
- `apps/api/src/services/integrations.ts` — `recordOutcome`/`listOutcomes` (structured
  connector outcome capture).
- `apps/api/src/routes/events.ts` (new) — `POST /v1/webhooks/github` (repo-resolved),
  `POST /v1/webhooks/linear/:orgId` (org-embedded), `POST /v1/integrations/:id/webhook-secret`
  (owner/admin), `GET /v1/integrations/:id/webhook`, `GET/PUT/DELETE /v1/event-rules`,
  `GET/POST /v1/connector-outcomes`, and internal hooks `POST /v1/internal/events/process-pending`,
  `/v1/internal/memory/consolidate`, `/v1/internal/briefings/daily` (INTERNAL_TOKEN).
- `apps/api/src/app.ts` — registered event routes; **raw-body-capturing JSON parser override**
  (webhook HMAC needs the exact signed bytes; malformed JSON → 400 envelope).
- `packages/core/src/config.ts` + `apps/api/.env.example` — `EMBEDDING_BASE_URL`/
  `EMBEDDING_MODEL`/`EMBEDDING_API_KEY` (optional; unset = keyword fallback).
- `.github/workflows/orq8-jobs.yml` (new) — events every 5 min, consolidation 06:30 UTC,
  briefings 07:00 UTC.
- `apps/web/scripts/contrast-check.mjs` (new) + `test:contrast` script — resolves
  `--muted-foreground` vs white (WCAG math, 4.74:1) and bans faint text classes
  (`text-ink-faint`, `text-gray-200/300/400`) in `app/`+`components/` (single documented
  allowlist entry: the decorative top-bar `·` separator).
- UI sweep (light-surface fixes): `admin/model-router` (2× `text-ink-faint` →
  `text-ink-muted`), `admin/execution` (2 icons), `admin/errors` (1 icon),
  `notifications-bell` (Bell icon gray-400 → 500), `landing/Common/PricingComparison`
  (information-carrying X mark gray-300 → 500), `top-bar` (LogOut icon gray-400 → 500).
- `docs/ORQ8_STYLE_GUIDE.md` (new) — semantic tokens, light/dark rules, WCAG AA requirements,
  prohibited patterns, examples.

**Tests added** (55 new; pure-unit, no DB): `test/events.test.ts` (signatures, replay window,
normalization, templates), `test/embeddings.test.ts` (cosine, vector parsing, fallback),
`test/consolidate-memory.test.ts` (normalization, duplicate clusters, thresholds),
`test/briefing.test.ts` (day boundary, aging, quiet detection), `test/app-boot.test.ts`
(boot + raw-body parser + receiver 400s without DB).

**Verification**: API typecheck 0 errors; API tests **266 passed / 0 failed** (was 211); web
typecheck clean; web production build passes; `test:contrast` PASS. **Known gaps**: no live
provider E2E (no creds); connector ACTION handlers not yet implemented; briefing email needs
SMTP/Resend configured in prod; migration `0004` must be applied to prod DB before deploy.

### 2026-09-05 — Executor, simulation apply, exec-agent structure, org integration tests, contrast self-check

**Original problem**: remaining Phases 8–16 gaps — the engineering sandbox was record-only
(no actual command execution), simulation "apply" merely flipped a state flag (no
materialization, no approval gate), goals/tasks had no `team_id`, the Executive Agent's
context had no department/team structure (so "which team owns this?" was unanswerable),
there was no team/department/agent integration test suite, and contrast protection covered
source scans but not rendered computation or dark mode.

**Architecture chosen**: reuse the existing approval gate for simulation apply (first apply
call creates the pending approval — nothing is created; after founder approval the next apply
materializes inside one transaction, idempotent by org+name lookups with provenance in
`agents.config`); a subprocess boundary that is honest about its limits (per-org scratch dir,
tree-kill timeout, ulimit CPU/memory, output caps, env allowlist, path containment, audit —
container/gVisor documented as the remaining production boundary); `shell: true` with a single
command string (the only quoting-safe spawn on Windows — an args array mangles inner quotes
via cmd /s /c); compact deterministic `OrgStructure` for the exec agent with per-team
active/blocked(failed)/overdue aggregates; API-level integration tests with real Bearer
sessions plus RLS tests via `request.jwt.claims` emulation; dev-only rendered contrast
self-check plus a token-pair audit extended to the dark theme.

**Files changed (this session)**:

- `apps/api/src/services/executor.ts` (new) — `executeCommand` boundary + `toSafeSummary`,
  `validateCommand`, `assertInsideSandbox`, `scrubEnv`, `killTree`; 22 tests
  (`test/executor.test.ts`).
- `apps/api/src/routes/engineering.ts` — `POST /v1/sandbox-runs` now actually executes
  (server-determined scratch `working_dir`, persists stdout/stderr/exitCode/resultSummary,
  audits `sandbox.run.*`); `updateSandboxRun` accepts `workingDir`.
- `apps/api/src/services/simulation.ts` — `saveProposal` (named structured proposal),
  `OrgProposal` types, approval-gated `applySimulation` (pending→create approval only;
  approved→transactional materialization of departments/teams/agents/goals with
  `simulation.apply.*_created` audits + provenance; already_applied no-op), exported
  `riskFromSimulation`/`buildApprovalDescription`; `packages/db/src/schema.ts` +
  `supabase/migrations/0007_add_simulation_proposal.sql` (proposal jsonb column).
- `apps/api/src/routes/simulation.ts` — `POST /v1/simulations/:id/proposal` (zod-validated,
  duplicate-name rejection) + apply result mapping (202 pending_approval / 400 rejected /
  applied / already_applied).
- `apps/api/src/services/executive-agent.ts` — `buildOrgStructure` + `formatOrgStructure`
  (departments, teams with owner/members, per-team work flags, unassigned count, org-scoped
  task aggregates), injected into `buildContextPrompt`; tests
  (`test/executive-agent-context.test.ts`).
- `test/org-structure-integration.test.ts` (new) — API create/reassign/pause/archive,
  cross-org 401/404, foreign-departmentId 400, RLS direct-SQL; `test/simulation.test.ts`
  (new) — pure helpers + DB-gated apply flow (gate → approve → materialize → idempotent
  re-apply → reject).
- Task 8 — `packages/db/src/schema.ts` + `supabase/migrations/0006_add_team_id_to_goals_tasks.sql`
  (`team_id` on goals+tasks, `onDelete: set null`, indexes), goals API `teamId`
  create/update with in-org validation + `team_id` filter, web proxy forwards params
  (`app/api/goals/route.ts`), team cards show Goals & Tasks (`app/app/teams/page.tsx`).
- `apps/web/components/contrast-self-check.tsx` (new) — dev-only rendered contrast
  diagnostic (computed styles, nearest non-transparent background, AA 4.5, visible alert on
  failure, nothing in production); `data-contrast-check` attributes on dashboard stat cards.
- `apps/web/scripts/contrast-check.mjs` — dark-mode token audit: parses `@theme` palette +
  `:root` + `.dark` blocks, asserts 9 semantic pairs ≥ 4.5:1 (light ink/ink-muted/muted/
  foreground on card; dark muted/foreground on card + background; emerald CTA).

**Bugs found & fixed**: (1) cmd.exe quoting destroyed `node -e "…"` args via args-array spawn
(empty script, exit 0) — switched to `shell: true` single-string spawn (verified by test);
(2) vitest `beforeAll` at module level runs even under `describe.skip` — moved hooks inside
the skip-gated describe; (3) `AuditInput` has no free-form `detail` — structured context goes
in `resultRef` (JSON, per existing convention); (4) contrast script failed to resolve tokens
because the palette lives across multiple `@theme` blocks and `@theme {` ≠ `@theme inline {`
— parse all blocks, optional `inline` modifier.

**Verification**: API typecheck 0 errors; API tests **296 passed / 0 failed** (224 DB-gated
skipped locally — no Postgres in this environment; run against infra compose/Supabase in CI);
web typecheck clean; web production build passes; `test:contrast` PASS (9 light+dark pairs).
**Not done / blocked**: live-DB integration runs (no local Postgres), connector action
handlers, live provider E2E (no creds), briefing email needs SMTP/Resend in prod.

---

## Superseded / corrected decisions

- **Drizzle migrations vs production**: never run `drizzle-kit generate` against prod; the
  journal diverged. Ship idempotent SQL under `supabase/migrations/` (convention established in
  `0002_add_departments_and_authority.sql`, followed by `0003_add_teams.sql`).
- **`orq8.com` is not the product**: it is a parked registrar page. The live site is
  `orq8.vercel.app`. No custom domain is configured. Any "live site" claim must reference
  `orq8.vercel.app` unless a domain is later configured.

---

## Environment variables (see also CURRENT_STATE §Environment Audit)

Required/production: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SESSION_SECRET`, `ENCRYPTION_KEY`, `AUTH_SECRET` (web), `API_URL`/`NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`,
`NEXT_PUBLIC_POSTHOG_HOST`. AI: `NVIDIA_API_KEY` (+`_KEYS` pool), `OPENROUTER_API_KEY`,
`OLLAMA_BASE_URL`. Optional: `REDIS_URL`, `SMTP_*`/`RESEND_API_KEY`, `S3_*`, `STRIPE_*`,
`INTERNAL_TOKEN`, `PLATFORM_ADMIN_EMAILS`. Connectors (not yet configured):
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (see CURRENT_STATE, Task 1).