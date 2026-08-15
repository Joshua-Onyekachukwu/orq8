# 16 — Goals, KPI & Strategy

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 16.1 Hierarchy (§19)

```
Company Mission → Strategic Goals → Strategy → Objectives/KPIs → Projects → Tasks
```

Every major task traces to an objective; the trace is enforced by `tasks.objective_id`. Tasks without a meaningful objective are questioned or deprioritized (anti-busywork).

## 16.2 Goal/Objective/KPI Model

- **Goal:** company-level outcome; status, owner, deadline, success criteria.
- **Objective:** measurable target under a goal; owner, deadline, KPIs.
- **KPI:** first-class record (ADR-013): name, metric_key, target, current_value, unit, source, status. Lives in a `kpis` table linked to objectives; feeds metric_snapshots, health, and reports.

## 16.3 Stop Conditions & Risk Thresholds

Per goal/project: success / continue / pause / escalate / abandon + review schedule (15.2). Risk thresholds: budget warning (80%), schedule slip, cost-overrun (20%), low confidence (0.6) — defaults from 17a, configurable.

## 16.4 Strategy Objects

Strategies are versioned documents under a goal; changes follow change management (12.4). Strategy ↔ objective linkage is explicit.

## 16.5 Goal Health & Reporting

- Goal progress = KPI current vs target + stop-condition state + blocked work.
- Rolled into: Executive dashboard, weekly/monthly reports (40), Org Health (12.5).
- Deviations trigger: diagnosis by Executive Agent → corrective proposal → Decision Center if approval required.

## 16.6 Example

> Mission: accessible AI support for African businesses
> Goal: acquire 100 paying customers in 12 months
> Objectives: launch MVP (Q2), 40% conversion on onboarding (Q3), CAC < $80 (Q4)
> KPIs: customers (0→100), conversion (15%→40%), CAC (→$80)
> Stop: CAC > $80 for 4 consecutive weeks → escalate; spend > $5,000 → CEO

## 16.7 Data Model

`goals`, `objectives`, `strategies`, `kpis` (added to 34), `stop_conditions`, `projects`, `tasks`. Events: `goal.created/updated/stopped`, `objective.kpi_updated`, `stop_condition.reached`.
