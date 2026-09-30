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

/**
 * The activation surface (docs/69 §14).
 *
 * `/readyz` answers "can this instance serve?" and `/v1/readiness` answers "is
 * the product switched on?". A release gate reads the first without a session;
 * only the second names capabilities, and it names key names, never values —
 * asserted here, because the whole point of the split is that the public one
 * cannot leak the deployment's soft spots.
 */
describe('activation surface (DB required)', () => {
  const dbConfig = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.DATABASE_URL,
  } as NodeJS.ProcessEnv);
  const dbDeps: AppDeps = {
    config: dbConfig,
    logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    ...createDb(dbConfig.DATABASE_URL),
  };
  let dbApp: FastifyInstance;

  beforeAll(async () => {
    dbApp = await buildApp(dbDeps);
  });
  afterAll(async () => {
    await dbApp.close();
    await dbDeps.pool.end();
  });

  it('GET /readyz reports dependency readiness and the activation counts', async () => {
    const res = await dbApp.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);

    const body = res.json().data;
    expect(body.status).toBe('ready');
    expect(Object.keys(body.activation)).toEqual([
      'ready',
      'configurationRequired',
      'devOnly',
      'blocking',
    ]);
    expect(body.activation.ready).toBeGreaterThan(0);
    // This environment has no mail provider and no hosted model key, so it is
    // ready to serve and not ready to be a product. That difference is the
    // point of reporting both.
    expect(body.activation.blocking).toBeGreaterThan(0);
  });

  it('does not name a capability on the public route', async () => {
    const res = await dbApp.inject({ method: 'GET', url: '/readyz' });

    expect(res.payload).not.toContain('OPENROUTER');
    expect(res.payload).not.toContain('DATABASE_URL');
    expect(res.payload).not.toContain('RESEND');
  });

  it('GET /v1/readiness names them, and requires a session to do it', async () => {
    const res = await dbApp.inject({ method: 'GET', url: '/v1/readiness' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('auth.unauthorized');
  });
});

/**
 * The machine read (docs/68 MVP-021): a release gate has no session, and a red
 * deploy that cannot say *why* is a red deploy nobody fixes. The internal token
 * is the same one the cron hooks use; the report it unlocks is still names only.
 */
describe('readiness as a machine (DB required)', () => {
  const GATE_TOKEN = 'token-for-the-release-gate-9d';
  const gateConfig = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.DATABASE_URL,
    INTERNAL_TOKEN: GATE_TOKEN,
  } as NodeJS.ProcessEnv);
  const gateDeps: AppDeps = {
    config: gateConfig,
    logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    ...createDb(gateConfig.DATABASE_URL),
  };
  let gateApp: FastifyInstance;

  beforeAll(async () => {
    gateApp = await buildApp(gateDeps);
  });
  afterAll(async () => {
    await gateApp.close();
    await gateDeps.pool.end();
  });

  it('accepts the internal token with no session and names the blocking capabilities', async () => {
    const res = await gateApp.inject({
      method: 'GET',
      url: '/v1/readiness',
      headers: { 'x-internal-token': GATE_TOKEN },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json().data;
    expect(Array.isArray(body.blocking)).toBe(true);
    // This environment has no hosted model key and no mail provider, so the gate
    // has something concrete to name.
    expect(body.blocking).toContain('model_gateway');
    expect(body.blocking).toContain('email');
    // Naming a blocker means naming the key, never the value.
    expect(res.payload).not.toContain(GATE_TOKEN);
  });

  it('refuses a wrong or missing token', async () => {
    const wrong = await gateApp.inject({
      method: 'GET',
      url: '/v1/readiness',
      headers: { 'x-internal-token': 'not-the-token-at-all-0000' },
    });
    expect(wrong.statusCode).toBe(401);

    const missing = await gateApp.inject({ method: 'GET', url: '/v1/readiness' });
    expect(missing.statusCode).toBe(401);
  });

  it('agrees with the public counts: the same deployment, one with names, one without', async () => {
    const publicRes = await gateApp.inject({ method: 'GET', url: '/readyz' });
    const namedRes = await gateApp.inject({
      method: 'GET',
      url: '/v1/readiness',
      headers: { 'x-internal-token': GATE_TOKEN },
    });

    expect(publicRes.json().data.activation.blocking).toBe(
      namedRes.json().data.blocking.length,
    );
  });
});
