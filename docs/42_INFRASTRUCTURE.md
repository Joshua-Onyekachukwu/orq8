# 42 — Infrastructure

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 42.1 Baseline (free-first, single host)

```
[VPS $5–10/mo or local]
├── docker-compose:
│   ├── postgres:16 (+pgvector)     # primary store
│   ├── minio                      # S3-compatible object storage
│   ├── litellm                    # model gateway (24/7 for agents)
│   ├── ollama                     # local models (optional; needs RAM)
│   ├── orq8-api                   # Fastify + pg-boss workers
│   ├── orq8-web                   # Next.js (static/SSR)
│   └── caddy (or traefik)         # TLS termination
└── docker socket → sandbox containers (30)
```

## 42.2 Components

- **Database:** Postgres 16 + pgvector; single instance now; managed upgrade later (same SQL, ADR-002/005).
- **Object storage:** MinIO (S3 API) → R2/S3 later (endpoint swap only).
- **Queues/workflows:** pg-boss in Postgres → Temporal later (ADR-003).
- **Secrets:** env-based master key → KMS (37/23).
- **Observability:** pino + OTel; optional self-hosted Langfuse (39).
- **Sandbox:** Docker API (30).

## 42.3 Scaling Path (Phase 16)

1. Split web/api into separate services; scale API horizontally behind Caddy.
2. Dedicated worker deployment for workflows/agents.
3. Managed Postgres; managed Redis (or keep pg-boss until Temporal).
4. R2/S3; gVisor sandboxing; region replication per requirements.

## 42.4 Networking & Security

- Private network for internal services; only web/api/TLS exposed.
- Egress allowlists from sandbox; no host network for agents.
- Backups: nightly pg_dump + WAL archiving; MinIO replication (see 53).

## 42.5 Environments

dev (local, compose) · staging (optional VPS) · prod (VPS/managed). Configuration via env vars, validated at boot; no secrets in images (43).
