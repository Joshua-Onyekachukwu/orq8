/**
 * Lineage parity — proves what a database actually has, and what differs.
 *
 * The migration runner keeps no applied-files ledger, so the catalog is the only
 * truth about what a database contains. This tool fingerprints the schema
 * (tables and columns, indexes, RLS policies and enablement, functions,
 * triggers, extensions) and diffs two fingerprints, classifying every
 * difference as expected (documented environment differences such as the
 * pgvector skip) or unexpected (drift the lineage should have resolved).
 *
 * Read-only: every query is a SELECT against the target database. Nothing here
 * can create, alter or drop anything.
 *
 * Usage:
 *   pnpm exec tsx scripts/lineage-parity.ts --out .lineage-parity/prod.json
 *     Fingerprint the database at DATABASE_URL.
 *   pnpm exec tsx scripts/lineage-parity.ts --fresh --out .lineage-parity/fresh.json
 *     Boot an embedded Postgres, apply both production lineages from scratch,
 *     then fingerprint that fresh database (no external database is touched).
 *   pnpm exec tsx scripts/lineage-parity.ts --diff .lineage-parity/fresh.json .lineage-parity/prod.json
 *     Report the drift between two fingerprints. Exit 0 only when every
 *     difference is expected.
 *   pnpm exec tsx scripts/lineage-parity.ts --check
 *     Boot a fresh database, fingerprint it, and compare it against the
 *     COMMITTED baseline (supabase/lineage-baseline.json). Exit 0 only when no
 *     unexpected difference exists. This is the mode CI runs: the two modes
 *     above always need a database (and therefore a founder, a host and a
 *     credential) to say anything at all, which is why the schema could drift
 *     unnoticed while every check stayed green.
 *   pnpm exec tsx scripts/lineage-parity.ts --write-baseline
 *     Re-record the committed baseline from a fresh lineage. Run this when a
 *     migration is SUPPOSED to change the catalog, and read the diff it prints
 *     first — that diff is the review.
 *   pnpm exec tsx scripts/lineage-parity.ts --supabase --out .lineage-parity/prod.json
 *     Fingerprint the production Supabase project through the Management API
 *     (projectRef + managementToken from the gitignored `.supabase-setup.json`,
 *     or SUPABASE_PROJECT_REF + SUPABASE_MANAGEMENT_TOKEN). This is how a
 *     founder compares a live Supabase deployment without a database password:
 *     the pooler credential has been stale since 2026-10-10.
 *
 * Expected environment differences (documented, not drift):
 *   * `vector` — the embedded/CI lineage has no pgvector build, so the vector
 *     extension, its functions, and the hnsw index on
 *     `company_memory.embedding` exist only in a real deployment;
 *   * `pgcrypto` — the harness installs it into `public`, Supabase into the
 *     `extensions` schema, so the two catalogs see its functions in different
 *     schemas;
 *   * `pg_stat_statements`, `supabase_vault`, `uuid-ossp` — Supabase platform
 *     extensions, not migrations;
 *   * `get_user_org_id()`, `is_platform_admin()`, `handle_new_user()` —
 *     functions Supabase's own bootstrap creates in `public` (the three only
 *     migration 0049's comment names as absent from non-Supabase databases).
 *
 * What `--check` does and does not prove, stated so its green is not read as
 * more than it is:
 *   * it proves the lineage still applies from scratch and that the catalog it
 *     produces is the catalog that was reviewed and committed;
 *   * it catches an UNINTENDED catalog change (0048 tightening
 *     `agent_jobs.locked_at` would have shown here as a column difference);
 *   * it does NOT prove parity with a live deployment. That is what
 *     `--diff fresh.json prod.json` is for, and it is why this mode is a
 *     companion to it rather than a replacement — `--supabase` is the missing
 *     transport that makes that comparison possible without a DB password.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { bootEmbeddedDatabase } from "./lib/embedded-db.js";

/**
 * The committed baseline: what the lineage is expected to produce. Tracked in
 * git (`.lineage-parity/` is ignored, so it cannot live there), so a change to
 * the catalog is visible in the same diff as the migration that made it.
 */
const BASELINE_FILE = "supabase/lineage-baseline.json";

// ─── Fingerprint shape ──────────────────────────────────────────────────────

interface Fingerprint {
  /** Where this came from (never a connection string — a label only). */
  source: string;
  capturedAt: string;
  extensions: string[];
  /** "table.column" → "data_type | null | default" */
  columns: Record<string, string>;
  /** index name → normalized definition */
  indexes: Record<string, string>;
  /** "table.policy" → "cmd | roles | using | check" */
  policies: Record<string, string>;
  /** table → "rls on|off, force on|off" */
  rls: Record<string, string>;
  /** "name(args)" → prokind */
  functions: Record<string, string>;
  /**
   * "name(args)" → the extension that owns the function, or "" when the
   * migrations (or Supabase's own bootstrap) created it. Ownership is what
   * separates an environment difference — "the harness has no pgvector, so
   * production's vector functions cannot exist here" — from drift, and it is
   * why a function can be classified without listing a hundred names.
   */
  functionOwners: Record<string, string>;
  /** "table.trigger" → normalized trigger definition */
  triggers: Record<string, string>;
}

/**
 * Runs one read-only query and returns its rows. The fingerprint does not care
 * whether they come from a direct Postgres connection or the Management API.
 */
export type QueryRows = <T>(sql: string) => Promise<T[]>;

function norm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export async function fingerprint(query: QueryRows, source: string): Promise<Fingerprint> {
  const columns: Record<string, string> = {};
  const indexes: Record<string, string> = {};
  const policies: Record<string, string> = {};
  const rls: Record<string, string> = {};
  const functions: Record<string, string> = {};
  const functionOwners: Record<string, string> = {};
  const triggers: Record<string, string> = {};

  const [ext, cols, idx, pol, rlsRows, fns, trg] = await Promise.all([
    query<{ extname: string }>("select extname from pg_extension order by extname"),
    query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `select table_name, column_name, data_type, is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public'
        order by table_name, column_name`,
    ),
    query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where schemaname = 'public' order by indexname",
    ),
    query<{ tablename: string; policyname: string; cmd: string; roles: string; qual: string | null; with_check: string | null }>(
      `select tablename, policyname, cmd, roles::text as roles, qual, with_check
         from pg_policies
        where schemaname = 'public'
        order by tablename, policyname`,
    ),
    query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname`,
    ),
    query<{ proname: string; args: string; prokind: string; extname: string }>(
      `select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prokind,
              coalesce(e.extname, '') as extname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
         left join pg_extension e on e.oid = d.refobjid
        where n.nspname = 'public'
        order by p.proname, args`,
    ),
    query<{ relname: string; tgname: string; def: string }>(
      `select c.relname, t.tgname, pg_get_triggerdef(t.oid) as def
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
        order by c.relname, t.tgname`,
    ),
  ]);

  for (const r of cols) {
    columns[`${r.table_name}.${r.column_name}`] = `${r.data_type} | ${r.is_nullable} | ${norm(r.column_default) || "no default"}`;
  }
  for (const r of idx) indexes[r.indexname] = norm(r.indexdef);
  for (const r of pol) {
    policies[`${r.tablename}.${r.policyname}`] = `${r.cmd} | ${norm(r.roles)} | ${norm(r.qual) || "no using"} | ${norm(r.with_check) || "no check"}`;
  }
  for (const r of rlsRows) rls[r.relname] = `rls ${r.relrowsecurity ? "on" : "off"}, force ${r.relforcerowsecurity ? "on" : "off"}`;
  for (const r of fns) {
    const key = `${r.proname}(${norm(r.args)})`;
    functions[key] = r.prokind;
    functionOwners[key] = norm(r.extname);
  }
  for (const r of trg) triggers[`${r.relname}.${r.tgname}`] = norm(r.def);

  return {
    source,
    capturedAt: new Date().toISOString(),
    extensions: ext.map((r) => r.extname),
    columns,
    indexes,
    policies,
    rls,
    functions,
    functionOwners,
    triggers,
  };
}

/** A QueryRows backed by a direct Postgres connection. */
function poolQuery(pool: Pool): QueryRows {
  return async <T>(sql: string): Promise<T[]> => (await pool.query(sql)).rows as T[];
}

// ─── Diff ───────────────────────────────────────────────────────────────────

interface Difference {
  section: keyof Omit<Fingerprint, "source" | "capturedAt" | "extensions"> | "extensions";
  key: string;
  kind: "missing" | "extra" | "different";
  left: string;
  right: string;
  /** Documented environment difference, not drift. */
  expected: boolean;
}

/**
 * Extensions that exist because of the platform, not the migrations. Every
 * name here is a documented environment fact (see the header); a difference in
 * any OTHER extension is drift and stays unexpected.
 */
const ENVIRONMENT_EXTENSIONS = new Set([
  // The embedded/CI lineage has no pgvector build (see withoutVector in
  // scripts/lib/embedded-db.ts); a real Supabase deployment carries it.
  "vector",
  // The harness installs pgcrypto into `public`, Supabase into `extensions`,
  // so the two catalogs see its functions in different schemas.
  "pgcrypto",
  // Supabase platform extensions: present on a deployment, never created by a
  // migration in this repository.
  "pg_stat_statements",
  "supabase_vault",
  "uuid-ossp",
]);

/**
 * Functions Supabase's own bootstrap creates in `public`. These are the three
 * migration 0049's comment names as existing only where Supabase Auth does:
 * a non-Supabase database has no `auth.users` trigger and no platform helpers.
 */
const PRODUCTION_ONLY_FUNCTIONS = new Set([
  "get_user_org_id()",
  "is_platform_admin()",
  "handle_new_user()",
]);

/**
 * Differences that are documented facts of the environment rather than drift:
 * the embedded/CI lineage skips pgvector (no vector build) and shims the
 * embedding column as jsonb, while Supabase carries the real vector column and
 * its index. Function ownership decides the long tail: a function that exists
 * on one side only is expected when the side that has it attributes it to one
 * of the environment extensions above (or it is one of the three Supabase
 * bootstrap functions), and drift when it does not — so the classification
 * cannot silently absorb a function the lineage creates or drops.
 */
function isExpected(
  section: Difference["section"],
  key: string,
  left: string,
  right: string,
  leftFp: Fingerprint,
  rightFp: Fingerprint,
): boolean {
  if (section === "extensions") return ENVIRONMENT_EXTENSIONS.has(key);
  if (section === "columns" && key === "company_memory.embedding") {
    return (left.includes("jsonb") && right.includes("USER-DEFINED")) || (left.includes("USER-DEFINED") && right.includes("jsonb"));
  }
  if (section === "indexes") {
    // pgvector's embedding index: the harness skips the column, so it cannot
    // create the index. Matched on the pgvector operator class, not one name.
    return key.startsWith("company_memory") && /hnsw|ivfflat|vector_/.test(`${left} ${right}`);
  }
  if (section === "functions") {
    if (PRODUCTION_ONLY_FUNCTIONS.has(key)) return true;
    // The optional chain keeps `--diff` usable against fingerprints recorded
    // before ownership was part of the shape: without it the difference is
    // reported, which is the honest default.
    const owner = leftFp.functionOwners?.[key] || rightFp.functionOwners?.[key];
    return !!owner && ENVIRONMENT_EXTENSIONS.has(owner);
  }
  return false;
}

export function diff(left: Fingerprint, right: Fingerprint): Difference[] {
  const out: Difference[] = [];
  const sections = ["columns", "indexes", "policies", "rls", "functions", "triggers"] as const;

  const leftExt = new Set(left.extensions);
  const rightExt = new Set(right.extensions);
  for (const e of new Set([...left.extensions, ...right.extensions])) {
    if (leftExt.has(e) && rightExt.has(e)) continue;
    const onlyLeft = leftExt.has(e);
    out.push({
      section: "extensions",
      key: e,
      kind: onlyLeft ? "missing" : "extra",
      left: onlyLeft ? "present" : "absent",
      right: onlyLeft ? "absent" : "present",
      expected: isExpected("extensions", e, "", "", left, right),
    });
  }

  for (const section of sections) {
    const a = left[section];
    const b = right[section];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const inLeft = key in a;
      const inRight = key in b;
      if (inLeft && inRight) {
        if (a[key] !== b[key]) {
          const expected = isExpected(section, key, a[key] as string, b[key] as string, left, right);
          out.push({ section, key, kind: "different", left: a[key] as string, right: b[key] as string, expected });
        }
        continue;
      }
      const onlyLeft = inLeft;
      out.push({
        section,
        key,
        // "missing" means present on the left (fresh) and absent on the right (target).
        kind: onlyLeft ? "missing" : "extra",
        left: onlyLeft ? (a[key] as string) : "absent",
        right: onlyLeft ? "absent" : (b[key] as string),
        expected: isExpected(section, key, onlyLeft ? (a[key] as string) : "absent", onlyLeft ? "absent" : (b[key] as string), left, right),
      });
    }
  }
  return out;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function load(file: string): Fingerprint {
  return JSON.parse(readFileSync(path.resolve(file), "utf8")) as Fingerprint;
}

function write(file: string, fp: Fingerprint): void {
  const target = path.resolve(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(fp, null, 2));
  const counts = [
    `${Object.keys(fp.columns).length} columns`,
    `${Object.keys(fp.indexes).length} indexes`,
    `${Object.keys(fp.policies).length} policies`,
    `${Object.keys(fp.functions).length} functions`,
    `${Object.keys(fp.triggers).length} triggers`,
  ].join(", ");
  console.log(`[parity] ${fp.source}: ${counts} written to ${path.relative(process.cwd(), target)}`);
}

/** Print a diff the way `--diff` does, and say whether it is clean. */
function report(left: Fingerprint, right: Fingerprint, differences: Difference[]): boolean {
  const unexpected = differences.filter((d) => !d.expected);
  const expected = differences.filter((d) => d.expected);

  console.log(`[parity] ${left.source} vs ${right.source}`);
  const bySection = new Map<string, Difference[]>();
  for (const d of unexpected) bySection.set(d.section, [...(bySection.get(d.section) ?? []), d]);
  for (const [section, list] of bySection) {
    console.log(`\n  ${section} — ${list.length} unexpected difference(s)`);
    for (const d of list.sort((a, b) => a.key.localeCompare(b.key))) {
      const sign = d.kind === "missing" ? "-" : d.kind === "extra" ? "+" : "~";
      console.log(`    ${sign} ${d.key}`);
      if (d.kind === "different") console.log(`        ${left.source}:  ${d.left}\n        ${right.source}: ${d.right}`);
      else if (d.kind === "extra") console.log(`        only in ${right.source}: ${d.right}`);
    }
  }
  if (expected.length > 0) {
    console.log(`\n  expected environment differences (documented, not drift) — ${expected.length}`);
    for (const d of expected) console.log(`    = ${d.section} ${d.key}`);
  }
  console.log(
    unexpected.length === 0
      ? `\n[parity] no drift:${expected.length === 0 ? " the two catalogs match" : ` only the ${expected.length} documented difference(s) remain`}`
      : `\n[parity] ${unexpected.length} unexpected difference(s) — see above`,
  );
  return unexpected.length === 0;
}

/**
 * A QueryRows backed by the Supabase Management API (`POST
 * /v1/projects/<ref>/database/query`). This is the transport that makes a
 * production comparison possible without the database password — the pooler
 * credential has been stale since 2026-10-10, and every other mode needs one.
 * The endpoint takes plain SQL and answers with the row array, so the very
 * read-only SELECTs the fingerprint would run over a direct connection are
 * what it executes.
 */
function managementQuery(projectRef: string, token: string): QueryRows {
  return async <T>(sql: string): Promise<T[]> => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Management API HTTP ${res.status}: ${body.slice(0, 300)}`);
    const parsed = JSON.parse(body) as unknown;
    return (Array.isArray(parsed) ? parsed : []) as T[];
  };
}

/**
 * The workspace's Supabase vault (gitignored; docs/64 §64.2) holds the project
 * ref and the Management API token. Env vars win when both are set, so CI can
 * use secrets instead of a file.
 */
function readSupabaseVault(): { projectRef: string; token: string } {
  let cfg: { projectRef?: string; managementToken?: string } = {};
  try {
    cfg = JSON.parse(readFileSync(path.resolve(".supabase-setup.json"), "utf8")) as typeof cfg;
  } catch (err) {
    if (!process.env.SUPABASE_PROJECT_REF || !process.env.SUPABASE_MANAGEMENT_TOKEN) {
      throw new Error(
        `--supabase needs .supabase-setup.json (projectRef, managementToken) or SUPABASE_PROJECT_REF + SUPABASE_MANAGEMENT_TOKEN: ${(err as Error).message}`,
      );
    }
  }
  const projectRef = process.env.SUPABASE_PROJECT_REF || cfg.projectRef || "";
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN || cfg.managementToken || "";
  if (!projectRef || !token) throw new Error("the Supabase vault is missing projectRef or managementToken");
  return { projectRef, token };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // ── Self-contained check against the committed baseline ──────────────────
  if (args.includes("--check") || args.includes("--write-baseline")) {
    const writeMode = args.includes("--write-baseline");
    const at = args.indexOf("--baseline-file");
    const baselineFile = at >= 0 ? args[at + 1] : BASELINE_FILE;

    const pg = await bootEmbeddedDatabase({
      dbName: "orq8_lineage_check",
      dirPrefix: "parity-check",
    });
    try {
      const fresh = await fingerprint(
        poolQuery(pg.pool),
        "fresh lineage (embedded Postgres, both lineages from scratch)",
      );

      // The label of the file being recorded, not of the database it came from:
      // in a report, "committed baseline vs fresh lineage" is what the reader
      // needs to see, and both sides are fingerprints of the same thing.
      const label = `committed baseline (${baselineFile})`;

      if (writeMode) {
        write(baselineFile, { ...fresh, source: label });
        console.log(
          `[parity] baseline re-recorded. This is a REVIEW artifact: read the diff against the previous baseline before committing it.`,
        );
        process.exit(0);
      }

      if (!existsSync(path.resolve(baselineFile))) {
        throw new Error(
          `no committed baseline at ${baselineFile} — record it once with --write-baseline`,
        );
      }
      const baseline = { ...load(baselineFile), source: label };
      const clean = report(baseline, fresh, diff(baseline, fresh));
      process.exit(clean ? 0 : 1);
    } finally {
      await pg.stop();
    }
  }

  if (args[0] === "--diff") {
    const [, leftFile, rightFile] = args;
    if (!leftFile || !rightFile) throw new Error("usage: --diff <fresh.json> <target.json>");
    const left = load(leftFile);
    const right = load(rightFile);
    const clean = report(left, right, diff(left, right));
    process.exit(clean ? 0 : 1);
  }

  if (args.includes("--supabase")) {
    const outIdx = args.indexOf("--out");
    const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
    if (!out) throw new Error("usage: --supabase --out <file>");
    const { projectRef, token } = readSupabaseVault();
    const fp = await fingerprint(
      managementQuery(projectRef, token),
      process.env.PARITY_LABEL ?? `production (Supabase ${projectRef}, via Management API)`,
    );
    write(out, fp);
    process.exit(0);
  }

  if (args.includes("--fresh")) {
    const outIdx = args.indexOf("--out");
    const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
    if (!out) throw new Error("usage: --fresh --out <file>");
    const pg = await bootEmbeddedDatabase({ dbName: "orq8_lineage_parity", dirPrefix: "parity" });
    try {
      const fp = await fingerprint(poolQuery(pg.pool), "fresh lineage (embedded Postgres, both lineages from scratch)");
      write(out, fp);
    } finally {
      await pg.stop();
    }
    process.exit(0);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (or use --fresh / --diff)");
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
  if (!out) throw new Error("usage: DATABASE_URL=… --out <file>");
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 10_000 });
  pool.on("error", () => {});
  try {
    const fp = await fingerprint(poolQuery(pool), process.env.PARITY_LABEL ?? "target database");
    write(out, fp);
  } finally {
    await pool.end().catch(() => undefined);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`[parity] fatal: ${(err as Error).message}`);
  process.exit(2);
});
