# 24 — Cost & Resource Management

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 24.1 Cost Attribution

Every ModelUsage and CostEntry carries: org → department → project → agent → task, plus kind (ai | tool | infra | voice | saas | internal). This enables spend views at every level of the org (R-MOD-5).

## 24.2 Weekly View (§32)

- total AI spend · previous week · % change
- by department · by model · by project · high-cost workflows
- (Daily spend is not the primary executive view.)

## 24.3 Monthly View (§32)

- total AI spend · tool spend · infrastructure · voice · external SaaS · internal tools
- per department · per goal/project · cost trends · projected monthly spend

## 24.4 Budget Governance (§27, §79)

- Levels: **target / warning / hard ceiling** — under target normal; above warning CFO/Executive review; above ceiling approval required.
- **Budget allocation ≠ spend authorization** (18/17a VIII): allocations on financial_controls; spending authority per role.
- Hiring budget separate from operating, infrastructure, and tool budgets (R-FIN-6).
- Budget is a resource-governance mechanism, not a hard wall: agents can request increases (24.5).

## 24.5 Budget Requests (§79.4)

Request includes: amount · current allocation · current spend · remaining balance · reason · work blocked without it · expected outcome · expected revenue/savings impact · confidence · alternatives · duration · proposed new budget · downside if approved/rejected.

Executive Agent evaluates; may recommend approve / reject / reduce / **staged release** (e.g., "$500 in two $250 stages against milestones"). This creates performance-linked budgeting.

## 24.6 Performance-Linked Budgets (§79.5)

Successful agents/teams may receive resource-increase recommendations when measurable impact justifies it (delivery beats targets, cost reductions, revenue contribution, throughput). Evidence is validated before presentation; measured vs attributed vs estimated clearly distinguished (11.7).

## 24.7 Financial Execution Layer (§79.3)

```
Spending Request → Policy Engine → Budget Check → Authority Check → Risk/Vendor/Category Check
  → Approval if required → Payment Executor → Receipt/Evidence → Ledger + Audit
```

Deterministic; no bypass by prompt or self-claimed authority. (Phase 5 core; payment executors are adapters — first adapters are "no-op ledger" for planning and "manual instruction" for the CEO to execute externally; real payment rails later.)

## 24.8 Dashboards & UX

Finance workspace (32): budgets, expenses, forecasts, approvals. CEO home: weekly AI spend chip. Reports (40): cost sections. Cost Model (54) holds unit economics.
