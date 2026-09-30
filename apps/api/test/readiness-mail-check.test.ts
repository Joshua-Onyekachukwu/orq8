import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

/**
 * The deployment's mail self-check (docs/69 §14, `/v1/readiness/mail-check`).
 *
 * `/v1/readiness` reports that the `email` capability is *configured*: a
 * `SMTP_HOST` or `RESEND_API_KEY` is present in the environment. That is not the
 * same claim as "mail delivers" — a provider can reject a correct-looking key,
 * or a port can be blocked, and every capability check still passes while nobody
 * can confirm an account. This endpoint closes that gap by running the same
 * three-verdict diagnosis the settings page shows, so a release gate can prove
 * delivery instead of describing configuration.
 *
 * What is pinned here:
 *
 *   1. It is machine-only. An unauthenticated or wrongly-authenticated caller
 *      cannot make a deployment send mail — the check has a real side effect.
 *   2. 200 means "the check ran", not "mail works": a failed diagnosis is the
 *      answer, carried in the body with the broken step and the fix.
 *   3. With no transport configured it says so, and names the keys that fix it,
 *      without touching the network.
 */

const TOKEN = 'token-internal-readiness-mail';
const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', INTERNAL_TOKEN: TOKEN } as NodeJS.ProcessEnv);
const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL), // pool connects lazily; these paths don't hit the DB
};
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(deps);
});
afterAll(async () => {
  await app.close();
  await deps.pool.end();
});

const post = async (headers: Record<string, string> = {}, payload: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: '/v1/readiness/mail-check', headers, payload });

describe('POST /v1/readiness/mail-check', () => {
  it('refuses a caller with no internal token', async () => {
    const res = await post();

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('auth.forbidden');
  });

  it('refuses a caller with the wrong internal token', async () => {
    const res = await post({ 'x-internal-token': 'not-the-token' });

    expect(res.statusCode).toBe(403);
  });

  it('runs the check for the pipeline and returns the verdict, not an error', async () => {
    const res = await post({ 'x-internal-token': TOKEN }, { to: 'pipeline@orq8.test' });

    // The check itself succeeded; that the deployment cannot send is the
    // answer, and the founder-facing path reports it the same way.
    expect(res.statusCode).toBe(200);

    const diagnosis = res.json().data;
    expect(diagnosis.delivered).toBe(false);
    expect(diagnosis.to).toBe('pipeline@orq8.test');

    const configuration = diagnosis.steps.find((s: { id: string }) => s.id === 'configuration');
    expect(configuration.ok).toBe(false);
    // Every step is reported, not just the first failure: a founder fixing one
    // problem should not discover the next one only after redeploying.
    expect(diagnosis.steps.length).toBeGreaterThan(1);
  });

  it('names the fix, so a red release is actionable', async () => {
    const res = await post({ 'x-internal-token': TOKEN });
    const diagnosis = res.json().data;

    expect(diagnosis.failure).toBeTruthy();
    expect(diagnosis.failure.reason).toBeTruthy();
    expect(diagnosis.failure.fix).toMatch(/RESEND_API_KEY|SMTP_HOST/);
  });

  it('falls back to the address in EMAIL_FROM when the caller names no recipient', async () => {
    const res = await post({ 'x-internal-token': TOKEN });
    const diagnosis = res.json().data;

    // `ORQ8 <founder@orq8.ai>` → the mailbox, not the display name.
    expect(diagnosis.to).toBe('founder@orq8.ai');
    expect(diagnosis.to).not.toContain('<');
  });

  it('rejects a malformed recipient instead of sending anywhere', async () => {
    const res = await post({ 'x-internal-token': TOKEN }, { to: 'not-an-address' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation.failed');
  });
});
