# ORQ8 AI Provider Comparison — 2026-10-12 (measured, not brochure)

Chain (live path `services/llm.ts`): **OpenRouter → NVIDIA NIM → LiteLLM → Ollama → structured fallback**, with 5-key NVIDIA pool (round-robin + 429 smoothing), per-key failover, model fallbacks, circuit breakers, two-stage timeouts, BYO org keys, and per-call tracing.

## Live measurements (today, safe prompts)

| | OpenRouter | NVIDIA NIM |
|---|---|---|
| Health probe | healthy, 988ms, catalog current (incl. claude-haiku-5.5, gemini-nano-banana-2.1) | healthy, 727ms, 5 keys, full catalog |
| Completion | `openai/gpt-4o-mini`, exact output, 1.2s | `nvidia/nemotron-3-super-120b-a12b`, correct output, <1s |
| Registry price | $0.00015 / $0.0006 per 1K in/out, 128K ctx | $0.00035 / $0.0014 per 1K in/out, 128K ctx |
| Typical EA turn (~4K in / 1K out) | ~$0.0012 | ~$0.0028 |

## Key findings

1. **ORQ8 does not use provider function-calling.** Tools are app-level text-parsed blocks (`tool-registry.ts`/`ea-tools.ts`), so provider tool-call API differences are irrelevant. What matters — followed-instructions + exact output — is verified live on both.
2. **Reasoning-model caveat (measured):** nemotron emits `reasoning_content` and needs adequate `max_tokens`; truncated budgets yield null `content`. At normal budgets `content` is correct. Nothing in `llm.ts` reads `reasoning_content` — no change needed while budgets stay sane; do not cap task calls below ~500 tokens on reasoning models.
3. **No third provider justified.** Two healthy providers + structured fallback cover the workload. Revisit only on sustained quality/cost evidence.

## Strategy (unchanged, now evidenced)

OpenRouter primary (one predictable route, broad catalog), NVIDIA fallback (key pool absorbs parallel-task 429s), dev providers last and never in prod, structured fallback when nothing answers. Fallback preserves capabilities because the tool layer is provider-agnostic text.
