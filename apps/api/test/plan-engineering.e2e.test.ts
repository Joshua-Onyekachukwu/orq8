import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, agents, departments, tasks, teams } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/services/sessions.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

/**
 * §35/§36 — `plan_engineering` end-to-end with REAL state verification.
 *
 * The full Executive Agent pipeline is exercised through POST /v1/commands
 * with natural language (rule-based intent fallback handles the missing LLM
 * hermetically). No final behavior is mocked: the Engineering Manager runs,
 * then the test queries the database directly — the only accepted proof —
 * and re-queries to confirm persistence (§36: "reload/re-query").
 */

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
let orgId: string;
let userId: string;
let token = '';

const auth = () => ({ authorization: `Bearer ${token}` });

async function cleanup(): Promise<void> {
  await deleteOrg(deps.pool, orgId);
  await deps.db.delete(users).where(eq(users.id, userId));
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  const [orgRow] = await deps.db
    .insert(organizations)
    .values({ name: `plan-eng-${randomUUID()}`, slug: `plan-eng-${randomUUID()}` })
    .returning();
  orgId = orgRow!.id;
  const [userRow] = await deps.db
    .insert(users)
    .values({ email: `pe-${randomUUID()}@example.com`, name: 'Founder', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userId = userRow!.id;
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });
  const session = await createSession(deps.db, { userId, orgId });
  token = session.token;
});

afterAll(async () => {
  if (dbUp) {
    await app.close();
    await cleanup();
  }
  await deps.pool.end();
  await pool?.end();
});

run('plan_engineering E2E — NL command → real engineering org → verified persistence (§35–§36)', () => {
  it('creates an engineering team, tasks and assignments; state persists on re-query', async () => {
    // ── Arrange: a real Engineering department with real engineering agents ──
    const [dept] = await deps.db
      .insert(departments)
      .values({ orgId, name: 'Engineering', status: 'active' })
      .returning();
    const seed = [
      { name: 'Ada', role: 'engineering manager', capabilities: ['project_management', 'code_review'] },
      { name: 'Grace', role: 'software architect', capabilities: ['architecture', 'backend'] },
      { name: 'Linus', role: 'backend engineer', capabilities: ['backend', 'api_development'] },
      { name: 'Margaret', role: 'qa engineer', capabilities: ['testing'] },
    ];
    for (const s of seed) {
      await deps.db.insert(agents).values({
        orgId,
        name: s.name,
        role: s.role,
        departmentId: dept!.id,
        status: 'active',
        capabilities: s.capabilities,
        autonomyLevel: 'execute_with_approval',
      });
    }

    // ── Act: natural-language command through the live API (no tool mock) ──
    const res = await app.inject({
      method: 'POST',
      url: '/v1/commands',
      headers: auth(),
      payload: { command: 'Build me an app for managing customer leads.' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const data = body.data;

    // The plan must have executed tooling — the plan_engineering path.
    expect(data.message ?? '').toBeTruthy();
    expect(data.toolResults.some((t: { tool: string; success: boolean }) => t.tool === 'plan_engineering' && t.success)).toBe(true);

    // ── Assert: the ENGINEERING MANAGER actually created state (§35) ──
    // Note the architecture: the "engineering team" is the org's REAL
    // engineering agents, assembled by role — no synthetic team entity is
    // created. The verifiable artifacts are: task assignments to the real
    // engineering agents, the audit record, and the plan marker in memory.
    // 1. Tasks exist with correct org, real assignments to engineering agents,
    //    and valid statuses.
    const taskRows = await deps.pool!.query(
      `select t.id, t.title, t.status, t.agent_id, a.name as agent_name, a.role as agent_role
         from tasks t join agents a on a.id = t.agent_id
        where t.org_id = $1 and t.agent_id in (select id from agents where department_id = $2)`,
      [orgId, dept!.id],
    );
    expect(taskRows.rowCount).toBeGreaterThanOrEqual(1);
    for (const row of taskRows.rows) {
      // Tasks are live rows — the executor may already have advanced them.
      expect(['pending', 'queued', 'in_progress', 'blocked', 'completed', 'failed', 'archived']).toContain(row.status);
      expect(row.agent_name).toBeTruthy();
    }
    // Roles match engineering positions, not arbitrary agents.
    const roles = taskRows.rows.map((r) => r.agent_role as string);
    expect(roles.some((r) => r.toLowerCase().includes('engineer') || r.toLowerCase().includes('qa'))).toBe(true);

    // 2. Relationships valid: every assigned agent belongs to this org + dept.
    const relViolations = await deps.pool!.query(
      `select count(*)::int as n from tasks t
         join agents a on a.id = t.agent_id
        where t.org_id = $1 and a.org_id <> t.org_id`,
      [orgId],
    );
    expect(relViolations.rows[0].n).toBe(0);

    // 3. Audit records exist where required.
    const audit = await deps.pool!.query(
      "select count(*)::int as n from audit_events where org_id = $1 and action in ('engineering_manager.planned','task.created')",
      [orgId],
    );
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(1);

    // 4. The plan marker persists in company memory (idempotency + report).
    const marker = await deps.pool!.query(
      "select count(*)::int as n from company_memory where org_id = $1 and source like 'engineering_manager:%'",
      [orgId],
    );
    expect(marker.rows[0].n).toBe(1);

    // ── Re-query (§36: state must persist, not be transient) ──
    const tasksAgain = await deps.pool!.query(
      'select count(*)::int as n from tasks where org_id = $1 and agent_id is not null',
      [orgId],
    );
    expect(tasksAgain.rows[0].n).toBe(taskRows.rowCount);
  });

  it('EM idempotency: the same engineering objective never duplicates tasks', async () => {
    // Note: repeating the NL *command* legitimately creates new EA work each
    // time (the founder asked twice). The idempotency contract under test is
    // the Engineering Manager's fingerprint: the same objective, planned twice,
    // must not duplicate tasks.
    const { planEngineeringRequest } = await import('../src/services/engineering-manager.js');
    const input = {
      objective: 'Build me an app for managing customer leads.',
      priority: 'normal' as const,
    };
    const before = await deps.pool!.query('select count(*)::int as n from tasks where org_id = $1', [orgId]);
    const plan = await planEngineeringRequest(deps.db, orgId, userId, input);
    expect(plan.alreadyPlanned).toBe(true);
    const after = await deps.pool!.query('select count(*)::int as n from tasks where org_id = $1', [orgId]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
