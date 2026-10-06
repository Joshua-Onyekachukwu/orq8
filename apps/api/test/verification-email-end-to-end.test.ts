/**
 * Verification email, end-to-end (docs/82 §flip-to-verified).
 *
 * The flip to `REQUIRE_EMAIL_VERIFICATION=true` must not be a leap of faith:
 * the moment a Resend key exists in the environment, registration must hand a
 * real message to the real transport (correct recipient, subject, and a
 * verify link carrying a working token), and the emailed token must confirm
 * the account and unlock login.
 *
 * This suite runs that ENTIRE chain on the embedded production-lineage
 * database with the production transport code — the only thing stubbed is the
 * provider's HTTP boundary (global fetch to api.resend.com), which is the one
 * thing that needs the real key. If this stays green, providing
 * `RESEND_API_KEY` (and `EMAIL_FROM` on a verified domain) is configuration,
 * not code.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

const captured: Array<{ url: string; auth: string; body: Record<string, unknown> }> = [];

vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith('https://api.resend.com/emails')) {
    captured.push({
      url,
      auth: String((init?.headers as Record<string, string>)?.Authorization ?? ''),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'test-message-id' }),
    } as Response;
  }
  throw new Error(`unexpected fetch in test: ${url}`);
});

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
  REQUIRE_EMAIL_VERIFICATION: 'true',
  RESEND_API_KEY: 're_test_key_present',
  EMAIL_FROM: 'ORQ8 <founder@orq8.ai>',
} as NodeJS.ProcessEnv);

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let app: Awaited<ReturnType<typeof buildApp>>;

const run = process.env.DATABASE_URL || process.env.CI === 'true' ? describe : describe.skip;

run('verification email is wired end-to-end the moment a Resend key exists', () => {
  beforeAll(async () => {
    app = await buildApp(deps);
  });

  afterAll(async () => {
    if (app) await app.close();
    await deps.pool.end();
  });

  it('register sends the real transport a message with a working verify link', async () => {
    const email = `verified-${Date.now()}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'TestPass123!', org_name: 'Mail Wired Org' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.email_verified).toBe(false);

    // The production transport code ran, aimed at Resend, authorised with the
    // configured key, addressed to the new user, carrying the template.
    expect(captured.length).toBe(1);
    const mail = captured[0]!;
    expect(mail.auth).toBe('Bearer re_test_key_present');
    expect(mail.body.from).toBe('ORQ8 <founder@orq8.ai>');
    expect(mail.body.to).toEqual([email]);
    expect(String(mail.body.subject).toLowerCase()).toContain('verify');

    // The link inside the email carries the plaintext token the verify
    // endpoint will consume — proving template → URL → token → endpoint all
    // agree.
    const html = String(mail.body.html);
    const match = /verify-email\?token=([A-Za-z0-9_-]+)/.exec(html);
    expect(match, 'verify link present in the emailed HTML').not.toBeNull();
    return match![1];
  });

  it('the emailed token confirms the account and unlocks login', async () => {
    // Chain on the token captured by the previous step.
    const tokenMatch = /verify-email\?token=([A-Za-z0-9_-]+)/.exec(String(captured[0]!.body.html));
    expect(tokenMatch).not.toBeNull();

    const verify = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token: tokenMatch![1] },
    });
    expect(verify.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: (await registeredEmail()) , password: 'TestPass123!' },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().data.token as string;

    // And the confirmed session reaches a confirmation-gated data route.
    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
  });
});

/** The registered address, shared across the two steps without module state gymnastics. */
let storedEmail = '';
async function registeredEmail(): Promise<string> {
  if (!storedEmail) {
    // Re-derive from the captured mail rather than a fixture leak.
    storedEmail = (captured[0]!.body.to as string[])[0]!;
  }
  return storedEmail;
}
