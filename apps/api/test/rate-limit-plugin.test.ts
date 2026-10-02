/**
 * Rate limiter fallback tests (docs/77 A8).
 *
 * The API's rate limits are Redis-backed in production (`plugins/rate-limit-redis.ts`)
 * and fall back to the in-memory limiters in `plugins/rate-limit.ts` when Redis is
 * absent. Two things are worth proving about the fallback, because it is the path
 * a single-instance deployment actually runs:
 *
 *   1. it limits (a burst is answered 429 with a Retry-After, not served);
 *   2. each route class keeps its own bucket, so exhausting one does not lock a
 *      user out of everything else.
 *
 * Note on the integration suites: the global limiter is disabled when
 * `NODE_ENV=test` (see `app.ts`), so HTTP-level spam cannot be exercised through
 * `buildApp` in tests. That is deliberate and is why this file drives the plugin
 * directly instead of pretending the app's limits are covered end to end.
 */

import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { rateLimitRoute } from '../src/plugins/rate-limit.js';

const apps: Array<ReturnType<typeof Fastify>> = [];

function buildLimitedApp(path: string, max: number, label?: string) {
  const app = Fastify();
  rateLimitRoute(app, { path, max, windowMs: 60_000, label });
  app.post(path, async () => ({ ok: true }));
  app.post(`${path}/other`, async () => ({ ok: true }));
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('in-memory route limiter', () => {
  it('serves up to the limit, then answers 429 with Retry-After', async () => {
    const app = buildLimitedApp('/v1/commands', 2, 'commands');

    const first = await app.inject({ method: 'POST', url: '/v1/commands' });
    const second = await app.inject({ method: 'POST', url: '/v1/commands' });
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);

    const limited = await app.inject({ method: 'POST', url: '/v1/commands' });
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    const body = limited.json() as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('rate_limited');
    expect(String(body.error?.message)).toContain('commands');

    // Still limited on the next attempt — the window has not been reset by the
    // first rejection.
    expect((await app.inject({ method: 'POST', url: '/v1/commands' })).statusCode).toBe(429);
  });

  it('keeps a bucket per route class, so one exhausted limit does not lock the rest', async () => {
    const app = Fastify();
    rateLimitRoute(app, { path: '/v1/tasks/execute', max: 1, windowMs: 60_000, label: 'task execution' });
    rateLimitRoute(app, { path: '/v1/credits', max: 5, windowMs: 60_000, label: 'credits' });
    app.post('/v1/tasks/execute', async () => ({ ok: true }));
    app.post('/v1/credits/consume', async () => ({ ok: true }));
    apps.push(app);

    expect((await app.inject({ method: 'POST', url: '/v1/tasks/execute' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/v1/tasks/execute' })).statusCode).toBe(429);

    // A different class is unaffected.
    expect((await app.inject({ method: 'POST', url: '/v1/credits/consume' })).statusCode).toBe(200);
  });

  it('ignores methods and paths it does not own', async () => {
    const app = buildLimitedApp('/v1/commands', 1);
    app.get('/v1/commands', async () => ({ listed: true }));
    apps.push(app);

    // The limiter is POST-scoped; reads must not consume the write budget.
    for (let i = 0; i < 3; i++) {
      expect((await app.inject({ method: 'GET', url: '/v1/commands' })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'POST', url: '/v1/commands' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/v1/commands' })).statusCode).toBe(429);
  });
});
