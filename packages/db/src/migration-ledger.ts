import { createHash } from 'node:crypto';

/**
 * Applied-migration ledger (the parts that need no database).
 *
 * The supabase lineage is applied by a script, and until now nothing recorded
 * what a given database had received. The only evidence was the catalog itself,
 * which is why migrations 0033 and 0034 sat unapplied in production while every
 * local run applied them, and why that drift was invisible until a schema
 * fingerprint was diffed by hand (docs/62).
 *
 * The rows live in `supabase_migrations.schema_migrations`, the same table the
 * Supabase CLI uses, so a database has exactly one answer to "what has been
 * applied here" no matter which tool applied it. This module holds the decision
 * logic: which version a file is, a checksum of its contents, and the diff
 * between the files on disk and the rows in the ledger.
 */

export interface LedgerRow {
  version: string;
  checksum: string | null;
}

/** applied: already recorded and unchanged. pending: never recorded. changed: recorded, but the file was edited since. */
export type LedgerState = 'applied' | 'pending' | 'changed';

export interface LedgerEntry {
  file: string;
  version: string;
  checksum: string;
  state: LedgerState;
}

export interface LedgerSummary {
  applied: number;
  pending: number;
  changed: number;
  total: number;
}

/**
 * The ledger key: the filename without `.sql`, e.g. `0033_rls_hardening`.
 *
 * The numeric prefix alone is not unique in this lineage. 0002 is used twice
 * (0002_add_all_missing_tables, 0002_add_departments_and_authority), so keying
 * on the prefix made the two files share one row: whichever was applied last
 * overwrote the other's checksum, and the other read as permanently "changed",
 * which is exactly the drift this ledger exists to make visible. The stem is
 * unique, sorts the way the prefix does, and still names the migration.
 */
export function migrationVersion(file: string): string {
  return file.replace(/\.sql$/, '');
}

/** `0033_rls_hardening.sql` → `rls_hardening`, for the ledger's `name` column. */
export function migrationName(file: string): string {
  return file.replace(/^\d+_?/, '').replace(/\.sql$/, '');
}

/**
 * Content checksum, line-ending and trailing-space insensitive so a checkout
 * with CRLF endings (Windows) does not read as an edited migration.
 */
export function checksumSql(sql: string): string {
  const normalized = sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Pair the files on disk with the ledger. Order is preserved (the caller has
 * already put the files in apply order), because the runner applies in this
 * order and dependency order is a property of the files, not of the ledger.
 *
 * `force` re-applies everything, which is what a run that wants to reconcile a
 * database with the files wants: every statement in the lineage is idempotent.
 */
export function planLedger(
  files: Array<{ file: string; sql: string }>,
  rows: LedgerRow[],
  force = false,
): LedgerEntry[] {
  const recorded = new Map(rows.map((row) => [row.version, row.checksum]));
  return files.map(({ file, sql }) => {
    const version = migrationVersion(file);
    const checksum = checksumSql(sql);
    const known = recorded.get(version);
    let state: LedgerState;
    if (force) state = 'pending';
    else if (known === undefined) state = 'pending';
    else if (known === null || known !== checksum) state = 'changed';
    else state = 'applied';
    return { file, version, checksum, state };
  });
}

export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  return {
    applied: entries.filter((entry) => entry.state === 'applied').length,
    pending: entries.filter((entry) => entry.state === 'pending').length,
    changed: entries.filter((entry) => entry.state === 'changed').length,
    total: entries.length,
  };
}
