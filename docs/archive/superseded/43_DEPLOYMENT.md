# 43 — Deployment

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 43.1 Pipeline (GitHub Actions, free tier)

```
push → lint → typecheck → unit → integration (dockerized Postgres)
     → API contracts → e2e (deterministic models) → security scans
     → build images → deploy (staging → prod, gated)
```

## 43.2 Artifacts

- `orq8-api` container: Fastify + workers (pg-boss in-process initially).
- `orq8-web` container: Next.js (standalone output).
- Migration step: `drizzle-kit migrate` runs before API roll-out; migrations are forward-only.
- Seeds: idempotent (default org/constitution/templates only when absent).

## 43.3 Targets

| Stage | Target | Notes |
|-------|--------|-------|
| dev | local docker compose | hot reload |
| staging | VPS | mirrors prod config; real BYOK keys in CI secrets |
| prod | VPS (compose) → managed (fly.io/Railway/K8s later) | TLS via Caddy; backups enabled (53) |

## 43.4 Secrets in Deploy

- Env vars / CI secrets; master key from deployment environment (never in repo or image).
- `apps/*/.env.example` committed; real `.env` never.
- No secrets in images, logs, or health endpoints.

## 43.5 Rollout & Rollback

- Blue/green or simple stop-start on single VPS (downtime ~seconds for MVP).
- Rollback = redeploy previous image + backward-compatible migrations (write migration that can be rolled back or forward-fixed).
- Feature flags for high-risk surfaces (voice, payment executors).

## 43.6 Health & Monitoring

`/healthz` (api, web), `/readyz` (db, litellm, minio). Alerts wired per 39.3.
