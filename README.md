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
| 17a | CONSTITUTION_TEMPLATE | Default constitution template (seed content for new orgs) |
| 18 | GOVERNANCE_AUTHORIZATION | Authority model, approvals, delegation, kill switches |
| 21 | MEMORY_KNOWLEDGE | Company memory, decision precedent, evidence types |
| 33 | UI_UX_SYSTEM | Design direction, information architecture, workspaces |
| 34 | DATABASE_SCHEMA | ERD and table definitions |
| 35 | API_SPECIFICATION | API conventions and endpoint contracts |
| 36 | EVENT_ARCHITECTURE | Event catalog and durable workflows |
| 37 | SECURITY_ARCHITECTURE | Security model and threat model |
| 44 | TESTING_STRATEGY | Test plan and agent evaluation framework |
| 49 | IMPLEMENTATION_PLAN | Phased plan, dependency graph, definition of done |

The remaining documents (09–56) will be produced in a later pass once this core set is reviewed and approved.

## Environment setup (dev)

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

- **Phase 0 (Documentation & Architecture):** core foundation set in progress.
- **Phase 1+ (Implementation):** not started — begins after documentation review and approval.
