import { createLogger, loadConfig } from '@orq8/core';
import { createDb, emailVerificationTokens } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

/**
 * REQUIRE_EMAIL_VERIFICATION=false — the "mail not wired yet" launch posture.
 *
 * With verification on (the default), registration mints an unconfirmed
 * session: the account exists but cannot sign in until the emailed link is
 * opened. That dead-ends every signup whenever Resend/SMTP is unconfigured,
 * because the link is only written to the log. This suite pins the off
 * behaviour: the account is active at signup, no verification token is issued,
 * and login succeeds immediately — while the default (on) still gates.
 */
const baseEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv;

const configOff = loadConfig({ ...baseEnv, REQUIRE_EMAIL_VERIFICATION: 'false' });
const configOn = loadConfig({ ...baseEnv });

let dbUp = false;
try {
  const probe = new Pool({ connectionString: configOff.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

function makeDeps(config: typeof configOff): AppDeps {
  return {
    config,
    logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    ...createDb(config.DATABASE_URL),
  };
}

const run = dbUp ? describe : describe.skip;

run('REQUIRE_EMAIL_VERIFICATION=false activates the account at signup', () => {
  const email = `optional-${randomUUID()}@example.com`;
  const password = 'sup3r-secret!';
  let appOff: FastifyInstance;
  let appOn: FastifyInstance;
  let depsOff: AppDeps;
  let depsOn: AppDeps;

  beforeAll(async () => {
    depsOff = makeDeps(configOff);
    depsOn = makeDeps(configOn);
    appOff = await buildApp(depsOff);
    appOn = await buildApp(depsOn);
  });

  afterAll(async () => {
    if (appOff) await appOff.close();
    if (appOn) await appOn.close();
    await depsOff.pool.end();
    await depsOn.pool.end();
  });

  it('register returns email_verified:true and issues no verification token', async () => {
    const res = await appOff.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password, org_name: 'No-Mail Org' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.email_verified).toBe(true);

    const tokens = await depsOff.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, body.data.user.id));
    expect(tokens.length).toBe(0);
  });

  it('login succeeds immediately without confirming an email', async () => {
    const res = await appOff.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    const token = res.json().data.token as string;
    expect(token).toBeTruthy();

    // And the session reaches a data route that the confirmation gate guards.
    const me = await appOff.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
  });

  it('the default (verification on) still gates login until confirmed', async () => {
    const gatedEmail = `gated-${randomUUID()}@example.com`;
    const reg = await appOn.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: gatedEmail, password, org_name: 'Gated Org' },
    });
    expect(reg.statusCode).toBe(201);
    expect(reg.json().data.email_verified).toBe(false);

    const login = await appOn.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: gatedEmail, password },
    });
    expect(login.statusCode).toBe(403);
    expect(login.json().error.code).toBe('email_not_verified');
  });
});
