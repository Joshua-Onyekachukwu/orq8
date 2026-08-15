# 45 — Evaluation Framework

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 45.1 Purpose (§71)

Evaluate agents and workflows on outcomes: correctness, task success, safety, tool-use accuracy, policy compliance, cost, latency, human approval rate, rework, goal contribution. **Do not deploy a changed agent configuration to important workflows without evaluation.**

## 45.2 Dimensions & Metrics

| Dimension | Metrics |
|-----------|---------|
| Correctness | benchmark score, factual accuracy, citation validity |
| Task success | completion rate, acceptance rate, rework rate |
| Safety | policy violations, injection resistance, sandbox escapes |
| Tool-use | correct tool/capability selection, misuse rate |
| Cost/latency | per-task cost, tokens, duration |
| Org impact | approval rate, goal contribution, incident rate |

## 45.3 Benchmark Tasks (per role)

Executive (intent classification, delegation, council synthesis) · Researcher/Market Analyst (accuracy, evidence) · Finance Analyst (math/modeling) · Engineering (code correctness, review quality, sandbox safety) · Legal Researcher (compliance detection) · Support (resolution, escalation judgment). Versioned, data-driven task sets.

## 45.4 Harness

- Deterministic mode (CI): scripted model responses exercise every branch (approval, debate, need-human, block).
- Live mode (optional): Ollama or BYOK models; assertions on structure/outcomes.
- Run = `(task, agent_version, model_policy)` → metrics → score → stored in `agent_eval_runs` (added to 34) → comparable across versions (25/11).
- Human spot-checks on sample outputs; disagreement surfaces as flagged items.

## 45.5 Deploy Gate

Changed agent config for important roles requires: eval run + no regression on key benchmarks → review → version publish (10.6). Golden Workflow v1 e2e (04.6) is the system-level gate (Phase 6).

## 45.6 Safety Evals

Prompt-injection benchmark suite (hostile website/email/doc content attempting authority changes) — required for every major role before approval-gated actions (44.2.8).

## 45.7 Iteration Loop

Detect → Diagnose → Improve (new version) → Evaluate → Keep/Replace (11.5). Eval data feeds performance reviews and performance-linked budget recommendations (11.8).
