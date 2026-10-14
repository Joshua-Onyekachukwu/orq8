# ORQ8 Service Verification Report — 2026-10-12

Live evidence only. Prior-session context: `docs/90_MASTER_AUDIT_SESSION.md`, `docs/68_REQUIREMENT_MATRIX.md`, `docs/82_DEPLOYMENT_RUNBOOK.md`.

## Verdicts

| Service | Role | Status | Evidence (today) |
|---|---|---|---|
| GitHub / Actions | source, CI/CD | WORKING | CI 11/11 SUCCESS on `ce9d17a`; scheduled-jobs green |
| Vercel (`orq8.vercel.app`) | web host | WORKING | release build READY, domain serves it, 65/65 assets 200 |
| Railway API (`-062a`) | API host | WORKING | `/healthz` + `/readyz` 200 |
| Railway worker (`@orq8/worker`) | job drain | UNVERIFIED live, WORKING in CI | prod `agent_jobs`/`tasks` empty (zero workload — nothing to drain, nothing stuck); drain proven by CI founder-loop + proof gate, not prod traffic |
| Supabase Postgres | system of record | WORKING, ledger gapless | 2026-10-13: 0053/0054/0056/0057 found physically applied, ledger backfilled with module-verified checksums; 0055 found NOT applied (all seven drop-targets present) → founder-approved, applied, re-probed clean (7 drops gone, 7 narrow policies + 4 FK indexes present), ledger row recorded. `plan_revisions` RLS enabled (verified). RLS matrix extended 55→69 checks, wired into CI proof gate; 2026-10-13 pm run 75/75 including the new 0055 catalog pair |
| OpenRouter | primary LLM | WORKING | models-list healthy (988ms); live `gpt-4o-mini` completion exact output (1.2s) |
| NVIDIA NIM | fallback LLM | WORKING | models-list healthy (727ms, 5-key pool); live nemotron completion correct at normal budgets |
| Ollama / LiteLLM | dev providers | DOWN (by design) | nothing listening locally; correctly last in chain |
| Email (Resend/SMTP) | transactional mail | BLOCKED | no provider secret in prod; code ready (`transport.ts` Resend + SMTP + provider check); release gate BLOCKED on `email` |
| Redis/Upstash | rate-limit sharing | MISSING (optional) | in-memory fallback active; correct on single API instance |
| Error monitoring (Sentry) | alerts | WIRED, dormant until configured | `SENTRY_DSN` unset = logs only; `services/error-reporting.ts` scrubs PII/bodies, loads `@sentry/node` by dynamic import only when set; boot-wired in API + worker. Verified 2026-10-13 by import: scrub redacts email/bodies/drops `user`, no-DSN init returns false |
| Old Railway hosts | dead | UNUSED (correct) | edge 404; dev-script defaults repointed to `-062a` |

## Session evidence 2026-10-13 (pm)

- **Landing merge conflicts resolved:** 13 files / 55 blocks resolved to upstream (stashed WIP referenced dead `orq8-*` tokens with zero defs in `globals.css`, and its staged page imported a `FoundingCohort` component that exists nowhere). Zero unmerged paths; the WIP survives in `stash@{0} \(landing-copy-wip-before-revert\)` for a proper token-aware revival. Web `tsc --noEmit` fully clean afterward.
- **RLS proof hardened for 0055:** two catalog checks added to `scripts/rls-security-e2e.ts` (broad seven absent, narrow seven present) — guards against a repeat wrong-direction backport. Live run: **75 passed, 0 failed**, both new checks green.
- **MVP-008 live proof:** new kept script `scripts/first-value-proof.mjs` against the review stack (rebuilt web + rebooted stack): **14/14** — seeded org dismisses, fresh org welcomes without checklist, first hire raises it with step 1 Done, first completion dismisses it, all from server-rendered HTML. (One real find en route: the first run tested a stale pre-edit build — the proof now guards the actual behavior.)
- **MVP-020 built and proven 2026-10-13 (pm):** `apps/api/src/services/demo-seed.ts` (records-only Northwind Labs: 3 depts + focus blueprints, 3 agents within the trial cap, 2 goals, 5 tasks, 1 approval, 3 deals, 3 tickets, 2 decisions, activity; no money, no execution, no privilege changes) + `POST /v1/demo-company` (owner/admin, empty-org-only, once per org via `isDemo`, both outcomes audited) + hub `SeedDemoButton` + web proxy. Proven: integration 4/4, live API 201 with readable boards + reseed 409 `already_demo`, member 403, web path welcome → button → 201 → `Demo data` badge; `first-value-proof.mjs` regression still 14/14; API tsc shows only the 6 pre-existing optional-dep errors, web tsc + build clean.

## Full-codebase review findings 2026-10-13 (pm, in progress)

- **Fail-closed fix — `/v1/internal/migrate*` hardcoded fallback token:** `apps/api/src/routes/migration.ts` fell back to `'orq8-internal-migrate-2026'` when `INTERNAL_TOKEN` was unset — a public password on a raw-DDL endpoint with zero in-repo callers. Now refuses when unset (behavior unchanged when set). Proven by new `test/migration-guard.integration.test.ts` (3/3).
- **Untracked 5 MB stale bundle:** `apps/api/api/index.js` (committed Oct 12, predates current routes, referenced by nothing — deploys run `tsx src/index.ts`) removed from tracking + gitignored. It had also been polluting code search.
- **Silent suite skips under load:** full API run showed 8 files skipped via 1.5 s pool-probe timeouts; all pass alone. Bumped the shared probe boilerplate to 10 s across 63 test files (mechanical, comment-marked).
- **Two suite failures fixed at cause:** `env-surface` (SENTRY_* keys added by the observability session were undocumented → added to `.env.example`); `error-reporting` scrubber kept the `request` container while its own test + header comment promise wholesale drop → `request` added to the drop list. Both files 15/15 after.
- Auth-surface audit: admin (platform-role gate), webhooks (HMAC), billing webhook (Stripe signature), migration (internal token, now fail-closed), auth routes (public only where passwordless flows require) — no open surface found.
- **Clean full API suite 2026-10-14 ~00:05 UTC: 130 files passed / 1 skipped, 1041 tests passed / 3 skipped, 0 failed.** The single skip is `boot.prod` (needs real SESSION_SECRET/ENCRYPTION_KEY — legitimate). An earlier 7-failure run during this session was self-inflicted load contamination (subset suites run concurrently with the full run); all 7 pass alone and in the clean run. The 10 s probe bump held: zero dbUp-gate skips.

## Probe scripts (kept in tree)

- `apps/api/scripts/pico-provider-probe.ts` — free models-list health per provider, no key material in output.
- `apps/api/scripts/pico-capability-ping.ts` — one tiny completion per provider (fractions of a cent).

## Config cross-checks (verified by inspection, 2026-10-12)

- `apps/api/railway.json` ↔ `apps/api/Dockerfile`: match. Builder DOCKERFILE with `dockerfilePath apps/api/Dockerfile`; `startCommand /start-railway.sh` equals the Dockerfile CMD; the script runs `migrate:supabase` then starts the API — migrate-then-serve on both paths, no drift. Closes former blocker 3.
- `apps/worker/Dockerfile` (CMD `pnpm --filter @orq8/worker start`) + `infra/docker-compose.yml` (`orq8-api`/`orq8-worker`, independent scaling, SKIP LOCKED) — consistent with the background-job path in `ORQ8_CURRENT_ARCHITECTURE.md`.
- Probe scripts present and parse-clean: `apps/api/scripts/pico-provider-probe.ts`, `pico-capability-ping.ts`.
- Observability (`packages/core/src/tracing.ts`, `apps/api/src/services/error-reporting.ts`, `config.ts` `SENTRY_DSN`/`SENTRY_TRACES_SAMPLE_RATE`/`OTEL_EXPORTER_OTLP_ENDPOINT`, boot calls in `apps/api/src/index.ts` + `apps/worker/src/main.ts`): OTLP exporter registers only when the endpoint is set and the optional SDK packages are installed, otherwise warns once and runs untraced; spans carry operation names + caught exceptions only, never prompts/bodies/credentials. Sentry `sendDefaultPii: false`, request bodies/headers/cookies dropped wholesale by the scrubber. No new required dependency — both SDKs stay uninstall until the founder configures them.
- DB preflight (`scripts/db-preflight.mjs`, untracked helper run by `db-migrate.yml` before the runner): TCP + TLS probes with 10s caps, 3s proxy-drop hold; prints host:port only.
- RLS matrix (`scripts/rls-security-e2e.ts`, +45 lines): fixture seeds one file + one invitation per company; §3.1 cross-checks grow 5→8 tables (files FOR ALL member policy, invitations SELECT-only, organizations SELECT member/UPDATE owner, writes default-deny); §3.3 unauthenticated list gains invitations + organizations; own-read sanity gains organization/file/invitation rows. 55→69 executed checks; runs in CI via `proofs.mjs` `rls` proof. Local run was environment-blocked (orphaned machine-wide Postgres SHM segment, no safe process to reap — sibling harnesses active); fixture SQL validated against migration lineage by inspection (all NOT NULL columns covered, unique/partial-index safe, rerun-safe via ON CONFLICT DO NOTHING).

## Scheduled-workflow failures, root-caused 2026-10-13 (read-only log analysis)

- **Nightly rehearsal `38385916274` (0/6, plus 4 prior runs back to 10-10):** every suite died `ENOENT` on `scripts/.env.e2e.local` / `.env.demo.local` — the `E2E_ENV_LOCAL` / `DEMO_ENV_LOCAL` secrets are unset/empty, so the materialize step wrote nothing. Credential absence, not product regression. Fixed in-tree: `scripts/run.mjs` now partitions suites whose env file is missing and reports them `⊘ NOT RUN` with one named cause (exit 1, never spawns the suite). Verified locally by moving both env files aside: 3 selected → `0 passed, 0 failed, 3 not run`, files restored. Tomorrow's nightly is the live proof — expect the issue comment to say NOT RUN, not FAILED.
- **Verify Vercel Production `38430502455` (and `38360568256`):** the web half PASSES — deployment READY at the pushed sha, domain serves it, 65/65 shipped assets 200. The failure is the release gate, which faithfully mirrors the API: `/v1/readiness` names `email` blocking and no mail provider is configured (`FAIL no blocking capability — blocking: email`, `FAIL mail delivers`). Fix is founder-side (provide `RESEND_API_KEY`/SMTP) or a deliberate product decision to stop treating email as launch-blocking — the gate must not be taught to pass by ignoring the API's own list.

## Blockers needing the founder

1. `RESEND_API_KEY` (or SMTP_*) in the API environment → unblocks email + release gate (see Vercel-verify analysis above).
2. `E2E_ENV_LOCAL` / `DEMO_ENV_LOCAL` repo secrets (or accept NOT RUN nightlies) → nightly rehearsal actually exercises prod again.
3. ~~`0055_reclose_client_write_surface` apply to production~~ DONE 2026-10-13 (founder-approved): applied via the prod SQL runner after one transient management-API timeout (retry clean); re-probed — all seven drop-targets gone, seven narrow policies present (`approvals_org_select/insert`, credit/billing `*_org_select`, `password_reset_tokens_select_own`), four 0054 FK leading indexes present; ledger row recorded (`eb60a11a…`). Ledger now gapless 0050→0057.
4. ~~`plan_revisions` RLS enable~~ DONE 2026-10-13 (founder-approved): `ENABLE ROW LEVEL SECURITY` applied, re-probed `rowsecurity: true`. Safe for the app path — every access goes through the API service (direct pg, owner/bypass) with membership enforced in service code (role-matrix tests); no PostgREST/client reads exist.
2. `SUPABASE_DATABASE_URL` reachability from Actions runners (DB Migrate ECONNRESET since 09-27; 0056/0057 hand-applied meanwhile). Mitigated in-tree 2026-10-13: `scripts/db-preflight.mjs` runs first in `db-migrate.yml`, fails fast with host:port-only diagnostics (empty URL / wrong port / non-pooler host / TCP-hold proxy-drop signature) instead of a bare `read ECONNRESET`; empty-URL path verified locally (exit 1, no secret logged).
