# 32 — Department UX

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 32.1 Principle (§44, §68)

A **shared workspace framework** with configurable modules — never a separate application per department. Departments activate modules; the shell stays consistent.

## 32.2 Common Workspace (per department)

Overview · Active work · Goals · Agents · Tools · Metrics · Decisions · Reports

## 32.3 Department Modules

| Department | Modules |
|-----------|---------|
| Marketing | campaigns, content calendar, analytics, leads, experiments, competitor intelligence |
| Finance | budgets, expenses, forecasts, financial decisions, reports, approvals |
| Sales | pipeline, leads, opportunities, outreach, customer activity |
| Customer Success | tickets, customer health, escalations, support conversations |
| Operations | workflows, vendors, processes, task queues |
| Legal/Risk | contracts, risk reviews, compliance tasks, approvals |
| Engineering | the Engineering Workspace (29) replaces the generic modules |

## 32.4 Module Configurability

- Modules are data-driven: an org can rename, add, or hide modules per department without code changes (fits dynamic primitives, 12).
- Approval surfaces (Decision Center items scoped to a department) render inside the department view too.
- Department metrics roll up to objectives (16) and reports (40).

## 32.5 UX Rules

- Calm, executive density (33.1) — no card walls.
- Every department page links blocked work, pending approvals, and open decisions at top (attention model, 18).
- Deep inspection available; low-level events hidden by default (33.6).
