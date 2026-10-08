/**
 * DR drill — prove the production database is restorable, and measure how long
 * that takes.
 *
 *   pnpm exec tsx scripts/dr-drill.ts dump
 *   pnpm exec tsx scripts/dr-drill.ts restore [--keep-db]
 *   pnpm exec tsx scripts/dr-drill.ts full
 *
 * `dump`   reads every public base table from the live database (DBURL env or
 *          --db-url) and writes one JSONL file per table into .dr-backup/,
 *          plus dr-manifest.json (row counts, sequence state, timings). The
 *          manifest is also the completeness marker: `restore` refuses to run
 *          against a directory without one.
 * `restore` boots a disposable embedded PostgreSQL, applies the SAME migration
 *          lineage production runs (scripts/lib/embedded-db.ts), bulk-loads
 *          every dumped table in one transaction with foreign keys and user
 *          triggers disabled (session_replication_role = replica), resets
 *          sequences, then verifies:
 *            1. every restored table's row count equals the manifest count
 *               (backup fidelity),
 *            2. live prod counts vs the manifest (drift since the dump —
 *               reported, not a failure: prod keeps moving),
 *            3. the audit-chain verifier passes on BOTH the restored copy and
 *               live prod (the tamper-evident record survives the round trip).
 * `full`   runs dump then restore and prints the RPO/RTO summary.
 *
 * Known, documented limitations (also recorded in docs/83):
 *   • only the `public` schema (the application's data) is exercised; the
 *     Supabase-managed `auth.users` credential store and the `vault` schema
 *     are not reachable from here — an Auth-side recovery is a Supabase
 *     console operation, not part of this drill.
 *   • pgvector is not in the embedded binary, so `company_memory.embedding`
 *     restores into the lineage's jsonb shim column (all prod values are
 *     NULL today, so nothing is lost; if embeddings go live, revisit).
 *   • float8 NaN/Infinity serialise to JSON `null` (none exist in the data
 *     today).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Pool, type PoolClient } from "pg";
import { bootEmbeddedDatabase, killStaleEmbeddedPostgres } from "./lib/embedded-db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const MODE = args.find((a) => !a.startsWith("--"));
const KEEP_DB = args.includes("--keep-db");
const dirArg = args.indexOf("--dir") >= 0 ? args[args.indexOf("--dir") + 1] : undefined;
const BACKUP_DIR = path.resolve(ROOT, dirArg ?? ".dr-backup");
const MANIFEST = path.join(BACKUP_DIR, "dr-manifest.json");
const REPORT = path.join(BACKUP_DIR, "restore-report.json");
const PROD_URL = args.includes("--db-url")
  ? args[args.indexOf("--db-url") + 1]
  : process.env.DBURL;

const VERIFIER = path.join(ROOT, "scripts", "verify-audit-chain.cjs");
const PARAM_BUDGET = 60_000; // stay well under Postgres' 65535-parameter cap

if (!MODE || !["dump", "restore", "full"].includes(MODE)) {
  console.error("usage: pnpm exec tsx scripts/dr-drill.ts dump|restore|full [--keep-db] [--dir <dir>] [--db-url <url>]");
  process.exit(2);
}

const redact = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:${u.password ? "***" : ""}@<redacted>${u.pathname}`;
  } catch {
    return "<redacted-url>";
  }
};

const bufTag = (b: Uint8Array): unknown => ({ __pgbuf: Buffer.from(b).toString("base64") });

/** JSON replacer that keeps Postgres-only shapes representable. */
const replacer = (_k: string, v: unknown): unknown => {
  if (v instanceof Uint8Array) return bufTag(v); // bytea
  if (
    v !== null && typeof v === "object" && !Array.isArray(v) &&
    !(v instanceof Date) &&
    "months" in v && "days" in v && "seconds" in v
  ) {
    // node-pg interval object → interval literal (round-trips exactly)
    const o = v as Record<string, number>;
    const sec = String(o.seconds ?? 0);
    const hh = String(o.hours ?? 0).padStart(2, "0");
    const mm = String(o.minutes ?? 0).padStart(2, "0");
    const ss = sec.includes(".") ? sec : sec.padStart(2, "0");
    return { __pginterval: `${o.months ?? 0} months ${o.days ?? 0} days ${hh}:${mm}:${ss}` };
  }
  if (v !== null && typeof v === "object" && !Array.isArray(v) && "__pgbuf" in (v as object)) {
    throw new Error("row value already carries the __pgbuf tag — refusing to overwrite");
  }
  return v;
};

const decodeVal = (v: unknown): unknown => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.__pgbuf === "string") return Buffer.from(o.__pgbuf, "base64");
    if (typeof o.__pginterval === "string") return o.__pginterval;
  }
  return v;
};

interface Manifest {
  createdAt: string;
  source: string;
  server: string;
  dumpMs: number;
  tables: { table: string; columns: string[]; rows: number }[];
  sequences: { table: string; column: string; sequence: string; lastValue: number | null }[];
  notes: string[];
}

async function dump(): Promise<void> {
  if (!PROD_URL) {
    console.error("dump: no connection — set DBURL or pass --db-url");
    process.exit(2);
  }
  mkdirSync(BACKUP_DIR, { recursive: true });
  const pool = new Pool({ connectionString: PROD_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const t0 = performance.now();
  try {
    const ver = await pool.query("select version() as v, now() as at");
    const server = String(ver.rows[0]!.v).split(" on ")[0]!;
    console.log(`[dump] source ${redact(PROD_URL)}`);
    console.log(`[dump] ${server} · snapshot at ${ver.rows[0]!.at.toISOString()}`);

    const tables = (
      await pool.query(
        `select table_name from information_schema.tables
         where table_schema='public' and table_type='BASE TABLE' order by table_name`,
      )
    ).rows.map((r) => String(r.table_name));
    console.log(`[dump] ${tables.length} public tables`);

    const notes: string[] = [];
    const manifest: Manifest = {
      createdAt: new Date().toISOString(),
      source: redact(PROD_URL),
      server,
      dumpMs: 0,
      tables: [],
      sequences: [],
      notes,
    };

    // Sequence state (serial + identity), captured before the data walk.
    const seqCols = (
      await pool.query(
        `select c.table_name, c.column_name,
                pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) as seq
         from information_schema.columns c
         where c.table_schema='public'
           and (c.column_default like 'nextval%' or c.is_identity='YES')
         order by c.table_name, c.column_name`,
      )
    ).rows as { table_name: string; column_name: string; seq: string | null }[];
    for (const s of seqCols) {
      if (!s.seq) continue;
      const lv = await pool.query(
        `select last_value from pg_sequences where schemaname='public' and sequencename=$1`,
        [s.seq.split(".").pop()!],
      );
      manifest.sequences.push({
        table: s.table_name,
        column: s.column_name,
        sequence: s.seq,
        lastValue: lv.rows[0] ? (lv.rows[0].last_value as number | null) : null,
      });
    }

    let total = 0;
    for (const table of tables) {
      const file = path.join(BACKUP_DIR, `${table}.jsonl`);
      const stream = createWriteStream(file, { encoding: "utf8" });
      const cols = (
        await pool.query(
          `select column_name from information_schema.columns
           where table_schema='public' and table_name=$1 order by ordinal_position`,
          [table],
        )
      ).rows.map((r) => String(r.column_name));
      let rows = 0;
      // Chunked keyset-free walk is fine at this data scale (tens of rows per
      // table); keep the page size bounded anyway so a future large table
      // streams instead of buffering whole.
      const PAGE = 5000;
      for (let offset = 0; ; offset += PAGE) {
        const { rows: page } = await pool.query(
          `select * from public."${table}" order by ctid offset ${offset} limit ${PAGE}`,
        );
        for (const row of page) {
          stream.write(JSON.stringify(row, replacer) + "\n");
          rows += 1;
        }
        if (page.length < PAGE) break;
      }
      stream.end();
      await new Promise<void>((res, rej) => {
        stream.on("finish", () => res());
        stream.on("error", rej);
      });
      total += rows;
      manifest.tables.push({ table, columns: cols, rows });
      if (rows > 0) console.log(`[dump]   ${table}: ${rows} rows`);
    }
    manifest.dumpMs = Math.round(performance.now() - t0);

    const emb = await pool.query(
      `select count(*) filter (where embedding is not null) nn from public.company_memory`,
    );
    if (Number(emb.rows[0]!.nn) === 0) notes.push("company_memory.embedding all NULL — pgvector/pgvector-index nuance moot at snapshot time");

    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    console.log(
      `[dump] manifest: ${manifest.tables.length} tables, ${total} rows, ${manifest.sequences.length} sequences, ${manifest.dumpMs} ms`,
    );
    console.log(`[dump] artifact dir: ${BACKUP_DIR}`);
  } finally {
    await pool.end();
  }
}

async function restore(): Promise<void> {
  if (!existsSync(MANIFEST)) {
    console.error(`restore: ${MANIFEST} missing — run dump first (manifest is the completeness marker)`);
    process.exit(2);
  }
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  console.log(`[restore] from ${BACKUP_DIR} (dumped ${manifest.createdAt})`);

  const t0 = performance.now();
  await killStaleEmbeddedPostgres(".dr-restore-data");
  const boot0 = performance.now();
  const emb = await bootEmbeddedDatabase({
    dbName: "orq8_dr_restore",
    dirPrefix: "dr-restore",
    dataRoot: ".dr-restore-data",
  });
  const bootMs = Math.round(performance.now() - boot0);
  console.log(`[restore] embedded PostgreSQL up + production lineage applied (${bootMs} ms) — ${emb.databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);

  const pool = new Pool({ connectionString: emb.databaseUrl, max: 6 });
  const t1 = performance.now();
  let inserted = 0;
  const drift: string[] = [];
  const skipped = new Set<string>();
  try {
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      // The lineage seeds system rows (agent/department/team templates). The
      // backup is authoritative for DATA, so clear every migrated table first
      // (sequences restart, then my setval pass re-advances them).
      const migrated = (
        await client.query(
          `select table_name from information_schema.tables
           where table_schema='public' and table_type='BASE TABLE' order by table_name`,
        )
      ).rows.map((r) => `public."${r.table_name}"`);
      if (migrated.length > 0) {
        await client.query(`truncate table ${migrated.join(", ")} restart identity cascade`);
      }
      for (const t of manifest.tables) {
        const cols = (
          await client.query(
            `select column_name from information_schema.columns
             where table_schema='public' and table_name=$1 order by ordinal_position`,
            [t.table],
          )
        ).rows.map((r) => String(r.column_name));
        if (cols.length === 0) {
          drift.push(`${t.table}: NOT present in restored lineage — skipped`);
          skipped.add(t.table);
          continue;
        }
        const missing = t.columns.filter((c) => !cols.includes(c));
        if (missing.length > 0) drift.push(`${t.table}: ${missing.length} column(s) missing in lineage (${missing.join(", ")})`);
        const use = t.columns.filter((c) => cols.includes(c));
        if (t.rows === 0) continue;

        // Target column types — json/jsonb need the value re-serialised to a
        // JSON string, or a dumped pg array (JS array) would be sent back as a
        // Postgres array literal and fail JSON parsing on the server.
        const dtypes = new Map(
          (
            await client.query(
              `select column_name, data_type from information_schema.columns
               where table_schema='public' and table_name=$1`,
              [t.table],
            )
          ).rows.map((r) => [String(r.column_name), String(r.data_type)] as const),
        );
        const coerce = (c: string, v: unknown): unknown => {
          const dt = dtypes.get(c);
          if (v === null || v === undefined) return null;
          if (dt === "json" || dt === "jsonb") {
            // The decoded value equals what the driver parsed from prod's jsonb;
            // re-serialising to a JSON string is exactly what the server needs to
            // see back (works for scalars, arrays, objects, and the vector shim).
            return JSON.stringify(v);
          }
          return v;
        };

        const lines = readFileSync(path.join(BACKUP_DIR, `${t.table}.jsonl`), "utf8")
          .split("\n")
          .filter((l) => l.length > 0);
        if (lines.length !== t.rows) throw new Error(`${t.table}: manifest says ${t.rows} rows, file has ${lines.length}`);

        const chunkRows = Math.max(1, Math.floor(PARAM_BUDGET / use.length));
        for (let i = 0; i < lines.length; i += chunkRows) {
          const slice = lines.slice(i, i + chunkRows);
          const params: unknown[] = [];
          const tuples = slice.map((l) => {
            const row = JSON.parse(l) as Record<string, unknown>;
            return `(${use.map((c) => {
              params.push(coerce(c, decodeVal(row[c] ?? null)));
              return `$${params.length}`;
            }).join(",")})`;
          });
          await client.query(
            `insert into public."${t.table}" (${use.map((c) => `"${c}"`).join(",")})
             overriding system value values ${tuples.join(",")}`,
            params,
          );
          inserted += slice.length;
        }
      }
      // Sequences: advance past both the data and the snapshot's last_value.
      for (const s of manifest.sequences) {
        const hasSeq = await client.query(
          `select pg_get_serial_sequence('public.${s.table}', $1) as seq`,
          [s.column],
        );
        const seq = hasSeq.rows[0]!.seq as string | null;
        if (!seq) {
          drift.push(`sequence for ${s.table}.${s.column} not found in restored lineage`);
          continue;
        }
        const mx = await client.query(`select max("${s.column}") as m from public."${s.table}"`);
        const hasRows = Number(mx.rows[0]!.m ?? 0) > 0;
        const next = Math.max(
          Number(mx.rows[0]!.m ?? 0) || 0,
          Number(s.lastValue ?? 0) || 0,
          1,
        );
        // is_called=false when the table is empty, so the next nextval returns
        // `next` itself instead of skipping past it.
        await client.query("select setval($1::regclass, $2, $3)", [seq, next, hasRows]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  } finally {
    // pool closed after verification below
  }
  const insertMs = Math.round(performance.now() - t1);
  console.log(`[restore] loaded ${inserted} rows in one replica-mode transaction (${insertMs} ms)`);
  if (drift.length > 0) drift.forEach((d) => console.log(`[restore]   drift: ${d}`));

  // ── verification ───────────────────────────────────────────────────────────
  const t2 = performance.now();
  let failures = 0;

  const verify = new Pool({ connectionString: emb.databaseUrl, max: 2 });
  const prod = new Pool({ connectionString: PROD_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  try {
    for (const t of manifest.tables) {
      if (skipped.has(t.table)) continue; // already reported as lineage drift
      const r = await verify.query(`select count(*) n from public."${t.table}"`);
      const got = Number(r.rows[0]!.n);
      if (got !== t.rows) {
        console.error(`[verify] FAIL ${t.table}: restored ${got} ≠ manifest ${t.rows}`);
        failures += 1;
      }
    }
    const restoredTotal = manifest.tables.reduce((a, t) => a + t.rows, 0);
    if (inserted === restoredTotal && failures === 0) {
      console.log(`[verify] PASS row counts: all ${manifest.tables.length} tables equal manifest (${restoredTotal} rows)`);
    }

    // Live drift (informational): prod keeps moving between dump and check.
    let driftRows = 0;
    for (const t of manifest.tables) {
      const live = await prod.query(`select count(*) n from public."${t.table}"`);
      const d = Number(live.rows[0]!.n) - t.rows;
      if (d !== 0) {
        driftRows += Math.abs(d);
        console.log(`[verify]   live drift ${t.table}: ${d >= 0 ? "+" : ""}${d} since dump`);
      }
    }
    if (driftRows === 0) console.log("[verify] live prod unchanged since dump (drift 0)");

    // Audit-chain integrity, both sides, via the independent verifier.
    for (const [label, url] of [["restored", emb.databaseUrl], ["source", PROD_URL!]] as const) {
      const r = spawnSync(process.execPath, [VERIFIER, url], { cwd: ROOT, encoding: "utf8" });
      const out = (r.stdout ?? "").trim();
      const tail = out.split("\n").filter(Boolean).slice(-2).join(" | ") || (r.stderr ?? "").trim().split("\n")[0] || `exit ${r.status}`;
      const ok = r.status === 0 && /ALL CHAINS VALID/i.test(out);
      console.log(`[verify] audit chain ${label}: ${ok ? "PASS" : "FAIL"} — ${tail}`);
      if (!ok) failures += 1;
    }
  } finally {
    await verify.end().catch(() => undefined);
    await prod.end().catch(() => undefined);
  }
  const verifyMs = Math.round(performance.now() - t2);

  const rtoMs = Math.round(performance.now() - t0); // boot + lineage + load + verify
  const report = {
    restoredAt: new Date().toISOString(),
    dumpedAt: manifest.createdAt,
    databaseUrl: emb.databaseUrl.replace(/:[^:@/]+@/, ":***@"),
    inserted,
    drift,
    failures,
    timings: { bootAndLineageMs: bootMs, insertMs, verifyMs, totalMs: rtoMs },
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2));

  await pool.end().catch(() => undefined);
  await emb.stop();
  if (KEEP_DB) console.log(`[restore] --keep-db: data dir left in place (already stopped)`);
  console.log(
    `[restore] ${failures === 0 ? "PASS — backup restorable" : `FAIL (${failures} check(s))`} · restore+verify ${rtoMs} ms · report: ${REPORT}`,
  );
  if (failures > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (MODE === "dump") return dump();
  if (MODE === "restore") return restore();
  await dump();
  await restore();
  const m: Manifest | null = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : null;
  const rp = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, "utf8")) : null;
  if (m && rp) {
    const rows = m.tables.reduce((a, t) => a + t.rows, 0);
    console.log(`
=== DR drill summary ===
  RPO (current, manual on-demand backup): 0 — recovery loses nothing since the
      last dump; until a schedule exists, RPO equals time-since-last-drill.
      Recommended: run \`dump\` daily (cron/scheduled task) → RPO ≤ 24 h.
  RTO (measured, data layer): restore into a running local PostgreSQL =
      ${Math.round(rp.timings.totalMs / 100) / 10} s (boot + lineage ${rp.timings.bootAndLineageMs} ms · load ${rp.timings.insertMs} ms · verify ${rp.timings.verifyMs} ms)
      for ${rows} rows across ${m.tables.length} tables. Add operator time to
      repoint DATABASE_URL + redeploy services (minutes, not seconds).
  Artifact: ${BACKUP_DIR} (dump ${m.dumpMs} ms)`);
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error("dr-drill failed:", e);
    process.exit(1);
  });
