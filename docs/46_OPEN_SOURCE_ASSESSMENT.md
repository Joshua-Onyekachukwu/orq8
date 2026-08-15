# 46 — Open Source Assessment

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 46.1 Methodology

For each candidate: license · architecture fit · maturity · security posture · maintenance health · verdict (**USE** / **ADAPT** / **STUDY** / **REJECT**) + reason. Recorded as ADRs where consequential (56).

## 46.2 Candidates

| Candidate | Verdict | Rationale |
|-----------|---------|-----------|
| **LiteLLM** | USE (proxy) | Unified gateway, routing/fallback, cost tracking, virtual keys; MIT; self-hostable (ADR-004) |
| **Ollama** | USE (local) | Free local models; MIT; keeps the platform runnable at $0 model cost |
| **pg-boss** | USE (v1) | Durable Postgres-backed queues; MIT; no extra infra (ADR-003) |
| **Temporal** | USE (later) | Strong durable workflows; MIT; behind WorkflowRuntime interface (ADR-003) |
| **Drizzle** | USE | TS-first ORM, pgvector support; Apache-2.0 (ADR-002) |
| **Fastify** | USE | Modular plugin architecture; MIT (ADR-001) |
| **MinIO** | USE (service) | S3-compatible self-hosted; AGPL — used as separate service via S3 API, not linked (47) |
| **LangGraph** | ADAPT (optional) | Graph orchestration where useful; MIT; not the org backbone (ADR-010) |
| **OpenHands** | STUDY | MIT; agent/tool/sandbox concepts worth studying; platform stays native (ADR-010) |
| **Codebuff** | STUDY | Open-source coding agents (planner/editor/reviewer); study components; verify license before reuse (ADR-010) |
| **Langfuse** | USE (optional) | Self-hosted LLM observability; MIT |
| **Next.js / Tailwind / shadcn / Monaco** | USE | Standard free web stack (33) |
| **Whisper / whisper.cpp** | USE (Phase 13) | Free local STT; MIT |

## 46.3 Rejection Examples (so far)

- Any proprietary coding agent as the platform core (ADR-010) — architecture must stay native.
- AGPL libraries inside product code (47.1).
- Over-engineered orchestration frameworks as mandatory backbone (LangGraph optional only).

## 46.4 Ongoing

Every new OSS adoption: license check (47) + security scan + ADR. Never copy code without license verification (brief §92).
