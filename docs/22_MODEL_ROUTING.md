# 22 — Model Routing

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 22.1 Principle (§29)

No hard-coded single model. A model abstraction layer routes every call based on task characteristics, using the cheapest adequate model and reserving frontier models for work where they pay for themselves (§55).

## 22.2 Router Inputs

task type · complexity · reasoning requirement · latency requirement · context size · tool-use requirement · vision/audio requirements · cost ceiling · quality requirement · user/provider keys · model availability · department/agent model policy

## 22.3 Task Classes → Model Tiers (defaults, configurable)

| Class | Examples | Default tier |
|-------|----------|--------------|
| Cheap | classification, routing, summarization, simple extraction, routine reports | small/local/free (e.g., Ollama, Gemini free, Groq) |
| Medium | research drafting, content, code review, data analysis | mid-range reasoning |
| Strong | architecture, difficult engineering, strategic decisions, complex reasoning, high-risk analysis | frontier (Claude/GPT/Gemini Pro) |
| Sensitive | financial/legal/high-risk | approved providers only (policy) |

## 22.4 Decision Flow

1. Classify task (cheap model or deterministic rules).
2. Resolve model policy: department default → agent policy → task-class rule.
3. Select candidate models from registry (capabilities + pricing metadata).
4. Estimate cost: expected tokens × tool calls × duration × price (55).
5. Route; on failure → **fallback order** (policy-defined) → provider down event → next provider.
6. Record ModelUsage (tokens, latency, cost, task, agent, org) → CostEntry (24).

## 22.5 Model Registry

`models` table: provider, model_id, capabilities (context/vision/audio/tools), pricing, availability, default use cases, enabled. Seeded for Ollama + major providers; definitions are **configurable data**, never assumed permanent (R-MOD-6).

## 22.6 Cost-Aware Routing (§55)

Cheap models for: classification, routing, summarization, simple extraction, routine reports. Strong models for: architecture, difficult engineering, strategic decisions, complex reasoning, high-risk analysis. **Cost is never the only criterion** — quality and risk matter first.

## 22.7 Reliability

- Fallback chains per model policy (e.g., claude-sonnet → gpt-5-mini → gemini → ollama/llama).
- Provider outage: `model.provider_down`, `model.fallback_used` events; retries bounded; escalation if all fallbacks fail (15.4).
- Evaluation: routing choices are benchmarked (45) — verify cheaper models don't regress task quality.

## 22.8 Gateway

LiteLLM (self-hosted, free) provides the unified interface, virtual keys, cost tracking, routing/fallback (ADR-004). Domain code never calls provider SDKs directly.
