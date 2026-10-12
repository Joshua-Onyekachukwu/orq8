# ORQ8 Infrastructure Cost Model — 2026-10-12

Assumptions stated; provider prices from official pages checked today (see researcher notes in session). Excludes founder labor. LLM prices from `services/model-router.ts` registry.

## Unit economics (measured models)

| Operation | Shape | Est. provider cost |
|---|---|---|
| EA interaction | 1–3 calls, gpt-4o-mini, ~4K in / 1K out each | $0.001–$0.004 |
| Employee task | ~5 calls mixed mini/nemotron | <$0.01 |
| Task with retries (3x) | 3x the above | <$0.03 |
| Multi-step workflow (10 calls) | 10x EA turn | $0.01–$0.03 |

Credits are metered per call with settlement carrying USD cost (`llm-pricing.ts`); exhausted balances block at zero cost (proven in CI slice).

## Platform (monthly, USD)

| Level | Frontend (Vercel) | API+worker (Railway) | Supabase | Email (Resend free) | Monitoring | Total ex-LLM |
|---|---|---|---|---|---|---|
| MVP / internal (now) | $0 (hobby limits) | ~$5–10 (allowance covers idle) | $0 (free tier) | $0 (≤3K/mo) | $0 (none yet) | **~$5–10** |
| Early adoption | $0–20 | ~$10–30 | $0–25 | $0–20 | $0 (Sentry dev 5K errs) | **~$10–95** |
| Growth (10x jobs) | $20+ | ~$30–80 (RAM $10/GB-mo dominates) | $25+ | $20 (50K) | $26 (Sentry team) | **~$120–170** |

Idle worker (~256MiB) ≈ $2.50/mo before allowances — the main fixed cost; it is also the reason NOT to add Trigger.dev/Cloud Run yet (each adds a platform for ~zero workload).

## Runaway guards (already in tree)

Credit reservation pre-execution, exhaustion blocks at zero cost, per-key 429 smoothing, circuit breakers, EA execution budgets, bounded retries. Missing: spend alerts (recommend with Sentry/monitoring when volume exists).
