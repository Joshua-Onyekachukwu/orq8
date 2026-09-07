import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Applies supabase/migrations/*.sql (the real ORQ8 schema lineage, 0001-0015)
// to a plain PostgreSQL (CI service / local test DB). Supabase-only objects
// referenced by the migrations are shimmed so they can run anywhere:
//
//   - auth.uid()   -> returns NULL (RLS policies evaluate to deny for direct
//                     access; the API connects as a superuser/service role and
//                     is unaffected by RLS, exactly like production)
//   - auth.users   -> minimal id-only table (users.id FK target)
//
// The pgvector extension must be available (pgvector/pgvector image — the same
// one infra/docker-compose.yml uses). Everything is idempotent (the migration
// files use IF NOT EXISTS throughout), so re-running is safe.

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
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select null::uuid $$;
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

const DROP_TRIGGERS = `
-- The 0002 files both create *_set_updated_at triggers (Postgres has no
-- CREATE TRIGGER IF NOT EXISTS). Dropping all of them before every file keeps
-- the set idempotent across runs and across files. Each drop is wrapped so a
-- not-yet-created table is skipped (42P01) instead of aborting the run.
do $$ begin
  begin drop trigger if exists agents_set_updated_at on public.agents; exception when undefined_table then null; end;
  begin drop trigger if exists company_memory_set_updated_at on public.company_memory; exception when undefined_table then null; end;
  begin drop trigger if exists credit_balances_set_updated_at on public.credit_balances; exception when undefined_table then null; end;
  begin drop trigger if exists departments_set_updated_at on public.departments; exception when undefined_table then null; end;
  begin drop trigger if exists event_rules_set_updated_at on public.event_rules; exception when undefined_table then null; end;
  begin drop trigger if exists files_set_updated_at on public.files; exception when undefined_table then null; end;
  begin drop trigger if exists goals_set_updated_at on public.goals; exception when undefined_table then null; end;
  begin drop trigger if exists onboarding_states_set_updated_at on public.onboarding_states; exception when undefined_table then null; end;
  begin drop trigger if exists providers_set_updated_at on public.providers; exception when undefined_table then null; end;
  begin drop trigger if exists subscriptions_set_updated_at on public.subscriptions; exception when undefined_table then null; end;
  begin drop trigger if exists tasks_set_updated_at on public.tasks; exception when undefined_table then null; end;
  begin drop trigger if exists teams_set_updated_at on public.teams; exception when undefined_table then null; end;
  begin drop trigger if exists user_provider_keys_set_updated_at on public.user_provider_keys; exception when undefined_table then null; end;
  begin drop trigger if exists users_set_updated_at on public.users; exception when undefined_table then null; end;
end $$;
`;

const DROP_POLICIES = `
-- CREATE POLICY has no IF NOT EXISTS either. Drop every RLS policy on public
-- tables before each file so re-runs stay idempotent (the migrations recreate
-- the policies they need). Tables that don't exist yet are skipped.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;
`;

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
      // Drop before every file keeps the set idempotent across runs and across
      // files (every trigger/policy is recreated by whichever file creates it).
      await db.execute(DROP_TRIGGERS);
      await db.execute(DROP_POLICIES);
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