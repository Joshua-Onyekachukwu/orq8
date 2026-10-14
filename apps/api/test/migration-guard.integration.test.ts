import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

/**
 * /v1/internal/migrate* fail-closed guard (found 2026-10-13 codebase review).
 *
 * These endpoints run raw DDL. They used to fall back to a hardcoded default
 * token (`orq8-internal-migrate-2026`) when INTERNAL_TOKEN was unset — a
 * public password. Now: no configured token means every call is refused,
 * and the old default string never authenticates.
 */

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000 /* 2026-10-13: 1.5s tripped under full-suite load, silently skipping files */ });
  await pool.query('SELECT 1');
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

function depsWithoutToken(): AppDeps {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.DATABASE_URL,
  } as NodeJS.ProcessEnv);
  // Belt and braces: the loader must not see a token from the environment.
  (cfg as Record<string, unknown>).INTERNAL_TOKEN = undefined;
  return {
    config: cfg,
    logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    ...createDb(config.DATABASE_URL),
  };
}

let app: FastifyInstance | undefined;
let ownedPool: { end: () => Promise<void> } | undefined;

afterAll(async () => {
  if (app) await app.close();
  if (ownedPool) await ownedPool.end();
});

run('internal migration endpoints fail closed without INTERNAL_TOKEN', () => {
  it('refuses the old hardcoded default on /verify', async () => {
    const deps = depsWithoutToken();
    ownedPool = deps.pool as unknown as { end: () => Promise<void> };
    app = await buildApp(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/migrate/verify',
      headers: { 'x-internal-token': 'orq8-internal-migrate-2026' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses the old hardcoded default on /migrate', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/v1/internal/migrate',
      headers: { 'x-internal-token': 'orq8-internal-migrate-2026' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses a missing token entirely', async () => {
    const res = await app!.inject({ method: 'POST', url: '/v1/internal/migrate/verify' });
    expect(res.statusCode).toBe(403);
  });
});
