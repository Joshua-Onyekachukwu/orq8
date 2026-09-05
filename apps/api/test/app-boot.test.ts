/**
 * App-boot smoke tests.
 *
 * Verifies the raw-body-capturing JSON content-type parser (required for
 * webhook HMAC verification) boots and behaves: valid JSON parses, malformed
 * JSON returns the standard 400 envelope, and the GitHub receiver rejects
 * events without repository.full_name before any database access.
 *
 * No database required — the pool is created lazily and never queried.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

// Only the repo-resolution test needs a live database (it queries repositories);
// everything else exercises routes that fail before touching the pool.
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
  await app.close();
  await deps.pool.end();
});

describe('app boot — raw-body JSON parser', () => {
  it('builds with the override JSON parser', () => {
    expect(app).toBeDefined();
  });

  it('rejects malformed JSON with the standard 400 envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/github',
      headers: { 'content-type': 'application/json' },
      payload: '{not-json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error?.code).toBe('bad_request');
  });

  it('parses valid JSON and reaches the handler (400: missing repository)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/github',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ action: 'opened' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error?.message).toContain('repository.full_name');
  });

  it('returns 404 for events on repos ORQ8 does not track', { skip: !dbUp }, async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/github',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ repository: { full_name: 'nobody/does-not-exist' } }),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error?.message).toContain('not tracked');
  });

  it('internal endpoints are disabled when INTERNAL_TOKEN is unset', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/internal/events/process-pending' });
    expect(res.statusCode).toBe(404);
  });
});