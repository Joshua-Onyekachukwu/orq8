import { beforeAll, describe, expect, it } from 'vitest';

// Production boot check (docs/58): loadConfig's production guard accepts real
// secrets, buildApp boots, and inject round-trips. No DB access — health route.
// Secrets come from env (see .freebuff/prod-secrets.txt); NODE_ENV forced here.
process.env.NODE_ENV = 'production';
process.env.LOG_LEVEL = 'error';
process.env.PORT = '';

const hasSecrets = Boolean(process.env.SESSION_SECRET && process.env.ENCRYPTION_KEY);
const run = hasSecrets ? describe : describe.skip;

type DbHandle = Awaited<ReturnType<typeof import('@orq8/db').createDb>>;

run('production boot (Vercel entry path)', () => {
  let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
  let handle: DbHandle;

  beforeAll(async () => {
    const { loadConfig, createLogger } = await import('@orq8/core');
    const { createDb } = await import('@orq8/db');
    const { buildApp } = await import('../src/app.js');
    const config = loadConfig();
    expect(config.NODE_ENV).toBe('production');
    const logger = createLogger(config);
    handle = createDb(config.DATABASE_URL);
    app = await buildApp({ config, db: handle.db, pool: handle.pool, logger });
    await app.ready();
  }, 30000);

  it('healthz returns ok in production', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
  });

  it('unknown route returns the envelope in production', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error?: { code?: string } }).error?.code).toBe('not_found');
  });
});
