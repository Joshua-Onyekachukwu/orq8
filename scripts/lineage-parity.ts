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
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { bootEmbeddedDatabase } from "./lib/embedded-db.js";

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
  /** "table.trigger" → normalized trigger definition */
  triggers: Record<string, string>;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export async function fingerprint(pool: Pool, source: string): Promise<Fingerprint> {
  const columns: Record<string, string> = {};
  const indexes: Record<string, string> = {};
  const policies: Record<string, string> = {};
  const rls: Record<string, string> = {};
  const functions: Record<string, string> = {};
  const triggers: Record<string, string> = {};

  const [ext, cols, idx, pol, rlsRows, fns, trg] = await Promise.all([
    pool.query<{ extname: string }>("select extname from pg_extension order by extname"),
    pool.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `select table_name, column_name, data_type, is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public'
        order by table_name, column_name`,
    ),
    pool.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where schemaname = 'public' order by indexname",
    ),
    pool.query<{ tablename: string; policyname: string; cmd: string; roles: string; qual: string | null; with_check: string | null }>(
      `select tablename, policyname, cmd, roles::text as roles, qual, with_check
         from pg_policies
        where schemaname = 'public'
        order by tablename, policyname`,
    ),
    pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname`,
    ),
    pool.query<{ proname: string; args: string; prokind: string }>(
      `select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prokind
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
        order by p.proname, args`,
    ),
    pool.query<{ relname: string; tgname: string; def: string }>(
      `select c.relname, t.tgname, pg_get_triggerdef(t.oid) as def
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal
        order by c.relname, t.tgname`,
    ),
  ]);

  for (const r of cols.rows) {
    columns[`${r.table_name}.${r.column_name}`] = `${r.data_type} | ${r.is_nullable} | ${norm(r.column_default) || "no default"}`;
  }
  for (const r of idx.rows) indexes[r.indexname] = norm(r.indexdef);
  for (const r of pol.rows) {
    policies[`${r.tablename}.${r.policyname}`] = `${r.cmd} | ${norm(r.roles)} | ${norm(r.qual) || "no using"} | ${norm(r.with_check) || "no check"}`;
  }
  for (const r of rlsRows.rows) rls[r.relname] = `rls ${r.relrowsecurity ? "on" : "off"}, force ${r.relforcerowsecurity ? "on" : "off"}`;
  for (const r of fns.rows) functions[`${r.proname}(${norm(r.args)})`] = r.prokind;
  for (const r of trg.rows) triggers[`${r.relname}.${r.tgname}`] = norm(r.def);

  return {
    source,
    capturedAt: new Date().toISOString(),
    extensions: ext.rows.map((r) => r.extname),
    columns,
    indexes,
    policies,
    rls,
    functions,
    triggers,
  };
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
 * Differences that are documented facts of the environment rather than drift:
 * the embedded/CI lineage skips pgvector (no vector build) and shims the
 * embedding column as jsonb, while Supabase carries the real vector column.
 */
function isExpected(section: Difference["section"], key: string, left: string, right: string): boolean {
  if (section === "extensions" && key === "vector") return true;
  if (section === "columns" && key === "company_memory.embedding") {
    return (left.includes("jsonb") && right.includes("USER-DEFINED")) || (left.includes("USER-DEFINED") && right.includes("jsonb"));
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
      expected: isExpected("extensions", e, "", ""),
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
          const expected = isExpected(section, key, a[key] as string, b[key] as string);
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
        expected: false,
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === "--diff") {
    const [, leftFile, rightFile] = args;
    if (!leftFile || !rightFile) throw new Error("usage: --diff <fresh.json> <target.json>");
    const left = load(leftFile);
    const right = load(rightFile);
    const differences = diff(left, right);
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
        if (d.kind === "different") console.log(`        fresh:  ${d.left}\n        target: ${d.right}`);
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
    process.exit(unexpected.length === 0 ? 0 : 1);
  }

  if (args.includes("--fresh")) {
    const outIdx = args.indexOf("--out");
    const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
    if (!out) throw new Error("usage: --fresh --out <file>");
    const pg = await bootEmbeddedDatabase({ dbName: "orq8_lineage_parity", dirPrefix: "parity" });
    try {
      const fp = await fingerprint(pg.pool, "fresh lineage (embedded Postgres, both lineages from scratch)");
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
    const fp = await fingerprint(pool, process.env.PARITY_LABEL ?? "target database");
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
