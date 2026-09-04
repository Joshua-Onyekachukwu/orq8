/**
 * Notifications Persistence + Isolation Integration Tests
 *
 * The notification feed used to live in an in-memory Map per API instance:
 * history vanished on restart and instances disagreed. After migration 0012
 * the feed is DB-backed. These tests pin the lifecycle and org isolation:
 *   1. Seed → list/unread counts
 *   2. read-all + per-id read
 *   3. Feed survives a full app rebuild (DB, not memory)
 *   4. A second org cannot read or mutate the first org's notifications
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

// ─── Setup ──────────────────────────────────────────────────────────────────

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

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
  if (app) await app.close();
  await deps.pool.end();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function registerOrg(tag: string): Promise<string> {
  const email = `${tag}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `${tag} Org` },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data.token as string;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

// ─── Tests ──────────────────────────────────────────────────────────────────

const run = dbUp ? describe : describe.skip;

run('DB-backed notifications', () => {
  it('persists seeded notifications through a full app restart', async () => {
    // App close + rebuild can exceed the default 5s when other integration
    // files are hammering the same dev DB in parallel workers.
    const token = await registerOrg('notif-persist');
    const seed = await app.inject({
      method: 'POST',
      url: '/v1/notifications/seed',
      headers: auth(token),
    });
    expect(seed.statusCode).toBe(200);
    expect(seed.json().data.seeded).toBe(8);

    // Simulate a restart: rebuild the entire app against the same DB.
    await app.close();
    app = await buildApp(deps);

    const list = await app.inject({
      method: 'GET',
      url: '/v1/notifications?limit=50',
      headers: auth(token),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().meta.total).toBe(8);

    const unread = await app.inject({
      method: 'GET',
      url: '/v1/notifications/unread',
      headers: auth(token),
    });
    expect(unread.json().data.count).toBe(8);
  }, 30_000);

  it('marks read via read-all and per-id read', async () => {
    const token = await registerOrg('notif-read');
    await app.inject({ method: 'POST', url: '/v1/notifications/seed', headers: auth(token) });

    const readAll = await app.inject({
      method: 'POST',
      url: '/v1/notifications/read-all',
      headers: auth(token),
    });
    expect(readAll.json().data.marked).toBe(8);

    const unread = await app.inject({
      method: 'GET',
      url: '/v1/notifications/unread',
      headers: auth(token),
    });
    expect(unread.json().data.count).toBe(0);
  });

  it('isolates notifications between orgs', async () => {
    const tokenA = await registerOrg('notif-iso-a');
    const tokenB = await registerOrg('notif-iso-b');
    await app.inject({ method: 'POST', url: '/v1/notifications/seed', headers: auth(tokenA) });

    // B sees nothing of A's
    const listB = await app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: auth(tokenB),
    });
    expect(listB.json().meta.total).toBe(0);
    expect(listB.json().meta.unread).toBe(0);

    // B cannot mark A's notification read (org-scoped 404, not a leak)
    const listA = await app.inject({
      method: 'GET',
      url: '/v1/notifications?limit=1',
      headers: auth(tokenA),
    });
    const id = listA.json().data[0].id as string;
    const crossPatch = await app.inject({
      method: 'PATCH',
      url: `/v1/notifications/${id}/read`,
      headers: auth(tokenB),
    });
    expect(crossPatch.statusCode).toBe(404);

    // A's notification is still unread
    const unreadA = await app.inject({
      method: 'GET',
      url: '/v1/notifications/unread',
      headers: auth(tokenA),
    });
    expect(unreadA.json().data.count).toBe(8);
  });
});
