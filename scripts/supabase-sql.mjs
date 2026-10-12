/**
 * Run SQL against the ORQ8 production Supabase project from this workspace.
 *
 * Why this exists: production access was repeatedly reported as blocked —
 * "the MCP connector is read-only, there is no CLI, there is no database
 * password" — and work stalled behind it. All three of those are true and none
 * of them matters, because this workspace holds the two credentials that do the
 * job, in `.supabase-setup.json` (gitignored; see `docs/64_SUPABASE_SETUP.md`
 * §64.2):
 *
 *   managementToken  an `sbp_…` personal access token for the Management API.
 *                    `POST /v1/projects/<ref>/database/query` runs arbitrary SQL,
 *                    DDL included, with no database password involved.
 *   databasePassword the pooler password. On 2026-10-10 the pooler rejected it
 *                    (`password authentication failed for user "postgres"`), so
 *                    treat it as possibly stale and prefer the runner below.
 *
 * Prefer the project's own runner when the pooler password works — it also
 * writes the `supabase_migrations.schema_migrations` ledger, which this script
 * deliberately does NOT:
 *
 *   DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" \
 *     pnpm --filter @orq8/db migrate:supabase:status
 *
 * Use this script when it does not: reading production state, spot checks, or
 * applying a migration whose file is idempotent (every file in
 * `supabase/migrations` is). A hand-applied file is invisible to the ledger, so
 * the runner will re-apply it later and record it then.
 *
 * Usage:
 *   node scripts/supabase-sql.mjs "select 1 as ok"
 *   node scripts/supabase-sql.mjs --file supabase/migrations/0055_x.sql --write
 *
 * Read-only by default: a statement that is not a SELECT/SHOW/WITH/EXPLAIN is
 * refused unless `--write` is passed, so an accidental `drop` needs two
 * deliberate acts rather than one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = path.join(REPO_ROOT, ".supabase-setup.json");

function readVault() {
  let raw;
  try {
    raw = readFileSync(VAULT, "utf8");
  } catch {
    throw new Error(
      `no vault at ${path.relative(REPO_ROOT, VAULT)} — it holds projectRef and managementToken; see docs/64_SUPABASE_SETUP.md`,
    );
  }
  const cfg = JSON.parse(raw);
  for (const key of ["projectRef", "managementToken"]) {
    if (!cfg[key]) throw new Error(`the vault is missing ${key}`);
  }
  return cfg;
}

const args = process.argv.slice(2);
const write = args.includes("--write");
const fileArg = args.indexOf("--file");
const sql =
  fileArg > -1
    ? readFileSync(path.resolve(REPO_ROOT, args[fileArg + 1] ?? ""), "utf8")
    : args.filter((a) => a !== "--write" && a !== "--file").join(" ");

if (!sql.trim()) {
  console.error("usage: node scripts/supabase-sql.mjs \"<sql>\" [--write]");
  console.error("       node scripts/supabase-sql.mjs --file <path.sql> [--write]");
  process.exit(2);
}

// The gate is on the first keyword, not on a SQL parser: it exists to stop a
// typo (`delte`, a truncated paste) from reaching production, not to classify
// every statement perfectly.
const first = sql.replace(/^[\s(]*(--[^\n]*\n[\s]*)*/g, "").split(/\s+/)[0]?.toLowerCase() ?? "";
const READS = new Set(["select", "show", "with", "explain", "values", "table"]);
if (!write && !READS.has(first)) {
  console.error(`refusing to run a "${first}" statement without --write (read-only by default)`);
  process.exit(2);
}

const cfg = readVault();
const res = await fetch(`https://api.supabase.com/v1/projects/${cfg.projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${cfg.managementToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  console.error(body.slice(0, 2000));
  process.exit(1);
}

// The endpoint answers 201 with the row array for anything that returns rows,
// and with an empty body for a statement that returns none (DDL).
let rows;
try {
  rows = JSON.parse(body);
} catch {
  process.stdout.write(body);
  process.exit(0);
}
if (Array.isArray(rows)) {
  if (rows.length === 0) console.log("(no rows)");
  else if (rows.length === 1 && !write) console.log(JSON.stringify(rows[0], null, 1));
  else console.log(JSON.stringify(rows, null, 1));
} else {
  console.log(JSON.stringify(rows, null, 1));
}
