import { createLogger, loadConfig } from '@orq8/core';
import { createDb, loginLockouts, passwordResetTokens } from '@orq8/db';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { appendAudit, verifyChain } from '../src/services/audit.js';
import type { AppDeps } from '../src/types.js';

function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

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

// ─── Brute-Force Account Lockout (docs/37: 10 attempts, 15-min cooldown) ────

run('auth brute-force lockout (10 failed logins → 15-min cooldown)', () => {
  const email = `bf-${randomUUID()}@example.com`;
  const password = 'sup3r-secret!';
  const wrongPassword = 'wrong-password-123';

  it('registers the target account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password, org_name: 'Brute Force Test Org' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('allows 10 failed attempts (each 401, no lockout yet)', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: wrongPassword },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('auth.unauthorized');
    }
  });

  it('locks the account on the 11th attempt (429 account_locked + Retry-After)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error.code).toBe('account_locked');
    expect(body.error.policy_ref).toBe('docs/37');
    // Retry-After should be ~15 minutes (900s)
    const retryAfter = parseInt(res.headers['retry-after'] as string, 10);
    expect(retryAfter).toBeGreaterThan(800);
    expect(retryAfter).toBeLessThanOrEqual(900);
  });

  it('persists the lockout to the database (survives restart)', async () => {
    const [row] = await deps.db
      .select()
      .from(loginLockouts)
      .where(eq(loginLockouts.email, email));
    expect(row).toBeDefined();
    expect(row!.failedCount).toBe(10);
    expect(row!.lockedUntil).toBeDefined();
    expect(row!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('still locked even with the correct password during cooldown', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('account_locked');
  });

  it('cleans up the lockout row after the test', async () => {
    await deps.db.delete(loginLockouts).where(eq(loginLockouts.email, email));
    const [row] = await deps.db.select().from(loginLockouts).where(eq(loginLockouts.email, email));
    expect(row).toBeUndefined();
  });
});

// ─── Password Reset Flow (forgot → token → reset → new login) ───────────────

run('auth password reset flow', () => {
  const email = `pwreset-${randomUUID()}@example.com`;
  const originalPassword = 'OriginalPass!123';
  const newPassword = 'NewPassword!456';
  const plaintextToken = `reset-token-${randomUUID()}`;

  it('registers a user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: originalPassword, org_name: 'Reset Flow Org' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('forgot-password does not leak whether an email exists (enumeration-safe)', async () => {
    // Unknown email → still ok:true
    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email: `nobody-${randomUUID()}@example.com` },
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json().data.ok).toBe(true);
  });

  it('forgot-password issues a reset token for a known email (dev transport logs it)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);

    // A token row must exist for this user (hashed — never the plaintext)
    const { users } = await import('@orq8/db');
    const [user] = await deps.db.select().from(users).where(eq(users.email, email));
    const tokens = await deps.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user!.id));
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    expect(tokens[0]!.tokenHash).not.toContain(plaintextToken);
  });

  it('rejects reset with an invalid/unknown token (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: 'definitely-not-a-real-token', password: newPassword },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('auth.unauthorized');
  });

  it('resets the password with a valid token and signs in with the new password', async () => {
    // Simulate the emailed token: we can't read it out of the dev transport,
    // so insert a known-token row directly (same sha256 hashing the route uses).
    const { users } = await import('@orq8/db');
    const [user] = await deps.db.select().from(users).where(eq(users.email, email));
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await deps.db.insert(passwordResetTokens).values({
      userId: user!.id,
      tokenHash: sha256hex(plaintextToken),
      expiresAt,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: plaintextToken, password: newPassword },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);

    // Old password must no longer work
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: originalPassword },
    });
    expect(oldLogin.statusCode).toBe(401);

    // New password works
    const newLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: newPassword },
    });
    expect(newLogin.statusCode).toBe(200);
    expect(newLogin.json().data.token).toBeTruthy();
  });

  it('rejects reusing the same reset token (single-use)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: plaintextToken, password: 'AnotherPass!789' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Change Password (authenticated) ────────────────────────────────────────

run('auth change-password flow', () => {
  const email = `changepw-${randomUUID()}@example.com`;
  const originalPassword = 'FirstPass!123';
  const newPassword = 'SecondPass!456';
  let token = '';

  it('registers and logs in', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: originalPassword, org_name: 'Change PW Org' },
    });
    expect(reg.statusCode).toBe(201);
    token = reg.json().data.token as string;
  });

  it('rejects change with wrong current password (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { current_password: 'wrong-current', new_password: newPassword },
    });
    expect(res.statusCode).toBe(401);
  });

  it('requires auth (401 without token)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      payload: { current_password: originalPassword, new_password: newPassword },
    });
    expect(res.statusCode).toBe(401);
  });

  it('changes the password successfully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { current_password: originalPassword, new_password: newPassword },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);
  });

  it('new password works, old password does not', async () => {
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: originalPassword },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: newPassword },
    });
    expect(newLogin.statusCode).toBe(200);
  });
});
