# 15 — Task & Workflow Engine

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 15.1 Task Lifecycle

```
todo → ready → in_progress ⇄ blocked / waiting_approval → completed | failed | cancelled
```

- Assignment by manager or Executive Agent; every task carries `objective_id` (traceability, 16).
- **Dependencies:** blocked_by / requires (task_dependencies); the engine surfaces chains and critical path.
- **Blocks:** explicit `blocks` records with reason, blocker type, resolver; task.blocked event.
- **Anti-busywork:** tasks without a meaningful objective link are flagged for review (R-GOA-5).

## 15.2 Stop Conditions (R-GOA-3, §20)

Every significant project/workflow declares: success / continue / pause / escalate / abandon conditions + review schedule. Triggering a condition halts the work and routes per the condition (pause = halt + notify, escalate = Decision Center, abandon = termination with report).

## 15.3 WorkflowSpec (declarative)

```json
{
  "id": "hiring_flow", "version": 1,
  "steps": [
    { "key": "precheck", "action": "run_precheck", "next": "recommend" },
    { "key": "recommend", "action": "executive_recommend" },
    { "key": "approve", "action": "request_approval", "tier": "CEO",
      "on": { "approved": "provision", "rejected": "end" } },
    { "key": "provision", "action": "provision_agent", "idempotent": true },
    { "key": "onboard", "action": "run_onboarding" }
  ],
  "timeouts": { "step": "10m", "approval": "72h" },
  "retries": { "max": 3, "backoff": "exponential" }
}
```

Supports branches on events, approvals, parallel fan-out, timeouts, retries, compensation steps.

## 15.4 Durable Execution (§72)

- `workflow_runs` + `workflow_steps` persist state; a crashed worker resumes from the last persisted step (WorkflowRuntime adapter: pg-boss now → Temporal later, ADR-003).
- Side-effectful steps carry idempotency keys; retries never duplicate side effects.
- Failures: bounded retry → replan → need-human → fail-with-context.

## 15.5 Canonical Specs (registry)

golden_validation_v1 (04.6) · approval_flow · hiring_flow (09) · budget_request_flow (24) · weekly/monthly_report_flow (40) · council_flow (14) · import_flow (28) · agent_replacement_flow (11)

## 15.6 Data Model

`projects`, `tasks`, `task_dependencies`, `workflows`, `workflow_runs`, `workflow_steps`, `blocks`, `commitments` (34). Events: full `task.*`, `project.*`, `workflow.*`, `commitment.*` catalog (36).
