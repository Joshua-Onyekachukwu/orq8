/**
 * Supabase RLS security test matrix (Supabase task STEP 3).
 *
 * Boots an embedded Postgres, applies the full supabase/migrations lineage
 * (including 0033_rls_hardening), then executes every matrix check as REAL
 * SQL under REAL roles:
 *
 *   - as the real PostgREST role `authenticated` with request.jwt.claims set
 *     to a user's uuid (exactly what PostgREST does for a caller's JWT), and
 *   - as the real role `anon` with NO claims (the unauthenticated case;
 *     auth.uid() returns NULL and every membership EXISTS() is false).
 *
 * Role names matter: the lineage declares its policies `TO authenticated`
 * (a few `TO anon, authenticated`). A custom test role matches none of them,
 * Postgres then default-denies every statement, and the matrix would report
 * passes while validating nothing. The actor therefore IS the real
 * PostgREST role.
 *
 * This validates the policies themselves, not the UI. An admin pool runs the
 * fixture setup only (superuser, BYPASSRLS) and is never used for the checks.
 *
 * Run: pnpm exec tsx scripts/rls-security-e2e.ts
 */
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_DIR = path.join(ROOT, ".rls-e2e-pg");
const PGDATA_ESC = DB_DIR.replace(/\\/g, "\\\\");
const DB_NAME = "orq8_rls_e2e";

let PG_PORT = 54336;
let DATABASE_URL = `postgres://orq8:orq8_load@localhost:${PG_PORT}/${DB_NAME}?client_encoding=utf8`;

async function freePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

const failures: string[] = [];
let passCount = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passCount += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Migration application (same shape as scripts/auth-e2e.ts) ────────────────

function splitDrizzle(sql: string): string[] {
  return sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
}
function supabaseOrder(a: string, b: string): number {
  const n = (f: string) => parseInt(/^(\d+)_/.exec(f)?.[1] ?? "9999", 10);
  const rank = (f: string) => (n(f) === 5 ? 4.5 : n(f) === 4 ? 4.6 : n(f));
  return rank(a) - rank(b);
}
function withoutVector(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, "-- [e2e] pgvector skipped")
    .replace(/DO\s*\$\$[\s\S]*?END\s*\$\$;/gi, (m) =>
      m.includes("vector(") ? "-- [e2e] pgvector embedding column skipped" : m,
    );
}
function scopedDrops(sql: string): string {
  const toNames = (m: RegExpMatchArray[] | IterableIterator<RegExpMatchArray>) =>
    [...m].map((g) => g[1]).filter((n): n is string => typeof n === "string");
  const policyNames = toNames(sql.matchAll(/create\s+policy\s+"?([a-z0-9_]+)"?/gi));
  const triggerNames = toNames(sql.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+"?([a-z0-9_]+)"?/gi));
  const quote = (n: string) => `'${n.replace(/'/g, "''")}'`;
  const blocks: string[] = [];
  if (policyNames.length > 0) {
    const list = policyNames.map(quote).join(",");
    blocks.push(`do $$ declare r record; begin for r in select schemaname, tablename, policyname from pg_policies where policyname in (${list}) loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop; end $$;`);
  }
  if (triggerNames.length > 0) {
    const list = triggerNames.map(quote).join(",");
    blocks.push(`do $$ declare r record; begin for r in select n.nspname as schemaname, c.relname as tablename, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and t.tgname in (${list}) loop execute format('drop trigger if exists %I on %I.%I', r.tgname, r.schemaname, r.tablename); end loop; end $$;`);
  }
  return blocks.join("\n");
}
const AUTH_SHIM = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
`;
const ROLE_SHIM = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
`;
const EMBEDDING_SHIM = `
alter table company_memory add column if not exists embedding jsonb;
`;

async function applyMigrations(adminPool: Pool): Promise<void> {
  const baseDir = path.join(ROOT, "packages/db/migrations");
  for (const f of readdirSync(baseDir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of splitDrizzle(readFileSync(path.join(baseDir, f), "utf8"))) {
      await adminPool.query(stmt);
    }
  }
  await adminPool.query(ROLE_SHIM);
  await adminPool.query(AUTH_SHIM);
  await adminPool.query(EMBEDDING_SHIM);
  const supaDir = path.join(ROOT, "supabase/migrations");
  const files = readdirSync(supaDir).filter((f) => f.endsWith(".sql")).sort().sort(supabaseOrder);
  const pending = new Set(files);
  const lastErrors = new Map<string, string>();
  let pass = 0;
  while (pending.size > 0 && pass < 10) {
    pass += 1;
    let progressed = false;
    for (const file of [...pending]) {
      const raw = readFileSync(path.join(supaDir, file), "utf8");
      const sql = withoutVector(raw);
      try {
        const drops = scopedDrops(sql);
        if (drops) await adminPool.query(drops);
        await adminPool.query(sql);
        pending.delete(file);
        progressed = true;
        console.log(`      [migrate] ${file} (pass ${pass})`);
      } catch (err) {
        lastErrors.set(file, err instanceof Error ? err.message.split("\n")[0] : String(err));
      }
    }
  }
  if (pending.size > 0) {
    throw new Error(
      `migrations failed:\n${[...pending].map((f) => `  ${f}: ${lastErrors.get(f) ?? "?"}`).join("\n")}`,
    );
  }
}

// ── Role helpers: run SQL as a PostgREST-equivalent restricted role ──────────

const CLIENT_ROLE_SQL = `
-- The exact roles PostgREST uses: nologin, NO superuser, NO bypassrls.
-- (ROLE_SHIM creates them earlier; the guards keep this runnable alone.)
-- The grants mirror Supabase's default privilege set for these roles (full
-- DML on public; RLS is what restricts rows, not the grant set).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;
grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant usage, select on all sequences in schema public to authenticated, anon;
`;

async function makeActorPool(connectionString: string): Promise<Pool> {
  const pool = new Pool({ connectionString, max: 2 });
  await pool.query("select 1");
  return pool;
}

/**
 * One connection acting as a PostgREST client role with a given user claim.
 *
 *   userId set   -> role `authenticated` + claims {"sub": userId}
 *   userId null  -> role `anon` + no claims (unauthenticated caller)
 *
 * Everything runs inside one explicit transaction: set_config(..., is_local)
 * is transaction-scoped, and node-postgres runs each statement in its own
 * autocommit transaction — without the BEGIN, the role and claims would roll
 * back before the first test query and the actor would silently run as the
 * superuser (BYPASSRLS), faking every result.
 *
 * Expected rejections are caught by the test body itself and the transaction
 * continues (a failed statement inside a transaction only poisons it until a
 * SAVEPOINT rollback, which the runner performs automatically after any
 * error, so one denial never corrupts the next check). ROLLBACK at the end
 * discards any partial writes the policies (correctly) rejected.
 */
async function act(
  adminPool: Pool,
  userId: string | null,
  fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>) => Promise<void>,
): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('role', '${userId ? "authenticated" : "anon"}', true)`);
    if (userId) {
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId }),
      ]);
    } else {
      await client.query("SELECT set_config('request.jwt.claims', '', true)");
    }
    let savepoint = 0;
    const wrapped = async (sql: string, params?: unknown[]) => {
      savepoint += 1;
      const sp = `sp_${savepoint}`;
      await client.query(`SAVEPOINT ${sp}`);
      try {
        return await client.query(sql, params);
      } catch (err) {
        // A policy rejection aborts the transaction; roll back to the
        // savepoint taken before this statement so the actor can continue.
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        throw err;
      }
    };
    await fn(wrapped);
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch { /* already aborted */ }
    client.release();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  PG_PORT = await freePort();
  DATABASE_URL = `postgres://orq8:orq8_load@localhost:${PG_PORT}/${DB_NAME}?client_encoding=utf8`;

  // Kill leftover embedded-postgres postmasters from a crashed prior run
  // (Windows shared-memory key stays held otherwise).
  if (process.platform === "win32") {
    try {
      const { execSync } = await import("node:child_process");
      const ps =
        `Get-CimInstance Win32_Process -Filter "name='postgres.exe'" | ` +
        `Where-Object { $_.CommandLine -like '*@embedded-postgres*' -or $_.CommandLine -like '*${PGDATA_ESC}*' } | ` +
        `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      const b64 = Buffer.from(ps, "utf16le").toString("base64");
      execSync(`powershell -NoProfile -EncodedCommand ${b64}`, { timeout: 20_000, stdio: "ignore" });
    } catch {
      /* nothing to kill */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: "orq8",
    password: "orq8_load",
    port: PG_PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  let adminPool: Pool | null = null;
  try {
    console.log("[1/4] booting embedded Postgres + full migration lineage…");
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(DB_NAME);
    adminPool = new Pool({ connectionString: DATABASE_URL, max: 6 });
    adminPool.on("error", () => {});
    await applyMigrations(adminPool);
    await adminPool.query(CLIENT_ROLE_SQL);

    // STEP 4.3: FK index coverage. A child FK column with no index where it
    // leads makes every parent delete/update a seq scan (org/user rows churn
    // constantly in this app). Report all gaps, assert the tenant hot paths.
    const fkGaps = await adminPool.query(`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey) AS k(col)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.col
      WHERE c.contype = 'f'
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid AND i.indkey[0] = k.col
        )
      ORDER BY 1, 2`);
    console.log(
      `      FK columns lacking a leading index (${fkGaps.rows.length}): ` +
        (fkGaps.rows.length === 0
          ? "none"
          : fkGaps.rows.map((r) => `${r.tbl}.${r.col}`).join(", ")),
    );
    check(
      "every FK column has a leading index (0034 invariant)",
      fkGaps.rows.length === 0,
      fkGaps.rows.length === 0
        ? undefined
        : fkGaps.rows.map((r) => `${r.tbl}.${r.col}`).join(", "),
    );
    const hotPaths = await adminPool.query(`
      WITH need(rel, col, must_lead) AS (
        VALUES ('tasks'::regclass, 'org_id', true),
               ('agents'::regclass, 'org_id', true),
               ('approvals'::regclass, 'org_id', true),
               ('company_memory'::regclass, 'org_id', true),
               ('audit_events'::regclass, 'org_id', true),
               ('tasks'::regclass, 'status', false)
      )
      SELECT count(*)::int AS missing
      FROM need n
      JOIN pg_attribute a ON a.attrelid = n.rel AND a.attname = n.col
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = n.rel
          AND a.attnum::int = ANY (string_to_array(i.indkey::text, ' ')::int[])
          AND (
            NOT n.must_lead
            OR split_part(i.indkey::text, ' ', 1)::int = a.attnum::int
          )
      )`);
    check(
      "tenant hot-path indexes present (org-leading on 5 tables + tasks status)",
      Number(hotPaths.rows[0]?.missing ?? -1) === 0,
      `missing ${hotPaths.rows[0]?.missing}`,
    );

    console.log("[2/4] fixture: two companies, one member each + one outsider…");

    // Fixture as superuser (setup only). auth.users needs rows for the FK.
    const users = {
      a: "11111111-1111-4111-8111-111111111111",
      b: "22222222-2222-4222-8222-222222222222",
      out: "33333333-3333-4333-8333-333333333333",
      // c: plain member of Company A (privilege-escalation subject)
      c: "44444444-4444-4444-8444-444444444444",
    };
    for (const id of Object.values(users)) {
      await adminPool.query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
      // The drizzle lineage's users table is NOT keyed on auth.users; it is a
      // standalone profile table with its own id FK'd from memberships.
      await adminPool.query(
        `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'rls-test-only') ON CONFLICT DO NOTHING`,
        [id, `rls-${id.slice(0, 8)}@test.com`],
      );
    }
    const orgA = "aaaaaaaa-0000-4000-8000-00000000aaaa";
    const orgB = "bbbbbbbb-0000-4000-8000-00000000bbbb";
    for (const [id, name] of [[orgA, "Company A"], [orgB, "Company B"]] as const) {
      await adminPool.query(
        `INSERT INTO organizations (id, name, slug, plan) VALUES ($1, $2, $3, 'free')
         ON CONFLICT DO NOTHING`,
        [id, name, `rls-${name.toLowerCase().replace(/\s+/g, "-")}`],
      );
    }
    // memberships: a -> org A (owner), b -> org B (owner), c -> org A (member)
    for (const [orgId, userId, role] of [
      [orgA, users.a, "owner"],
      [orgB, users.b, "owner"],
      [orgA, users.c, "member"],
    ] as const) {
      await adminPool.query(
        `INSERT INTO memberships (org_id, user_id, role, status) VALUES ($1, $2, $3, 'active')
         ON CONFLICT DO NOTHING`,
        [orgId, userId, role],
      );
    }
    // Departments, agents, tasks, approvals, memory in BOTH companies.
    const deptA = "aaaaaaaa-1111-4000-8000-00000000aaaa";
    const deptB = "bbbbbbbb-1111-4000-8000-00000000bbbb";
    for (const [orgId, deptId, dname] of [
      [orgA, deptA, "A Engineering"],
      [orgB, deptB, "B Engineering"],
    ] as const) {
      await adminPool.query(
        `INSERT INTO departments (id, org_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [deptId, orgId, dname],
      );
    }
    const agentA = "aaaaaaaa-2222-4000-8000-00000000aaaa";
    const agentB = "bbbbbbbb-2222-4000-8000-00000000bbbb";
    // The agents.department_id column only exists where migration 0002b applied
    // (in the unified lineage it does); resolve it defensively so the fixture
    // works on both shapes.
    const hasDeptCol = await adminPool.query(
      "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'department_id'",
    );
    const deptColSql = Number(hasDeptCol.rows[0]?.n ?? 0) > 0 ? ", department_id" : "";
    const deptColVal = Number(hasDeptCol.rows[0]?.n ?? 0) > 0 ? ", $3" : "";
    for (const [orgId, deptId, agentId, aname] of [
      [orgA, deptA, agentA, "A Agent"],
      [orgB, deptB, agentB, "B Agent"],
    ] as const) {
      await adminPool.query(
        `INSERT INTO agents (id, org_id${deptColSql}, name, role, status)
         VALUES ($1, $2${deptColVal}, $4, 'Analyst', 'active') ON CONFLICT DO NOTHING`,
        Number(hasDeptCol.rows[0]?.n ?? 0) > 0 ? [agentId, orgId, deptId, aname] : [agentId, orgId, aname],
      );
    }
    const taskA = "aaaaaaaa-3333-4000-8000-00000000aaaa";
    const taskB = "bbbbbbbb-3333-4000-8000-00000000bbbb";
    for (const [orgId, agentId, taskId, title] of [
      [orgA, agentA, taskA, "A secret task"],
      [orgB, agentB, taskB, "B secret task"],
    ] as const) {
      await adminPool.query(
        `INSERT INTO tasks (id, org_id, agent_id, title) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [taskId, orgId, agentId, title],
      );
    }
    const approvalA = "aaaaaaaa-4444-4000-8000-00000000aaaa";
    for (const [orgId, agentId, approvalId] of [
      [orgA, agentA, approvalA],
      [orgB, agentB, "bbbbbbbb-4444-4000-8000-00000000bbbb"],
    ] as const) {
      await adminPool.query(
        `INSERT INTO approvals (id, org_id, agent_id, action, risk_level, status)
         VALUES ($1, $2, $3, 'external_communicate', 'high', 'pending')
         ON CONFLICT DO NOTHING`,
        [approvalId, orgId, agentId],
      );
    }
    const memoryA = "aaaaaaaa-5555-4000-8000-00000000aaaa";
    for (const [orgId, memoryId] of [
      [orgA, memoryA],
      [orgB, "bbbbbbbb-5555-4000-8000-00000000bbbb"],
    ] as const) {
      await adminPool.query(
        `INSERT INTO company_memory (id, org_id, category, content) VALUES ($1, $2, 'fact', 'secret memory')
         ON CONFLICT DO NOTHING`,
        [memoryId, orgId],
      );
    }
    for (const [orgId] of [[orgA], [orgB]] as const) {
      await adminPool.query(
        `INSERT INTO audit_events (org_id, actor_type, action, outcome, prev_hash, hash)
         VALUES ($1, 'system', 'rls.fixture', 'success', 'prev', 'hash')`,
        [orgId],
      );
    }
    for (const [orgId] of [[orgA], [orgB]] as const) {
      const sub = await adminPool.query(
        `INSERT INTO subscriptions (id, org_id, plan, status, current_period_start, current_period_end)
         VALUES (gen_random_uuid(), $1, 'founder', 'active', now(), now() + interval '30 days')
         RETURNING id`,
        [orgId],
      );
      const subId = sub.rows[0].id as string;
      await adminPool.query(
        `INSERT INTO credit_balances (id, org_id, subscription_id, included_credits, used_credits, period_start, period_end)
         VALUES (gen_random_uuid(), $1, $2, 1000, 100, now(), now() + interval '30 days')`,
        [orgId, subId],
      );
    }

    // One template owned by Company B so the scoping policy has something
    // to hide from A (the system catalog rows come from migration 0017).
    await adminPool.query(
      `INSERT INTO department_templates (name, slug, org_id)
       VALUES ('B private template', 'rls-test-b-template', $1)
       ON CONFLICT DO NOTHING`,
      [orgB],
    );

    // Fixture sanity (as superuser): the checks below are only meaningful if
    // the fixture actually landed.
    const sanity = await adminPool.query(
      `SELECT
        (SELECT count(*)::int FROM memberships) AS memberships,
        (SELECT count(*)::int FROM tasks) AS tasks,
        (SELECT count(*)::int FROM audit_events) AS audits,
        (SELECT count(*)::int FROM agents) AS agents`,
    );
    console.log(
      `      fixture sanity: ${JSON.stringify(sanity.rows[0])}`,
    );

    console.log("[3/4] security matrix (real SQL as PostgREST roles)…");

    // Actor diagnostics: prove every check below runs as the intended role
    // with a resolvable auth.uid(). If auth.uid() were NULL here, every
    // membership EXISTS() would be false and denials would pass vacuously.
    await act(adminPool, users.a, async (q) => {
      const diag = await q(
        `SELECT current_user AS role, coalesce(auth.uid()::text, 'NULL') AS uid`,
      );
      console.log(`      actor diagnostics: ${JSON.stringify(diag.rows[0])}`);
      check(
        "actor runs as authenticated with resolvable auth.uid()",
        diag.rows[0]?.role === "authenticated" && diag.rows[0]?.uid === users.a,
        `got ${JSON.stringify(diag.rows[0])}`,
      );
    });

    // ── 3.1 Cross-company isolation on every tenant surface ────────────────
    // User A must see nothing of Company B's rows; vice versa. Include
    // "guessed UUID" semantics: A queries B's rows by their exact ids.
    const crossChecks: Array<{ table: string; idCol: string; bRowId: string; writeCol: string; writeVal: string }> = [
      { table: "tasks", idCol: "id", bRowId: taskB, writeCol: "title", writeVal: "'hacked'" },
      { table: "approvals", idCol: "id", bRowId: "bbbbbbbb-4444-4000-8000-00000000bbbb", writeCol: "status", writeVal: "'approved'" },
      { table: "company_memory", idCol: "id", bRowId: "bbbbbbbb-5555-4000-8000-00000000bbbb", writeCol: "category", writeVal: "'hacked'" },
      { table: "departments", idCol: "id", bRowId: deptB, writeCol: "name", writeVal: "'hacked'" },
      { table: "agents", idCol: "id", bRowId: agentB, writeCol: "name", writeVal: "'hacked'" },
    ];
    for (const c of crossChecks) {
      await act(adminPool, users.a, async (q) => {
        const sel = await q(`SELECT count(*)::int AS n FROM ${c.table} WHERE ${c.idCol} = $1`, [c.bRowId]);
        check(`A cannot READ Company B ${c.table} by id`, Number(sel.rows[0]?.n ?? 0) === 0, `got ${sel.rows[0]?.n}`);
      });
      await act(adminPool, users.a, async (q) => {
        const upd = await q(`UPDATE ${c.table} SET ${c.writeCol} = ${c.writeVal} WHERE ${c.idCol} = $1 RETURNING 1`, [c.bRowId]);
        check(`A cannot UPDATE Company B ${c.table} by id`, upd.rowCount === 0, `updated ${upd.rowCount}`);
      });
      await act(adminPool, users.a, async (q) => {
        const del = await q(`DELETE FROM ${c.table} WHERE ${c.idCol} = $1 RETURNING 1`, [c.bRowId]);
        check(`A cannot DELETE Company B ${c.table} by id`, del.rowCount === 0, `deleted ${del.rowCount}`);
      });
    }
    // Audit: A cannot read B's ledger rows.
    await act(adminPool, users.a, async (q) => {
      const sel = await q(
        `SELECT count(*)::int AS n FROM audit_events WHERE org_id = $1`, [orgB],
      );
      check("A cannot READ Company B audit_events", Number(sel.rows[0]?.n ?? 0) === 0, `got ${sel.rows[0]?.n}`);
    });
    // Credit isolation both directions.
    await act(adminPool, users.a, async (q) => {
      const sel = await q(`SELECT count(*)::int AS n FROM credit_balances WHERE org_id = $1`, [orgB]);
      check("A cannot READ Company B credit_balances", Number(sel.rows[0]?.n ?? 0) === 0, `got ${sel.rows[0]?.n}`);
    });
    await act(adminPool, users.b, async (q) => {
      const sel = await q(`SELECT count(*)::int AS n FROM tasks WHERE org_id = $1`, [orgA]);
      check("B cannot READ Company A tasks", Number(sel.rows[0]?.n ?? 0) === 0, `got ${sel.rows[0]?.n}`);
    });
    // A CAN still read own-company rows (sanity: policies did not lock everyone out).
    await act(adminPool, users.a, async (q) => {
      const sel = await q(`SELECT count(*)::int AS n FROM tasks WHERE org_id = $1`, [orgA]);
      check("A can still read own company tasks (no lockout)", Number(sel.rows[0]?.n ?? 0) === 1, `got ${sel.rows[0]?.n}`);
      const own = await q(`SELECT count(*)::int AS n FROM audit_events WHERE org_id = $1`, [orgA]);
      check("A can still read own audit ledger", Number(own.rows[0]?.n ?? 0) === 1, `got ${own.rows[0]?.n}`);
    });

    // ── 3.2 No membership self-escalation ─────────────────────────────────
    await act(adminPool, users.a, async (q) => {
      let escalated = false;
      try {
        const ins = await q(
          `INSERT INTO memberships (org_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active') RETURNING 1`,
          [orgB, users.a],
        );
        escalated = ins.rowCount !== 0;
      } catch {
        escalated = false; // rejected
      }
      check("A cannot INSERT own membership into Company B", !escalated);
      const member = await q(
        `SELECT count(*)::int AS n FROM memberships WHERE org_id = $1 AND user_id = $2`,
        [orgB, users.a],
      );
      check("No phantom membership row exists after attempt", Number(member.rows[0]?.n ?? 0) === 0);
      const bTasks = await q(`SELECT count(*)::int AS n FROM tasks WHERE org_id = $1`, [orgB]);
      check("A still cannot read Company B data after escalation attempt", Number(bTasks.rows[0]?.n ?? 0) === 0);
    });
    // A plain member cannot rewrite role/membership rows either.
    await act(adminPool, users.c, async (q) => {
      let escalated = false;
      try {
        const upd = await q(
          `UPDATE memberships SET role = 'owner' WHERE user_id = $1 RETURNING 1`,
          [users.c],
        );
        escalated = upd.rowCount !== 0;
      } catch {
        escalated = false;
      }
      check("member C cannot escalate own membership role", !escalated);
      let touchedOwner = false;
      try {
        const upd = await q(
          `UPDATE memberships SET role = 'viewer' WHERE user_id = $1 RETURNING 1`,
          [users.a],
        );
        touchedOwner = upd.rowCount !== 0;
      } catch {
        touchedOwner = false;
      }
      check("member C cannot modify the owner's membership row", !touchedOwner);
      const me = await q(`SELECT role FROM memberships WHERE user_id = $1`, [users.c]);
      check(
        "member C role unchanged after attempts",
        me.rows[0]?.role === "member",
        `got ${me.rows[0]?.role}`,
      );
    });

    // ── 3.3 Unauthenticated requests are rejected on protected tables ─────
    const protectedTables = [
      "tasks", "approvals", "company_memory", "audit_events", "agents",
      "departments", "credit_balances", "files", "notifications",
    ];
    for (const t of protectedTables) {
      await act(adminPool, null, async (q) => {
        let n = -1;
        try {
          const sel = await q(`SELECT count(*)::int AS n FROM ${t}`);
          n = Number(sel.rows[0]?.n ?? -1);
        } catch {
          n = 0; // permission denied also counts as rejected
        }
        check(`unauthenticated cannot READ ${t}`, n === 0, `got ${n}`);
      });
    }
    await act(adminPool, null, async (q) => {
      let wrote = false;
      try {
        const ins = await q(`INSERT INTO tasks (id, org_id, title) VALUES (gen_random_uuid(), $1, 'anon') RETURNING 1`, [orgA]);
        wrote = ins.rowCount !== 0;
      } catch {
        wrote = false;
      }
      check("unauthenticated cannot WRITE tasks", !wrote);
    });

    // ── 3.4 Approvals/credits cannot be decided/minted by clients ─────────
    await act(adminPool, users.a, async (q) => {
      let approved = false;
      try {
        // A approves B's request (cross-org) — must be invisible AND unwritable.
        const upd = await q(
          `UPDATE approvals SET status = 'approved', decided_at = now() WHERE id = $1 RETURNING 1`,
          ["bbbbbbbb-4444-4000-8000-00000000bbbb"],
        );
        approved = upd.rowCount !== 0;
      } catch {
        approved = false;
      }
      check("A cannot approve Company B's request by writing the row", !approved);
      // A approves their OWN pending approval directly (bypassing app flow).
      let selfApproved = false;
      try {
        const upd = await q(
          `UPDATE approvals SET status = 'approved', decided_at = now() WHERE id = $1 RETURNING 1`,
          [approvalA],
        );
        selfApproved = upd.rowCount !== 0;
      } catch {
        selfApproved = false;
      }
      check("A cannot approve own request by writing the approval row", !selfApproved);
      // A mints credits.
      let minted = false;
      try {
        const ins = await q(
          `INSERT INTO credit_balances (id, org_id, subscription_id, included_credits, used_credits, period_start, period_end)
           VALUES (gen_random_uuid(), $1, gen_random_uuid(), 999999, 0, now(), now()) RETURNING 1`,
          [orgA],
        );
        minted = ins.rowCount !== 0;
      } catch {
        minted = false;
      }
      check("A cannot mint credit_balances rows", !minted);
      let forged = false;
      try {
        const upd = await q(
          `UPDATE credit_balances SET used_credits = 0 WHERE org_id = $1 RETURNING 1`,
          [orgA],
        );
        forged = upd.rowCount !== 0;
      } catch {
        forged = false;
      }
      check("A cannot rewrite own credit usage", !forged);
    });
    // Budget: subscriptions (billing state) is read-only for clients.
    await act(adminPool, users.a, async (q) => {
      let upgraded = false;
      try {
        const upd = await q(
          `UPDATE subscriptions SET plan = 'enterprise' WHERE org_id = $1 RETURNING 1`,
          [orgA],
        );
        upgraded = upd.rowCount !== 0;
      } catch {
        upgraded = false;
      }
      check("A cannot upgrade own subscription plan by writing the row", !upgraded);
      let deleted = false;
      try {
        const del = await q(`DELETE FROM subscriptions WHERE org_id = $1 RETURNING 1`, [orgA]);
        deleted = del.rowCount !== 0;
      } catch {
        deleted = false;
      }
      check("A cannot delete own subscription row", !deleted);
      const sub = await q(`SELECT plan FROM subscriptions WHERE org_id = $1`, [orgA]);
      check(
        "A can still read own subscription",
        sub.rows.length === 1 && sub.rows[0]?.plan === "founder",
        `rows ${sub.rows.length} plan ${sub.rows[0]?.plan}`,
      );
    });
    // Approvals: clients may file NEW pending requests, never pre-decided ones.
    await act(adminPool, users.a, async (q) => {
      let forged = false;
      try {
        const ins = await q(
          `INSERT INTO approvals (id, org_id, agent_id, action, risk_level, status)
           VALUES (gen_random_uuid(), $1, $2, 'external_communicate', 'high', 'approved') RETURNING 1`,
          [orgA, agentA],
        );
        forged = ins.rowCount !== 0;
      } catch {
        forged = false;
      }
      check("A cannot INSERT a pre-approved approval row", !forged);
      const pending = await q(
        `INSERT INTO approvals (id, org_id, agent_id, action, status)
         VALUES (gen_random_uuid(), $1, $2, 'external_communicate', 'pending') RETURNING id`,
        [orgA, agentA],
      );
      check(
        "A can file a new pending approval (allowed path)",
        pending.rowCount === 1,
        `inserted ${pending.rowCount}`,
      );
    });

    // ── 3.5 Audit ledger is append-only from the client side ──────────────
    await act(adminPool, users.a, async (q) => {
      let updated = false;
      try {
        const upd = await q(`UPDATE audit_events SET outcome = 'success' WHERE org_id = $1 RETURNING 1`, [orgA]);
        updated = upd.rowCount !== 0;
      } catch {
        updated = false;
      }
      check("A cannot UPDATE audit records", !updated);
      let deleted = false;
      try {
        const del = await q(`DELETE FROM audit_events WHERE org_id = $1 RETURNING 1`, [orgA]);
        deleted = del.rowCount !== 0;
      } catch {
        deleted = false;
      }
      check("A cannot DELETE audit records", !deleted);
      // Insert by a client is also denied (the API appends via service role;
      // a founder should not be able to forge ledger entries either).
      let forged = false;
      try {
        const ins = await q(
          `INSERT INTO audit_events (org_id, actor_type, action, outcome, prev_hash, hash)
           VALUES ($1, 'user', 'forged', 'success', 'x', 'y') RETURNING 1`,
          [orgA],
        );
        forged = ins.rowCount !== 0;
      } catch {
        forged = false;
      }
      check("A cannot INSERT forged audit records", !forged);
      const own = await q(`SELECT count(*)::int AS n FROM audit_events WHERE org_id = $1`, [orgA]);
      check("A can still read own audit ledger", Number(own.rows[0]?.n ?? 0) === 1, `got ${own.rows[0]?.n}`);
    });

    // ── 3.6 Template catalog scoping ──────────────────────────────────────
    await act(adminPool, users.a, async (q) => {
      const total = await q(`SELECT count(*)::int AS n FROM department_templates`);
      check(
        "A can read the system template catalog",
        Number(total.rows[0]?.n ?? 0) >= 1,
        `got ${total.rows[0]?.n}`,
      );
      const bTpl = await q(
        `SELECT count(*)::int AS n FROM department_templates WHERE slug = 'rls-test-b-template'`,
      );
      check(
        "A cannot read Company B's custom templates",
        Number(bTpl.rows[0]?.n ?? 0) === 0,
        `got ${bTpl.rows[0]?.n}`,
      );
    });
    await act(adminPool, null, async (q) => {
      let n = -1;
      try {
        const tpl = await q(`SELECT count(*)::int AS n FROM department_templates`);
        n = Number(tpl.rows[0]?.n ?? -1);
      } catch {
        n = 0;
      }
      check("unauthenticated cannot read department templates", n === 0, `got ${n}`);
    });

    console.log("[4/4] summary");
  } finally {
    try {
      await adminPool?.end();
    } catch { /* shutdown races */ }
    try {
      await pg.stop();
    } catch { /* shutdown races */ }
  }

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("FAILURES:");
    for (const f of failures) console.log(`  x ${f}`);
  }
  // Exit explicitly: on success the embedded-postgres child handles keep the
  // event loop alive and the process would hang after printing the summary.
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("RLS e2e crashed:", err);
  process.exit(1);
});
