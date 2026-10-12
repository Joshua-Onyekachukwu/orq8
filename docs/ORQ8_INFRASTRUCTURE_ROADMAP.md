# ORQ8 Infrastructure Roadmap — 2026-10-12 (priority order)

1. **Email secret** (founder, minutes): set `RESEND_API_KEY` on the API service → clears the only red release-gate item. Code + provider check already shipped.
2. **DB Migrate connectivity** (infra, hours): diagnose Actions→pooler ECONNRESET (secret vs network). Until fixed, use the hand-apply procedure (`ORQ8_MIGRATION_AND_ROLLBACK_PLAN.md`). No schema work is blocked.
3. **Canonical web host** (founder decision): Vercel vs Railway web — stop serving both.
4. **Error monitoring** (eng, hours, on first users): Sentry dev plan (5K errors/mo free) + wire OTel exporter (seam ready in `tracing.ts`).
5. **`REDIS_URL`** (eng, hour, before 2nd API replica): Upstash; rate limits already code-complete for it.
6. **Spend alerts** (eng, with monitoring): weekly provider-cost vs credit-margin check from existing ledger data.
7. **Revisit Trigger.dev** (only if): durable approval-pauses or run dashboards become requirements — not for job volume alone.
8. **Revisit Cloud Run** (only if): Railway pricing or regions pinch — `Dockerfile.cloudrun` is the kept option.
9. **Branch protection** (minutes): require CI on `main` now that it is 11/11 green.
