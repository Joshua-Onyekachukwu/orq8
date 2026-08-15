import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { appendAudit, verifyChain } from '../src/services/audit.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

// Only run when the local Postgres (infra compose) is reachable — keeps `pnpm test` green
// on machines without Docker.
let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(deps);
});
afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

const run = dbUp ? describe : describe.skip;

run('auth end-to-end (G1: two tenants isolated, audit chain, free stack)', () => {
  const email = `it-${randomUUID()}@example.com`;
  const emailB = `it-${randomUUID()}@example.com`;
  const password = 'sup3r-secret!';
  let token = '';
  let orgId = '';

  it('registers a tenant and returns a session (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password, org_name: 'Integration Test Org' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.token).toBeTruthy();
    expect(body.data.org.role).toBe('owner');
    expect(body.data.org.plan).toBe('free');
    token = body.data.token as string;
    orgId = body.data.org.id as string;
  });

  it('me returns user + memberships + active org', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.email).toBe(email);
    expect(body.data.active_org_id).toBe(orgId);
    expect(body.data.memberships[0].org.id).toBe(orgId);
  });

  it('rejects duplicate registration (409 conflict)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password, org_name: 'Another Org' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('conflict');
  });

  it('logs in with the same credentials (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBeTruthy();
  });

  it('rejects wrong password (401 auth.unauthorized)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('auth.unauthorized');
  });

  it('second tenant cannot see the first tenant (isolation)', async () => {
    const regB = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: emailB, password, org_name: 'Isolation Org' },
    });
    expect(regB.statusCode).toBe(201);
    const tokenB = regB.json().data.token as string;

    const meB = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    const membershipsB = meB.json().data.memberships as { org: { id: string } }[];
    // tenant B sees only its own org — never tenant A's
    expect(membershipsB.map((m) => m.org.id)).not.toContain(orgId);
  });

  it('audit chain verifies after registration (tamper-evident, docs/34.4)', async () => {
    const check = await verifyChain(deps.db, orgId);
    expect(check.valid).toBe(true);
    expect(check.rows).toBeGreaterThanOrEqual(3); // user.registered + org.created + member.joined
  });

  it('tampering with an audit row breaks the chain', async () => {
    // append one more event, then mutate the newest row — chain must fail
    await appendAudit(deps.db, { orgId, actorType: 'system', actorId: null, action: 'test.tamper_target', outcome: 'success' });
    const before = await verifyChain(deps.db, orgId);
    expect(before.valid).toBe(true);

    const { auditEvents } = await import('@orq8/db');
    const { desc, eq } = await import('drizzle-orm');
    const [row] = await deps.db
      .select({ last: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgId))
      .orderBy(desc(auditEvents.id))
      .limit(1);
    if (!row) throw new Error('expected an audit row to tamper with');
    // deliberate mutation of the newest append-only row to prove tamper-evidence (docs/34.4)
    await deps.db.update(auditEvents).set({ outcome: 'failure' }).where(eq(auditEvents.id, row.last));

    const after = await verifyChain(deps.db, orgId);
    expect(after.valid).toBe(false);
    expect(after.firstBrokenId).toBeDefined();
  });

  it('logout revokes the session (204, then 401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);
    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(401);
  });
});
