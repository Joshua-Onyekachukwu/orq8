# 00 — Documentation index

The map. Every document that is authoritative, active, or historical is listed
here with what it is for and what to do with it. If a document is not in this
index, it is either archived (`docs/archive/README.md`) or a dated log.

Updated 2026-09-29 during the ecosystem reconciliation
(`docs/69_ECOSYSTEM_RECONCILIATION_REPORT.md`).

---

## The chain of authority

When two documents disagree, the one higher in this chain wins. Nothing below
the line may contradict something above it — if it does, that is a defect to
fix, not a preference to weigh.

```text
docs/source/AI_ORGANIZATION_OS_MASTER_BRIEF.md   the requirements, as given
            ↓
docs/66_ORQ8_MVP_MASTER.md                       what is built, what is MVP, what is next
            ↓
docs/68_REQUIREMENT_MATRIX.md                    requirement → code → evidence → status
            ↓
docs/05,06,34,35,36,37 + docs/adr/*              how it is designed (domain, architecture, data, contracts)
            ↓
docs/67_ORQ8_PRODUCT_EXPERIENCE_SPEC.md          how it looks and behaves
docs/70_HEADQUARTERS_DASHBOARD_DESIGN.md         the Headquarters redesign plan (dark mission control)
docs/71_ORQ8_PRODUCT_REDESIGN_PLAN.md           product-wide redesign plan: IA, shell, EA, phases — awaiting approval
docs/72_ATLAS_EA_GUIDE_QUESTIONNAIRE.md         founder questionnaire locking Atlas's behavior (autonomy, hiring, money, tone)
            ↓
the code, the migrations, the tests             what is actually true
```

`docs/66` and `docs/68` are the only two places that state status. Any other
document that states status is a snapshot; it belongs in `docs/archive/`.

---

## Read these first

| Question | Document |
| --- | --- |
| What is ORQ8, in one paragraph, and is it working? | `66_ORQ8_MVP_MASTER.md` §66.1–66.2 |
| Which requirements are done, and where is the evidence? | `68_REQUIREMENT_MATRIX.md` |
| What should a founder see and do? | `67_ORQ8_PRODUCT_EXPERIENCE_SPEC.md` |
| How do I run and deploy it? | `58_DEPLOYMENT.md`, `51_ENVIRONMENT_SETUP.md` |
| What is the state of the whole ecosystem right now? | `69_ECOSYSTEM_RECONCILIATION_REPORT.md` |
| Why was a decision made? | `adr/` + `56_ADR_INDEX.md` |

---

## Canonical documents

### Product definition and requirements

| Document | Purpose | Status |
| --- | --- | --- |
| `source/AI_ORGANIZATION_OS_MASTER_BRIEF.md` | The original requirements brief | Authoritative input |
| `source/ORQ8_ALL_PROMPTS_WITH_PLAN.md` | The prompt pack the brief was issued through | Input; several of its assumptions are stale and `docs/66` measures against the repository instead |
| `01_PRODUCT_VISION.md` | What ORQ8 is and why | Canonical, Phase 0 design set |
| `02_PRODUCT_REQUIREMENTS.md` | Requirement families and ids | Canonical (requirement ids reused by `docs/68`) |
| `03_PERSONAS_AND_USER_STORIES.md` | Who the product is for | Canonical |
| `04_GOLDEN_WORKFLOW.md` | The validation scenario for the whole architecture | Canonical |
| `05_DOMAIN_MODEL.md` | Entities and terminology | Canonical |
| `66_ORQ8_MVP_MASTER.md` | MVP boundary, requirement register, phase plan, live status, founder actions | **The master development guide** |
| `68_REQUIREMENT_MATRIX.md` | Requirement-by-requirement status with evidence and dependencies | **The matrix** |
| `55_PRODUCT_ROADMAP.md` | Post-MVP roadmap | Active; scope claims defer to `66` |

### Architecture, data and contracts

| Document | Purpose | Status |
| --- | --- | --- |
| `06_SYSTEM_ARCHITECTURE.md` | Components, boundaries, data flow | Canonical |
| `07_AGENT_RUNTIME.md` | How an agent run is constructed and executed | Canonical |
| `08_EXECUTIVE_AGENT_SPEC.md` | The Executive Agent's contract | Canonical |
| `09_AGENT_HIRING_SYSTEM.md`, `10_AGENT_LIFECYCLE.md`, `11_AGENT_PERFORMANCE.md` | Hiring, lifecycle, evaluation | Canonical |
| `12_ORGANIZATION_ENGINE.md`, `13_DEPARTMENT_SYSTEM.md`, `14_TEAM_AND_COUNCIL_SYSTEM.md` | Organization structure | Canonical |
| `15_TASK_WORKFLOW_ENGINE.md` | Work states and transitions | Canonical |
| `16_GOALS_KPI_STRATEGY.md` | Goals, KRs, initiatives | Canonical |
| `34_DATABASE_SCHEMA.md` | Tables and relationships | Canonical, verified against `packages/db/src/schema.ts` and `supabase/migrations/` |
| `35_API_SPECIFICATION.md` | HTTP surface and conventions | Canonical; the live surface is the route modules |
| `36_EVENT_ARCHITECTURE.md` | Events, realtime, webhooks | Canonical |
| `37_SECURITY_ARCHITECTURE.md` | Authn, authz, encryption, secrets | Canonical |
| `42_INFRASTRUCTURE.md` | Baseline infrastructure | Active; environment specifics defer to `58` |
| `adr/ADR-001..023.md`, `56_ADR_INDEX.md` | Decisions of record | Canonical; `ADR-023` supersedes `ADR-004` on model routing |

### Governance, authority, memory, audit

| Document | Purpose | Status |
| --- | --- | --- |
| `17_COMPANY_CONSTITUTION.md`, `17a_CONSTITUTION_TEMPLATE.md`, `17c_SEED_LOADER.md` | Company constitution and its seed | Canonical |
| `18_GOVERNANCE_AUTHORIZATION.md` | Authority model, approval tiers | Canonical |
| `19_APPROVAL_ENGINE.md` | Approval gating, and the activation-by-configuration principle | Canonical |
| `20_AUDIT_TRAIL.md` | Hash-chained audit | Canonical |
| `21_MEMORY_KNOWLEDGE.md` | Company memory and knowledge graph | Canonical |
| `22_MODEL_ROUTING.md` | Provider priority and routing | Canonical; §22.9 = OpenRouter primary (ADR-023) |
| `23_PROVIDER_API_KEYS.md` | Key management | Canonical |
| `24_COST_RESOURCE_MANAGEMENT.md` | Credits, budgets, caps | Canonical |

### Tools, integrations, engineering

| Document | Purpose | Status |
| --- | --- | --- |
| `25_TOOLS_INTEGRATIONS.md` | Tool registry, permission gating | Canonical |
| `26_BUILD_VS_BUY.md`, `27_INTERNAL_TOOLS.md` | Build-vs-buy and internal tools | Canonical |
| `28_EXISTING_BUSINESS_IMPORT.md` | Business import | Canonical |
| `29_ENGINEERING_IDE.md`, `30_CODE_EXECUTION_SANDBOX.md` | Engineering workspace and sandbox | Canonical |
| `31_VOICE_SYSTEM.md` | Voice | Canonical, post-MVP |
| `48_INTEGRATION_ROADMAP.md` | Integration order | Canonical |
| `46_OPEN_SOURCE_ASSESSMENT.md`, `47_THIRD_PARTY_LICENSES.md` | FOSS posture | Canonical |

### Experience and design

| Document | Purpose | Status |
| --- | --- | --- |
| `67_ORQ8_PRODUCT_EXPERIENCE_SPEC.md` | Product experience, UI/UX and design specification | **The UX authority** |
| `70_HEADQUARTERS_DASHBOARD_DESIGN.md` | Headquarters redesign plan: dark mission-control dashboard | Plan (approved direction, not yet built) |
| `71_ORQ8_PRODUCT_REDESIGN_PLAN.md` | Product-wide redesign: audit, IA, shell, phases A–U; Rev 2 folds in the founder's page-by-page build brief (§V, authoritative) | **Plan — awaiting founder approval** |
| `72_ATLAS_EA_GUIDE_QUESTIONNAIRE.md` | Founder questionnaire: Atlas autonomy, hiring, money, external actions, escalation, tone, guardrails — unanswered items keep safe defaults | **Open — awaiting founder answers** |
| `65_COLOR_SYSTEM.md` | Colour tokens and contrast rules | Canonical token reference |
| `ORQ8_STYLE_GUIDE.md` | Design and contrast style guide | Active; tokens defer to `65` |
| `33_UI_UX_SYSTEM.md` | Original UI system | Canonical design canon; concrete IA defers to `67` |
| `32_DEPARTMENT_UX.md` | Department surface | Canonical |

### Operations, deployment and environments

| Document | Purpose | Status |
| --- | --- | --- |
| `58_DEPLOYMENT.md` | The deployment path: Supabase + Vercel + GitHub, env vars, database lifecycle, CI/CD | **The deployment authority** |
| `64_SUPABASE_SETUP.md` | Supabase project setup and migration lineage | Active |
| `51_ENVIRONMENT_SETUP.md` | Local environment | Active |
| `52_OPERATIONS_RUNBOOK.md` | Day-to-day operations | Active |
| `53_DISASTER_RECOVERY.md` | Backup and restore | Active, drill not yet exercised |
| `INCIDENT_RESPONSE.md` | Incident handling | Active |
| `59_GIT_PUSH_SETUP.md` | Non-interactive git push setup | Active |
| `60_DOMAIN_RECOVERY_RUNBOOK.md` | Recovering the production domain | Active, conditional |
| `50-posthog-setup.md` | PostHog setup | Active |
| `54_COST_MODEL.md` | Cost model | Active |

### Process, status and logs

| Document | Purpose | Status |
| --- | --- | --- |
| `44_TESTING_STRATEGY.md` | Test layers and gates | Canonical |
| `45_EVALUATION_FRAMEWORK.md` | Evaluation of agent output | Canonical |
| `50_DEVELOPMENT_CHECKLIST.md` | Pre-merge checklist | Active |
| `ORQ8_LAUNCH_CHECKLIST.md` | Launch readiness list | Active |
| `ORQ8_CHANGELOG.md` | Per-session log | Active; append-only |
| `68_REQUIREMENT_MATRIX.md`, `69_ECOSYSTEM_RECONCILIATION_REPORT.md` | Current status | Active |

### Business

| Location | Purpose | Status |
| --- | --- | --- |
| `00_MARKET_GTM.md` | Market analysis and go-to-market | Active |
| `marketing/` (repository root) | Brand guide, pricing page copy, design partner material | Active |
| `docs/strategy/` | Strategic analyses and weekly execution plans | Active; `WEEKLY-EXECUTION-PLAN.md` is dated |
| `docs/fundraising/` | Investor material | Active |

---

## Conflicts found, and how each was resolved

| # | Conflict | Resolution |
| --- | --- | --- |
| 1 | Four documents claimed to be the plan: `49_IMPLEMENTATION_PLAN`, `61_ORQ8_MASTER_IMPLEMENTATION_PLAN`, `ORQ8_IMPLEMENTATION_MASTER_PLAN` ("persistent source of truth"), and `ORQ8_CURRENT_STATE` ("living operational document") | `66` is the master guide and `68` is the matrix. The other four are archived. Only two documents state status now |
| 2 | Deployment: `58` is headed "Supabase + Vercel + GitHub" but carried a section titled "Railway — API host (current)"; `43_DEPLOYMENT` described a single-host pipeline; `59_CLOUDRUN_DEPLOYMENT` described a third target; and `.github/workflows/vercel-deploy.yml` still asserted "the API deploys to Railway separately" | `58` is the only deployment document; its Railway section is marked historical. `vercel-deploy.yml` no longer claims a host that does not exist. `43` and `59` are archived. Reality: **the web is on Vercel and the API has no host** (`docs/68` MVP-001) |
| 3 | Duplicate document numbers: two `50_*` (PostHog setup, development checklist), two `59_*` (Cloud Run, git push), two `60_*` (domain recovery, redesign audit) | The `59`/`60` collisions are resolved by archiving the Cloud Run and redesign docs. The `50` pair stays: both are referenced and neither is in the numbered architecture series — treat the number as a label, not an id |
| 4 | Design authority split between `33_UI_UX_SYSTEM` (Phase 0), `67` (current spec), `ORQ8_STYLE_GUIDE` and `65_COLOR_SYSTEM` | `67` owns behaviour and layout; `65` owns tokens; `ORQ8_STYLE_GUIDE` is prose about them; `33` is design canon for the system's intent |
| 5 | Work from another era and another brand (`aethel`, `nexus`, `vertex` design files at the repository root, Trezo-branded material, two prototype routes inside the web app) | Archived to `docs/archive/design-references/` and `archive/prototypes/`. The brand audit (`scripts/brand-audit.mjs`) already prevents a foreign wordmark from shipping |
| 6 | Status claims scattered across documents (test counts, "production verified" statements, superseded verdicts) | Status lives in `66` and `68` only. Snapshots that state it are archived, including the 2026-09-27 audit whose verdicts `66.3` already amends |
| 7 | **Open** — the Supabase arrangement: this repository's local configuration points at project ref `gttkaxbcdtpsusmconxm`, while the connected Supabase account holds one project, `CapitalOS` (`tvekoojdilkjptjzpvqo`), an investor-intelligence database with 18,957 `investors` rows and no ORQ8 table at all | Founder decision required; see `docs/68` MVP-002 and `docs/69` §11 |

---

## Archive

`docs/archive/README.md` lists every archived file with the reason and the
document that replaces it. `archive/prototypes/` at the repository root holds
prototype surfaces removed from the web app.

Rules:

1. Archive before deleting. Delete only when a file is duplicated elsewhere, is
   generated, or actively misleads.
2. A document that states status is a snapshot. When a newer snapshot exists,
   the older one is archived rather than edited.
3. When a document is superseded, record the successor in the archive ledger the
   same day. A superseded document left in place is the drift this index exists
   to prevent.

---

## Repository entry points the documents point at

| What | Where |
| --- | --- |
| The proof gate and its requirement manifest | `scripts/proofs.mjs` — `--list` prints each proof and the MVP id it protects |
| Requirement-protecting tests | `apps/api/test/*.integration.test.ts` (embedded Postgres, no Docker) |
| Migration lineage | `supabase/migrations/` (replayed by CI), `supabase/MIGRATION.md` |
| Schema of record | `packages/db/src/schema.ts` |
| Configuration surface | `packages/core/src/config.ts` (`envSchema`, `envSurface`, `envRequiredInProduction`, `capabilityReadiness`) |
| Activation status of a running deployment | `GET /readyz` (counts) and `GET /v1/readiness` (named capabilities, authenticated) |
| CI | `.github/workflows/ci.yml` (typecheck, test, build, security, brand, proofs, founder-loop, docker) |
