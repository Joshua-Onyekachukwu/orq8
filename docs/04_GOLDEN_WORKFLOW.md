# 04 — Golden Workflow

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

The Golden Workflow is the **canonical architecture validation scenario**. If the platform executes it reliably, the core architecture is sound. It drives the implementation dependency graph, the API surface, the event catalog, and the end-to-end test suite.

## 4.1 Reference Scenario

> **CEO:** "I think we should build an AI customer support product for African businesses. Find out whether this is worth pursuing."

## 4.2 Canonical Steps

| # | Step | System action | Key events | Authz gate |
|---|------|---------------|------------|------------|
| 1 | Intent | Intent Engine classifies: research needed, council needed, no execution yet | `intent.classified` | — |
| 2 | Context | Executive Agent gathers memory, active work, workforce | `context.gathered` | memory.read |
| 3 | Council | Temporary strategy council convened (Market Researcher, Finance Analyst, Legal Researcher, Growth Strategist) | `council.convened` | org:convene |
| 4 | Research | Members research market, competition, feasibility independently | `task.created`, `task.completed` | research tools |
| 5 | Debate | Agents challenge each other's assumptions; disagreement preserved | `council.deliberated` | — |
| 6 | Synthesis | Executive Agent synthesizes recommendation with evidence, alternatives, confidence, required approval | `decision.created` | — |
| 7 | CEO decision | Recommendation queued in CEO Decision Center | `approval.requested` | CEO approval |
| 8 | Approval | CEO approves validation phase | `approval.approved` | approval engine |
| 9 | Project | Project created under a strategic objective | `project.created` | org:create |
| 10 | Simulation | Workforce simulated: departments, temp agents, workload, model cost, infra cost, risks | `simulation.run` | — |
| 11 | Workforce proposal | Hiring proposal for temporary agents with business cases | `hiring.proposed` | hiring review |
| 12 | Hire | CEO approves hires; agents onboarded | `agent.hired`, `agent.onboarded` | CEO approval |
| 13 | Execution | Agents execute validation plan; tasks tracked with stop conditions | `task.assigned`, `task.blocked`, `task.completed` | per-task |
| 14 | Build vs Buy | Engineering evaluates build vs buy vs adopt for tooling | `capability.evaluated` | — |
| 15 | Internal tool | Small internal tool built where justified, registered in Tool Registry | `tool.built`, `tool.registered` | dept authority |
| 16 | External tool | Marketing uses external tool where better | `integration.connected` | dept authority |
| 17 | Ask for help | A blocked agent requests human input; other work continues | `human.input_requested` | — |
| 18 | Major spend | Spend above threshold requires CEO approval via financial execution layer | `approval.requested`, `spend.executed` | financial matrix |
| 19 | Performance | Performance system flags an underperforming agent | `agent.performance.reviewed` | — |
| 20 | Improve/replace | Diagnose → improve → re-evaluate → replace if still failing (with approval, knowledge transfer) | `agent.offboarded`, `agent.hired` | CEO approval |
| 21 | Validation | Validation succeeds against stop conditions | `project.completed` | — |
| 22 | Business unit | Executive Agent proposes converting to a business unit | `decision.created` | — |
| 23 | Expansion | CEO approves; organization expands | `department.created`, `agent.hired` | CEO approval |
| 24 | Memory | Lessons, decisions, precedents written to Company Memory | `memory.written` | memory.write |
| 25 | Reporting | Weekly/monthly reports continue; PA agent drafts, Executive Agent reviews | `report.generated` | — |

## 4.3 What "Reliable Execution" Means

- Every step above is **durable**: survives process restarts, model/provider failure, worker failure (§72).
- Every consequential action passes a **server-side authorization + approval gate** (§73); no step can be skipped by prompting.
- Every significant action is in the **append-only audit trail** (§34).
- The CEO is interrupted only where the attention model requires it (§18): approvals and urgent items are queued/notified; everything else runs autonomously.
- Cost is tracked per step and attributable to org/department/project/agent (§32).

## 4.4 Acceptance Criteria (architecture validation)

1. A fresh ORQ8 deployment can execute §4.2 end-to-end with a *local/free model stack* (Ollama + free-tier providers) and with *frontier models* — no code changes between the two (§29).
2. Any single step can fail (model outage, tool outage, worker restart) and the workflow resumes without duplicate side effects (§72).
3. An auditor can reconstruct every step, decision, and approval from the audit trail.
4. No agent can perform a step its authority profile forbids, even with a hostile prompt (§74, §75).
5. The CEO's total interaction time for the whole workflow (excluding waiting for work) is under ~30 minutes of focused review.

## 4.5 Secondary Golden Scenarios (later phases)

- **Import:** existing-business import → discovery → business map → simulation → activation.
- **Budget escalation:** department requests budget increase with evidence → performance-linked recommendation → CEO approval → staged release.
- **Agent succession:** critical agent fails → backup takes over → knowledge transferred → permissions re-evaluated.
- **Voice approval:** "Approve the marketing campaign" → confirmation → execution via the same authorization system.
