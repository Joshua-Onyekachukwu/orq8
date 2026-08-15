# 36 — Event Architecture

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 36.1 Principles

- The organization is **event-driven** (§59): agents react to events through durable workflows.
- Events are the integration backbone between services, workers, and the UI (SSE fan-out).
- Publishing is fire-and-forget to an outbox; delivery is at-least-once; consumers are idempotent (§72).

## 36.2 Event Shape

```
{
  id: uuid,                    // unique event id
  type: "task.completed",
  org_id, department_id?, agent_id?, task_id?, project_id?,
  actor: { type, id },         // who caused it
  payload: { ... domain data },
  trace_id,                    // correlation across the golden workflow
  occurred_at
}
```

## 36.3 Outbox Pattern

1. Service writes business row + `outbox_events` row in the same DB transaction.
2. Relay worker publishes to the event bus (in-process broker initially → pg-boss topics later → Kafka/NATS at scale).
3. Consumers ack idempotently (consumer offset / processed-event table).

## 36.4 Event Catalog (core)

### Agent lifecycle
`agent.proposed` · `agent.hired` · `agent.onboarded` · `agent.restricted` · `agent.under_review` · `agent.suspended` · `agent.offboarded` · `agent.archived` · `agent.version_published` · `agent.performance.reviewed`

### Work
`task.created` · `task.assigned` · `task.started` · `task.blocked` · `task.unblocked` · `task.waiting_approval` · `task.completed` · `task.failed` · `task.cancelled` · `project.created` · `project.completed` · `project.stopped` · `workflow.run_started` · `workflow.step_completed` · `workflow.run_completed` · `workflow.run_failed` · `workflow.run_abandoned` · `commitment.due_soon` · `commitment.missed`

### Governance & approvals
`approval.requested` · `approval.approved` · `approval.rejected` · `approval.expired` · `approval.delegated` · `decision.created` · `decision.updated` · `decision.overridden` · `council.convened` · `council.member_position` · `council.deliberated` · `council.concluded` · `constitution.updated` · `policy.updated` · `permission.changed` · `emergency.activated` · `emergency.deactivated`

### Intent & executive
`intent.classified` · `context.gathered` · `executive.recommendation` · `executive.escalated` · `human.input_requested` · `human.input_resolved`

### Memory
`memory.written` · `memory.updated` · `precedent.created` · `precedent.reviewed`

### Goals & strategy
`goal.created` · `goal.updated` · `goal.stopped` · `objective.kpi_updated` · `stop_condition.reached` (subtype: escalate/pause/abandon)

### Tools & integrations
`tool.connected` · `tool.disconnected` · `tool.failed` · `tool.permission_changed` · `tool.built` · `tool.registered` · `capability.evaluated` · `procurement.recorded` · `procurement.renewal_due`

### AI & cost
`model.usage_recorded` · `model.provider_down` · `model.fallback_used` · `budget.threshold_reached` (target/warning/ceiling) · `budget.requested` · `budget.approved` · `budget.rejected` · `cost.weekly_ready` · `cost.monthly_ready`

### Reports & org health
`report.generated` · `report.reviewed` · `report.delivered` · `org.health_changed` · `org.paused` · `org.resumed`

## 36.5 Durable Workflows

`WorkflowSpec` (declarative, JSON): steps with inputs, branches on events, approvals, timeouts, retries, compensation. Runs are `workflow_runs` with per-step state; a crashed worker resumes the run from its last persisted step.

**Adapter strategy (ADR-003):** `WorkflowRuntime` interface — implementation 1: **pg-boss** (Postgres-backed, free, durable); implementation 2: **Temporal** (later, same interface). Domain code depends only on the interface.

### Canonical specs
- `golden_validation` — the §04 workflow end-to-end.
- `approval_flow` — request → queue → notify → approve/reject/expire → execute-once → audit.
- `hiring_flow` — business case → pre-hire questions → recommendation → approval → provision → onboard → events.
- `budget_request_flow` — evidence gathering → policy check → recommendation → approval → staged release → ledger.
- `weekly_report_flow` / `monthly_report_flow` — collect metrics → PA agent drafts → Executive reviews → deliver → archive.
- `council_flow` — members → independent analysis → debate → synthesis → recommendation → approval.
- `import_flow` (Phase 10) — connect → discover → map → findings → correct → propose → simulate → approve → activate.
- `agent_replacement_flow` — diagnose → improve → evaluate → approve → offboard → knowledge transfer → hire → onboard → resume.

## 36.6 Idempotency & Reliability (§72)

- Every workflow step records `attempts`; retries reuse the same step id; side-effectful operations carry `idempotency_key` (e.g., tool execution) and are deduped by key.
- Model/API/tool/worker failures retry with backoff (bounded) then escalate: replan → need-human → fail-with-context.
- Long-running workflows survive process restarts (state in Postgres, not memory).

## 36.7 Realtime to Clients

- `POST /v1/events` (SSE): server pushes events to authenticated sessions.
- UI subscribes per role/permission; the Agent Activity Center and Decision Center update live.
- Event → notification mapping per attention model (§18): urgent → notify; approval → queue badge; important → report section; routine → silent.
