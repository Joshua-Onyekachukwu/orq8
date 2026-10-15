import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import {
  createDb,
  notifications as notificationsTable,
  organizations as organizationsTable,
  users,
} from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { approvalEmail } from '../src/email/transactional.js';
import { sendGateEmail } from '../src/services/approval-notify.js';

/**
 * Wk2 Attention push — a new approval gate emails the org owner.
 *
 * Realtime + in-app already existed; email never fired (the
 * `emailOnApproval` preference was read by nothing). What is asserted here,
 * through HTTP against a real database:
 *
 *   template   subject names the action, body carries the review link and the
 *              "silence never approves" promise
 *   default    with prefs on and no SMTP configured, POST /v1/approvals still
 *              201s and the in-app notification is created (dev transport,
 *              non-fatal by design)
 *   opt-out    emailOnApproval=false → gate still 201s, helper reports
 *              { sent: false, reason: 'opt-out' }, nothing is attempted
 */
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];
try {
  const probe = new (await import('pg')).Pool({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

let app: FastifyInstance;
let token = '';
let orgId = '';
let ownerEmail = '';

const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

run('approval gates email the owner', () => {
  beforeAll(async () => {
    const created = createDb(config.DATABASE_URL);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config, db, pool, logger: createLogger(config) });
    await app.ready();

    ownerEmail = `gate-mail-${Date.now()}@test.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: ownerEmail, password: 'TestPass123!', org_name: 'Gate Mail Org' },
    });
    expect(reg.statusCode, reg.payload).toBe(201);
    const body = JSON.parse(reg.payload) as { data: { token: string; org: { id: string } } };
    token = body.data.token;
    orgId = body.data.org.id;
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, ownerEmail.toLowerCase()));
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  it('renders a gate email naming the action and the review link', () => {
    const email = approvalEmail({
      orgName: 'Gate Mail Org',
      agentName: 'Nova',
      action: 'Merge PR: launch site',
      description: 'Ready to merge.',
      costCents: 250,
      riskLevel: 'high',
      approvalsUrl: 'http://localhost:3000/app/approvals',
    });
    expect(email.subject).toContain('Merge PR: launch site');
    expect(email.text).toContain('Nova');
    expect(email.text).toContain('http://localhost:3000/app/approvals');
    expect(email.text).toContain('silence never approves');
    expect(email.html).toContain('Review the gate');
  });

  it('creates the gate (201) with prefs on and no SMTP — email non-fatal', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: auth(),
      payload: { action: 'Publish the launch post', description: 'Needs eyes first.', cost: 0, risk_level: 'medium' },
    });
    expect(res.statusCode, res.payload).toBe(201);

    const notes = await db.select().from(notificationsTable).where(eq(notificationsTable.orgId, orgId));
    expect(notes.some((n) => n.type === 'approval')).toBe(true);
  });

  it('sends nothing when the org opted out, and the gate still opens', async () => {
    const [org] = await db
      .select({ settings: organizationsTable.settings })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    const settings = { ...((org?.settings as Record<string, unknown>) ?? {}), notifications: { emailOnApproval: false } };
    await db.update(organizationsTable).set({ settings }).where(eq(organizationsTable.id, orgId));

    const result = await sendGateEmail(db, config, undefined, orgId, {
      action: 'Delete the staging database',
      description: null,
      cost: 0,
      riskLevel: 'high',
    }, 'Nova');
    expect(result).toEqual({ sent: false, reason: 'opt-out' });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: auth(),
      payload: { action: 'Delete the staging database', cost: 0, risk_level: 'high' },
    });
    expect(res.statusCode, res.payload).toBe(201);
  });
});
