# 69 — Ecosystem reconciliation report

2026-09-29. Repository `C:\Users\Administrator\Webstrom\ORQ8`, branch `main`,
local HEAD `d2402be`. Every claim below was produced by reading or running
something in this repository during this cycle; where a claim comes from an
earlier cycle it says so. Nothing here is taken from a plan.

---

## 0. Verdict

The product works and cannot be reached. That sentence has been true for three
cycles and the reason has not changed: **there is no host for the API and no
confirmed production database**, so every founder-facing outcome is local.

> **Update 2026-10-02:** unchanged on both counts (docs/68 MVP-001/MVP-002). What has moved is the
> product behind the wall: docs/80 Phase 0 and the layered rate limits (Phase 3) shipped, docs/79
> phases 5–7 are built in the working tree, and `docs/81_SERVICE_SETUP_CHECKLIST.md` is the ordered
> answer to "what do I provision" — the two founder decisions above remain the first step.

What changed in this cycle is the shape of the unknowns. There are no longer any
*unknown* blockers. The ecosystem had four documents claiming to be the plan, one
deployment story contradicted by its own section headings and by a CI workflow,
two prototype URLs compiled into the web app and referenced by nothing, and a
category of failure — "the deployment is not configured" — that the running
system could not report about itself. All four are now resolved or named, and the
last one is now a product surface (`GET /v1/readiness`) rather than a developer's
memory.

---

## 1. Ecosystem summary

| Thing | Count | Note |
| --- | --- | --- |
| Markdown documents at repository root | 3 | `README.md`, `PITCH_ONEPAGER.md`, `ORQ8_ALL_PROMPTS_WITH_PLAN.md` (now in `docs/source/`) |
| Documents in `docs/` | 72 | 69 at the top level, 23 ADRs, 4 strategy, 4 fundraising |
| Documents archived this cycle | 20 | `docs/archive/**` |
| API route modules | 56 | `apps/api/src/routes/*.ts` |
| API services | 94 | `apps/api/src/services/*.ts` |
| API test files | 91 | 27 of them integration suites on the embedded database |
| Web pages | 80 | `apps/web/app/**/page.tsx` |
| Web proxy route handlers | 139 | `apps/web/app/api/**/route.ts` |
| Web components | 105 | `apps/web/components/**/*.tsx` |
| Migrations | 37 | `supabase/migrations/*.sql`, replayed by CI on a clean database |
| Tables in the schema of record | 66 | `packages/db/src/schema.ts` |
| GitHub Actions workflows | 6 | `ci`, `db-migrate`, `orq8-jobs`, `waitlist-drip`, `nightly-rehearsal`, `vercel-deploy` |
| Unpushed commits | 33 | local `main` vs `origin/main` |
| Uncommitted files | 246 | 209 modified, 9 deleted, 28 untracked |

---

## 2. Documentation audit

Actions: **KEEP** (authoritative, untouched) · **UPDATE** (authoritative, edited
this cycle) · **MERGE** (folded into another document) · **ARCHIVE** (moved to
`docs/archive/`) · **REMOVE** (deleted).

| File(s) | Action | Why |
| --- | --- | --- |
| `01`–`48` numbered design canon | **KEEP** | Phase 0 design set. Still the definition of the system; `34`, `35`, `37` are the ones the code is held against |
| `66_ORQ8_MVP_MASTER.md` | **UPDATE** | Master guide. Register rows brought current, `MVP-034` added |
| `67_ORQ8_PRODUCT_EXPERIENCE_SPEC.md` | **KEEP** | The UX authority |
| `65_COLOR_SYSTEM.md`, `ORQ8_STYLE_GUIDE.md`, `33_UI_UX_SYSTEM.md` | **KEEP** | Token and design canon |
| `58_DEPLOYMENT.md` | **UPDATE** | Railway section relabelled historical; API-host status corrected (`58.11`) |
| `43_DEPLOYMENT.md` | **ARCHIVE** | Superseded by `58` |
| `49_IMPLEMENTATION_PLAN.md` | **ARCHIVE** | Phase plan from a greenfield assumption; superseded by `66` |
| `61_ORQ8_MASTER_IMPLEMENTATION_PLAN.md` | **ARCHIVE** | Superseded by `66` within a day of being written |
| `ORQ8_IMPLEMENTATION_MASTER_PLAN.md` | **ARCHIVE** | Second "persistent source of truth" |
| `ORQ8_CURRENT_STATE.md` | **ARCHIVE** | Stale in place |
| `ORQ8_ECOSYSTEM_AUDIT.md` | **MERGE → ARCHIVE** | Folded into `68` |
| `57_V1_LENS.md`, `60_PRODUCT_REDESIGN_AUDIT.md`, `62_ORQ8_SYSTEM_AUDIT.md`, `63_COMPANY_HUB_IMPLEMENTATION_AUDIT.md` | **ARCHIVE** | Dated snapshots, still valuable as evidence |
| `59_CLOUDRUN_DEPLOYMENT.md` | **ARCHIVE** | A real alternative, not the production path |
| `ORQ8_PROJECT_HISTORY.md`, `ORQ8-REBRANDING-DRAFT.md` | **ARCHIVE** | History and a superseded draft |
| `docs/superpowers/plans/2026-08-15…`, `2026-08-16…` | **ARCHIVE** | Dated session plans |
| `Design MD files/*` (5 files, repository root) | **ARCHIVE** | Interfaces for the `aethel` / `nexus` / `vertex` naming era |
| `AI_Organization_Operating_System_Master_Brief(1).md`, `ORQ8_ALL_PROMPTS_WITH_PLAN.md` | **UPDATE (moved)** → `docs/source/` | Input, not instruction; kept as the requirements' authority |
| `00_INDEX.md`, `68_REQUIREMENT_MATRIX.md`, `69` (this file), `archive/README.md` | **NEW** | The index, the matrix, the report, the ledger |
| `marketing/`, `docs/strategy/`, `docs/fundraising/` | **KEEP** | Business material, outside the development chain |
| **Removed** | — | **Nothing was deleted.** Every document was kept or archived |

---

## 3. Canonical documentation

```text
docs/source/AI_ORGANIZATION_OS_MASTER_BRIEF.md   the requirements, as given
        ↓
docs/66_ORQ8_MVP_MASTER.md                       what is built, what is MVP, what is next
        ↓
docs/68_REQUIREMENT_MATRIX.md                    requirement → code → evidence → status
        ↓
docs/05,06,34,35,36,37 + docs/adr/*              how it is designed
        ↓
docs/67_ORQ8_PRODUCT_EXPERIENCE_SPEC.md          how it looks and behaves
        ↓
the code, the migrations, the tests              what is actually true
```

`docs/00_INDEX.md` is the map to all of it, including the conflict register.
Status is stated in `66` and `68` only.

---

## 4. Codebase audit

**No duplicated subsystem was found.** The consolidation this repository needed
was in its documents, not in its code; the code is singular where it matters
(one model router, one approval engine, one memory service trio, one executor).

Findings acted on:

| Finding | Evidence | Action |
| --- | --- | --- |
| Two prototype surfaces were compiled into the web app as live URLs, referenced by no source file | `/dashboard-prototype` and `/design/colors` appear in `.next` route manifests; `grep` over `apps/web` finds no source reference | Moved to `archive/prototypes/` (restorable, documented) |
| `apps/api/api/index.js`, a 123,956-line generated serverless bundle, is tracked and rebuilt by hand | `apps/api/package.json` `build:bundle` → `scripts/build-serverless.mjs`; commit `703b428` "rebuild the bundled serverless entry point" | **REFACTOR, not yet done:** it is a build artifact in version control. It should be produced by the deploy pipeline, and it inflated this cycle's working tree review |
| Local build logs inside `apps/` (`api-tests.log`, `web-build.log`, `web-build-revert.log`) | present on disk | Already gitignored; harmless, left alone |
| `.recovery/` (landing-recovery oracle) was untracked **and** unignored, so it polluted `git status` | `git check-ignore` → no match | Added to `.gitignore` |
| Code comments pointed at archived documents | `apps/api/src/routes/health.ts` cited `docs/43` | Repointed to `docs/58` |

Feature reality, classified as the brief asks (REAL / PARTIAL / UI-ONLY /
MOCKED), with the chain the brief demands — for the Executive Agent, work,
approvals, memory and members, the full chain was exercised: request →
authorization → execution → model call → result → audit → memory. Nothing in the
product's core loop is UI-only or mocked; the executables are listed in `docs/66`
§66.13 and confirmed by the harnesses in §66.9/§66.16. The one feature that is
*partially real in a consequential way* is **MVP-030**: the executor enforces the
approval gate but imports no tool registry, so an AI employee's work cannot yet
call a tool except through the Executive Agent's own path
(`routed-chat.ts` → `tool-registry.executeTool`).

---

## 5. Database audit

- **One lineage, 37 migrations**, replayed from scratch by the embedded harness
  and by CI (`pnpm --filter @orq8/db migrate` then `migrate:supabase`). The
  duplicate-lineage problem recorded in `docs/62` §"single migration lineage" is
  resolved in the repository.
- **66 tables** in `packages/db/src/schema.ts`, which is the schema of record;
  migrations are the applied history. Relationship coverage for the product chain
  (user → company → department → employee → work → execution → tool → decision →
  outcome → memory → audit) is present; the two links that were missing in the
  product — approvals→work and memory→use — were added in the preceding cycles
  (`0036_approval_gates_work.sql`, `0037_memory_usage.sql`).
- **RLS**: `0033_rls_hardening.sql` plus the matrix proof (55/55 checks) run in
  CI. Tenant isolation is verified behaviour, not a policy file.
- **Production database: unresolved.** This repository's local configuration
  points at Supabase ref `gttkaxbcdtpsusmconxm`. The Supabase project visible to
  the connected tooling in this session is a different product entirely:
  `CapitalOS` (`tvekoojdilkjptjzpvqo`, eu-west-1, Postgres 17.6, created
  2026-09-26) whose 48 tables are investor intelligence — `investors` with 18,957
  rows, `investor_firms`, `campaign_sequences`, `email_tracking`, `billing_plans`
  — and whose 15 migrations (`profiles_and_triggers`, `investor_intelligence`, …)
  share nothing with the ORQ8 lineage. **No ORQ8 table exists in any project this
  session can see.** See §15, founder dependency 2.

---

## 6. Infrastructure audit

| System | Purpose | Current state | Required | Working? | Action |
| --- | --- | --- | --- | --- | --- |
| GitHub | Source control, CI | Repository `Joshua-Onyekachukwu/orq8`; `origin/main` at `3b559b9` (2026-09-12); local `main` 33 commits ahead; 246 uncommitted files | `main` to be the code that runs | local only; `gh` token invalid in this environment | **P0**: commit and push (founder ask) |
| Vercel (web) | Web deployment | Project `orq8` (`prj_apiN6ei5QfGK4Dev4toYXLrjDmVl`, org `team_ksBu4z76RQhxb2mFJHgsodAn`), Git integration connected 2026-09-10, serving `orq8.vercel.app` from an older commit | a build of current `main` | serves, stale | push; then `vercel-deploy` verifies |
| Vercel (API) | API serverless host | **No project.** The code side is ready: `apps/api/vercel.json`, `build:bundle`, a committed bundle, `boot.prod.test.ts`, `bundle.prod.test.ts` | a project with the env surface set | no | founder: create it (or use a container host) |
| Railway | Previous API host | Deleted; its edge answers 404 for `orq8api-production.up.railway.app/healthz` | — | dead | references removed from code; `58` corrected |
| Supabase | Database + auth | Repo targets `gttkaxbcdtpsusmconxm`; the tooling in this session sees only `CapitalOS` | the ORQ8 project with the lineage applied | unknown | founder decision (§15.2) |
| Model gateway | AI execution | `PROVIDER_PRIORITY = openrouter → nvidia → litellm → ollama` (ADR-023); keys present locally | a production key | works locally | set `OPENROUTER_API_KEY` in the deployment |
| Background execution | Jobs and cron | GitHub Actions: `orq8-jobs`, `waitlist-drip`, `nightly-rehearsal`; every one targets a dead `API_URL` | a reachable API + `INTERNAL_TOKEN` | **BROKEN** | follows the API host |
| Realtime | Live updates | In-process fan-out without `REDIS_URL` | optional single instance | works on one instance | note only |
| Email | Transactional mail | Dev transport logs the message body (fixed this cycle: a production boot without a provider now fails loudly) | `RESEND_API_KEY` or SMTP | unconfigured | founder: key |
| Object storage | Uploads | Local disk fallback | S3-compatible keys | dev only | later |
| Stripe | Billing | Code complete (`services/billing.ts`), keys absent | keys + webhook secret | unconfigured | post-MVP |
| PostHog | Analytics | Web key present | key | assumed working | verify when producing traffic |
| Monitoring / tracing | Errors, traces | `OTEL_EXPORTER_OTLP_ENDPOINT` unset; no error tracker integrated | optional | unconfigured | later |

Operational instruments found already in place (they make activation cheap):
`pnpm ops:check` (`apps/api/scripts/production-check.ts`) validates a production
database through the API's own `/v1/internal/ops-check`; `scripts/review-stack.ts`
boots the whole product locally on the production migration lineage; `proofs.mjs`
runs the requirement-protecting proofs.

---

## 7. GitHub status

- Remote: `https://github.com/Joshua-Onyekachukwu/orq8.git`, branch `main`.
- **`origin/main` is at `3b559b9` (2026-09-12). Local `main` is 33 commits ahead
  (`d2402be`, 2026-09-28), and the working tree holds 246 further changes.**
  Production therefore cannot be running this repository's code — including this
  cycle's fixes to signup, invitations, approvals→work, memory usage and the 150
  integration tests that now enforce instead of skip.
- The `gh` CLI token in this environment is invalid (`Failed to log in to
  github.com account Joshua-Onyekachukwu (keyring)`), so Actions history, secret
  inventory and branch protection could not be read from here. That is a
  founder-side check (§15.4), not a repository problem.
- Nothing was committed or pushed in this cycle; the founder's instruction not to
  commit stands.

---

## 8. Vercel status

- A web project exists and is linked (`orq8`), and `.github/workflows/vercel-deploy.yml`
  verifies it: latest production deployment `READY`, built from the sha the
  workflow ran on, and the domain serving that build.
- That workflow previously asserted *"the API deploys to Railway separately"* — a
  host that no longer exists. **Fixed this cycle** so CI no longer documents a
  pipeline that cannot run.
- The `vercel` CLI is not installed in this environment and `VERCEL_TOKEN` is not
  present locally (`VERCEL_OIDC_TOKEN` is), so deployment state was not queried
  from here: authority for it is the workflow's own verification after a push.
- No Vercel project exists for the API. `apps/api/vercel.json` plus the bundle
  and its `bundle.prod` test mean creating one is a configuration step, not a
  build.

---

## 9. Supabase status

- Database engine visible to the connected tooling: Postgres 17.6.1, healthy.
- Migrations visible: 15, from 2026-09-27/28, all belonging to **CapitalOS**
  (investor intelligence): `profiles_and_triggers`, `investor_intelligence`,
  `intelligence_pipeline`, `company_intelligence_billing`,
  `billing_state_threads_jobs`, `search_intelligence_enhancements`,
  `followup_sequences`, `email_tracking`, `user_pipeline_entries`,
  `app_supporting_tables`, `security_hardening`, `views_security_invoker`,
  `investors_source_unique_full`, `schema_drift_2026_09_27`,
  `rls_anon_read_and_tighten`.
- Every one of that project's 48 tables has RLS enabled, so the *other* product is
  not leaking; the point is that it is not ORQ8.
- The repository's own `secrets.env` (untracked, ignored) and `apps/api/.env`
  both name `gttkaxbcdtpsusmconxm`, which this session cannot see. Either the
  ORQ8 project lives under a different Supabase account, or it no longer exists.
  Both are founder questions, and the answer decides MVP-002.

---

## 10. Integration status

Read from `GET /v1/readiness` semantics (built this cycle) plus configuration
inspection. "Configured locally" means the key is present in this machine's
environment; it says nothing about production.

| Integration | Capability id | Configured locally | Production |
| --- | --- | --- | --- |
| Postgres | `database` | yes | unknown (§9) |
| OpenRouter (primary) | `model_gateway` | yes | to be set |
| NVIDIA (documented fallback) | `model_gateway` | no | optional |
| LiteLLM / Ollama (dev only) | — | yes | deliberately not production |
| Resend / SMTP | `email` | no (dev log transport) | to be set |
| Embeddings | `embeddings` | no | degrades to keyword memory |
| S3 storage | `storage` | no | dev disk only |
| Redis fan-out | `realtime` | no | single instance only |
| Scheduler token | `scheduler` | yes | to be set, with the API host |
| Web search (SerpAPI) | `search` | unknown | optional |
| GitHub OAuth | `github_oauth` | no | MVP-019, founder |
| Google OAuth | `google_oauth` | no | optional |
| Stripe | `billing` | no | post-MVP |
| OTLP tracing | `observability` | no | optional |

---

## 11. Archive

Twenty documents and three prototype surfaces moved, each with its reason and its
successor recorded in `docs/archive/README.md`. **Nothing was deleted.** The
guiding rule applied: a document was archived when it stated status that is now
stated elsewhere, when it described a direction that was superseded, or when it
belonged to a product naming era that no longer exists; it was kept in place when
it is a design definition the code is still held against.

---

## 12. Requirement matrix

`docs/68_REQUIREMENT_MATRIX.md`. Headline: **22 REAL, 4 PARTIAL, 5 MISSING, 1
BROKEN, 1 EXTERNAL, 1 FOUNDER** across 35 requirements; six P0 rows, five of which
are the same missing host. Two requirements were added after this cycle began:
`MVP-034` (the activation report) and `MVP-035` (mail delivery is provable, with
the cause and the fix).

---

## 13. Remaining MVP work

**P0**

1. **A host for the API** (MVP-001, MVP-005, MVP-021, MVP-026). The code is
   ready: `build:bundle`, `apps/api/vercel.json`, `boot.prod`/`bundle.prod` tests,
   or the existing `Dockerfile` on any container host.
2. **A confirmed production database with the ORQ8 lineage applied** (MVP-002,
   MVP-003, MVP-024). `DB Migrate` replays drizzle + supabase and records a
   ledger; `pnpm ops:check` validates the result.
3. **A task execution that can call a tool** (MVP-030). The executor enforces the
   gate and then has nothing to run; `executeTool` is reachable only from the
   Executive Agent path.

**P1** — releases that are not tested live (a staging target, MVP-004); one
working external integration end to end (MVP-019, an OAuth app); onboarding to
first value (MVP-008); the stack proofs blocking on GitHub runners (MVP-022);
cost caps verified in production (MVP-025); the restore drill (MVP-024).

**P2** — semantic memory by configuring embeddings (MVP-016 degradation); a
one-click demo company (MVP-020).

---

## 14. Infrastructure to build

Built this cycle, because it is infrastructure the whole plan depends on and it
needs no credentials:

- **The activation model, as data.** `capabilityReadiness(config)` in
  `packages/core/src/config.ts` declares, for each capability, the keys it needs
  (`requires`, or `anyOf` groups for a choice of provider), whether it is
  production-critical, and what the founder loses while it is not configured.
  Key names only — a value never crosses the boundary.
- **Two surfaces over it.** `GET /readyz` (public) reports dependency health plus
  activation counts, so a release gate can read it without a session;
  `GET /v1/readiness` names every unconfigured capability with its impact and its
  documentation, read either by a founder's session or by a machine presenting
  `x-internal-token` (constant-time compare) — a blocker nobody can name is a
  red build nobody can act on. A deployment can now answer "what is not
  switched on?" by itself.
- **The gate that acts on it.** `scripts/release-gate.mjs` asks a running
  deployment four questions — web `/healthz`, API `/healthz`, `/readyz`, and
  `/v1/readiness` — and exits non-zero when a production-critical capability is
  not activated, printing the missing key names, the impact and the docs.
  `--require <id>` raises the floor for a stage that needs more than the default
  set. It is proven against the local review stack by
  `scripts/release-gate-proof.mjs` (a `proofs.mjs` proof, so CI runs it): the
  verdict must follow the deployment's own report, `/readyz` must agree with
  `/v1/readiness`, and the gate must refuse to guess without its token.
- **A fifth question, because configuration is not delivery.** `SMTP_HOST` being
  set and the provider accepting a message are different claims, and only the
  second one is mail working. `POST /v1/readiness/mail-check` (machine-only,
  `x-internal-token`) runs the same three-verdict diagnosis the settings page
  shows and sends one real message; the gate fires it and fails the release on
  the broken step, with the fix in the check's own detail so a pipeline reading
  JSON gets the actionable part. `200` means *the check ran* — a failed diagnosis
  is the answer, in the body. The probe targets the address inside the
  deployment's `EMAIL_FROM` unless `--mail-to` / `ORQ8_MAIL_PROBE_TO` says
  otherwise, `--no-mail` skips it loudly, and a `404` from an older API build is
  a failed check rather than a silent skip. So "is this release good?" is now
  answered partly by the deployment *doing* the thing, not only by describing how
  it is configured.
- **Seven tests** (`apps/api/test/readiness.test.ts`) pinning the four properties
  that make the report trustworthy: a minimal deployment is not reported
  complete; a configured one has nothing blocking; a local substitute reports
  `dev_only` and never `ready`; no value leaks. Plus a drift guard: every key the
  model names must exist in `envSurface()`, and it must cover
  `envRequiredInProduction()`.

Still to build when a host exists: the deployment itself (choose Vercel
serverless or a container) and a staging target. The smoke gate is no longer on
that list: it exists, it is proven locally both ways (it refused a review stack
with no mail provider and cleared one whose mail capability is genuinely
activated — including sending a real message through a local SMTP sink), and
`.github/workflows/vercel-deploy.yml` runs it after every web verification —
blocking as soon as `PRODUCTION_API_URL` and `INTERNAL_TOKEN` are set as
repository secrets, and reporting *not run* in the job summary until then rather
than a green check for a check that did not run. The optional `MAIL_PROBE_TO`
secret aims the mail probe at a mailbox the founder reads.

---

## 15. Founder dependencies

Only these, and none of them needs a decision about the product itself:

1. **A host for the API.** Recommended: a second Vercel project rooted at
   `apps/api` with the bundle build, since the bundle and its tests already
   exist; the alternatives are the committed `Dockerfile` on any container host,
   or Cloud Run via the archived runbook.
2. **Which Supabase project is production.** `gttkaxbcdtpsusmconxm` (what the
   repository targets) cannot be seen from this session; `CapitalOS` is a
   different product. Either grant access to the ORQ8 project or confirm it must
   be created, then apply the lineage.
3. **The production environment values** — names only, never values:
   `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `APP_URL`,
   `ALLOWED_ORIGINS`, `INTERNAL_TOKEN`, `OPENROUTER_API_KEY`, and
   `RESEND_API_KEY` or the SMTP set. `GET /v1/readiness` lists the rest, with
   impact.
4. **A working GitHub credential** for this environment (`gh auth refresh`) if
   Actions history, secrets and branch protection are to be audited from here.
5. **The commit decision.** 246 files and 33 commits are unreviewed outside this
   machine. Nothing is committed.

---

## 16. Implementation sequence

```text
1. Commit and push the working tree in logical commits      (founder-authorized)
        ↓
2. Create the API host and set the env surface              (founder + 1)
        ↓
3. Confirm or create the production database, apply lineage (founder + 2)
        ↓
4. `pnpm ops:check` and `GET /v1/readiness` against production — the deployment
   proves itself, and the smoke check becomes a release gate            (MVP-021)
        ↓
5. Re-point the three scheduled workflows at the live API, run them once,
   confirm the audit trail and the briefing output                      (MVP-005)
        ↓
6. MVP-030: give task execution the same tool path and gate the Executive Agent
   has, proven on the embedded database                                  (P0, in code)
        ↓
7. The founder acceptance test: a week of operation without a developer
                                                                        (MVP-026)
        ↓
8. Then the P1 rows: staging, OAuth integration, onboarding, the restore drill
```

Steps 1–5 are configuration and authorization. **Step 6 is the next piece of
product work and the only P0 that needs no founder input**; it is where
implementation resumes.

---

## Appendix — hygiene checks run this cycle

- **Secrets**: no value from `secrets.env` appears in any tracked file. Only two
  identifiers do — the Supabase project ref (in `docs/64`, the changelog and the
  archived history) and the Vercel project id (in `vercel-deploy.yml` and
  `docs/60`). Identifiers are not credentials, but they are the kind of thing that
  should not accumulate in prose; both are already acted on by the workflows.
- **Generated artifacts**: `apps/web/playwright-report/` and the local build logs
  are gitignored; `.recovery/` is now gitignored too. The committed serverless
  bundle is the one generated artifact still under version control (see §4).
- **Typechecks**: `@orq8/core` and `@orq8/api` clean after the readiness work.
- **Tests**: `readiness.test.ts` 7/7. Regression batches for the affected areas
  were run and are green (see the changelog entry for this cycle).
