import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readFile, readdir } from 'node:fs/promises';
import type { Pool } from 'pg';
import { createPool } from './db.js';
import {
  migrationName,
  planLedger,
  summarizeLedger,
  type LedgerEntry,
  type LedgerRow,
  type LedgerSummary,
} from './migration-ledger.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Applies supabase/migrations/*.sql (the real ORQ8 schema lineage, 0001 onward)
// to a plain PostgreSQL (CI service / local test DB). Supabase-only objects
// referenced by the migrations are shimmed so they can run anywhere:
//
//   - auth.uid()   -> reads the request.jwt.claims 'sub' (Supabase semantics),
//                     so membership-based RLS policies evaluate correctly when
//                     a test sets claims and queries as a restricted role
//   - auth.users   -> minimal id-only table (users.id FK target)
//
// The pgvector extension must be available (pgvector/pgvector image — the same
// one infra/docker-compose.yml uses). Re-running is safe: before each file we
// drop only the policies/triggers that file itself creates (scopedDrops), so
// nothing is wiped and duplicate objects are avoided.
//
// What a database has actually received is recorded in
// supabase_migrations.schema_migrations (the Supabase CLI's own table), so the
// lineage state of any database can be read instead of inferred, and a second
// run skips the files that are already there instead of replaying all 34.
// `--status` reports the ledger and writes nothing; `--force` replays every
// file (all statements are idempotent) when a database has to be reconciled
// with what is on disk.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

const databaseUrl: string =
  process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8';

/** Apply-order index: 0005 must precede 0004 (see main()); everything else is numeric prefix order. */
function orderIdx(file: string): number {
  const m = /^(\d+)_/.exec(file);
  const n = m?.[1] !== undefined ? parseInt(m[1], 10) : 9999;
  // swap only within the {0004, 0005} pair so 0005's integration foundation
  // (integration_providers) is in place before 0004's connector_outcomes FK.
  if (n === 5) return 4.5;
  if (n === 4) return 4.6;
  return n;
}

const AUTH_SHIM = `
-- Minimal Supabase auth shim so migrations referencing auth.* can run on plain Postgres.
-- auth.uid() mirrors Supabase: it reads the request JWT claim (sub) set via
-- select set_config('request.jwt.claims', '{"sub": "<uuid>"}', true), so RLS
-- policies that are membership-based via auth.uid() evaluate correctly under
-- a restricted test role. Returns NULL when no claim is set (deny).
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
`;

// Supabase built-in roles referenced by RLS grant statements. Always run:
// on plain Postgres they must be created, on real Supabase they already
// exist (the duplicate_object exception is caught). The DO blocks make this
// idempotent on both.
const ROLE_SHIM = `
do $$ begin
  create role anon nologin;
  exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
  exception when duplicate_object then null;
end $$;
`;

/**
 * Drop only the RLS policies and triggers that the given migration file itself
 * creates, so re-running a file is idempotent WITHOUT wiping objects created
 * by other files. Policies use IF NOT EXISTS guards, but CREATE TRIGGER does
 * not exist for plain triggers (the early *_set_updated_at files are
 * unguarded), so we look each name up in the catalog and drop it before the
 * file recreates it. Objects owned by other files are left intact.
 */
function scopedDrops(sql: string): string {
  const toNames = (m: RegExpMatchArray[] | IterableIterator<RegExpMatchArray>) =>
    [...m].map((g) => g[1]).filter((n): n is string => typeof n === 'string');
  // Names may be quoted (e.g. create policy "mcp_servers_select_org") — drop
  // the surrounding double quotes so the name matches the catalog.
  const policyNames = toNames(sql.matchAll(/create\s+policy\s+"?([a-z0-9_]+)"?/gi));
  const triggerNames = toNames(sql.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+"?([a-z0-9_]+)"?/gi));
  const quote = (n: string) => `'${n.replace(/'/g, "''")}'`;
  const blocks: string[] = [];
  if (policyNames.length > 0) {
    const list = policyNames.map(quote).join(',');
    blocks.push(`do $$ declare r record; begin for r in select schemaname, tablename, policyname from pg_policies where policyname in (${list}) loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop; end $$;`);
  }
  if (triggerNames.length > 0) {
    const list = triggerNames.map(quote).join(',');
    blocks.push(`do $$ declare r record; begin for r in select n.nspname as schemaname, c.relname as tablename, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and t.tgname in (${list}) loop execute format('drop trigger if exists %I on %I.%I', r.tgname, r.schemaname, r.tablename); end loop; end $$;`);
  }
  return blocks.join('\n');
}

/**
 * The ledger table is the Supabase CLI's, kept shape-compatible because the
 * question it answers (what has this database actually received) is the same
 * one. Two columns are ours: `version` holds the migration file stem rather
 * than a CLI timestamp (this lineage has a duplicate 0002 prefix, so a prefix
 * is not a key), and `checksum` makes an edited file detectable rather than
 * silently skipped.
 */
const LEDGER_DDL = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[]
);
alter table supabase_migrations.schema_migrations add column if not exists checksum text;
`;

/** The runner's own client: untyped on purpose, it only executes raw SQL. */
type Runner = ReturnType<typeof drizzle>;

/** The host only. A connection string never reaches a log line. */
function targetLabel(): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return 'database';
  }
}

/**
 * Applied migrations, read without creating anything: a database that has never
 * been recorded reports an empty ledger, which reads as "everything pending".
 */
async function readLedger(pool: Pool): Promise<LedgerRow[]> {
  const present = await pool.query<{ present: boolean }>(
    `select to_regclass('supabase_migrations.schema_migrations') is not null as present`,
  );
  if (!present.rows[0]?.present) return [];
  const rows = await pool.query<LedgerRow>(
    `select version, checksum from supabase_migrations.schema_migrations`,
  );
  return rows.rows;
}

async function ensureLedger(db: Runner): Promise<void> {
  await db.execute(LEDGER_DDL);
}

async function recordApplied(db: Runner, entry: LedgerEntry): Promise<void> {
  await db.execute(sql`
    insert into supabase_migrations.schema_migrations (version, name, created_by, checksum)
    values (${entry.version}, ${migrationName(entry.file)}, 'orq8 migrate-supabase', ${entry.checksum})
    on conflict (version) do update
      set checksum = excluded.checksum,
          name = excluded.name,
          created_by = excluded.created_by
  `);
}

function printLedger(entries: LedgerEntry[], summary: LedgerSummary): void {
  for (const entry of entries) {
    const mark = entry.state === 'applied' ? '=' : entry.state === 'changed' ? '~' : '+';
    console.log(`[db] ${mark} ${entry.file}`);
  }
  console.log(
    `[db] ledger ${targetLabel()}: ${summary.applied}/${summary.total} applied, ` +
      `${summary.pending} pending, ${summary.changed} changed ` +
      '(= applied, + pending, ~ changed since it was recorded)',
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const force = args.has('--force');
  const statusOnly = args.has('--status');

  const pool = createPool(databaseUrl);
  const db = drizzle(pool);

  // The lineage as it exists on disk, in apply order.
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    // 0005 is misnumbered relative to 0004: 0004's connector_outcomes has a FK
    // to integration_providers, which 0005 creates (its own header says it's
    // "needed by 0004's connector_outcomes"). Apply the integration foundation
    // (0005) before 0004 so the standalone lineage is dependency-correct.
    .sort((a, b) => orderIdx(a) - orderIdx(b));
  const sources = await Promise.all(
    files.map(async (file) => ({
      file,
      sql: await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'),
    })),
  );

  const entries = planLedger(sources, await readLedger(pool), force);
  const summary = summarizeLedger(entries);

  if (statusOnly) {
    printLedger(entries, summary);
    await pool.end();
    return;
  }

  console.log(
    `[db] lineage ${targetLabel()}: ${summary.total} files — ${summary.applied} applied, ` +
      `${summary.pending} pending, ${summary.changed} changed${force ? ' (--force: replaying all)' : ''}`,
  );
  await ensureLedger(db);

  // Install the auth shim ONLY when the target is plain Postgres. On a real
  // Supabase database the auth schema already exists with Supabase's own
  // auth.uid() — clobbering it with our shim would be dangerous even though
  // the semantics match. Gate on the function's existence so the same runner
  // is safe in CI/local (shim installed) and against production Supabase
  // (shim skipped, real auth.uid() untouched).
  const shimCheck = await pool.query(
    `select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'auth' and p.proname = 'uid') as present`,
  );
  // Roles first — always (idempotent, needed for grant statements either way).
  await db.execute(ROLE_SHIM);
  if (shimCheck.rows[0]?.present === true) {
    console.log('[db] real Supabase auth detected — skipping auth shim');
  } else {
    console.log('[db] creating auth shim');
    await db.execute(AUTH_SHIM);
  }

  // Multi-pass apply: every statement is idempotent (IF NOT EXISTS, guarded
  // ADD COLUMN, plus the trigger/policy drops above), so a file that fails only
  // because a dependency column/table is created by a differently-ordered file
  // succeeds on a later pass once that dependency exists. This also lets the
  // supabase lineage apply on top of a pre-existing drizzle-applied schema
  // (the production case) without hand-coding every cross-file ordering.
  const byFile = new Map(sources.map((source) => [source.file, source]));
  const pending = new Map(
    entries.filter((entry) => entry.state !== 'applied').map((entry) => [entry.file, entry]),
  );
  const appliedNow = pending.size;
  const failures = new Map<string, string>();
  let pass = 0;
  while (pending.size > 0 && pass < 10) {
    pass += 1;
    let progressed = false;
    for (const entry of [...pending.values()]) {
      const source = byFile.get(entry.file);
      if (!source) continue;
      console.log(
        `[db] applying ${entry.file}${entry.state === 'changed' ? ' (changed since it was recorded)' : ''} (pass ${pass})`,
      );
      // Drop only the objects THIS file creates, so re-runs stay idempotent
      // while policies/triggers created by other files are preserved.
      const drops = scopedDrops(source.sql);
      if (drops) await db.execute(drops);
      try {
        await db.execute(source.sql);
        // Recorded the moment it succeeds, so an interrupted run loses nothing.
        await recordApplied(db, entry);
        pending.delete(entry.file);
        failures.delete(entry.file);
        progressed = true;
      } catch (err) {
        // Leave it pending; a later pass may succeed once dependencies exist.
        failures.set(entry.file, err instanceof Error ? err.message : String(err));
      }
    }
    if (!progressed) break;
  }
  if (pending.size > 0) {
    const detail = [...pending.keys()]
      .map((file) => `${file} (${failures.get(file) ?? 'a dependency is still missing'})`)
      .join('; ');
    throw new Error(`migrations could not be applied after ${pass} passes: ${detail}`);
  }

  await pool.end();
  console.log(
    appliedNow === 0
      ? `[db] supabase lineage up to date: ${summary.applied} files already applied (latest ${files[files.length - 1]})`
      : `[db] supabase migrations applied: ${appliedNow} file(s); ${summary.applied} were already applied (latest ${files[files.length - 1]})`,
  );
}

main().catch((err) => {
  console.error('[db] migration failed:', err);
  process.exit(1);
});