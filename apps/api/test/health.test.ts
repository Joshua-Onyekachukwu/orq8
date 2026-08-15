import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL), // pool connects lazily; these tests don't hit the DB
};
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(deps);
});
afterAll(async () => {
  await app.close();
  await deps.pool.end();
});

describe('app shell (no DB required)', () => {
  it('GET /healthz returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { status: 'ok', service: 'orq8-api' } });
  });

  it('echoes x-request-id', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('unknown route returns the error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/definitely-not-a-route' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    expect(res.json().error.message).toBeTruthy();
  });

  it('invalid register body returns validation.failed envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation.failed');
    expect(res.json().error.details).toBeDefined();
  });

  it('protected route without a token returns auth.unauthorized', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('auth.unauthorized');
  });
});
