# 56 — ADR Index

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

Format: `ADR-NNN — Title (Status: Accepted / Proposed / Superseded)`. Core decisions live in 06.6; records below reference the doc where each is argued.

## Core Stack (from 06)

| ADR | Title | Status |
|-----|-------|--------|
| 001 | Fastify over NestJS/Express — modular plugin architecture, minimal overhead | Accepted |
| 002 | Drizzle over Prisma — TS-first, lightweight, pgvector support | Accepted |
| 003 | pg-boss first, Temporal later behind a WorkflowRuntime interface | Accepted |
| 004 | LiteLLM as the model gateway (self-hosted, free) | Accepted |
| 005 | MinIO now (S3 API) → R2/S3 later, endpoint swap only | Accepted |
| 006 | App-level authorization first; Postgres RLS as Phase 16 hardening | Accepted |
| 007 | Session auth (server-side, revocable) over JWT; OIDC later | Accepted |
| 008 | SSE before WebSockets; WS reserved for terminal/voice | Accepted |
| 009 | Docker sandbox first; gVisor/Firecracker evaluated Phase 16 | Accepted |
| 010 | No third-party coding app as platform core; study Codebuff/OpenHands only | Accepted |

## Added during full documentation set

| ADR | Title | Status |
|-----|-------|--------|
| 011 | Employee polymorphism: agent-only managers/owners for v1; polymorphic `employee_type` pattern reserved for future humans (12/34) | Accepted |
| 012 | Embedding dimension is deployment-configurable (default matches configured model, e.g., 768 for nomic-embed-text); no hard-coded 1536 (21/34) | Accepted |
| 013 | KPIs are a first-class `kpis` table (not `objectives.kpis` jsonb) — feeds snapshots, health, reports (16/34) | Accepted |
| 014 | Golden Workflow split: **v1** (steps 1–13, 17–18, 21, 24 + minimal cost/report) gates Phase 6; **full** gates after Phases 12–15 (04/49) | Accepted |
| 015 | `financial_controls` is the single source of truth for budgets; `departments.budget_defaults` not used (13/34) | Accepted |
| 016 | New runtime tables: `business_cases`, `kpis`, `import_runs`, `sandbox_runs`, `simulation_runs`, `agent_eval_runs` (34) | Accepted |
| 017 | Minimal cost/workload simulation ships with Golden Workflow v1 (Phase 6); full simulation Phase 15 (41/49) | Accepted |
| 018 | v1 weekly report ships at Phase 6; full reporting Phase 14 (40/49) | Accepted |
| 019 | Permission namespace `{domain}:{resource}:{action}` canonicalized in the Approval Engine (19) | Accepted |
| 020 | Event catalog extended: `spend.executed`, `payment.executed`, `simulation.run/completed`, `hiring.proposed/approved/rejected`, `import.*`, `sandbox.*`, `eval.*` (36) | Accepted |

## Process

- New decisions during implementation → new ADR entry here + record in git history.
- Superseded ADRs are marked, never deleted (audit-friendly).
- All statuses above are **Accepted for Phase 0**; revisit at each phase's DoD (50.2).
