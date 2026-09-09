import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import * as eaTools from '../src/services/ea-tools.js';
import type { ToolContext } from '../src/services/ea-tools.js';
import { createSession } from '../src/services/sessions.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

// DB reachability probe — integration tests skip cleanly without Postgres.
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
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;
let ctxA: ToolContext;
let ctxB: ToolContext;
let tokenA = '';

const authA = () => ({ authorization: `Bearer ${tokenA}` });

async function cleanupAll(): Promise<void> {
  for (const id of [orgA, orgB].filter(Boolean)) {
    await deleteOrg(deps.pool, id);
  }
  for (const id of [userA, userB].filter(Boolean)) {
    await deps.db.delete(users).where(eq(users.id, id));
  }
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  const [orgARow] = await deps.db
    .insert(organizations)
    .values({ name: `ea-lifecycle-a-${randomUUID()}`, slug: `ea-lifecycle-a-${randomUUID()}` })
    .returning();
  orgA = orgARow!.id;
  const [orgBRow] = await deps.db
    .insert(organizations)
    .values({ name: `ea-lifecycle-b-${randomUUID()}`, slug: `ea-lifecycle-b-${randomUUID()}` })
    .returning();
  orgB = orgBRow!.id;

  const [userARow] = await deps.db
    .insert(users)
    .values({ email: `ea-a-${randomUUID()}@example.com`, name: 'Owner A', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userA = userARow!.id;
  const [userBRow] = await deps.db
    .insert(users)
    .values({ email: `ea-b-${randomUUID()}@example.com`, name: 'Owner B', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userB = userBRow!.id;

  await deps.db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' });
  await deps.db.insert(memberships).values({ orgId: orgB, userId: userB, role: 'owner' });

  const sessionA = await createSession(deps.db, { userId: userA, orgId: orgA });
  tokenA = sessionA.token;

  ctxA = { db: deps.db, orgId: orgA, userId: userA };
  ctxB = { db: deps.db, orgId: orgB, userId: userB };
});

afterAll(async () => {
  if (dbUp) {
    await app.close();
    await cleanupAll();
  }
  await deps.pool.end();
  await pool?.end();
});

run('EA org tools — lifecycle with real state verification (§60)', () => {
  // Package plans cap departments per org; clean up everything this block
  // creates so each test starts from an empty slate.
  afterEach(async () => {
    if (!dbUp) return;
    await deps.pool!.query('delete from audit_events where org_id = $1', [orgA]);
    await deps.pool!.query('delete from tasks where org_id = $1', [orgA]);
    await deps.pool!.query('delete from goals where org_id = $1', [orgA]);
    await deps.pool!.query('delete from agents where org_id = $1', [orgA]);
    await deps.pool!.query('delete from teams where org_id = $1', [orgA]);
    await deps.pool!.query('delete from departments where org_id = $1', [orgA]);
  });

  it('create → rename → archive → restore a department, verifying DB state at every step', async () => {
    const created = await eaTools.createDepartment(ctxA, { name: 'Growth' });
    expect(created.success).toBe(true);
    const deptId = (created.data as { departmentId: string }).departmentId;

    let rows = await deps.pool!.query('select name, status from departments where id = $1 and org_id = $2', [
      deptId,
      orgA,
    ]);
    expect(rows.rows[0]).toMatchObject({ name: 'Growth', status: 'active' });

    const renamed = await eaTools.renameDepartment(ctxA, { departmentId: deptId, newName: 'Growth Ops' });
    expect(renamed.success).toBe(true);
    rows = await deps.pool!.query('select name from departments where id = $1', [deptId]);
    expect(rows.rows[0]).toMatchObject({ name: 'Growth Ops' });

    const archived = await eaTools.archiveDepartment(ctxA, { departmentId: deptId });
    expect(archived.success).toBe(true);
    rows = await deps.pool!.query('select status from departments where id = $1', [deptId]);
    expect(rows.rows[0]).toMatchObject({ status: 'archived' });

    const restored = await eaTools.archiveDepartment(ctxA, { departmentId: deptId, restore: true });
    expect(restored.success).toBe(true);
    rows = await deps.pool!.query('select status from departments where id = $1', [deptId]);
    expect(rows.rows[0]).toMatchObject({ status: 'active' });

    const audit = await deps.pool!.query(
      "select count(*)::int as n from audit_events where org_id = $1 and action like 'department.%'",
      [orgA],
    );
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(3); // created + renamed + archived(+restored)
  });

  it('agent lifecycle: pause → resume → archive stamps retired_at while preserving history (§48)', async () => {
    const created = await eaTools.createAgent(ctxA, {
      name: 'Nova',
      role: 'growth_analyst',
      capabilities: ['seo', 'analytics'],
    });
    expect(created.success).toBe(true);
    const agentId = (created.data as { agentId: string }).agentId;

    const paused = await eaTools.updateAgent(ctxA, { agentId, status: 'paused' });
    expect(paused.success).toBe(true);
    let rows = await deps.pool!.query('select status, retired_at from agents where id = $1', [agentId]);
    expect(rows.rows[0]).toMatchObject({ status: 'paused', retired_at: null });

    const resumed = await eaTools.updateAgent(ctxA, { agentId, status: 'active' });
    expect(resumed.success).toBe(true);
    rows = await deps.pool!.query('select status, retired_at from agents where id = $1', [agentId]);
    expect(rows.rows[0]).toMatchObject({ status: 'active', retired_at: null });

    const archived = await eaTools.updateAgent(ctxA, { agentId, status: 'archived' });
    expect(archived.success).toBe(true);
    rows = await deps.pool!.query('select status, retired_at from agents where id = $1', [agentId]);
    expect(rows.rows[0].status).toBe('archived');
    expect(rows.rows[0].retired_at).not.toBeNull();

    // Execution history is preserved (§48/§71): the row and its audit trail survive.
    const audit = await deps.pool!.query(
      'select count(*)::int as n from audit_events where org_id = $1 and agent_id = $2',
      [orgA, agentId],
    );
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('rejects assigning work to an archived agent (§64 failure states)', async () => {
    const agent = await eaTools.createAgent(ctxA, { name: 'Retiree', role: 'analyst', capabilities: [] });
    const agentId = (agent.data as { agentId: string }).agentId;
    await eaTools.updateAgent(ctxA, { agentId, status: 'archived' });

    const task = await eaTools.createTask(ctxA, { title: 'Should fail', agentId });
    expect(task.success).toBe(false);
    expect(task.error).toBe('agent_archived');
  });

  it('update_agent reassigns an agent between departments (§60 reassign)', async () => {
    const dept1 = await eaTools.createDepartment(ctxA, { name: 'Marketing' });
    const dept2 = await eaTools.createDepartment(ctxA, { name: 'Engineering' });
    const from = (dept1.data as { departmentId: string }).departmentId;
    const to = (dept2.data as { departmentId: string }).departmentId;

    const agent = await eaTools.createAgent(ctxA, {
      name: 'Mover',
      role: 'engineer',
      capabilities: [],
      departmentId: from,
    });
    const agentId = (agent.data as { agentId: string }).agentId;

    const reassigned = await eaTools.updateAgent(ctxA, { agentId, departmentId: to });
    expect(reassigned.success).toBe(true);
    const rows = await deps.pool!.query('select department_id from agents where id = $1', [agentId]);
    expect(rows.rows[0].department_id).toBe(to);
  });

  it("cross-tenant isolation: tools cannot touch another organization's resources (§57)", async () => {
    const agentB = await eaTools.createAgent(ctxB, { name: 'B Agent', role: 'analyst', capabilities: [] });
    const agentBId = (agentB.data as { agentId: string }).agentId;

    // Org A's context cannot see or modify org B's agent.
    const attempt = await eaTools.updateAgent(ctxA, { agentId: agentBId, status: 'paused' });
    expect(attempt.success).toBe(false);
    expect(attempt.error).toBe('not_found');

    const rows = await deps.pool!.query('select status from agents where id = $1', [agentBId]);
    expect(rows.rows[0].status).toBe('active'); // unchanged
  });
});

run('Template slug conflicts return clean 409, not 500 (§59)', () => {
  // Tenant model (aligned with agent_templates in 0024/0025): system slugs are
  // globally unique among system rows; org-scoped custom templates may reuse a
  // system slug and may share slugs across orgs; duplicates within one org 409.
  it('department template: fresh slug → 201, same-org duplicate → 409', async () => {
    const slug = `test-dept-${randomUUID().slice(0, 8)}`;
    const first = await app.inject({
      method: 'POST',
      url: '/v1/department-templates',
      headers: authA(),
      payload: { name: 'Test Dept', slug },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/department-templates',
      headers: authA(),
      payload: { name: 'Test Dept Again', slug },
    });
    expect(second.statusCode).toBe(409);
  });

  it('department template: another org reusing the same slug → 201 (tenant-correct)', async () => {
    const slug = `x-org-dept-${randomUUID().slice(0, 8)}`;
    const first = await app.inject({
      method: 'POST',
      url: '/v1/department-templates',
      headers: authA(),
      payload: { name: 'Org A Dept', slug },
    });
    expect(first.statusCode).toBe(201);

    // Org B creates its own template with the same slug — allowed.
    const tokenB = await createSession(deps.db, { userId: userB, orgId: orgB });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/department-templates',
      headers: { authorization: `Bearer ${tokenB.token}` },
      payload: { name: 'Org B Dept', slug },
    });
    expect(second.statusCode).toBe(201);
  });

  it('agent template: same-org duplicate slug → 409', async () => {
    const slug = `test-agent-tpl-${randomUUID().slice(0, 8)}`;
    const first = await app.inject({
      method: 'POST',
      url: '/v1/agent-templates',
      headers: authA(),
      payload: { name: 'Custom Role', slug, role: 'specialist' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/agent-templates',
      headers: authA(),
      payload: { name: 'Custom Role Again', slug, role: 'specialist' },
    });
    expect(second.statusCode).toBe(409);
  });
});

run('System department template catalog (§9–§32, §35)', () => {
  it('contains no duplicate system slugs', async () => {
    const rows = await deps.pool!.query(
      'select slug, count(*)::int as n from department_templates where is_system group by slug having count(*) > 1',
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('covers the full organizational catalog', async () => {
    const rows = await deps.pool!.query('select slug from department_templates where is_system');
    const slugs = rows.rows.map((r: { slug: string }) => r.slug);
    for (const required of [
      'engineering', 'product', 'marketing', 'sales', 'customer_success', 'finance',
      'operations', 'data_analytics',
      'executive_office', 'customer_research', 'legal_compliance', 'people_hr',
      'research_intelligence', 'security_trust', 'it_internal', 'communications',
      'revenue_monetization', 'innovation_rd', 'program_management', 'company_knowledge',
      'workforce_management', 'quality_assurance', 'strategy_simulation',
    ]) {
      expect(slugs, `missing system department template: ${required}`).toContain(required);
    }
  });

  it('encodes workforce-maturity stage guidance in org_size (§35)', async () => {
    const rows = await deps.pool!.query(
      "select slug, org_size from department_templates where is_system and slug in ('engineering','legal_compliance','strategy_simulation')",
    );
    const bySlug = Object.fromEntries(
      rows.rows.map((r: { slug: string; org_size: string | null }) => [r.slug, r.org_size ?? '']),
    );
    expect(bySlug.engineering).toContain('Stage 1');
    expect(bySlug.legal_compliance).toContain('Stage 3');
    expect(bySlug.strategy_simulation).toContain('Stage 5');
  });

  it('all system template JSON columns are valid JSON arrays', async () => {
    const rows = await deps.pool!.query(
      `select slug from department_templates where is_system and (
        jsonb_typeof(functions::jsonb) <> 'array'
        or jsonb_typeof(roles::jsonb) <> 'array'
        or jsonb_typeof(teams::jsonb) <> 'array'
        or jsonb_typeof(kpis::jsonb) <> 'array'
      )`,
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('legal template preserves the human-counsel boundary (governance)', async () => {
    const rows = await deps.pool!.query(
      "select mission from department_templates where is_system and slug = 'legal_compliance'",
    );
    expect(rows.rows[0].mission).toContain('does not replace');
  });
});
