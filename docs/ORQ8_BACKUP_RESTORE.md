# ORQ8 Backup & Restore — Actual Production Architecture

Status: PROCEDURE (founder-run where prod access is required). This document
covers the REAL stack — Supabase Postgres, Vercel (web + API), S3-compatible
object storage. `docs/53_DISASTER_RECOVERY.md` describes a VPS/MinIO baseline
that is NOT production; treat it as superseded for recovery purposes until its
owner aligns it.

## 1. What protects each layer

| Layer | Mechanism (verify in dashboard) | Owner check |
|-------|-------------------------------|-------------|
| Postgres (Supabase) | Daily automated backups + Point-In-Time Recovery (retention depends on plan — confirm PITR window in Supabase dashboard → Database → Backups) | Founder: record plan + PITR window here: [___] |
| Web + API (Vercel) | Every deployment immutable + instant rollback; source in GitHub | Redeploy or one-click rollback |
| Object storage (S3) | Bucket versioning + cross-region replication (confirm both ON) | Founder: confirm here: [___] |
| Config | GitHub repo (migrations, workflows, env.examples) | — |
| Secrets | Env vars in Vercel project settings; master key offline per runbook | Rotation procedure on exposure |

RPO target: ≤ PITR granularity (minutes) for DB; ≤ last deployment for code.
RTO target: ≤ 2h for full DB restore + redeploy (measure on first drill).

## 2. Restore procedures (isolated first, prod second)

Database (Supabase): Dashboard → Database → Backups → restore to a NEW
project/branch first; run `scripts/rls-security-e2e.ts` (59 checks) + login
smoke + audit-chain verify against the restored copy; only then restore prod
(or promote the branch). Never restore over prod untested.

Vercel: Deployments tab → redeploy a known-good build, or `git revert` +
push through the normal pipeline (canary + gates must pass).

Storage: versioned restore of affected keys; verify signed-URL reads per org.

Secrets: re-enter from offline backup; rotate anything that touched the
incident (see `ORQ8_SECRET_ROTATION_PROCEDURE.md`).

## 3. Quarterly restore drill (founder-run, record below)

1. Restore DB backup to an isolated project. 2. Run RLS matrix + smoke.
3. Redeploy API+web from repo to preview. 4. Record RTO achieved + gaps.
No drill has been recorded yet — the first drill is a launch-gate item.

| Date | Scope | RTO achieved | Gaps | Run by |
|------|-------|--------------|------|--------|
| — | — | — | — | — |

## 4. Kill switches (no restore needed)

- Agent execution: per-agent/per-org emergency-stop + resume (owner/admin).
- AI spend: `/v1/budgets/kill-switch` (owner/admin) — same gate as credit
  purchase. Both verified by integration tests.
