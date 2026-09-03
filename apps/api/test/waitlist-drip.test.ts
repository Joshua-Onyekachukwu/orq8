import { createLogger, loadConfig } from '@orq8/core';
import { createDb, waitlistEmails, waitlistSignups } from '@orq8/db';
import { eq, inArray, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createEmailTransport } from '../src/email/transport.js';
import { enqueueDrip, processDueWaitlistEmails } from '../src/email/waitlist-drip.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', INTERNAL_TOKEN: 'test-internal-token' } as NodeJS.ProcessEnv);

// Only run against the local Postgres (infra compose) — skips cleanly otherwise.
let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};
let app: FastifyInstance;

const testEmails: string[] = [];

function freshEmail(): string {
  const email = `drip-test-${randomUUID()}@example.com`;
  testEmails.push(email);
  return email;
}

beforeAll(async () => {
  app = await buildApp(deps);
  // Remove stale signups from previous runs so processDueWaitlistEmails'
  // global "sent" count only reflects this run's rows.
  const stale = await deps.db
    .select({ email: waitlistSignups.email })
    .from(waitlistSignups)
    .where(like(waitlistSignups.email, 'drip-test-%'));
  if (stale.length > 0) {
    await deps.db
      .delete(waitlistSignups)
      .where(inArray(waitlistSignups.email, stale.map((s) => s.email)));
  }
});

afterAll(async () => {
  await app.close();
  if (testEmails.length > 0) {
    await deps.db.delete(waitlistSignups).where(inArray(waitlistSignups.email, testEmails));
  }
  await deps.pool.end();
});

run('waitlist drip queue', () => {
  it('enqueueDrip schedules welcome + day-2 + day-7 rows', async () => {
    const email = freshEmail();
    const [signup] = await deps.db
      .insert(waitlistSignups)
      .values({ email, name: 'Drip Tester', source: 'design_partner' })
      .returning();
    expect(signup).toBeDefined();
    const s = signup!;

    const now = new Date();
    const n = await enqueueDrip(deps.db, s, now);
    expect(n).toBe(3);

    const rows = await deps.db
      .select()
      .from(waitlistEmails)
      .where(eq(waitlistEmails.signupId, s.id))
      .orderBy(waitlistEmails.scheduledAt);
    expect(rows.map((r) => r.kind)).toEqual(['welcome', 'drip_2d', 'drip_7d']);
    expect(rows.every((r) => r.status === 'queued')).toBe(true);
    expect(rows[0]!.scheduledAt.getTime()).toBeLessThanOrEqual(now.getTime() + 1000);
    expect(rows[1]!.scheduledAt.getTime()).toBeGreaterThan(now.getTime() + 1.9 * 86400000);
    expect(rows[2]!.scheduledAt.getTime()).toBeGreaterThan(now.getTime() + 6.9 * 86400000);
  });

  it('processDueWaitlistEmails sends due rows and marks them sent', async () => {
    const email = freshEmail();
    const [signup] = await deps.db
      .insert(waitlistSignups)
      .values({ email, source: 'landing' })
      .returning();
    expect(signup).toBeDefined();
    const s = signup!;
    const now = new Date();
    await enqueueDrip(deps.db, s, now);

    const transport = createEmailTransport(config, deps.logger);
    // Only the welcome row is due now; the future drips must stay queued.
    // NOTE: processDueWaitlistEmails sends ALL due rows globally (other tests
    // in this file enqueue due welcomes too), so assert on this signup's rows
    // rather than the global "sent" count.
    await processDueWaitlistEmails(deps.db, transport, new Date(now.getTime() + 60_000));

    const rows = await deps.db.select().from(waitlistEmails).where(eq(waitlistEmails.signupId, s.id));
    const welcome = rows.find((r) => r.kind === 'welcome');
    expect(welcome?.status).toBe('sent');
    expect(welcome?.sentAt).toBeTruthy();
    expect(welcome?.attempts).toBe(1);
    expect(rows.filter((r) => r.kind !== 'welcome').every((r) => r.status === 'queued')).toBe(true);
  });

  it('POST /v1/waitlist creates the signup and enqueues the drip', async () => {
    const email = freshEmail();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/waitlist',
      headers: { 'content-type': 'application/json' },
      payload: { email, name: 'Route Tester', source: 'design_partner' },
    });
    expect(res.statusCode).toBe(201);
    const [signup] = await deps.db.select().from(waitlistSignups).where(eq(waitlistSignups.email, email));
    expect(signup).toBeDefined();
    const outbox = await deps.db.select().from(waitlistEmails).where(eq(waitlistEmails.signupId, signup!.id));
    expect(outbox.map((r) => r.kind).sort()).toEqual(['drip_2d', 'drip_7d', 'welcome']);
  });

  it('POST /v1/waitlist is idempotent — repeat is 200 and does not re-enqueue', async () => {
    const email = freshEmail();
    const first = await app.inject({
      method: 'POST',
      url: '/v1/waitlist',
      headers: { 'content-type': 'application/json' },
      payload: { email },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/waitlist',
      headers: { 'content-type': 'application/json' },
      payload: { email },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    const [signup] = await deps.db.select().from(waitlistSignups).where(eq(waitlistSignups.email, email));
    const outbox = await deps.db.select().from(waitlistEmails).where(eq(waitlistEmails.signupId, signup!.id));
    expect(outbox).toHaveLength(3);
  });

  it('internal process-due endpoint requires the token and returns a result', async () => {
    const noToken = await app.inject({ method: 'POST', url: '/v1/internal/waitlist/process-due' });
    expect(noToken.statusCode).toBe(401);

    const wrong = await app.inject({
      method: 'POST',
      url: '/v1/internal/waitlist/process-due',
      headers: { 'x-internal-token': 'nope' },
    });
    expect(wrong.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/internal/waitlist/process-due',
      headers: { 'x-internal-token': 'test-internal-token' },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as { data: { sent: number; failed: number } };
    expect(typeof body.data.sent).toBe('number');
    expect(typeof body.data.failed).toBe('number');
  });
});
