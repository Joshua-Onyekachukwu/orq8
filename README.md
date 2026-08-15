# ORQ8 — AI Organization Operating System

**ORQ8** (pronounced "or-kate", from *orchestrate*) is an AI Organization Operating System: a platform where a human CEO can create or import a business, define its constitution, goals and governance, hire AI employees, organize them into departments and temporary teams, delegate work, connect external tools, route tasks across multiple AI models, require human approval for consequential actions, maintain company memory and audit history, evaluate and replace underperforming agents, and receive concise weekly/monthly executive reporting.

> The product is **not** primarily an AI chat application. It is an organizational operating system.

---

## Repository layout

```
orq8/
├── apps/
│   ├── web/          # Next.js frontend (App Router, TypeScript, Tailwind, shadcn/ui)
│   └── api/          # Fastify API server (modular service architecture)
├── packages/
│   ├── db/           # Drizzle ORM schema, migrations, seed data
│   ├── domain/       # Shared domain types, Zod schemas, constants
│   ├── auth/         # Authentication + session primitives
│   ├── agents/       # Agent runtime (execution loop, tool layer)
│   └── core/         # Shared utilities, config, logging, errors
├── infra/
│   ├── docker-compose.yml   # Postgres, MinIO, Ollama, LiteLLM (local dev)
│   └── deploy/              # Deployment manifests (VPS → managed cloud later)
├── marketing/        # Landing + pricing copy, brand guide, design-partner kit, application + outreach plan
├── ORQ8_OVERVIEW.pdf         # One-page executive overview (tools/pdf_build.js)
├── ORQ8_DESIGN_PARTNER.pdf   # One-pager for recruiting solo-founder beta users (tools/pdf_build_design_partner.js)
└── docs/             # Phase 0 documentation set (this repository's source of truth)
```

## Core principles

1. **Human sovereignty** — the human CEO is the final authority. Governance, authorization, and financial control are enforced in code, never by prompts.
2. **Organizational, not conversational** — intent → understand → context → plan → deliberate → recommend → authorize → execute → verify → report → learn.
3. **Dynamic, not hard-coded** — departments, teams, and agent roles are reusable primitives, not fixed types.
4. **Model-agnostic & provider-agnostic** — routing across providers via LiteLLM; local models (Ollama) and BYOK supported from day one.
5. **FOSS-first, no lock-in** — self-hosted Postgres/pgvector, MinIO (S3-compatible), pg-boss queues, Docker sandboxing. Every layer has a funded upgrade path that does not require rework.

## Documentation

The complete Phase 0 documentation set lives in `docs/`. The **core foundation set** (this batch) is:

| # | Doc | Purpose |
|---|-----|---------|
| 01 | PRODUCT_VISION | Vision, positioning, differentiators, commercial model |
| 02 | PRODUCT_REQUIREMENTS | Functional + non-functional requirements (traced to brief) |
| 03 | PERSONAS_AND_USER_STORIES | Personas and user stories |
| 04 | GOLDEN_WORKFLOW | Canonical end-to-end workflow (architecture validation) |
| 05 | DOMAIN_MODEL | Terminology, entities, relationships, domain boundaries |
| 06 | SYSTEM_ARCHITECTURE | Services, tech stack, ADRs |
| 07 | AGENT_RUNTIME | Agent execution loop, tool layer, sandbox |
| 08 | EXECUTIVE_AGENT_SPEC | Executive Agent, intent engine, modes |
| 17 | COMPANY_CONSTITUTION | Constitution design and versioning |
| 17a | CONSTITUTION_TEMPLATE | Default constitution template (human-readable) |
| 17b | CONSTITUTION_SEED | Machine-readable constitution seed (Phase 5 JSON w/ enforcement metadata) |
| 17c | SEED_LOADER | Phase 5 seed loader spec — 17b → constitutions/approval_rules/permissions/financial_controls rows |
| 17d | AGENT_TEMPLATES_SEED | Phase 2 seed — 7 department shapes + 21 hire-ready agent role templates (aligned with 17b authority defaults) |
| 18 | GOVERNANCE_AUTHORIZATION | Authority model, approvals, delegation, kill switches |
| 21 | MEMORY_KNOWLEDGE | Company memory, decision precedent, evidence types |
| 33 | UI_UX_SYSTEM | Design direction, information architecture, workspaces |
| 34 | DATABASE_SCHEMA | ERD and table definitions |
| 35 | API_SPECIFICATION | API conventions and endpoint contracts |
| 36 | EVENT_ARCHITECTURE | Event catalog and durable workflows |
| 37 | SECURITY_ARCHITECTURE | Security model and threat model |
| 44 | TESTING_STRATEGY | Test plan and agent evaluation framework |
| 49 | IMPLEMENTATION_PLAN | Phased plan, dependency graph, definition of done |

The full set (09–56) is now complete. Index:

| # | Doc | | # | Doc | | # | Doc |
|---|---|---|---|---|---|---|---|
| 09 | AGENT_HIRING_SYSTEM | | 25 | TOOLS_INTEGRATIONS | | 41 | SIMULATION |
| 10 | AGENT_LIFECYCLE | | 26 | BUILD_VS_BUY | | 42 | INFRASTRUCTURE |
| 11 | AGENT_PERFORMANCE | | 27 | INTERNAL_TOOLS | | 43 | DEPLOYMENT |
| 12 | ORGANIZATION_ENGINE | | 28 | EXISTING_BUSINESS_IMPORT | | 44 | TESTING_STRATEGY |
| 13 | DEPARTMENT_SYSTEM | | 29 | ENGINEERING_IDE | | 45 | EVALUATION_FRAMEWORK |
| 14 | TEAM_AND_COUNCIL_SYSTEM | | 30 | CODE_EXECUTION_SANDBOX | | 46 | OPEN_SOURCE_ASSESSMENT |
| 15 | TASK_WORKFLOW_ENGINE | | 31 | VOICE_SYSTEM | | 47 | THIRD_PARTY_LICENSES |
| 16 | GOALS_KPI_STRATEGY | | 32 | DEPARTMENT_UX | | 48 | INTEGRATION_ROADMAP |
| 19 | APPROVAL_ENGINE | | 38 | PRIVACY_DATA_GOVERNANCE | | 50 | DEVELOPMENT_CHECKLIST |
| 20 | AUDIT_TRAIL | | 39 | OBSERVABILITY | | 51 | ENVIRONMENT_SETUP |
| 22 | MODEL_ROUTING | | 40 | REPORTING | | 52 | OPERATIONS_RUNBOOK |
| 23 | PROVIDER_API_KEYS | | | | | 53 | DISASTER_RECOVERY |
| 24 | COST_RESOURCE_MANAGEMENT | | | | | 54 | COST_MODEL |
| | | | | | | 55 | PRODUCT_ROADMAP |
| | | | | | | 56 | ADR_INDEX |

All **59 markdown docs** (56 numbered + 00 + 17a + 17c) and the **17b/17d seed JSONs** are internally consistent (ADR-001–021 in 56_ADR_INDEX). **docs/00_MARKET_GTM.md** holds the market analysis + go-to-market (wedge = solo founders, pricing Free/$49/$199/custom, hosting ~$7–15/mo, ORQ8 brand confirmed).

## Environment setup (dev)

> **Status note:** Phase 1 (Foundation) is underway. The monorepo, Drizzle schema + migrations, auth, the Fastify API shell, and the Next.js web shell (`/` + `/pricing` from the marketing copy) are in place — **all steps work now** (`pnpm dev` boots the API at `:3001`; `pnpm dev:web` boots the site at `:3000`). See 51_ENVIRONMENT_SETUP.md for the full guide.

> **Shortcuts:** `make help` lists the dev targets (`infra-up`, `infra-down`, `db-migrate`, `db-seed`, `dev-api`, `dev-web`, plus `setup` for a one-shot bootstrap) — all delegating to the pnpm scripts below. On Windows without `make`, call the pnpm scripts directly.

**Prerequisites:** Node.js ≥ 20, pnpm ≥ 9, Docker (with compose).

```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure (Postgres+pgvector, MinIO, Ollama, LiteLLM)
docker compose -f infra/docker-compose.yml up -d

# 3. Copy env files and fill in your provider keys (optional for local-only dev)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Run database migrations
pnpm --filter @orq8/db migrate

# 5. Start the API and web app
pnpm --filter @orq8/api dev
pnpm --filter @orq8/web dev
```

With Ollama running locally you can operate with **zero model cost**. To use frontier models, add your own provider keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter) in Settings → AI Providers — keys are encrypted at rest and never exposed to the frontend.

## Current status

- **Phase 0 (Documentation & Architecture):** **complete** — full documentation set (59 markdown docs + 17b seed + 21 ADRs) delivered, reviewed, and pushed to GitHub.
- **Phase 1 (Foundation):** **in progress** — pnpm monorepo, Drizzle schema + migrations (users, orgs, memberships, sessions, hash-chained audit), Argon2id auth (register/login/logout/me, ADR-007 sessions), Fastify shell with error envelope + idempotency, and the Next.js web shell with the `/` + `/pricing` routes built from the marketing copy (docs/33 palette, monthly/annual toggle, comparison table, FAQ). All tested (28 tests green) and verified against the free local stack (Postgres via `infra/docker-compose.yml`). Next: provider config + encrypted secrets, pg-boss + outbox, SSE.
