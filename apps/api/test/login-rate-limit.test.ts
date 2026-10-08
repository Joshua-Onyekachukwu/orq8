import { createLogger, loadConfig } from '@orq8/core';
import { createDb, loginLockouts } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { formatRetryAfter } from '../src/services/rate-limit-service.js';
import type { AppDeps } from '../src/types.js';

/**
 * Login rate limiting (docs/37) — the 429 must tell the truth.
 *
 * The old body said "try again in 1 minutes" for a lock with 8 seconds left,
 * because it rounded the remaining time up to whole minutes and always spoke
 * in minutes. A client that is lied to distrusts the header and hammers
 * anyway. This suite pins the honest behaviour:
 *
 *   - 10 failures lock the account; the next attempt is 429 `account_locked`
 *     with a numeric Retry-After;
 *   - the message reports the EXACT remaining time ("8 seconds"), matching
 *     the Retry-After header;
 *   - the lock lifts exactly when it said, and a successful login clears the
 *     failed-attempt counter.
 */
// Verification off: the lockout behaviour under test is independent of the
// email-confirmation gate, and the successful-login paths need the account to
// be sign-in-able (same posture as email-verification-optional.test.ts).
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
  REQUIRE_EMAIL_VERIFICATION: 'false',
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

function makeDeps(): AppDeps {
  return {
    config,
    logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    ...createDb(config.DATABASE_URL),
  };
}

const run = dbUp ? describe : describe.skip;

run('login rate limiting reports the real cooldown', () => {
  let app: FastifyInstance;
  let deps: AppDeps;
  const email = `lockout-${randomUUID()}@example.com`;
  const password = 'sup3r-secret!';

  const fail = () =>
    app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'wrong-password!' },
    });

  beforeAll(async () => {
    deps = makeDeps();
    app = await buildApp(deps);
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password, org_name: 'Lockout Probe Co' },
    });
    expect([200, 201]).toContain(reg.statusCode);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (deps) await deps.pool.end();
  });

  it('locks after 10 failed attempts and answers 429 with a Retry-After', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await fail();
      expect(res.statusCode).toBe(401);
    }
    const blocked = await fail();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('account_locked');

    const ra = Number(blocked.headers['retry-after']);
    expect(Number.isFinite(ra)).toBe(true);
    expect(ra).toBeGreaterThan(0);
    expect(ra).toBeLessThanOrEqual(900);

    // The honest envelope — never the old "in 1 minutes" rounding lie.
    const message: string = blocked.json().error.message;
    expect(message).toMatch(/^Too many failed login attempts\. Please try again in /);
    expect(message).not.toMatch(/in 1 minutes\./);
  });

  it('reports the exact seconds remaining, not a rounded-up minute', async () => {
    // 8 seconds left: the body must say "seconds" and match the header.
    await deps.db
      .update(loginLockouts)
      .set({ lockedUntil: new Date(Date.now() + 8_000) })
      .where(eq(loginLockouts.email, email));

    const res = await fail();
    expect(res.statusCode).toBe(429);
    const ra = Number(res.headers['retry-after']);
    expect(ra).toBeGreaterThanOrEqual(1);
    expect(ra).toBeLessThanOrEqual(8);
    expect(res.json().error.message).toMatch(/in [1-8] seconds\./);
  });

  it('the lock lifts exactly when it said — no residue after expiry', async () => {
    await deps.db
      .update(loginLockouts)
      .set({ lockedUntil: new Date(Date.now() - 1_000) })
      .where(eq(loginLockouts.email, email));

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    expect(ok.statusCode).toBe(200);

    // Successful login resets the counter — the lockout row is gone.
    const rows = await deps.db.select().from(loginLockouts).where(eq(loginLockouts.email, email));
    expect(rows.length).toBe(0);
  });

  it('a successful login clears a partial failed-attempt counter', async () => {
    for (let i = 0; i < 3; i++) await fail();
    const before = await deps.db.select().from(loginLockouts).where(eq(loginLockouts.email, email));
    expect(before[0]?.failedCount).toBe(3);

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    expect(ok.statusCode).toBe(200);

    const after = await deps.db.select().from(loginLockouts).where(eq(loginLockouts.email, email));
    expect(after.length).toBe(0);
  });
});

describe('formatRetryAfter', () => {
  it('humanizes durations without rounding away the truth', () => {
    expect(formatRetryAfter(0.4)).toBe('1 second');
    expect(formatRetryAfter(8)).toBe('8 seconds');
    expect(formatRetryAfter(90)).toBe('1 minute 30 seconds');
    expect(formatRetryAfter(120)).toBe('2 minutes');
    expect(formatRetryAfter(4500)).toBe('1 hour 15 minutes');
    expect(formatRetryAfter(7200)).toBe('2 hours');
  });
});
