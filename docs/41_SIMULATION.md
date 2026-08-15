# 41 — Simulation

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 41.1 Purpose (§50)

Simulation is a **planning tool, not a guarantee**. Before activating a major organization/project change, ORQ8 shows what is expected: workforce, workload, costs, approvals, bottlenecks, risks, capacity.

## 41.2 Simulation Types

- **Organization:** proposed departments, permanent + temporary agents, reporting lines.
- **Workforce:** roles, workloads, concurrency, capacity vs demand.
- **Cost:** model cost, external software cost, infrastructure cost, human approvals — from unit economics (54) and model pricing (22).
- **Workload/risk:** expected task flow, likely bottlenecks, risk thresholds (stop conditions, 15.2).
- **Scenario comparison:** side-by-side options with assumptions.

## 41.3 Inputs

org graph · agent costs · workload estimates · model policies/pricing · stop conditions · budget allocations · integration costs · import baselines (28).

## 41.4 Outputs (§50)

proposed departments · permanent/temporary agents · expected workload · estimated model cost · external software cost · infrastructure cost · human approvals · likely bottlenecks · risks · expected capacity — each with **assumptions + confidence** labels (measured vs estimated, 79.8).

## 41.5 Golden Workflow v1 (Phase 6)

A **minimal cost/workload simulation** (agents × expected tasks × model prices + infra) runs before the workforce proposal; full simulation (org/risk/scenario) is Phase 15.

## 41.6 Import Simulation (§51)

Import flow shows what the proposed workforce will do, cost, and risks before activation (28.6).

## 41.7 Data Model

`simulation_runs` (added to 34): id, org_id, kind, proposal_ref, inputs jsonb, results jsonb, assumptions jsonb, confidence, status, created_at. Never authoritative; UI labels it a forecast (R-SIM: no silent guarantees).
