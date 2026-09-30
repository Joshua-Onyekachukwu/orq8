import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import {
  agents as agentsTable,
  auditEvents as auditEventsTable,
  createDb,
  tasks as tasksTable,
  users as usersTable,
} from '@orq8/db';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

/**
 * Two founder-facing guarantees that used to require a developer:
 *
 *   1. Mail delivery is self-diagnosing. Mail is the one integration whose
 *      failure is invisible until someone is locked out — signup succeeds, the
 *      page says "confirm your email", and no link ever arrives. The check has
 *      to separate "not configured" from "the provider rejected the credentials"
 *      from "the provider refused this message", because the fixes differ, and
 *      it must say what the founder loses.
 *   2. Executing, retrying and running queued work are reachable from the
 *      product. These endpoints existed and nothing in the app called them, so a
 *      founder whose task was stuck needed a developer with curl.
 *
 * Everything here runs through HTTP against a real database on the embedded
 * harness. The LLM boundary is stubbed for the same reason as in
 * approval-gated-work: without it the executor reports 'failed', and "the queued
 * work ran" would be indistinguishable from "the queued work failed".
 */
vi.mock('../src/services/llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/llm.js')>()),
  chat: async () => 'Stubbed answer: the queued work was performed.',
}));

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new (await import('pg')).Pool({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 1500,
  });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

let app: FastifyInstance;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];
let token = '';
let orgId = '';

const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

run('mail delivery can be proven, and work can be moved, from the product', () => {
  beforeAll(async () => {
    const created = createDb(config.DATABASE_URL);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config, db, pool, logger: createLogger(config) });
    await app.ready();

    const email = `controls-${Date.now()}@test.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'TestPass123!', org_name: 'Controls Org' },
    });
    expect(reg.statusCode, reg.payload).toBe(201);
    const body = JSON.parse(reg.payload) as { data: { token: string; org: { id: string } } };
    token = body.data.token;
    orgId = body.data.org.id;

    await db
      .update(usersTable)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(usersTable.email, email.toLowerCase()));

    // One employee that may work without asking, seeded directly: registration
    // already seeds employees and a Trial org is capped, so hiring here would
    // make this a test of plan limits.
    await db.insert(agentsTable).values({
      orgId,
      name: 'Autonomous Worker',
      role: 'analyst',
      status: 'active',
      autonomyLevel: 'autonomous',
      authority: {
        canCreateTasks: true,
        canExecuteTasks: true,
        canAccessCompanyInfo: true,
        canCommunicateExternally: false,
        canModifyResources: false,
        spendingLimitCents: 0,
        requiresApprovalFor: [],
        forbiddenActions: [],
      },
    });
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  async function firstAgentId(): Promise<string> {
    const [agent] = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.autonomyLevel, 'autonomous')))
      .limit(1);
    return agent!.id;
  }

  async function createPendingTask(title: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: auth(),
      payload: { title, description: 'Queued work.', agentId: await firstAgentId() },
    });
    expect(res.statusCode, res.payload).toBe(201);
    return JSON.parse(res.payload).data.id as string;
  }

  describe('mail delivery', () => {
    it('requires a session to read the configuration or send a test', async () => {
      expect((await app.inject({ method: 'GET', url: '/v1/settings/mail' })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'POST', url: '/v1/settings/mail/test' })).statusCode,
      ).toBe(401);
    });

    it('reports an unconfigured deployment honestly, and never a credential', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/settings/mail', headers: auth() });
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.payload).data;
      expect(data.provider).toBe('dev-log');
      expect(data.delivers).toBe(false);
      expect(data.missingKeys).toContain('RESEND_API_KEY');
      expect(data.missingKeys).toContain('SMTP_HOST');
      expect(data.canSendTest).toBe(true);
      expect(data.notes.join(' ')).toContain('written to the API log');
      // Key names cross the boundary; values never do.
      expect(res.payload).not.toContain(config.SESSION_SECRET);
    });

    it('diagnoses the whole path and says what to change', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/settings/mail/test',
        headers: auth(),
        payload: {},
      });
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.payload).data;
      expect(data.ok).toBe(false);
      expect(data.delivered).toBe(false);
      expect(data.steps.map((s: { id: string }) => s.id)).toEqual([
        'configuration',
        'reachability',
        'delivery',
      ]);
      expect(data.steps[2].detail).toContain('Skipped');
      expect(data.failure.reason).toContain('No mail provider is configured');
      expect(data.failure.fix).toContain('RESEND_API_KEY');
      // The address the check would have written to is named, not assumed.
      expect(data.to).toContain('@test.com');

      const [audited] = await db
        .select({ action: auditEventsTable.action, outcome: auditEventsTable.outcome })
        .from(auditEventsTable)
        .where(and(eq(auditEventsTable.orgId, orgId), eq(auditEventsTable.action, 'mail.delivery_checked')))
        .orderBy(desc(auditEventsTable.occurredAt))
        .limit(1);
      expect(audited?.action).toBe('mail.delivery_checked');
      expect(audited?.outcome).toBe('failure');
    });
  });

  describe('work controls', () => {
    it('runs one pending task from the product', async () => {
      const taskId = await createPendingTask('Run this on demand');

      const res = await app.inject({
        method: 'POST',
        url: `/v1/commands/tasks/${taskId}/execute`,
        headers: auth(),
        payload: {},
      });
      expect(res.statusCode, res.payload).toBe(200);
      expect(JSON.parse(res.payload).status).toBe('completed');

      const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
      expect(row?.status).toBe('completed');
    });

    it('runs everything queued, and reports what it did', async () => {
      const taskId = await createPendingTask('Queued work for the batch runner');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/commands/tasks/execute-pending',
        headers: auth(),
        payload: {},
      });
      expect(res.statusCode, res.payload).toBe(200);

      const data = JSON.parse(res.payload).data;
      expect(Object.keys(data).sort()).toEqual(
        ['completed', 'deferred', 'executed', 'failed', 'results'].sort(),
      );
      expect(data.executed).toBeGreaterThan(0);
      expect(data.completed).toBeGreaterThan(0);

      const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
      expect(row?.status).toBe('completed');
    });
  });
});
