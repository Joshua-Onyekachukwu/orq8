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

> **Amended by §22.9.** LiteLLM is now a **development-only** gateway. The production unified interface is OpenRouter, which plays the same role (one API, many vendors, token/cost metadata) without a self-hosted hop. Domain code still never calls provider SDKs directly — it calls the provider chain, whose head is OpenRouter.

## 22.9 Provider Priority — OpenRouter Primary (decision)

**Decision.** OpenRouter is the primary model provider. NVIDIA NIM is the first
fallback. LiteLLM and Ollama are development-only and always last.

| # | Provider | Role | Credentials |
|---|----------|------|-------------|
| 1 | OpenRouter | **Primary.** One key fronts many vendors. | `OPENROUTER_API_KEY` / `OPENROUTER_API_KEYS` |
| 2 | NVIDIA NIM | First fallback, for workspaces holding NIM credentials. | `NVIDIA_API_KEY` / `NVIDIA_API_KEYS` |
| 3 | LiteLLM | Development gateway only. | `LITELLM_BASE_URL` (+ `LITELLM_MASTER_KEY`) |
| 4 | Ollama | Development local models. No auth. | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |

**Why.**

- *One credential, many vendors.* A pinned model id (`openai/gpt-4o-mini`, `anthropic/claude-…`) is honoured exactly by whichever vendor serves it, so "run this task on that model" means what it says.
- *Deterministic unpinned routing.* Without OpenRouter the provider that serves a call depends on which credentials a workspace happens to hold. With it, the default destination is one predictable path.
- *NVIDIA NIM is demoted, not deleted.* NIM gives direct, cheap access to Nemotron/Llama models and is a genuinely useful second attempt, so it stays as the first fallback.
- *Development providers must never lead.* A configured local LiteLLM/Ollama endpoint can still serve dev traffic, but it is tried last — so a stray local URL cannot decide what a production request does.

**Single source of truth.** `PROVIDER_PRIORITY` in
`apps/api/src/services/model-router.ts`:

```ts
export const PROVIDER_PRIORITY: readonly ProviderId[] = [
  'openrouter', 'nvidia', 'litellm', 'ollama',
];
```

`ModelRouter.getProviderChain()` derives its order from it, and
`isDevelopmentProvider()` marks `litellm`/`ollama`. `buildProviderChain()` in
`apps/api/src/services/llm.ts` — the direct HTTP chain behind `chatCompletion`
— pushes the same four providers in the same order. Only configured providers
are included; changing the order changes what every unpinned call in the
product does, so it is a decision rather than a detail.

**Coverage.** `apps/api/test/llm-fallback.test.ts` and
`apps/api/test/model-router.test.ts` assert the declared order, the fallback
walk, and that the development providers stay last.

**Record.** The decision is written up as **[ADR-023 — OpenRouter Is the
Production Model Gateway](adr/ADR-023.md)**, which **supersedes ADR-004**
(LiteLLM as the model gateway). ADR-004's own rule — domain code never calls a
vendor SDK directly — is retained; what changed is which service sits at the head
of the chain, and that LiteLLM/Ollama are development-only.

**Fallbacks stay bounded.** On failure the chain advances, emits
`model.fallback_used` / `model.provider_down` (§22.7), and escalates when the
whole chain is exhausted. With nothing configured, a request degrades to the
structured fallback path instead of failing hard.
