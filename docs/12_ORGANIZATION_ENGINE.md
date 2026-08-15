# 12 — Organization Engine

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 12.1 Purpose

The Organization Engine models the company as a living graph of **reusable primitives** — departments, positions, teams, agents, templates — with no fixed counts or hard-coded types (§1). It powers the org chart, restructuring, health reporting, and the Executive Agent's workforce decisions.

## 12.2 Primitives

- **Department** — durable grouping (13): name, head, allocation, model/tool defaults, status.
- **Position** — role instance within a department (manager, head, member); holds an employee (agent; human later — see ADR-011).
- **Agent** — AI employee (09/10) with Authority Profile and version.
- **Team** — objective-bound group (14): permanent, temporary, cross-functional, council.
- **Template** — reusable role config (CTO, Growth Strategist, …) that prefills Business Cases.

## 12.3 Org Graph

```
CEO (human)
 └─ Executive Agent
     ├─ Engineering Dept (head, positions, agents, teams)
     ├─ Marketing Dept
     ├─ Finance Dept
     ├─ Ops / Legal / CS / Sales (configurable)
     └─ Temporary Teams (project-scoped) + Councils (decision-scoped)
```

Rendered in the Organization Explorer (33.4): click agent → role, mission, manager, responsibilities, current work, performance, tools, model, cost, permissions, history, versions, employment status.

## 12.4 Restructuring (Change Management, §86)

`Change Proposal → Impact Analysis → Simulation (41) → Approval → Implementation → Verification → Audit`

Examples: create/remove department, change reporting, change executive authority, increase budgets, replace critical agents, change goals, new financial policy, major workflow changes. Restructuring runs through the same governance as any major change; nothing restructures itself.

## 12.5 Health Indicators (§70, §88)

- goals on track · blocked projects · pending decisions · workforce health · budget health · AI spend · major risks · integration health · system health
- Health shows **underlying evidence**, never unexplained scores. Executive Agent summarizes, e.g.: "Engineering is financially healthy but capacity-constrained; Customer Success has a rising unresolved-ticket backlog."

## 12.6 Capacity & Gaps

- Workload vs capacity per department (open tasks vs agent concurrency limits).
- Gap detection proposes: reassignment → temporary team → internal tool → hire (pre-hire checklist, 09).
- Anti-busywork: tasks without objective links are flagged (16).

## 12.7 Permissions & Propagation

- Authority Profiles are explicit per agent; **delegations cannot exceed the grantor's authority** (18).
- Department defaults (model policy, tool grants, budget) apply unless overridden by the agent's profile — never silently broadened.

## 12.8 Data Model

`departments`, `positions`, `teams`, `team_members`, `agents`, `agent_templates`, `employment_records`, `financial_controls` (34). Events: `department.created/updated`, `org.health_changed`, `agent.*`.
