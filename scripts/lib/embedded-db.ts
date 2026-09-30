/**
 * Embedded PostgreSQL boot + production migration lineage, shared by the API
 * harnesses (integration suite, vertical slice E2E).
 *
 * No Docker and no system Postgres on this machine, so every harness that needs
 * real SQL boots its own disposable server here and applies the same lineage
 * production runs (drizzle base + the supabase migrations, with the auth/role
 * shims and the scoped drop handling the idempotent pass needs). Nothing inside
 * ORQ8 is stubbed: the harnesses talk to this database exactly like production.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");

export interface EmbeddedDatabase {
  databaseUrl: string;
  port: number;
  dataDir: string;
  /** Admin pool on the harness database (max 5 connections, errors muted). */
  pool: Pool;
  /** Stop the server and delete its data directory. Safe to call twice. */
  stop: () => Promise<void>;
}

export interface BootOptions {
  /** Database name inside the embedded server. */
  dbName: string;
  /** Root for per-run data directories (relative to the repo root or absolute). */
  dataRoot?: string;
  /** Directory name prefix, so concurrent harnesses never share a data dir. */
  dirPrefix?: string;
  /** Fixed port (handy when a proxy config expects one); 0 picks a free port. */
  port?: number;
}

/** An ephemeral port nothing is listening on right now. */
export async function freePort(): Promise<number> {
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
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, "-- [harness] pgvector skipped")
    .replace(/DO\s*\$\$[\s\S]*?END\s*\$\$;/gi, (m) =>
      m.includes("vector(") ? "-- [harness] pgvector embedding column skipped" : m,
    );
}

/**
 * The supabase lineage is written to be re-runnable; drop the policies/triggers
 * a file creates before applying it, so a second pass does not fail on
 * `already exists` and force the multi-pass loop to give up.
 */
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

const ROLE_SHIM = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
`;

const AUTH_SHIM = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
`;

const EMBEDDING_SHIM = `
alter table company_memory add column if not exists embedding jsonb;
`;

/** Apply the full production migration lineage to a fresh database. */
export async function applyMigrations(pool: Pool): Promise<void> {
  const baseDir = path.join(REPO_ROOT, "packages/db/migrations");
  for (const f of readdirSync(baseDir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of splitDrizzle(readFileSync(path.join(baseDir, f), "utf8"))) {
      await pool.query(stmt);
    }
  }
  await pool.query(ROLE_SHIM);
  await pool.query(AUTH_SHIM);
  await pool.query(EMBEDDING_SHIM);

  const supaDir = path.join(REPO_ROOT, "supabase/migrations");
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
        if (drops) await pool.query(drops);
        await pool.query(sql);
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

/**
 * Boot a disposable embedded PostgreSQL with the production schema applied.
 * Each run gets its own data directory: on Windows a killed postmaster can
 * leave its shared-memory segment behind (keyed by data-directory path) and
 * `initdb` then refuses to start ("pre-existing shared memory block is still
 * in use"), so a fresh path sidesteps that class of stale-process failure.
 */
export async function bootEmbeddedDatabase(options: BootOptions): Promise<EmbeddedDatabase> {
  const dataRoot = path.isAbsolute(options.dataRoot ?? "")
    ? (options.dataRoot as string)
    : path.join(REPO_ROOT, options.dataRoot ?? ".integration-suite-data");
  const port = options.port && options.port > 0 ? options.port : await freePort();
  const dataDir = path.join(dataRoot, `${options.dirPrefix ?? "run"}-${Date.now()}`);
  const databaseUrl = `postgres://orq8:orq8_load@localhost:${port}/${options.dbName}?client_encoding=utf8`;

  mkdirSync(dataDir, { recursive: true });
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "orq8",
    password: "orq8_load",
    database: options.dbName,
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(options.dbName);

  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  // A pool client whose socket dies during shutdown emits on the pool; an
  // unhandled 'error' event would crash the harness after the results.
  pool.on("error", () => {});
  await applyMigrations(pool);

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await pool.end().catch(() => undefined);
    try {
      await pg.stop();
    } catch {
      /* already down */
    }
    // Windows keeps a handle on a data dir for a moment after its postmaster is
    // killed, so deletion can hit EPERM; retry briefly, then move on.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        rmSync(dataDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (existsSync(dataDir)) console.warn(`[harness] data dir left behind: ${dataDir}`);
  };

  return { databaseUrl, port, dataDir, pool, stop };
}

/**
 * On Windows, kill any postmaster left behind by an interrupted run of the
 * embedded distribution. A stale postmaster holds the shared-memory key and
 * makes every later boot fail. Only processes whose command line contains
 * `@embedded-postgres` are touched, so a user-installed Postgres is never
 * affected — and pass `scope` to narrow that further to one harness's data
 * root, so running the tests cannot stop a review stack's database.
 */
export async function killStaleEmbeddedPostgres(scope?: string): Promise<void> {
  if (process.platform !== "win32") return;
  const { execSync } = await import("node:child_process");
  // `scope` is the data root this harness uses (e.g. ".integration-suite-data",
  // ".review-stack-data"). Only postmasters serving that root are stopped, so a
  // harness cannot take down an unrelated stack on the same machine — a blanket
  // kill used to stop a running review stack's database, and every page in the
  // reviewer's browser then answered 500 (ECONNREFUSED) with no visible cause.
  const safeScope = (scope ?? "").replace(/[^A-Za-z0-9._-]/g, "");
  const filter = safeScope
    ? `Where-Object { $_.CommandLine -like '*@embedded-postgres*' -and $_.CommandLine -like '*${safeScope}*' }`
    : `Where-Object { $_.CommandLine -like '*@embedded-postgres*' }`;
  try {
    const ps =
      `Get-CimInstance Win32_Process -Filter "name='postgres.exe'" | ` +
      `${filter} | ` +
      `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    const b64 = Buffer.from(ps, "utf16le").toString("base64");
    execSync(`powershell -NoProfile -EncodedCommand ${b64}`, { timeout: 20_000, stdio: "ignore" });
  } catch {
    /* nothing to kill */
  }
  await new Promise((r) => setTimeout(r, 2_000));
}
