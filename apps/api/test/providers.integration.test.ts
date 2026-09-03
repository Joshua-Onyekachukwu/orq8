import { createLogger, loadConfig } from '@orq8/core';
import { and, count, eq } from 'drizzle-orm';
import { auditEvents, createDb, secretRecords, userProviderKeys } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { upsertProvider } from '../src/services/providers.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

// DB-gated like auth.integration.test.ts — green on machines without Docker.
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
  await upsertProvider(deps.db, {
    slug: 'openai',
    name: 'OpenAI',
    kind: 'byok',
    baseUrl: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4o-mini'],
  });
});
afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

const run = dbUp ? describe : describe.skip;

run('provider keys (docs/23)', () => {
  let cookie: string;
  let csrf: string;
  let keyId: string;

  /** Emulate a browser: fetch a CSRF token via GET, then send cookie + header on mutations. */
  async function csrfHeaders(sessionCookie: string): Promise<Record<string, string>> {
    const getRes = await app.inject({ method: 'GET', url: '/healthz' });
    const setCookies = getRes.headers['set-cookie'];
    const raw = (Array.isArray(setCookies) ? setCookies : [setCookies]).filter(
      (c): c is string => typeof c === 'string',
    );
    const csrfCookie = raw
      .map((c) => c.split(';').shift() ?? '')
      .find((c) => c.startsWith('csrf_token='));
    const token = csrfCookie?.split('=')[1] ?? '';
    expect(token).toBeTruthy();
    return {
      cookie: `${sessionCookie}; csrf_token=${token}` as string,
      'x-csrf-token': token as string,
    };
  }

  it('registers a user (creates org + session)', async () => {
    const email = `providers-${Date.now()}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'password123', name: 'Tester', org_name: 'Provider Test Co' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    const token = body.data.token as string;
    expect(token).toBeTruthy();
    // the API returns the token in the body; emulate the web cookie
    cookie = `orq8_session=${token}`;
    const headers = await csrfHeaders(cookie);
    cookie = headers.cookie!;
    csrf = headers['x-csrf-token']!;
  });

  it('saves a key — response carries only the mask, never the key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/providers/keys',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: {
        provider_slug: 'openai',
        name: 'prod',
        auth_type: 'api_key',
        api_key: 'sk-test-0123456789abcdef',
        allowed_models: ['gpt-4o-mini'],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.mask).toBe('sk-t…cdef');
    expect(body.provider).toBe('openai');
    expect(JSON.stringify(res.json())).not.toContain('sk-test-0123456789abcdef');
    keyId = body.id as string;
  });

  it('lists keys masked only', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/providers/keys', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const found = body.data.find((k: { id: string }) => k.id === keyId);
    expect(found.mask).toBe('sk-t…cdef');
    expect(JSON.stringify(body)).not.toContain('sk-test-0123456789abcdef');
  });

  it('catalog lists the provider as connected', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/providers', headers: { cookie } });
    const body = res.json();
    const p = body.data.find((x: { slug: string }) => x.slug === 'openai');
    expect(p.connected).toBe(true);
  });

  it('rotates the key (new mask, old key gone)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/providers/keys/${keyId}/rotate`,
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { new_api_key: 'sk-rotated-9999' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.mask).toBe('sk-r…9999');
    expect(JSON.stringify(res.json())).not.toContain('sk-rotated-9999');
  });

  it('records secret access + audit events', async () => {
    const [secretCount] = await deps.db
      .select({ n: count() })
      .from(secretRecords)
      .where(eq(secretRecords.keyId, keyId));
    expect((secretCount?.n ?? 0)).toBeGreaterThanOrEqual(2); // created + rotated

    const [audit] = await deps.db
      .select({ n: count() })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'provider.key_saved'), eq(auditEvents.actorType, 'user')));
    expect((audit?.n ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('rejects a second org trying to touch the key (tenant isolation)', async () => {
    const email = `providers-other-${Date.now()}@example.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'password123', name: 'Other', org_name: 'Other Co' },
    });
    const otherHeaders = await csrfHeaders(`orq8_session=${reg.json().data.token}`);
    const res = await app.inject({ method: 'GET', url: `/v1/providers/keys/${keyId}`, headers: { cookie: otherHeaders.cookie } });
    expect(res.statusCode).toBe(404);
  });

  it('revokes the key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/providers/keys/${keyId}/revoke`,
      headers: { cookie, 'x-csrf-token': csrf },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.status).toBe('revoked');
    expect(body.enabled).toBe(false);

    const [row] = await deps.db
      .select()
      .from(userProviderKeys)
      .where(and(eq(userProviderKeys.id, keyId)));
    expect(row?.status).toBe('revoked');
  });
});
