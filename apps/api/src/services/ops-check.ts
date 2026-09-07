/**
 * ORQ8 Production Operations Check — single source of truth for validating the
 * production environment. Shared by:
 *
 *   - GET /v1/internal/ops-check  (INTERNAL_TOKEN-protected endpoint; runs
 *     against the API service's own production DATABASE_URL)
 *   - scripts/production-check.ts (pnpm ops:check — prefers the endpoint so it
 *     works without a local DATABASE_URL; falls back to a direct local run)
 *
 * Never prints or returns secrets. Each check is a { label, ok, detail } row;
 * the report is safe to render in logs, CI, and the founder UI.
 */
import type { AppConfig } from '@orq8/core';
import { Pool } from 'pg';

export interface OpsCheckRow {
  label: string;
  ok: boolean;
  detail: string;
  category: 'config' | 'database' | 'jobs';
}

export interface OpsCheckReport {
  overall: 'PASS' | 'FAIL';
  checks: OpsCheckRow[];
  warnings: OpsCheckRow[];
  checkedAt: string;
}

async function tableExists(db: Pool, table: string): Promise<boolean> {
  const r = await db.query('select to_regclass($1) as t', [`public.${table}`]);
  return r.rows[0]?.t != null;
}

async function columnExists(db: Pool, table: string, column: string): Promise<boolean> {
  const r = await db.query(
    `select count(*)::int as c from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
    [table, column],
  );
  return ((r.rows[0]?.c as number) ?? 0) > 0;
}

async function columnLike(db: Pool, table: string, like: string): Promise<boolean> {
  const r = await db.query(
    `select count(*)::int as c from information_schema.columns where table_schema='public' and table_name=$1 and column_name ilike $2`,
    [table, like],
  );
  return ((r.rows[0]?.c as number) ?? 0) > 0;
}

async function recentRows(db: Pool, table: string, createdAtColumn: string, days: number, extraWhere = ''): Promise<number> {
  const sql = `select count(*)::int as c from public.${table} where ${createdAtColumn} > now() - make_interval(days => $1)${extraWhere ? ` and ${extraWhere}` : ''}`;
  const r = await db.query(sql, [days]);
  return (r.rows[0]?.c as number) ?? 0;
}

async function recentAudit(db: Pool, action: string, days: number): Promise<number> {
  const r = await db.query(
    `select count(*)::int as c from public.audit_events where action = $1 and occurred_at > now() - make_interval(days => $2)`,
    [action, days],
  );
  return (r.rows[0]?.c as number) ?? 0;
}

/** Run the full ops check. `db` is required; the caller owns the pool. */
export async function runOpsCheck(config: AppConfig, db: Pool): Promise<OpsCheckReport> {
  const days = Number(process.env.CHECK_JOB_DAYS ?? 3);
  const checks: OpsCheckRow[] = [];
  const warnings: OpsCheckRow[] = [];
  const row = (label: string, ok: boolean, detail: string, category: OpsCheckRow['category'] = 'config'): void => {
    checks.push({ label, ok, detail, category });
  };

  // ── Config (presence only — never values) ────────────────────────────────
  const tokenOk = Boolean(config.INTERNAL_TOKEN && config.INTERNAL_TOKEN.length > 12);
  row('INTERNAL_TOKEN', tokenOk, tokenOk ? 'configured (non-empty)' : 'missing or too short');

  const githubOAuth = Boolean(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET);
  row('CONNECTOR OAUTH (GitHub)', githubOAuth, githubOAuth ? 'client id + secret configured' : 'GITHUB_CLIENT_ID/SECRET missing');
  const googleOAuth = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
  row('CONNECTOR OAUTH (Gmail)', googleOAuth, googleOAuth ? 'client id + secret configured' : 'GOOGLE_CLIENT_ID/SECRET missing');

  if (config.RESEND_API_KEY || config.SMTP_HOST) {
    row('EMAIL PROVIDER', true, 'configured');
  } else {
    warnings.push({ label: 'EMAIL PROVIDER', ok: false, detail: 'RESEND_API_KEY or SMTP not configured (dev mode: emails logged)', category: 'config' });
  }
  if (config.EMBEDDING_BASE_URL && config.EMBEDDING_API_KEY) {
    row('EMBEDDINGS', true, 'configured');
  } else {
    warnings.push({ label: 'EMBEDDINGS', ok: false, detail: 'EMBEDDING_BASE_URL/API_KEY not configured — semantic memory falls back to keyword search', category: 'config' });
  }

  // ── Database reachability + migrations ───────────────────────────────────
  try {
    await db.query('select 1');
  } catch {
    return {
      overall: 'FAIL',
      checks: [
        ...checks,
        { label: 'DATABASE', ok: false, detail: 'unreachable — DATABASE_URL must point at the production DB', category: 'database' },
      ],
      warnings,
      checkedAt: new Date().toISOString(),
    };
  }
  row('DATABASE', true, 'reachable', 'database');

  const migrationProbes: Array<{ id: string; name: string; ok: boolean; detail: string }> = [];
  const probe = async (id: string, name: string, fn: () => Promise<boolean>): Promise<void> => {
    try {
      const ok = await fn();
      migrationProbes.push({ id, name, ok, detail: ok ? 'applied' : `not applied — ${name}` });
    } catch {
      migrationProbes.push({ id, name, ok: false, detail: 'probe query failed' });
    }
  };
  await probe('0003', 'teams', () => tableExists(db, 'teams'));
  await probe('0004', 'webhook/event/briefing tables', () => tableExists(db, 'event_rules'));
  await probe('0005', 'integration + engineering tables', () => tableExists(db, 'integration_providers'));
  await probe('0006', 'goals.team_id + tasks.team_id', async () => (await columnExists(db, 'goals', 'team_id')) && (await columnExists(db, 'tasks', 'team_id')));
  await probe('0007', 'simulations proposal column', async () => (await columnLike(db, 'simulations', '%proposal%')) || (await columnLike(db, 'simulations', '%scenario%')));
  await probe('0008', 'knowledge graph tables', () => tableExists(db, 'knowledge_entities'));
  await probe('0009', 'agents.autonomy_level', () => columnExists(db, 'agents', 'autonomy_level'));
  await probe('0010', 'squads tables', () => tableExists(db, 'squads'));
  await probe('0011', 'tasks.squad_id', () => columnExists(db, 'tasks', 'squad_id'));
  await probe('0012', 'mcp + capability registry tables', async () => (await tableExists(db, 'mcp_servers')) && (await tableExists(db, 'capability_registry')));
  await probe('0013', 'business imports (Phase 10)', () => tableExists(db, 'business_imports'));
  for (const p of migrationProbes) {
    row(`MIGRATION ${p.id} (${p.name})`, p.ok, p.detail, 'database');
  }

  // ── Scheduled-job execution evidence (recent rows/audit, not just config) ─
  try {
    const briefings = await recentRows(db, 'briefings', 'created_at', days);
    row('BRIEFING JOB', briefings > 0, briefings > 0 ? `ran (${briefings} briefing(s) in ${days}d)` : `no briefing rows in the last ${days} day(s)`, 'jobs');
  } catch {
    row('BRIEFING JOB', false, 'briefings table not queryable (migration 0004 missing?)', 'jobs');
  }
  try {
    const scans = await recentAudit(db, 'anomaly.scan_completed', days);
    row('ANOMALY JOB', scans > 0, scans > 0 ? `ran (${scans} scan(s) in ${days}d)` : `no 'anomaly.scan_completed' audit rows in the last ${days} day(s)`, 'jobs');
  } catch {
    row('ANOMALY JOB', false, 'audit table not queryable', 'jobs');
  }
  try {
    const consolidations = await recentAudit(db, 'memory.consolidated', days);
    row('CONSOLIDATION JOB', consolidations > 0, consolidations > 0 ? `ran (${consolidations} consolidation(s) in ${days}d)` : `no 'memory.consolidated' audit rows in the last ${days} day(s)`, 'jobs');
  } catch {
    row('CONSOLIDATION JOB', false, 'audit table not queryable', 'jobs');
  }

  const failures = checks.filter((c) => !c.ok);
  return {
    overall: failures.length === 0 ? 'PASS' : 'FAIL',
    checks,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

/** Open a short-lived pool for the local (script) path. Caller must end it. */
export function openCheckPool(connectionString: string): Pool {
  return new Pool({ connectionString, connectionTimeoutMillis: 4000, max: 3 });
}