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