# 06 — System Architecture

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 6.1 Architectural Goals

1. **Human sovereignty in code** — authorization, approvals, and financial control are deterministic platform services, never prompt-dependent.
2. **Organization-first** — the Executive Agent orchestrates; agents are workers; the platform is an operating system, not a chat wrapper.
3. **FOSS-first & no lock-in** — everything runs free locally/self-hosted; each layer has a funded upgrade path that does not require rework.
4. **Provider- and model-agnostic** — models route through a gateway; no provider is assumed permanent.
5. **Dynamic primitives** — departments, teams, councils, agent roles are data, not code.
6. **Durable by default** — long-running work survives failure via durable workflow semantics.
7. **Observable & auditable** — every significant action emits an event and an audit record.

## 6.2 High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Clients                                     │
│   Web (Next.js) · (later: mobile, API consumers)                    │
└───────────────┬────────────────────────────────────────────────────┘
                │ HTTPS + SSE/WebSocket
┌───────────────▼────────────────────────────────────────────────────┐
│                         API Gateway (Fastify)                       │
│   REST /v1 · SSE /v1/events · authn · rate limit · audit mw         │
└───────┬──────────────┬──────────────────┬───────────────────────────┘
        │              │                  │
┌───────▼───────┐ ┌────▼──────────┐ ┌────▼──────────────────────────┐
│ Auth Service  │ │ Org/Work      │ │ Authz & Approval Engine       │
│ (sessions,    │ │ Services      │ │ (permissions, authority,      │
│  memberships) │ │ (depts,       │ │  approval tiers, financial    │
│               │ │ agents,       │ │  matrix, emergency controls)  │
│               │ │ goals, tasks, │ └────┬──────────────────────────┘
│               │ │ projects,     │      │ policy checks (deterministic)
│               │ │ councils,     │      │
│               │ │ memory)       │      │
└───────┬───────┘ └───┬───────────┘      │
        │             │                  │
┌───────▼─────────────▼──────────────────▼───────────────────────────┐
│                    Workflow Runtime (durable)                      │
│   Adapter: pg-boss (free, Postgres)  →  Adapter: Temporal (scale)  │
│   WorkflowSpecs: golden workflow, approval flow, hiring, reports   │
└───────┬────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────────────┐
│                    Agent Runtime (workers)                         │
│   Agent loop: fetch task → context → model call → tool calls       │
│   Tool Layer (permission-gated) · Need-Human · Events              │
│   Sandbox: Docker (ephemeral, resource-limited)                    │
└───────┬────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────────────┐
│                    Model Gateway (LiteLLM)                         │
│   Ollama (local/free) · OpenAI · Anthropic · Gemini · DeepSeek ·   │
│   Groq · OpenRouter · any OpenAI-compatible endpoint               │
└───────┬────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────────────┐
│        Data layer (all self-hosted, free)                          │
│   PostgreSQL 16 + pgvector · MinIO (S3-compatible) · Redis (opt)   │
└────────────────────────────────────────────────────────────────────┘
```

## 6.3 Services (Modular, Single Deployable Initially)

One Fastify app with strict module boundaries (not microservices yet); modules can be split into workers/services later without rework.

| Module | Responsibility |
|--------|---------------|
| `auth` | Sessions, memberships, human roles |
| `organizations` | Tenants, constitution, settings |
| `departments` | Dept/team/position CRUD, org chart |
| `agents` | Agent profiles, versions, lifecycle, hiring |
| `goals` | Goals, objectives, KPIs, strategies, stop conditions |
| `projects` | Projects, tasks, dependencies, blocks, commitments |
| `workflows` | WorkflowSpec registry + run execution |
| `decisions` | Decisions, councils, deliberations, recommendations |
| `approvals` | Approval engine, decision center queue |
| `memory` | Company memory, documents, precedents |
| `tools` | Integration registry, tool registry, internal tools, permissions |
| `models` | Providers, user keys, model registry, routing, usage, cost |
| `reports` | Weekly/monthly reports, metrics snapshots |
| `audit` | Append-only audit trail |
| `simulations` | Organization/workforce/cost simulation |
| `intelligence` | Intent engine, Executive Agent orchestration |
| `realtime` | SSE fan-out of events to clients |
| `emergency` | Kill switches, action limits, org pause |

## 6.4 Monorepo Layout

```
orq8/
├── apps/
│   ├── web/          # Next.js (App Router, TS, Tailwind, shadcn/ui, TanStack Query, Monaco)
│   └── api/          # Fastify + module-per-domain; SSE endpoint
├── packages/
│   ├── db/           # Drizzle schema, migrations, seeds
│   ├── domain/       # shared Zod schemas + types (source of truth for contracts)
│   ├── auth/         # session, password hashing (Argon2id)
│   ├── agents/       # agent loop, tool layer, sandbox client
│   ├── workflows/    # WorkflowSpec types + pg-boss/Temporal adapters
│   ├── llm/          # LiteLLM client, routing, cost estimation
│   └── core/         # config, logger (pino), errors, idempotency, tracing
├── infra/            # docker-compose, deploy manifests
└── docs/             # this documentation set
```

Package manager: **pnpm** (fast, disk-efficient, free).

## 6.5 Technology Stack (with rationale)

| Layer | Choice | Why (free-first) | Funded upgrade path |
|-------|--------|------------------|---------------------|
| Frontend | Next.js 15 + TypeScript + Tailwind + shadcn/ui | Free, OSS, huge ecosystem | n/a |
| State/data | TanStack Query + SSE | Free, simple | n/a |
| Editor | Monaco | Free, OSS | n/a |
| API | Fastify (Node 20) | Free, fast, plugin-modular | scale horizontally |
| DB | PostgreSQL 16 + pgvector | Free, self-hosted; vector search for memory | managed Postgres (Neon/RDS/Supabase) — same SQL |
| ORM | Drizzle | Free, TS-first, pgvector support | n/a |
| Object storage | MinIO (S3 API) | Free, self-hosted | Cloudflare R2 / AWS S3 — same S3 API, zero rework |
| Queues/workflows | pg-boss (Postgres-backed) | Free, no extra infra; durable | Temporal (free self-host or cloud) behind same interface |
| Model gateway | LiteLLM (self-hosted) | OSS; one interface for Ollama + all providers | LiteLLM Cloud/Enterprise if desired |
| Local models | Ollama | Free, offline | — |
| Vector search | pgvector | Free in Postgres | dedicated vector DB later if needed |
| Realtime | SSE (Fastify) | Free, simple | WebSockets if bidirectional needs grow |
| Auth | Sessions + Argon2id (self-hosted) | Free, no SaaS dependency | SSO/OIDC later (Keycloak or managed) |
| Secrets | AES-256-GCM with master key from env (KMS-ready interface) | Free | KMS (AWS/GCP/self-hosted Vault) |
| Sandbox | Docker API (ephemeral containers) | Free | gVisor/Firecracker for stronger isolation |
| Observability | OpenTelemetry + pino; optional Langfuse (self-hosted) | Free, OSS | Langfuse Cloud / managed OTel |
| Deployment | Docker Compose on one VPS | ~$5–10/mo VPS (or free local) | managed cloud: fly.io/Railway/K8s |

## 6.6 Architecture Decision Records (key decisions)

- **ADR-001 — Fastify over NestJS/Express.** Modular plugin architecture, minimal overhead, freedom to compose domain modules. If a heavier framework is ever needed, domain boundaries are preserved so it can migrate.
- **ADR-002 — Drizzle over Prisma.** TS-first, lightweight, first-class pgvector support, no codegen lock-in.
- **ADR-003 — pg-boss first, Temporal later.** The brief names Temporal as a candidate; per its own guidance ("do not over-engineer infrastructure before workload requires it"), we define a `WorkflowRuntime` interface and ship a pg-boss adapter (durable, Postgres-backed, free). Temporal adapter implements the same interface when scale/features justify it. Zero domain-code changes.
- **ADR-004 — LiteLLM as the model gateway.** Common interface, routing/fallback, virtual keys, cost tracking, multi-provider — and self-hostable OSS. Ollama added as a provider so the platform runs with zero model cost.
- **ADR-005 — MinIO, not R2/S3 directly.** Same S3 API; self-hosted now (free), swap endpoint config later (funded). No rework.
- **ADR-006 — App-level authorization first, RLS as Phase-16 hardening.** Deterministic AuthzService checks in the API layer now; Postgres RLS added as defense-in-depth when tenants scale.
- **ADR-007 — Session auth, not JWT.** Server-side sessions are revocable (kill switches, membership changes) and avoid token-revocation complexity. OIDC/SSO is a later adapter.
- **ADR-008 — SSE before WebSockets.** Event fan-out to the CEO home screen and activity feeds is one-directional; SSE is simpler and free. WebSockets reserved for the engineering terminal and voice later.
- **ADR-009 — Docker sandbox first.** Ephemeral containers with resource limits, network policy, and command allow/deny. gVisor/Firecracker evaluated in Phase 16.
- **ADR-010 — No third-party coding agent as platform core.** Platform-native engineering agent interface (§42); Codebuff/OpenHands components studied and reused only where license and architecture permit, never as the orchestration backbone.

## 6.7 Data Flow: Golden Workflow Step 1–8 (intent → approval)

```
CEO message (web) → POST /v1/intelligence/execute
  → intent.classified event
  → Executive Agent workflow (durable):
      context gather (memory.read, active work)
      → council.convened → member tasks → research (model calls via LiteLLM)
      → deliberation (positions preserved)
      → decision.created → recommendation (explain-why)
      → approval.requested (queued in Decision Center)
  → SSE push to CEO home: "New decision awaiting your approval"
CEO approves → approval.approved → approval engine verifies actor+permission+policy
  → next workflow step (project creation) executes
Every step: audit event + event publish + cost attribution.
```

## 6.8 Cost Posture (free-first)

| Capability | Free mode | Funded mode | Rework required |
|-----------|-----------|-------------|-----------------|
| Models | Ollama local + free tiers (Gemini, Groq) + cheap DeepSeek via BYOK | Frontier models (Claude/OpenAI/GPT) via BYOK or platform keys | None (routing config) |
| Database | Postgres on VPS/local | Managed Postgres | None (connection string) |
| Storage | MinIO | R2/S3 | None (endpoint config) |
| Workflows | pg-boss | Temporal | None (adapter swap) |
| Deploy | Docker Compose single VPS | fly.io/Railway/K8s | Manifests only |
| Sandbox | Docker | gVisor | Config only |

## 6.9 What Runs Where (Phase 1 baseline)

- `apps/api` — Fastify; serves REST + SSE; runs workflow executions (pg-boss workers in-process initially).
- `apps/web` — Next.js; talks only to `apps/api`.
- `infra/` — docker-compose: postgres (+pgvector), minio, ollama, litellm. Redis optional (not required initially).
- Secrets come from `.env` (dev) or the environment (prod); KMS-ready interface kept from day one.
