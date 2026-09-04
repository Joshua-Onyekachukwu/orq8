/**
 * Platform-Admin Gate Integration Tests
 *
 * Regression guard for the privilege-escalation fix: org owners/admins must NOT
 * be able to read platform-wide data (/v1/admin/*). Only users whose
 * users.platform_role = 'admin' (or an email in PLATFORM_ADMIN_EMAILS) may.
 *
 *   1. Fresh org owner → 403 on every /v1/admin/* endpoint
 *   2. After DB promotion to platform admin → 200
 *   3. A second org's owner stays 403 even after the first is promoted
 *   4. /v1/auth/me reflects platformRole for the UI
 *   5. Org-scoped endpoints still work for non-platform-admins (no lockout)
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb, users } from '@orq8/db';
import { eq } from 'drizzle-orm';
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

async function registerOrgOwner(tag: string): Promise<{ token: string; orgId: string; email: string }> {
  const email = `${tag}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `${tag} Org` },
  });
  expect(res.statusCode).toBe(201);
  return {
    token: res.json().data.token as string,
    orgId: res.json().data.org.id as string,
    email,
  };
}

async function promoteToPlatformAdmin(email: string): Promise<void> {
  await deps.db.update(users).set({ platformRole: 'admin' }).where(eq(users.email, email));
}

const ADMIN_ENDPOINTS = [
  '/v1/admin/users',
  '/v1/admin/organizations',
  '/v1/admin/health',
  '/v1/admin/activity',
];

// ─── Tests ──────────────────────────────────────────────────────────────────

const run = dbUp ? describe : describe.skip;

run('platform-admin gate on /v1/admin/*', () => {
  it('denies a fresh org owner all platform-wide endpoints (403)', async () => {
    const a = await registerOrgOwner('gate-a');
    for (const url of ADMIN_ENDPOINTS) {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${a.token}` },
      });
      expect(res.statusCode, `${url} should be 403 for org owner`).toBe(403);
    }
  });

  it('grants access after DB promotion to platform admin (200)', async () => {
    const a = await registerOrgOwner('gate-promote');
    // Owner first
    const before = await app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(before.statusCode).toBe(403);

    await promoteToPlatformAdmin(a.email);

    const after = await app.inject({
      method: 'GET',
      url: '/v1/admin/users',
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(after.statusCode).toBe(200);
    const body = after.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBeGreaterThan(0);

    // /auth/me reports the platform role so the UI can show the Admin console
    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(me.json().data.platformRole).toBe('admin');
  });

  it('keeps other org owners locked out after one promotion', async () => {
    const a = await registerOrgOwner('gate-multi-a');
    await promoteToPlatformAdmin(a.email);

    const b = await registerOrgOwner('gate-multi-b');
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/organizations',
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('does not lock org owners out of their own org console', async () => {
    const a = await registerOrgOwner('gate-orgscope');
    const orgRes = await app.inject({
      method: 'GET',
      url: '/v1/org',
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(orgRes.statusCode).toBe(200);
    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(me.json().data.platformRole).toBe('user');
  });
});
