/**
 * One-click department-template activation (founder experience).
 *
 * Verifies the activation contract against the real endpoint:
 *   1. Activating a system template creates the department AND its
 *      template-defined teams (a working department, not a shell).
 *   2. Re-activation is idempotent — same names are reused, never duplicated.
 *   3. Unknown template ids 404; unauthenticated calls 401.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
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
let token: string;
let orgId: string;
let templateId: string;

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  const email = `activate-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: 'Activation Org' },
  });
  expect(res.statusCode).toBe(201);
  token = res.json().data.token;
  orgId = res.json().data.org.id;

  // A system template that defines teams (Marketing is the canonical one).
  const tpl = await deps.pool!.query(
    `select id, teams from department_templates
     where is_system = true and jsonb_array_length(teams) > 0
     order by (name = 'Marketing') desc, name limit 1`,
  );
  expect(tpl.rows.length).toBeGreaterThanOrEqual(1);
  templateId = tpl.rows[0].id;
});

afterAll(async () => {
  if (dbUp && orgId) {
    await pool!.query('delete from teams where org_id = $1', [orgId]);
    await pool!.query('delete from departments where org_id = $1', [orgId]);
    await pool!.query('delete from audit_events where org_id = $1', [orgId]);
    await pool!.query('delete from sessions where org_id = $1', [orgId]);
    await pool!.query('delete from memberships where org_id = $1', [orgId]);
    await pool!.query('delete from organizations where id = $1', [orgId]);
    await pool!.query("delete from users where email like 'activate-%@test.example.com'");
  }
  if (app) await app.close();
  await deps.pool.end();
});

run('Department template activation', () => {
  it('activates a template into a real department with its teams', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/department-templates/${templateId}/activate`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.departments).toHaveLength(1);

    // Department exists.
    const dept = await deps.pool!.query('select name from departments where id = $1', [body.departmentId]);
    expect(dept.rows).toHaveLength(1);

    // Every template-defined team exists, linked to the new department.
    const expected = (await deps.pool!.query('select teams from department_templates where id = $1', [templateId]))
      .rows[0].teams as Array<{ name: string }>;
    const teams = await deps.pool!.query(
      'select name from teams where org_id = $1 and department_id = $2',
      [orgId, body.departmentId],
    );
    expect(teams.rows.map((r) => r.name).sort()).toEqual(expected.map((t: { name: string }) => t.name).sort());
  });

  it('is idempotent — re-activation reuses, never duplicates', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `/v1/department-templates/${templateId}/activate`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.departments).toHaveLength(0); // reused
    expect(first.json().data.teams).toHaveLength(0); // reused

    const deptCount = await deps.pool!.query(
      'select count(*)::int as n from departments where org_id = $1',
      [orgId],
    );
    expect(deptCount.rows[0].n).toBe(1);
  });

  it('rejects activation with an unknown template id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/department-templates/${crypto.randomUUID()}/activate`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/department-templates/${templateId}/activate`,
    });
    expect(res.statusCode).toBe(401);
  });
});
