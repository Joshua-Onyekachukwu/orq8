# 39 — Observability

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 39.1 Stack (free-first)

- **Logs:** pino (structured JSON) + pino-pretty in dev.
- **Tracing:** OpenTelemetry; `trace_id` propagated across the Golden Workflow (event → workflow → agent call → tool → audit).
- **Metrics:** optional Prometheus + Grafana (self-hosted) in Phase 16; minimal counters (requests, queue depth, workflow failures, spend) from day one.
- **LLM observability:** Langfuse (self-hosted, OSS) optional — prompt/response traces, token/cost, latency per model; never logs secrets.

## 39.2 What to Observe

| Layer | Signals |
|-------|---------|
| API | latency, error rate, authz denials, rate-limit hits |
| Workflows | runs started/completed/failed, step retries, stuck runs, approval wait times |
| Agents | task throughput, iterations, tool call failures, need-human rate |
| Models | per-model latency, tokens, cost, fallback usage, provider outages |
| Infra | CPU/mem, queue depth, DB connections, sandbox container churn |
| Org | decision backlog age, budget warnings, integration health (40.6) |

## 39.3 Alerting

- Critical: provider down, workflow stuck, sandbox failure, budget ceiling, integration disconnect, auth anomalies.
- Default: notify via in-app (SSE) + optional email; alert routing follows the attention model (18) — no alert spam to the CEO.

## 39.4 Audit vs Observability

Audit (20) = immutable record of what happened (governance). Observability = operational health (debugging). Both carry trace_id; the audit trail is never truncated or modified for observability.

## 39.5 Phase 16 Hardening

Distributed tracing at scale, log retention policy, metric dashboards, load-test instrumentation (44).
