import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

// Workforce template catalog + task-creation contract (P0 org audit):
//   • system catalog must not duplicate (0020 NULL-conflict bug, fixed in 0024)
//   • org-scoped templates must be visible to — and only to — their org
//   • hiring from another org's custom template must 404 (tenant isolation)
//   • POST /v1/tasks honors an explicit initial status

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let app: FastifyInstance;
let tokenA = '';
let orgAId = '';
let tokenB = '';
let orgBId = '';

async function register(email: string): Promise<{ token: string; orgId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'TestPass123!', org_name: `tmpl-${email}` },
    headers: { 'content-type': 'application/json' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed (${res.statusCode}): ${res.payload}`);
  const body = res.json() as { data?: { token?: string; org?: { id?: string } } };
  return { token: body.data?.token ?? '', orgId: body.data?.org?.id ?? '' };
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);
  const a = await register(`tmpl-a-${Date.now()}@example.com`);
  tokenA = a.token;
  orgAId = a.orgId;
  const b = await register(`tmpl-b-${Date.now()}@example.com`);
  tokenB = b.token;
  orgBId = b.orgId;
});

afterAll(async () => {
  if (!dbUp) return;
  if (orgAId) await deleteOrg(deps.pool, orgAId);
  if (orgBId) await deleteOrg(deps.pool, orgBId);
  await app?.close();
});

run('agent template catalog', () => {
  it('lists the system catalog with no duplicated slugs', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/agent-templates', headers: { authorization: `Bearer ${tokenA}` } });
    expect(res.statusCode).toBe(200);
    const templates = res.json().data as Array<{ id: string; slug: string; isSystem: boolean; orgId: string | null }>;
    expect(templates.length).toBeGreaterThan(0);
    const slugs = templates.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(templates.every((t) => t.isSystem || t.orgId === orgAId)).toBe(true);
  });

  it('shows org-scoped templates to their owning org alongside system ones', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/agent-templates',
      payload: {
        name: 'Custom Ops Analyst',
        slug: `custom-ops-analyst-${orgAId.slice(0, 8)}`,
        role: 'Ops Analyst',
        description: 'Org-specific analyst',
        capabilities: ['data_analysis'],
      },
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    });
    expect(create.statusCode).toBe(201);

    const listA = await app.inject({ method: 'GET', url: '/v1/agent-templates', headers: { authorization: `Bearer ${tokenA}` } });
    const forA = listA.json().data as Array<{ slug: string; isSystem: boolean }>;
    expect(forA.some((t) => t.slug.startsWith('custom-ops-analyst-') && !t.isSystem)).toBe(true);
    expect(forA.some((t) => t.slug === 'data-analyst' && t.isSystem)).toBe(true);

    const listB = await app.inject({ method: 'GET', url: '/v1/agent-templates', headers: { authorization: `Bearer ${tokenB}` } });
    const forB = listB.json().data as Array<{ slug: string; isSystem: boolean }>;
    expect(forB.some((t) => t.slug.startsWith('custom-ops-analyst-'))).toBe(false);
  });

  it('refuses to hire from another org’s custom template but allows system templates', async () => {
    const listA = await app.inject({ method: 'GET', url: '/v1/agent-templates', headers: { authorization: `Bearer ${tokenA}` } });
    const rows = listA.json().data as Array<{ id: string; slug: string; isSystem: boolean }>;
    const custom = rows.find((t) => t.slug.startsWith('custom-ops-analyst-'))!;
    const system = rows.find((t) => t.slug === 'data-analyst' && t.isSystem)!;

    const cross = await app.inject({
      method: 'POST',
      url: `/v1/agent-templates/${custom.id}/hire`,
      payload: {},
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
    });
    expect(cross.statusCode).toBe(404);

    const hire = await app.inject({
      method: 'POST',
      url: `/v1/agent-templates/${system.id}/hire`,
      payload: { name: 'Sage' },
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
    });
    expect(hire.statusCode).toBe(201);
    expect((hire.json().data as { name: string }).name).toBe('Sage');
  });
});

run('task creation contract', () => {
  it('defaults a new task to pending', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: { title: 'Fresh work' },
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json().data as { status: string }).status).toBe('pending');
  });

  it('honors an explicit initial status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: { title: 'Migrated in-progress work', status: 'in_progress' },
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json().data as { status: string }).status).toBe('in_progress');
  });

  it('rejects invalid statuses', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: { title: 'Bad status', status: 'flying' },
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });
});
