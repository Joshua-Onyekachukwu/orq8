/**
 * The database the API integration tests run against.
 *
 * Every integration test gates itself on a reachable `DATABASE_URL`
 * (`const run = dbUp ? describe : describe.skip`). That gate is right — a test
 * that needs real SQL and cannot reach it must not pretend to pass — but on a
 * machine without a system Postgres it made the whole integration layer report
 * green while asserting nothing: `pnpm -r test` exited 0 having skipped 36
 * files. A skipped test is worse than a missing one, because the CI summary
 * counts it as protection.
 *
 * So the suite provisions its own server, using the same embedded-Postgres
 * helper the proof harnesses use (`scripts/lib/embedded-db.ts`) and the same
 * production migration lineage. Two consequences worth stating plainly:
 *
 *   - CI is unchanged. It runs a Postgres service and exports `DATABASE_URL`,
 *     so the first branch below reuses it verbatim.
 *   - A machine that cannot boot a database now fails loudly instead of
 *     quietly testing nothing. Use `ORQ8_TEST_DB=external` to require an
 *     existing `DATABASE_URL` and refuse to start one.
 *
 * It lives beside the helper it uses rather than in `apps/api/test` on purpose:
 * importing this file into the API's tsconfig program would drag
 * `embedded-db.ts` in with it, and that harness targets a bare Node runtime
 * (no `@types/pg` in scope, a `PostgresOptions` field the bundled types do not
 * declare) so `tsc --noEmit` fails on code that has always run fine.
 */

import { Pool } from 'pg';
import {
  bootEmbeddedDatabase,
  killStaleEmbeddedPostgres,
  type EmbeddedDatabase,
} from './embedded-db.js';

/** Kept for teardown; the module is loaded once per run, before workers fork. */
let embedded: EmbeddedDatabase | undefined;

/** Hide credentials — a connection string is a secret and these logs get pasted. */
function describeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || '(default)'}${parsed.pathname}`;
  } catch {
    return '<unparseable DATABASE_URL>';
  }
}

async function reachable(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 2_000 });
  // A pool whose socket dies mid-probe emits on the pool, and an unhandled
  // 'error' event would take the run down before it starts.
  pool.on('error', () => undefined);
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function setup(): Promise<void> {
  const configured = process.env.DATABASE_URL;

  if (await reachable(configured)) {
    console.log(`[api-tests] database: ${describeUrl(configured as string)} (configured)`);
    return;
  }

  if (process.env.ORQ8_TEST_DB === 'external') {
    throw new Error(
      'ORQ8_TEST_DB=external but DATABASE_URL is not reachable. Point it at a Postgres, or unset ORQ8_TEST_DB to let the suite boot an embedded one.',
    );
  }

  if (configured) {
    console.log(`[api-tests] database: ${describeUrl(configured)} is unreachable — booting an embedded one`);
  }

  // A postmaster left behind by an interrupted run holds the shared-memory key
  // on Windows and makes every later boot fail. Scoped to this harness's data
  // root: a blanket kill also stopped the embedded Postgres behind a running
  // review stack, so running the tests took the reviewer's database down with
  // it and their open pages started answering 500.
  await killStaleEmbeddedPostgres('.integration-suite-data');

  const started = await bootEmbeddedDatabase({
    dbName: 'orq8_test',
    dataRoot: '.integration-suite-data',
    dirPrefix: 'api-tests',
  });
  embedded = started;

  // Set before the workers fork, so every test file that reads
  // `process.env.DATABASE_URL` at module scope sees this server.
  process.env.DATABASE_URL = started.databaseUrl;
  console.log(`[api-tests] database: ${describeUrl(started.databaseUrl)} (embedded, production lineage applied)`);
}

export async function teardown(): Promise<void> {
  await embedded?.stop();
  embedded = undefined;
}
