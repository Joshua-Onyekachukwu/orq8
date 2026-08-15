# 44 — Testing Strategy

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 44.1 Layers

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Domain logic, policy engine, authorization decisions, routing rules, validation, event reducers |
| Integration | Vitest + test Postgres (pg-mem or dockerized) | Service + DB behavior, workflow steps, outbox relay, idempotency, audit chain integrity |
| API (contract) | Vitest + Fastify inject / supertest | Endpoint contracts, authz denials, pagination, error envelope |
| E2E (golden) | Playwright + orchestrated stack | CEO-driven Golden Workflow §04 end-to-end (web → API → workflow → agents → approvals → memory) |
| Agent eval | Eval harness (see §44.3) | Benchmark tasks per role; compare agent configs/models |
| Security | SAST/DAST/red-team suite | §37.6 scenarios |
| Load/scale | k6 (OSS) | Phase 16: concurrency, queues, tenant isolation at scale |

## 44.2 What Must Be Tested First (M1)

1. **Authz decisions** — property tests over permission matrices: every (actor, resource, action) combination returns the correct allow/deny/approval; denials carry policy refs.
2. **Approval engine** — approve → execute-once; reject/expire → no execution; idempotent replay; tier verification server-side (§73).
3. **Audit integrity** — hash chain breaks when any row is tampered; no update/delete path exists.
4. **Budget & financial matrix** — threshold transitions (auto → dept → CEO), ceiling blocks, cumulative authority, staged releases.
5. **Workflow durability** — kill a worker mid-run; run resumes; no duplicate side effects (idempotency keys).
6. **Tenant isolation** — org A cannot read/write org B data anywhere (API + memory retrieval + audit query).
7. **Emergency controls** — pause org → all agent actions denied immediately; resume restores prior policy.
8. **Prompt injection** — hostile website/email content cannot grant authority, change policy, or bypass approval (benchmark suite).
9. **Golden Workflow e2e** — §04 acceptance criteria with a stubbed/free model stack (deterministic fake or Ollama) and with real providers in CI-optional mode.
10. **Model router** — cost-aware routing picks expected model class; fallback on provider outage; usage/cost attribution correct.

## 44.3 Agent Evaluation Framework (§71)

**Dimensions:** correctness, task success, safety, tool-use accuracy, policy compliance, cost, latency, human approval rate, rework, goal contribution.

**Benchmark tasks** per major role (data-driven, versioned):
- Executive: intent classification, delegation planning, council synthesis quality.
- Researcher/Market Analyst: factual accuracy, evidence quality, citation validity.
- Finance Analyst: arithmetic/cost modeling correctness.
- Engineering: code correctness (unit tests pass), review quality, sandbox safety.
- Legal Researcher: compliance-issue detection.
- Support: resolution accuracy, escalation judgment.

**Harness:** run `(task, agent_version, model_policy)` → collect metrics → score → store in `agent_eval_runs` → compare across versions (§25). Deploy gate: a changed agent configuration must not regress benchmark scores for important workflows (§71).

**Evaluation runs are deterministic in structure:** fixed task set, fixed seeds where applicable, recorded outputs, human spot-checks. Never deploy a changed config to important workflows without evaluation.

## 44.4 Golden Workflow as the System Test

The e2e suite replays §04: the test asserts each step's events, audit records, approvals, and final memory entries. It runs in two model modes:
- **Deterministic mode (CI default):** stub model responses scripted to exercise every branch (approval, debate, need-human, block).
- **Live mode (optional):** Ollama or BYOK frontier models; assertions on structure/outcomes, not exact text.

## 44.5 CI Pipeline (free-first)

GitHub Actions (free for OSS/private small teams): lint → typecheck → unit → integration (dockerized Postgres) → API contracts → e2e (deterministic) → security scans (audit, SAST) → coverage report. Load + live-model tests run nightly or on demand.

## 44.6 Test Data & Fixtures

- Seed org with constitution, departments, template agents, models/providers, sample memory.
- Fixture factory in `packages/db/seeds` reused by integration + e2e.
- No real provider keys in tests; fake LiteLLM client records deterministic usage/cost.
