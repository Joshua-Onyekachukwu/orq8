/**
 * ORQ8 Production Operations Verification
 *
 * One command tells you whether the production environment is correctly
 * configured and whether the critical scheduled infrastructure is actually
 * working. Never prints secrets. Exits non-zero when a required check fails.
 *
 * Usage:
 *   pnpm tsx scripts/production-check.ts
 *   DATABASE_URL=... INTERNAL_TOKEN=... pnpm tsx scripts/production-check.ts
 *
 * Checks:
 *   - INTERNAL_TOKEN configured (never printed)
 *   - Migrations 0003-0012 actually applied (probed against the live DB)
 *   - Connector OAuth configuration present (presence only, never values)
 *   - Scheduled-job execution evidence (briefings / anomaly scan / consolidation)
 */
import { loadConfig } from '@orq8/core';
import { Pool } from 'pg';

interface Row {
  [key: string]: unknown;
}

const results: Array<{ label: string; ok: boolean; detail: string }> = [];
function report(label: string, ok: boolean, detail: string): void {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
}
function note(label: string, detail: string): void {
  results.push({ label, ok: true, detail });
  console.log(`NOTE  ${label}  — ${detail}`);
}

function tableExistsCheck(table: string): (db: Pool) => Promise<string | null> {
  return async (db) => {
    const r = await db.query('select to_regclass($1) as t', [`public.${table}`]);
    return (r.rows[0]?.t as string | null) ?? null;
  };
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

async function main(): Promise<void> {
  const config = loadConfig();
  const days = Number(process.env.CHECK_JOB_DAYS ?? 3);

  console.log('ORQ8 PRODUCTION OPERATIONS VERIFICATION\n');

  // 1. INTERNAL_TOKEN — presence only; never echo the value.
  const tokenOk = Boolean(config.INTERNAL_TOKEN && config.INTERNAL_TOKEN.length > 12);
  report('INTERNAL_TOKEN', tokenOk, tokenOk ? 'configured (non-empty)' : 'missing or too short');

  // 2. Connector OAuth configuration (presence only).
  const githubOAuth = Boolean(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET);
  report('CONNECTOR OAUTH (GitHub)', githubOAuth, githubOAuth ? 'client id + secret configured' : 'GITHUB_CLIENT_ID/SECRET missing');
  const googleOAuth = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
  report('CONNECTOR OAUTH (Gmail)', googleOAuth, googleOAuth ? 'client id + secret configured' : 'GOOGLE_CLIENT_ID/SECRET missing');
  if (config.RESEND_API_KEY || config.SMTP_HOST) {
    report('EMAIL PROVIDER', true, 'configured');
  } else {
    report('EMAIL PROVIDER', false, 'RESEND_API_KEY or SMTP not configured (dev mode: emails logged)');
  }
  if (config.EMBEDDING_BASE_URL && config.EMBEDDING_API_KEY) {
    report('EMBEDDINGS', true, 'configured');
  } else {
    report('EMBEDDINGS', false, 'EMBEDDING_BASE_URL/API_KEY not configured — semantic memory falls back to keyword search');
  }

  // 3. Database — migration + job evidence.
  let pool: Pool | null = null;
  try {
    pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 4000, max: 3 });
    await pool.query('select 1');
  } catch {
    report('DATABASE', false, 'unreachable — DATABASE_URL must point at the production DB');
    return finish(false);
  }

  const db = pool;

  // Migration probes — a table/column that each migration introduced.
  const migrationProbes: Array<{ id: string; name: string; check: (d: Pool) => Promise<string | null> }> = [
    { id: '0003', name: 'teams', check: tableExistsCheck('teams') },
    { id: '0004', name: 'webhook/event/briefing tables', check: tableExistsCheck('event_rules') },
    { id: '0005', name: 'integration + engineering tables', check: tableExistsCheck('integration_providers') },
    { id: '0006', name: 'goals.team_id + tasks.team_id', check: async (d) => ((await columnExists(d, 'goals', 'team_id')) && (await columnExists(d, 'tasks', 'team_id')) ? 'ok' : null) },
    { id: '0007', name: 'simulations proposal column', check: async (d) => ((await columnLike(d, 'simulations', '%proposal%')) || (await columnLike(d, 'simulations', '%scenario%')) ? 'ok' : null) },
    { id: '0008', name: 'knowledge graph tables', check: tableExistsCheck('knowledge_entities') },
    { id: '0009', name: 'agents.autonomy_level', check: async (d) => ((await columnExists(d, 'agents', 'autonomy_level')) ? 'ok' : null) },
    { id: '0010', name: 'squads tables', check: tableExistsCheck('squads') },
    { id: '0011', name: 'tasks.squad_id', check: async (d) => ((await columnExists(d, 'tasks', 'squad_id')) ? 'ok' : null) },
    { id: '0012', name: 'mcp + capability registry tables', check: async (d) => ((await tableExistsCheck('mcp_servers')) && (await tableExistsCheck('capability_registry'))) ? 'ok' : null },
  ];

  for (const probe of migrationProbes) {
    try {
      const r = await probe.check(db);
      report(`MIGRATION ${probe.id} (${probe.name})`, r === 'ok', `not applied — ${probe.name}`);
    } catch {
      report(`MIGRATION ${probe.id} (${probe.name})`, false, 'probe query failed');
    }
  }

  // Optional: Supabase migration tracker (when present).
  try {
    const r = await db.query(`select to_regclass('supabase_migrations.schema_migrations') as t`);
    if (r.rows[0]?.t) {
      const names = await db.query(`select name from supabase_migrations.schema_migrations order by name`);
      const applied = (names.rows as Row[]).map((x) => String(x.name));
      const wanted = ['0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012'];
      const missing = wanted.filter((w) => !applied.some((a) => a.includes(w)));
      note('SUPABASE MIGRATION TRACKER', missing.length === 0 ? `all ${wanted.length} migrations present in tracker` : `tracker missing: ${missing.join(', ')} (see table probes above)`);
    } else {
      note('SUPABASE MIGRATION TRACKER', 'tracker table not present — verified via table/column probes');
    }
  } catch {
    note('SUPABASE MIGRATION TRACKER', 'tracker not queryable — verified via table/column probes');
  }

  // 4. Scheduled-job execution evidence (recent rows/audit, not just config).
  try {
    const briefings = await recentRows(db, 'briefings', 'created_at', days);
    report('BRIEFING JOB', briefings > 0, `no briefing rows in the last ${days} day(s) — job may not have run`);
  } catch {
    report('BRIEFING JOB', false, 'briefings table not queryable (migration 0004 missing?)');
  }
  try {
    const scans = await recentAudit(db, 'anomaly.scan_completed', days);
    report('ANOMALY JOB', scans > 0, `no 'anomaly.scan_completed' audit rows in the last ${days} day(s)`);
  } catch {
    report('ANOMALY JOB', false, 'audit table not queryable');
  }
  try {
    const consolidations = await recentAudit(db, 'memory.consolidated', days);
    report('CONSOLIDATION JOB', consolidations > 0, `no 'memory.consolidated' audit rows in the last ${days} day(s)`);
  } catch {
    report('CONSOLIDATION JOB', false, 'audit table not queryable');
  }

  await db.end();
  finish(true);
}

function finish(dbOk: boolean): never {
  const required = results.filter((r) => r.label !== 'EMAIL PROVIDER' && r.label !== 'EMBEDDINGS' && !r.label.startsWith('NOTE'));
  const failures = required.filter((r) => !r.ok);
  console.log('\n' + '─'.repeat(46));
  console.log(`OVERALL STATUS: ${failures.length === 0 && dbOk ? 'PASS' : 'FAIL'}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`- ${f.label}: ${f.detail}`);
  }
  const warn = results.filter((r) => !r.ok && (r.label === 'EMAIL PROVIDER' || r.label === 'EMBEDDINGS'));
  if (warn.length > 0) {
    console.log('\nWarnings (non-fatal):');
    for (const w of warn) console.log(`- ${w.label}: ${w.detail}`);
  }
  process.exit(failures.length === 0 && dbOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Verification script crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});