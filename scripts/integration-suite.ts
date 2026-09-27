/**
 * API integration suite runner.
 *
 * The integration suites (`apps/api/test/*.integration.test.ts`) skip unless a
 * real PostgreSQL is reachable through DATABASE_URL. CI provides one as a
 * service; locally there is often none (no Docker on this machine), so those
 * 36 suites silently skip and the verification battery is weaker than it looks.
 *
 * This runner closes that gap: it boots an embedded PostgreSQL, applies the
 * production migration lineage (drizzle + supabase, with the same pgvector and
 * auth-schema shims the E2E harnesses use), then runs vitest with DATABASE_URL
 * pointed at it. Nothing inside ORQ8 is stubbed.
 *
 * Usage:
 *   pnpm exec tsx scripts/integration-suite.ts                 (all suites)
 *   pnpm exec tsx scripts/integration-suite.ts approvals       (name filter)
 */

import { rmSync, mkdirSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.join(ROOT, ".integration-suite-data");
/**
 * Each run gets its own data directory. On Windows a killed postmaster can
 * leave its shared-memory segment behind, keyed by data-directory path, and
 * `initdb` then refuses to start ("pre-existing shared memory block is still
 * in use"). A fresh path per run sidesteps that class of stale-process failure.
 */
const DB_DIR = path.join(DATA_ROOT, `run-${Date.now()}`);
const DB_NAME = "orq8_integration_suite";

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

// ── Migration helpers (same shape as scripts/auth-e2e.ts) ────────────────────

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
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, "-- [suite] pgvector skipped")
    .replace(/DO\s*\$\$[\s\S]*?END\s*\$\$;/gi, (m) =>
      m.includes("vector(") ? "-- [suite] pgvector embedding column skipped" : m,
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
      const sql = withoutVector(readFileSync(path.join(supaDir, file), "utf8"));
      try {
        const drops = scopedDrops(sql);
        if (drops) await adminPool.query(drops);
        await adminPool.query(sql);
        pending.delete(file);
        progressed = true;
      } catch (err) {
        lastErrors.set(file, (err as Error).message?.split("\n")[0] ?? String(err));
      }
    }
    if (!progressed) break;
  }
  if (pending.size > 0) {
    throw new Error(
      `migrations failed:\n${[...pending].map((f) => `  ${f}: ${lastErrors.get(f) ?? "?"}`).join("\n")}`,
    );
  }
}

async function main(): Promise<void> {
  const filter = process.argv[2];
  const port = await freePort();
  const databaseUrl = `postgres://orq8:orq8_load@localhost:${port}/${DB_NAME}?client_encoding=utf8`;

  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  // Windows keeps a handle on a data dir for a moment after its postmaster is
  // killed, so a leftover dir from an interrupted run can refuse deletion
  // (EPERM) even though nothing is running. Retry briefly, then give up and
  // start from a clean sibling directory rather than failing the whole run.
  const dataDir = DB_DIR;
  mkdirSync(dataDir, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "orq8",
    password: "orq8_load",
    database: DB_NAME,
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });

  let stopped = false;
  const stopPg = async () => {
    if (stopped) return;
    stopped = true;
    try {
      await pg.stop();
    } catch {
      /* already down */
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        rmSync(dataDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    try {
      rmSync(DATA_ROOT, { recursive: true, force: true });
    } catch {
      /* a leftover dir is harmless and gitignored */
    }
    if (existsSync(dataDir)) console.warn(`[suite] data dir left behind: ${dataDir}`);
  };

  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(DB_NAME);
    const pool = new Pool({ connectionString: databaseUrl });
    await applyMigrations(pool);
    await pool.end();
    console.log(`[suite] embedded Postgres ready on ${port}, migrations applied`);

    const args = ["--filter", "@orq8/api", "exec", "vitest", "run", ...(filter ? [filter] : [])];
    const code: number = await new Promise((resolve) => {
      const child = spawn("pnpm", args, {
        cwd: ROOT,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          NODE_ENV: "test",
          LOG_LEVEL: "silent",
        },
        stdio: "inherit",
        shell: true,
      });
      child.on("exit", (c) => resolve(c ?? 1));
    });
    console.log(`[suite] vitest exit code ${code}`);
    await stopPg();
    // Exit explicitly: vitest workers and the pg module can hold handles open,
    // which would otherwise leave the runner hanging after the suites finish.
    process.exit(code);
  } catch (err) {
    console.error(`[suite] fatal: ${(err as Error).message}`);
    await stopPg();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(`[suite] fatal: ${(err as Error).message}`);
  process.exit(1);
});
