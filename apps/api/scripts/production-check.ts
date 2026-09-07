/**
 * ORQ8 Production Operations Verification — `pnpm ops:check`
 *
 * Validates the production environment without requiring a local database
 * connection:
 *
 *   pnpm ops:check                     → calls GET /v1/internal/ops-check on the
 *                                       configured production API (API_URL +
 *                                       INTERNAL_TOKEN), which runs the check
 *                                       against the API service's own
 *                                       production DATABASE_URL.
 *   DATABASE_URL=... pnpm ops:check    → falls back to a direct local run of
 *                                       the same shared logic (services/ops-check)
 *                                       against the given database.
 *
 * Never prints secrets. Exits non-zero when a required check fails.
 */
import { loadConfig } from '@orq8/core';
import { runOpsCheck, openCheckPool, type OpsCheckReport } from '../src/services/ops-check.js';

function printReport(report: OpsCheckReport): void {
  console.log('ORQ8 PRODUCTION OPERATIONS VERIFICATION\n');
  for (const c of report.checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.ok ? '' : '  — ' + c.detail}`);
  }
  for (const w of report.warnings) {
    console.log(`NOTE  ${w.label}  — ${w.detail}`);
  }
  console.log('\n' + '─'.repeat(46));
  console.log(`OVERALL STATUS: ${report.overall}`);
  if (report.overall === 'FAIL') {
    console.log('\nFailures:');
    for (const f of report.checks.filter((c) => !c.ok)) console.log(`- ${f.label}: ${f.detail}`);
  }
  if (report.warnings.length > 0) {
    console.log('\nWarnings (non-fatal):');
    for (const w of report.warnings) console.log(`- ${w.label}: ${w.detail}`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();

  // Preferred path: the INTERNAL_TOKEN-protected production endpoint.
  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl && config.INTERNAL_TOKEN) {
    const url = `${apiUrl.replace(/\/$/, '')}/v1/internal/ops-check`;
    const res = await fetch(url, {
      headers: { 'x-internal-token': config.INTERNAL_TOKEN },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error(`Ops check endpoint returned HTTP ${res.status} — is INTERNAL_TOKEN configured on the API service?`);
      process.exit(1);
    }
    const body = (await res.json().catch(() => null)) as { data?: OpsCheckReport } | null;
    if (!body?.data) {
      console.error('Ops check endpoint returned an unexpected payload.');
      process.exit(1);
    }
    printReport(body.data);
    process.exit(body.data.overall === 'PASS' ? 0 : 1);
  }

  // Fallback: direct local run (requires DATABASE_URL).
  if (!config.DATABASE_URL) {
    console.error('Set API_URL + INTERNAL_TOKEN (endpoint mode) or DATABASE_URL (local mode) to run the ops check.');
    process.exit(1);
  }
  const pool = openCheckPool(config.DATABASE_URL);
  try {
    const report = await runOpsCheck(config, pool);
    printReport(report);
    process.exit(report.overall === 'PASS' ? 0 : 1);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('Verification script crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});