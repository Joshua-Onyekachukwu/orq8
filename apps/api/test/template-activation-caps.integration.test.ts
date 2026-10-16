import { createLogger, loadConfig } from '@orq8/core';
import { createDb, departmentTemplates, users } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

// Phase 3 (UX fix plan): verify cap enforcement inside
// activateDepartmentTemplate — test first. Trial caps are departments: 2,
// teams: 4, so a capped org must get a 403 with an upgrade path when a
// template would create past the cap, while the idempotent reuse path must
// NOT trip the cap.

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000 });
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
const createdOrgIds: string[] = [];
const createdTemplateIds: string[] = [];

async function register(email: string): Promise<{ token: string; orgId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'TestPass123!', org_name: `cap-${email}` },
    headers: { 'content-type': 'application/json' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed (${res.statusCode}): ${res.payload}`);
  const body = res.json() as { data?: { token?: string; org?: { id?: string } } };
  await deps.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email.trim().toLowerCase()));
  return { token: body.data?.token ?? '', orgId: body.data?.org?.id ?? '' };
}

async function makeTemplate(teamNames: string[] = []): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const [row] = await deps.db
    .insert(departmentTemplates)
    .values({
      name: `Cap Dept ${tag}`,
      slug: `cap-dept-${tag}`,
      mission: 'Cap test department',
      teams: teamNames.map((name) => ({ name })),
      isSystem: true,
    })
    .returning({ id: departmentTemplates.id });
  createdTemplateIds.push(row!.id);
  return row!.id;
}

async function makeTemplateNamed(name: string, teamNames: string[] = []): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const [row] = await deps.db
    .insert(departmentTemplates)
    .values({
      name,
      slug: `cap-named-${tag}`,
      mission: 'Cap test department',
      teams: teamNames.map((n) => ({ name: n })),
      isSystem: true,
    })
    .returning({ id: departmentTemplates.id });
  createdTemplateIds.push(row!.id);
  return row!.id;
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);
});

afterAll(async () => {
  if (!dbUp) return;
  for (const id of createdTemplateIds) {
    await deps.db.delete(departmentTemplates).where(eq(departmentTemplates.id, id));
  }
  for (const id of createdOrgIds) {
    await deleteOrg(deps.pool, id);
  }
  await app?.close();
});

run('template activation enforces entitlement caps', () => {
  it('activates cleanly under the cap', async () => {
    const { orgId, token } = await register(`cap-clean-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    const templateId = await makeTemplate(['Cap Team A', 'Cap Team B']);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/department-templates/${templateId}/activate`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.departmentId).toBeDefined();
  });

  it('refuses a new department past the trial cap (403 + upgrade path)', async () => {
    const { orgId, token } = await register(`cap-dept-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    for (const name of ['Dept One', 'Dept Two']) {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/departments',
        headers: { authorization: `Bearer ${token}` },
        payload: { name },
      });
      expect(created.statusCode).toBe(201);
    }
    const templateId = await makeTemplate();
    const res = await app.inject({
      method: 'POST',
      url: `/v1/department-templates/${templateId}/activate`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toMatch(/allows 2/i);
  });

  it('reuses an existing department without tripping the cap', async () => {
    const { orgId, token } = await register(`cap-reuse-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    for (const name of ['Dept One', 'Dept Two']) {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/departments',
        headers: { authorization: `Bearer ${token}` },
        payload: { name },
      });
      expect(created.statusCode).toBe(201);
    }
    // Same name as an existing department, no new teams: pure reuse.
    const templateId = await makeTemplateNamed('Dept One');
    const res = await app.inject({
      method: 'POST',
      url: `/v1/department-templates/${templateId}/activate`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.reused).toContain('Dept One');
  });

  it('refuses new teams past the trial cap (403 + upgrade path)', async () => {
    const { orgId, token } = await register(`cap-team-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    const dept = await app.inject({
      method: 'POST',
      url: '/v1/departments',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Dept One' },
    });
    expect(dept.statusCode).toBe(201);
    const departmentId = dept.json().data.id as string;
    for (const name of ['Team 1', 'Team 2', 'Team 3', 'Team 4']) {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/teams',
        headers: { authorization: `Bearer ${token}` },
        payload: { name, departmentId },
      });
      expect(created.statusCode).toBe(201);
    }
    // Existing department (reuse, no dept cap hit) + one brand-new team.
    const templateId = await makeTemplateNamed('Dept One', ['Team 5']);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/department-templates/${templateId}/activate`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toMatch(/allows 4/i);
  });
});
