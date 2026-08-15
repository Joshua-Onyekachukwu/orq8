# 13 — Department System

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 13.1 Department as a First-Class Object

Departments are dynamic organizational objects (12), not fixed code. A department owns: name, head position, parent (for hierarchies), status, allocation (financial_controls), model policy default, tool grant defaults, and workspace configuration (32).

## 13.2 Common Department Shapes (configurable templates, not hard-coded)

| Department | Typical modules | Default authority |
|-----------|-----------------|-------------------|
| Engineering | repos, code, sandbox, CI, PRs, preview | build/test in sandbox; merge/deploy approval-gated |
| Marketing | campaigns, content calendar, analytics, experiments | content ops; paid spend per matrix (18) |
| Finance | budgets, expenses, forecasts, reports | read-all; spend execution per matrix; policy changes CEO-only |
| Sales | pipeline, leads, outreach | CRM read/write; outbound comms per authority |
| Customer Success | tickets, health, escalations | replies within policy; escalation on complaints |
| Operations | workflows, vendors, task queues | process execution; vendor actions reviewed |
| Legal/Risk | contracts, risk reviews, compliance | drafts; commitments CEO-approved |

Template changes do not affect existing departments (versioned config).

## 13.3 Department Governance

- Head position carries **Department Authority** (18): actions within department policy and the head's delegated limits.
- Budgets: financial_controls per department (allocated/warning/ceiling + authorities) — **single source of truth** (ADR-015; `departments.budget_defaults` is not used).
- Model policy per department: e.g., research = cheap models; engineering = reasoning models; strategy = high quality (22).
- Tool grants default at department level; agents may be narrowed, never silently broadened.

## 13.4 Department Lifecycle

Create / Merge / Split / Archive follow Change Management (12.4): proposal → impact → simulation → approval → implement → verify → audit.
Archiving preserves positions, agents (moved or offboarded per 10), allocations, history.

## 13.5 Department Workspace (see 32)

Shared shell + configurable modules: Overview · Active work · Goals · Agents · Tools · Metrics · Decisions · Reports + department-specific modules.

## 13.6 Metrics per Department

Department KPIs roll into objectives (16); costs roll into weekly/monthly reports (40); health into Workforce/Org Health (12.5).
