# 09 — Agent Hiring System

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 9.1 Principle

Agents are **hired, not created** (§11). The primary UX copy is "Hire Agent." Every hire must be justified by a **Business Case** — hiring is a governed organizational decision, not a configuration action.

## 9.2 Business Case (required fields, §11)

- title · department · manager · mission
- responsibilities · capabilities · model policy · tools · knowledge sources
- permissions (Authority Profile) · budget/resource policy
- success metrics · expected workload · expected cost
- reason for hiring · alternatives considered · temporary/permanent status

## 9.3 Pre-Hire Checklist (asked before every hire)

1. Can an existing agent handle this?
2. Can responsibilities be reassigned?
3. Can an internal tool solve it?
4. Can an existing connected tool solve it?
5. Can an external tool solve it?
6. Can an open-source tool solve it?
7. Is hiring actually justified?

Each answer is recorded; if any alternative is viable, the recommendation reflects it (ties to Build-vs-Buy, 26).

## 9.4 Hiring Workflow (durable, per §36)

```
BusinessCase → PreCheck → Review (Executive Agent) → Recommendation (explain-why)
  → Approval (tier: CEO default; may be delegated) → Provision (agent row + v1 config)
  → Onboarding (10) → Active → events: hiring.proposed/approved/rejected, agent.hired, agent.onboarded
```

- **Temporary hires** are tied to a Project/Team; they are archived when the project completes.
- **Hiring budget is separate from operating budget** (R-FIN-6); the Business Case must show the cost fits the hiring allocation.
- Templates (13) prefill the Business Case; the CEO edits rather than writes from scratch.

## 9.5 Approval

- Default tier: **CEO approval** for new hires; org policy may delegate hiring ≤ a limit to the Executive Agent.
- The Decision Center shows: who, why, evidence, alternatives, expected cost/workload, temp/permanent, and the pre-check answers.

## 9.6 Data Model

`business_cases` (added to 34): id, org_id, title, department_id, manager ref, mission, responsibilities jsonb, capabilities jsonb, model_policy_id, tool_grants jsonb, permissions jsonb, budget_policy jsonb, success_metrics jsonb, expected_workload, expected_cost, reason, alternatives jsonb, temporary, status (draft|proposed|approved|rejected|hired|cancelled), precheck jsonb, recommendation_ref, decided_by, decided_at. `agents.hire_business_case_id` links the hire.

## 9.7 Anti-Sprawl

- Hiring recommendations must be economically justified (cost vs expected ROI, §79.8).
- Org chart review at hiring time: is the department over-staffed relative to workload? (12)
- Every hire has a review date; temporary roles always expire with their project.

## 9.8 UX

- "Hire Agent" entry points: Organization → AI Workforce → Hire, and Executive Agent proposals.
- Hiring appears in: Decision Center (approvals), AI Workforce (pipeline), Reports (workforce changes).
