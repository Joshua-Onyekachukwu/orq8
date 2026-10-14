# ORQ8 Infrastructure Handoff — 2026-10-12

## Done this track

- Verified every active service live (matrix in `ORQ8_SERVICE_VERIFICATION_REPORT.md`).
- Proved both AI providers with exact-output completions; wrote the capability comparison.
- Evaluated Trigger.dev / Cloud Run / Railway worker with current vendor docs: keep Railway.
- Costed three workload levels (~$5–10/mo now, ex-LLM; EA turn ~$0.001).
- Kept two probe scripts (`apps/api/scripts/pico-provider-probe.ts`, `pico-capability-ping.ts`).
- Wrote all ten track docs (five here + final architecture, verification, comparison, cost model, migration plan).

## Changed files (this track)

- `docs/ORQ8_*.md` (10 new), `apps/api/scripts/pico-*.ts` (2 new). No product code touched. No secrets touched. No migrations applied from this track (0056/0057 were the prior release).
- Follow-up (same day): `scripts/rls-security-e2e.ts` (+45 lines — RLS matrix 55→69 checks: files/invitations/organizations cross-org, unauthenticated, own-read sanity); `ORQ8_SERVICE_VERIFICATION_REPORT.md` (railway.json↔Dockerfile match confirmed, RLS evidence recorded). Runs in CI via the `rls` proof; local run environment-blocked (orphaned SHM, sibling harnesses active).
- Follow-up (2026-10-13): observability wiring — `packages/core/src/tracing.ts` (optional OTLP exporter, no-op without endpoint/SDK), `apps/api/src/services/error-reporting.ts` (scrubbed Sentry no-op, dynamic import), config keys `SENTRY_DSN`/`SENTRY_TRACES_SAMPLE_RATE` (endpoint key pre-existed), boot calls in API + worker; `scripts/db-preflight.mjs` (untracked) + `db-migrate.yml` preflight step. Verification report updated; full vitest suites NOT re-run (prior run hung >300s) — lightweight import/no-op checks only (see Test status).

## Test status

CI 11/11 on `ce9d17a`; docs-commit CI queued at handoff. Local gate 16/16 from the release (tree unchanged since except docs/scripts). 2026-10-13 lightweight checks only: `node --check scripts/db-preflight.mjs` OK; empty-URL preflight exits 1 with actionable message (no secret logged); `tsx` imports confirm Sentry scrub redacts email/bodies/drops `user` with no-DSN init false, and tracing with no endpoint returns false / `withSpan` passes through. New unit tests (`error-reporting.test.ts`, `tracing.test.ts`) are in tree but NOT executed here — prior full-suite run timed out after 300s, so CI is the verifier on next push.

## Blockers (unchanged, founder-owned)

`RESEND_API_KEY`, Actions→pooler connectivity, canonical web host. (Railway `railway.json` cross-check closed by inspection — matches Dockerfile CMD.)

## Next concrete actions

Take the roadmap in order (`ORQ8_INFRASTRUCTURE_ROADMAP.md` items 1–3 are founder decisions; 4–5 are small eng tasks). Resume here if interrupted: repo is on `main`, everything pushed.

- Follow-up (2026-10-13, verification pass): `scripts/run.mjs` credential preflight (missing `.env.*.local` → `⊘ NOT RUN` with one named cause, exit 1; locally verified); prod ledger backfilled for hand-applied 0053/0054/0056/0057 with module-verified checksums while 0055 confirmed NOT applied (all seven drop-targets present — flagged as founder decision, not auto-applied); nightly 0/6 and Vercel-verify failures root-caused from logs (missing E2E/DEMO secrets; release gate mirroring API's blocking `email` with no mail provider). Evidence in `ORQ8_SERVICE_VERIFICATION_REPORT.md` (scheduled-workflow section + corrected Supabase row + 4 founder blockers). NOTE: tree is NOT clean — `apps/web/components/landing/*` carry unresolved merge conflicts (UU both-modified, pre-existing, untouched by this pass); `git status` at handoff lists them plus uncommitted API/web/worker/docs edits from earlier sessions.
