# 11 — Agent Performance

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 11.1 Metrics (§24)

success rate · task completion · rework · error rate · cost · latency · human intervention · quality score · goal contribution · customer impact · incident rate

## 11.2 Data Sources

- Task outcomes (task.completed/failed, rework, output refs)
- ModelUsage + CostEntry (cost, latency per task)
- Eval harness runs (45): benchmark scores per (agent, version)
- Approvals: human intervention rate, rejection rate
- Incidents, blocks, escalations, need-human calls
- Goal contribution: completed tasks linked to objectives/KPIs

## 11.3 Review Cadence

- **Continuous:** every task completion updates the agent's rolling metrics.
- **Periodic:** scheduled reviews (default weekly lightweight, monthly deep) feed workforce health (12) and reports (40).
- **Triggered:** performance below threshold (e.g., success rate < X or error rate > Y for N consecutive tasks) opens an Under Review state.

## 11.4 Review Record

`agent.performance.reviewed` → review record with: period, metrics, diagnosis, actions (improve/restrict/replace/keep), new version ref, decision, approver, evidence refs.

## 11.5 Diagnosis First (never blame-first, §24)

Causes to distinguish before recommending replacement:
poor prompt/instructions · wrong model · insufficient context · bad task assignment · missing tools · insufficient permissions · inadequate knowledge · excessive workload · poorly defined role

The diagnose step decides the fix: better instructions (new version) vs better model policy vs more context vs different tools vs role redesign — replacement is the **last** option.

## 11.6 Improvement Pipeline

```
Detect → Diagnose → Improve (new agent version) → Evaluate (benchmark, 45)
       → Keep / Restrict / Replace
```

Replace flow (approval-gated): diagnose → improve → re-evaluate → recommend replacement → approval → offboard (10) → transfer knowledge → hire replacement → onboard → resume work. Preserve why the replacement occurred.

## 11.7 Economic Profile (§79.8)

Per agent/team where measurable: model cost · tool/API cost · infra cost · total operating cost · revenue generated/influenced · savings · human time saved · output volume · quality · completion rate · failure/rework rate · ROI estimate.
**Measured / attributed / estimated results are clearly distinguished.**

## 11.8 Performance-Linked Budgets (§79.5)

High performers may receive budget-increase recommendations when impact justifies it (e.g., >31% over delivery targets, cost reductions, MRR contribution). Evidence must be validated before the recommendation reaches the CEO.

## 11.9 UI

- Agent profile scorecard (role, current work, performance, cost, versions)
- Workforce Health view (12): per-department performance heat, cost, capacity
- Review history per agent; version comparison charts
