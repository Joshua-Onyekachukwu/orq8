import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Applies supabase/migrations/*.sql (the real ORQ8 schema lineage, 0001-0015)
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
-- Supabase built-in roles referenced by RLS grant statements.
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

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('[db] creating auth shim');
  await db.execute(AUTH_SHIM);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    // 0005 is misnumbered relative to 0004: 0004's connector_outcomes has a FK
    // to integration_providers, which 0005 creates (its own header says it's
    // "needed by 0004's connector_outcomes"). Apply the integration foundation
    // (0005) before 0004 so the standalone lineage is dependency-correct.
    .sort((a, b) => orderIdx(a) - orderIdx(b));

  // Multi-pass apply: every statement is idempotent (IF NOT EXISTS, guarded
  // ADD COLUMN, plus the trigger/policy drops above), so a file that fails only
  // because a dependency column/table is created by a differently-ordered file
  // succeeds on a later pass once that dependency exists. This also lets the
  // supabase lineage apply on top of a pre-existing drizzle-applied schema
  // (the production case) without hand-coding every cross-file ordering.
  const pending = new Set(files);
  let pass = 0;
  while (pending.size > 0 && pass < 10) {
    pass += 1;
    let progressed = false;
    for (const file of [...pending]) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[db] applying ${file} (pass ${pass})`);
      // Drop only the objects THIS file creates, so re-runs stay idempotent
      // while policies/triggers created by other files are preserved.
      const drops = scopedDrops(sql);
      if (drops) await db.execute(drops);
      try {
        await db.execute(sql);
        pending.delete(file);
        progressed = true;
      } catch {
        // Leave it pending; a later pass may succeed once dependencies exist.
      }
    }
    if (!progressed) break;
  }
  if (pending.size > 0) {
    throw new Error(
      `migrations could not be applied after ${pass} passes: ${[...pending].join(', ')}`,
    );
  }

  await pool.end();
  console.log('[db] supabase migrations applied (0001-0015)');
}

main().catch((err) => {
  console.error('[db] migration failed:', err);
  process.exit(1);
});