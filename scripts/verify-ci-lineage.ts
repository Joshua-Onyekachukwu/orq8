/**
 * Reproduce CI's drizzle provisioning step, to prove the journal gap is closed.
 *
 * CI runs `pnpm --filter @orq8/db migrate`: the drizzle migrator reads
 * migrations/meta/_journal.json and applies ONLY the entries it lists. The
 * embedded test harness (scripts/lib/embedded-db.ts) instead applies the
 * drizzle .sql files by reading the directory, so it applies files the journal
 * omits. That is why plan-revisions passed locally and 500'd in CI: migrations
 * 0013-0021 were on disk, applied by the harness, and invisible to the migrator
 * CI actually runs.
 *
 * This boots a fresh database, runs the drizzle migrator as a child process
 * (exactly as CI does), then asserts the objects that only 0013-0021 create
 * exist. It deliberately does NOT run `migrate:supabase`: that lineage needs
 * the pgvector extension, which the embedded Postgres does not ship (the
 * embedded harness strips pgvector when it applies the directory itself). The
 * journal gap lives entirely in the drizzle step, so that is what we replay.
 */
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { bootEmbeddedDatabase, REPO_ROOT } from './lib/embedded-db.js';

function run(script: string, databaseUrl: string): void {
  const result = spawnSync('pnpm', ['--filter', '@orq8/db', script], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    shell: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`step failed: ${script}`);
  }
}

/** Objects that exist ONLY because of the migrations the journal omitted. */
const EXPECTED: Array<[string, string, string]> = [
  ['table', 'plan_revisions', '0013_add_plan_revisions'],
  ['table', 'agent_jobs', '0014_add_agent_jobs'],
  ['table', 'credit_reservations', '0018_credit_reservations'],
];

// Columns the drizzle journal controls. The `llm_performance` columns from
// 0019/0021 are intentionally absent: they are guarded no-ops here because
// `llm_performance` is created by the Supabase lineage, which CI applies after
// this step (and which returns these columns on that deployment).
const EXPECTED_COLUMNS: Array<[string, string, string, string]> = [
  ['tasks', 'parent_task_id', 'uuid', '0020_task_delegation_parent'],
  ['tasks', 'estimated_credits', 'integer', '0018_credit_reservations'],
  ['credit_balances', 'reserved_credits', 'integer', '0018_credit_reservations'],
];

async function main(): Promise<void> {
  const db = await bootEmbeddedDatabase({
    dbName: 'orq8_ci_lineage',
    dataRoot: '.ci-lineage-data',
    dirPrefix: 'ci-lineage',
  });
  try {
    // A fresh database: bootEmbeddedDatabase already applied the full lineage.
    // Drop the schema so we can replay from zero through CI's own steps.
    await db.pool.query('drop schema public cascade; create schema public;');

    run('migrate', db.databaseUrl);

    const check = new Pool({ connectionString: db.databaseUrl });
    const failures: string[] = [];

    for (const [kind, name, source] of EXPECTED) {
      const q =
        kind === 'table'
          ? 'select to_regclass($1) is not null as present'
          : 'select count(*) > 0 as present from pg_type where typname = $1';
      const arg = kind === 'table' ? `public.${name}` : name;
      const { rows } = await check.query<{ present: boolean }>(q, [arg]);
      if (!rows[0]?.present) failures.push(`${kind} ${name} missing (from ${source})`);
    }

    for (const [table, column, type, source] of EXPECTED_COLUMNS) {
      const { rows } = await check.query<{ data_type: string }>(
        `select data_type from information_schema.columns
          where table_schema = 'public' and table_name = $1 and column_name = $2`,
        [table, column],
      );
      if (rows.length === 0) {
        failures.push(`column ${table}.${column} missing (from ${source})`);
      } else if (!rows[0]!.data_type.startsWith(type)) {
        failures.push(`column ${table}.${column} is ${rows[0]!.data_type}, expected ${type}`);
      }
    }

    await check.end();

    if (failures.length > 0) {
      console.error('\nCI LINEAGE CHECK FAILED:');
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nCI LINEAGE CHECK PASSED — ${EXPECTED.length} objects and ${EXPECTED_COLUMNS.length} columns present after CI's drizzle migrate step.\n`);
  } finally {
    await db.stop();
  }
}

await main();
