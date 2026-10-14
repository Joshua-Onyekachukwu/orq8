import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import { createDb, users as usersTable } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { appendAudit } from '../src/services/audit.js';
import { scanSecuritySignals } from '../src/services/security-monitor.js';

/**
 * Security monitoring, layer 1: the audit trail must ANSWER when attacked
 * (Phase 7, risk R-009).
 *
 * Failed logins are audited per-event today, but nothing aggregates them —
 * a brute-force campaign, a lockout wave, or a tool-denial probe is invisible
 * unless someone hand-queries the ledger. `scanSecuritySignals` turns recent
 * audit rows into typed signals the scheduled job (and the founder) can act
 * on. Thresholds are conservative: a handful of ordinary failures stays
 * silent, a campaign does not.
 */

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

const deps = { config, logger: createLogger(config), ...createDb(config.DATABASE_URL) };
let app: FastifyInstance;
let token = '';
let orgId = '';
let userId = '';

beforeAll(async () => {
  app = await buildApp(deps);
  await app.ready();
  const email = `secmon-${Date.now()}@test.com`;
  const reg = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'TestPass123!', org_name: 'SecMon Org' },
  });
  expect(reg.statusCode, reg.payload).toBe(201);
  const body = JSON.parse(reg.payload) as { data: { token: string; org: { id: string }; user: { id: string } } };
  token = body.data.token;
  orgId = body.data.org.id;
  userId = body.data.user.id;
  await deps.db.update(usersTable).set({ emailVerifiedAt: new Date() }).where(eq(usersTable.email, email.toLowerCase()));
}, 30_000);

afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

async function seed(action: string, outcome = 'denied', n = 1): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await appendAudit(deps.db, { orgId, actorType: 'user', actorId: userId, action, outcome });
  }
}

describe('security signal detection over the audit trail', () => {
  it('refuses the scheduled scan endpoint without the internal token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/security/scan',
      headers: { 'x-internal-token': 'wrong-token' },
    });
    expect([401, 404]).toContain(res.statusCode);
  });

  it('stays silent on ordinary low-volume failures', async () => {
    // Runs FIRST: seeds below accumulate in this org, so silence is only
    // assertable before the campaign tests run.
    await seed('auth.login_failed', 'denied', 2);
    const signals = await scanSecuritySignals(deps.db, orgId, { windowMinutes: 60 });
    expect(signals.map((s) => s.type)).not.toContain('failed_login_spike');
  });

  it('raises failed-login and lockout signals under a brute-force campaign', async () => {
    await seed('auth.login_failed', 'denied', 6);
    await seed('auth.account_locked', 'denied', 1);

    const signals = await scanSecuritySignals(deps.db, orgId, { windowMinutes: 60 });
    const types = signals.map((s) => s.type);
    expect(types).toContain('failed_login_spike');
    expect(types).toContain('account_lockout');
    expect(signals.find((s) => s.type === 'failed_login_spike')!.severity).toBe('high');
  });

  it('raises a tool-denial spike when an agent probes forbidden tools', async () => {
    await seed('tool.denied', 'denied', 5);
    const signals = await scanSecuritySignals(deps.db, orgId, { windowMinutes: 60 });
    expect(signals.map((s) => s.type)).toContain('tool_denial_spike');
  });

  it('raises an approval-rejection signal when the founder keeps refusing', async () => {
    await seed('approval.rejected', 'denied', 3);
    const signals = await scanSecuritySignals(deps.db, orgId, { windowMinutes: 60 });
    expect(signals.map((s) => s.type)).toContain('approval_rejection_spike');
  });

});
