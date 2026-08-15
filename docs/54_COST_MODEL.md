# 54 — Cost Model

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 54.1 Cost Components

- **Models:** per-token cost × volume per task class (22.6); local Ollama = $0.
- **Tools/APIs:** integration API costs, web search, STT/TTS (BYOK).
- **Infrastructure:** VPS/compute, storage (MinIO→R2), bandwidth.
- **Sandbox:** ephemeral container compute.
- **Human time:** CEO attention (the metric that justifies the product, 18).

## 54.2 Unit Economics (indicative per active agent/month)

| Agent class | Model cost | Tool cost | Infra share | Total (est.) |
|-------------|-----------|-----------|-------------|--------------|
| Research (cheap tier) | $1–15 | $0–5 | ~$1 | $2–20 |
| Ops (medium) | $10–60 | $5–30 | ~$2 | $20–90 |
| Engineering (strong, sandbox) | $20–150 | $10–50 | $5–20 | $35–220 |

Estimates assume cost-aware routing (22) and stop limits (83). With Ollama-only: near $0 model cost (hardware excluded).

## 54.3 Estimation Formula (per task)

```
expected_cost = Σ over calls: (tokens_in × price_in + tokens_out × price_out)
                + Σ over tools: tool_api_cost + sandbox_compute
```

Used by the router pre-check (22.4) and simulation (41).

## 54.4 Budgeting Integration

Estimates feed: allocations (financial_controls, 24), warnings/ceilings, budget requests (24.5), weekly/monthly reports (40), simulations (41).

## 54.5 Product Pricing (indicative, §78)

- Free/trial: limited org size, agents, usage.
- Pro: more agents/workflows, BYOK, simulation, reports.
- Business: larger orgs, governance, audit, SSO.
- Enterprise: private deployment, SLA, custom integrations.
Pricing stays flexible until usage economics are known (01.8).

## 54.6 Scaling Notes

Per-agent cost scales with workload; per-org cost with departments/projects. Cost-aware routing + ceilings keep runaway spend impossible (R-NFR-8).
