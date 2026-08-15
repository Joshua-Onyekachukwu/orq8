# 53 — Disaster Recovery

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 53.1 Objectives

- **RPO:** ≤ 24h (nightly dumps) at baseline; ≤ 15 min with WAL archiving.
- **RTO:** ≤ 2h for single-VPS restore at baseline; minutes with managed services.

## 53.2 Backup Strategy

- **Postgres:** nightly `pg_dump` + continuous WAL archiving to object storage (MinIO → R2).
- **Object storage:** MinIO bucket replication to a second location (or R2 cross-region later).
- **Config:** everything-as-code (compose, migrations, seeds, env.example) — repo is the config backup.
- **Secrets:** master key backed up separately (offline, encrypted); key loss = data unrecoverable — documented in runbook.

## 53.3 Restore Procedures

1. Provision replacement host (or reuse).
2. Restore compose + config from repo.
3. Restore Postgres from latest dump + WAL replay.
4. Restore MinIO buckets (replication or full copy).
5. Restore secrets (env/KMS).
6. Verify: health endpoints, audit chain verification (20.5), golden workflow smoke test.

## 53.4 Business Continuity (§82.2)

Organization continues operating after: agent failure, model/provider/tool outage, agent replacement, restructuring, revoked credentials. Critical workflows declare recovery + handoff (10.5); workflows are durable (15.4) so partial work resumes, never duplicates.

## 53.5 DR Testing

Quarterly restore drill (or monthly for baseline): fresh host → restore → smoke test → documented result. Postmortem → runbook updates (52).

## 53.6 Multi-Region (later, funded)

Managed Postgres with replicas, R2 multi-region, worker pools per region — Phase 16+.
