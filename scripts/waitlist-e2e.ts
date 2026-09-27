/**
 * Waitlist capture end-to-end test (landing QA, STEP 4.5).
 *
 * Tests the REAL chain: landing form POST → web proxy /api/waitlist →
 * API POST /v1/waitlist → waitlist_signups row in Postgres (the same
 * Supabase-lineage table production uses), then idempotency on repeat.
 *
 * Production note: at test time the Railway API hostname returned
 * "Application not found" (service unreachable), so the capture is exercised
 * against a locally booted REAL API (embedded Postgres + the production
 * migration lineage) instead. Nothing is mocked.
 *
 * Usage: pnpm exec tsx scripts/waitlist-e2e.ts
 */

import { rmSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PG_PORT = 54331;
const WEB_PORT = 4321;
const DB_DIR = path.join(ROOT, ".loadtest-pg");
const DATABASE_URL = `postgres://orq8:orq8_load@localhost:${PG_PORT}/orq8_waitlist?client_encoding=utf8`;

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
      m.includes("vector(") ? "-- [e2e] pgvector embedding column skipped" : m);
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

async function applyMigrations(adminPool: Pool): Promise<void> {
  const baseDir = path.join(ROOT, "packages/db/migrations");
  for (const f of readdirSync(baseDir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of splitDrizzle(readFileSync(path.join(baseDir, f), "utf8"))) {
      await adminPool.query(stmt);
    }
  }
  console.log("  migrations: drizzle base lineage applied");
  await adminPool.query(ROLE_SHIM);
  await adminPool.query(AUTH_SHIM);
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
  console.log(`  migrations: supabase lineage applied (${files.length} files)`);
}

async function main(): Promise<void> {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  rmSync(DB_DIR, { recursive: true, force: true });
  mkdirSync(DB_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: "orq8",
    password: "orq8_load",
    database: "orq8_waitlist",
    port: PG_PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });

  let adminPool: Pool | undefined;
  let app: any;
  let webProc: ReturnType<typeof spawn> | undefined;
  const failures: string[] = [];

  try {
    console.log("[1/5] booting embedded Postgres + production migrations…");
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("orq8_waitlist");
    adminPool = new Pool({ connectionString: DATABASE_URL, max: 5 });
    await applyMigrations(adminPool);

    console.log("[2/5] booting the real API app…");
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = DATABASE_URL;
    const { loadConfig, createLogger } = await import("@orq8/core");
    const { createDb } = await import("@orq8/db");
    const { buildApp } = await import("../apps/api/src/app.js");
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: DATABASE_URL,
      SESSION_SECRET: "waitlist-e2e-session-secret-32b",
      ENCRYPTION_KEY: "waitlist-e2e-encryption-key-32byte",
      LOG_LEVEL: "silent",
    } as NodeJS.ProcessEnv);
    const logger = createLogger(config);
    const created = createDb(DATABASE_URL);
    app = await buildApp({ config, db: created.db, pool: created.pool, logger });
    await app.ready();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const apiPort = (app.server.address() as { port: number }).port;
    console.log(`    API on http://127.0.0.1:${apiPort}`);

    console.log("[3/5] starting the built web app with API_URL pointed at it…");
    webProc = spawn("pnpm", ["exec", "next", "start", "-p", String(WEB_PORT)], {
      cwd: path.join(ROOT, "apps/web"),
      env: { ...process.env, API_URL: `http://127.0.0.1:${apiPort}` },
      stdio: "ignore",
      shell: true,
    });
    const webBase = `http://127.0.0.1:${WEB_PORT}`;
    let webUp = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch(webBase);
        if (res.ok) { webUp = true; break; }
      } catch { /* not up yet */ }
    }
    if (!webUp) throw new Error("web app did not start on port " + WEB_PORT);
    console.log(`    web on ${webBase}`);

    console.log("[4/5] exercising the capture through the real chain…");
    const email = `landing-qa-${Date.now()}@orq8test.com`;
    const post = async (em: string) => {
      const t0 = performance.now();
      const res = await fetch(`${webBase}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, source: "landing" }),
      });
      return { status: res.status, body: (await res.json().catch(() => null)) as any, ms: performance.now() - t0 };
    };

    const first = await post(email);
    if (first.status !== 201 || first.body?.data?.email !== email) {
      failures.push(`first signup: HTTP ${first.status} ${JSON.stringify(first.body)} (${first.ms.toFixed(0)}ms)`);
    } else {
      console.log(`    signup 201 in ${first.ms.toFixed(0)}ms → ${first.body.data.email} (status: ${first.body.data.status})`);
    }
    const again = await post(email);
    if (again.status !== 200 || again.body?.data?.already !== true) {
      failures.push(`idempotent repeat: HTTP ${again.status} ${JSON.stringify(again.body)}`);
    } else {
      console.log(`    repeat 200, already=true (no duplicate row)`);
    }
    const bad = await post("not-an-email");
    if (bad.status !== 400) failures.push(`invalid email: HTTP ${bad.status} (want 400)`);
    else console.log(`    invalid email rejected 400`);

    console.log("[5/5] verifying the row landed in waitlist_signups…");
    const check = await adminPool.query(
      `SELECT email, source, status, created_at FROM waitlist_signups WHERE email = $1`,
      [email],
    );
    if (check.rows.length !== 1) failures.push(`waitlist_signups rows for ${email}: ${check.rows.length} (want 1)`);
    else {
      const row = check.rows[0] as { email: string; source: string; status: string };
      console.log(`    row: ${row.email} source=${row.source} status=${row.status}`);
      if (row.source !== "landing") failures.push(`source mismatch: ${row.source}`);
    }
    const count = await adminPool.query(`SELECT count(*)::int AS n FROM waitlist_signups`);
    console.log(`    total rows in table: ${(count.rows[0] as { n: number }).n}`);

    if (failures.length === 0) {
      console.log("\nPASS — waitlist capture works end to end: form proxy → API validation → Postgres row, idempotent repeats, invalid input rejected.");
    } else {
      console.log(`\nFAIL — ${failures.length} problem(s):`);
      for (const f of failures) console.log(`  ✗ ${f}`);
    }
    process.exitCode = failures.length === 0 ? 0 : 1;
  } catch (err) {
    console.error("\nWaitlist e2e crashed:", err);
    process.exitCode = 2;
  } finally {
    try { webProc?.kill(); } catch {}
    try { await app?.close(); } catch {}
    try { await adminPool?.end(); } catch {}
    try { await Promise.race([pg.stop(), new Promise((r) => setTimeout(r, 10_000))]); } catch {}
    try { rmSync(DB_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); } catch {}
    console.log("[cleanup] embedded Postgres stopped, data dir removed.");
  }
}

void main();
