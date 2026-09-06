/**
 * Webhook end-to-end integration tests (DB-gated).
 *
 * Exercises the real path end to end at the service layer:
 *   webhook payload → ingestWebhookEvent (idempotent by external_event_id) →
 *   processPendingEvents → rule match → task created / approval created /
 *   notify / skipped when no rule. Also covers disabled rules and duplicate
 *   delivery. Signature verification itself is unit-tested in events.test.ts.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, memberships, users, agents, tasks, approvals, webhookEvents, eventRules, auditEvents } from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestWebhookEvent, processPendingEvents, upsertRule } from '../src/services/webhooks.js';
import type { AppDeps } from '../src/types.js';

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

const run = dbUp ? describe : describe.skip;

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let orgId = '';
let userId = '';
let engineerId = '';
let execId = '';

beforeAll(async () => {
  orgId = randomUUID();
  userId = randomUUID();
  await deps.db.insert(organizations).values({ id: orgId, name: `wh-e2e-${randomUUID()}`, slug: `wh-e2e-${randomUUID()}` });
  await deps.db.insert(users).values({ id: userId, email: `wh-${randomUUID()}@test.local`, name: 'Founder', passwordHash: 'x', status: 'active' });
  await deps.db.insert(memberships).values({ userId, orgId, role: 'owner' });
  const [eng] = await deps.db.insert(agents).values({ orgId, name: 'Engineer', role: 'software_engineer', status: 'active' }).returning();
  engineerId = eng!.id;
  const [exec] = await deps.db.insert(agents).values({ orgId, name: 'Executive', role: 'executive_agent', status: 'active' }).returning();
  execId = exec!.id;
});

afterAll(async () => {
  await deps.db.delete(tasks).where(eq(tasks.orgId, orgId));
  await deps.db.delete(approvals).where(eq(approvals.orgId, orgId));
  await deps.db.delete(webhookEvents).where(eq(webhookEvents.orgId, orgId));
  await deps.db.delete(eventRules).where(eq(eventRules.orgId, orgId));
  await deps.db.delete(auditEvents).where(eq(auditEvents.orgId, orgId));
  await deps.db.delete(agents).where(eq(agents.orgId, orgId));
  await deps.db.delete(memberships).where(eq(memberships.orgId, orgId));
  await deps.db.delete(organizations).where(eq(organizations.id, orgId));
  await deps.pool.end();
});

run('webhook → rule → action end-to-end', () => {
  it('ingests an issue event and a matching rule creates an assigned task', async () => {
    await upsertRule(deps.db, orgId, {
      provider: 'github',
      eventType: 'issues.opened',
      action: 'create_task',
      agentId: engineerId,
      taskTitleTemplate: 'Fix #{number}: {title}',
      requiresApproval: false,
      enabled: true,
    });

    const ingest = await ingestWebhookEvent(deps.db, {
      orgId,
      provider: 'github',
      eventType: 'issues.opened',
      title: 'Bug: login broken',
      externalEventId: `gh-issue-${randomUUID()}`,
      payload: { number: 42, title: 'Bug: login broken' },
      headers: {},
    });
    expect(ingest.inserted).toBe(true);

    const result = await processPendingEvents(deps.db, { limit: 10 });
    expect(result.createdTasks).toBeGreaterThan(0);

    const created = await deps.db
      .select()
      .from(tasks)
      .where(eq(tasks.orgId, orgId));
    const match = created.find((t) => t.title?.includes('Fix #42'));
    expect(match).toBeDefined();
    expect(match!.agentId).toBe(engineerId);
  });

  it('a duplicate delivery with the same external id is not ingested twice', async () => {
    const externalEventId = `dup-${randomUUID()}`;
    await ingestWebhookEvent(deps.db, { orgId, provider: 'github', eventType: 'issues.opened', title: 'dup', externalEventId, payload: { number: 1, title: 'dup' }, headers: {} });
    const second = await ingestWebhookEvent(deps.db, { orgId, provider: 'github', eventType: 'issues.opened', title: 'dup', externalEventId, payload: { number: 1, title: 'dup' }, headers: {} });
    expect(second.inserted).toBe(false);
  });

  it('a rule that requires approval creates a pending approval, not a task', async () => {
    await upsertRule(deps.db, orgId, {
      provider: 'github',
      eventType: 'issues.labeled',
      action: 'create_task',
      agentId: execId,
      taskTitleTemplate: 'Review label: {label}',
      requiresApproval: true,
      enabled: true,
    });
    await ingestWebhookEvent(deps.db, {
      orgId,
      provider: 'github',
      eventType: 'issues.labeled',
      title: 'needs review',
      externalEventId: `labeled-${randomUUID()}`,
      payload: { label: 'security' },
      headers: {},
    });
    const result = await processPendingEvents(deps.db, { limit: 10 });
    expect(result.createdApprovals).toBeGreaterThan(0);
    const pending = await deps.db
      .select()
      .from(approvals)
      .where(eq(approvals.orgId, orgId));
    const match = pending.find((a) => a.action?.includes('label'));
    expect(match).toBeDefined();
    expect(match!.status).toBe('pending');
  });

  it('a disabled rule leaves the event processed with no task', async () => {
    await upsertRule(deps.db, orgId, {
      provider: 'github',
      eventType: 'issues.closed',
      action: 'create_task',
      agentId: engineerId,
      taskTitleTemplate: 'Closed: {title}',
      requiresApproval: false,
      enabled: false,
    });
    await ingestWebhookEvent(deps.db, {
      orgId,
      provider: 'github',
      eventType: 'issues.closed',
      title: 'already done',
      externalEventId: `closed-${randomUUID()}`,
      payload: { title: 'already done' },
      headers: {},
    });
    const result = await processPendingEvents(deps.db, { limit: 10 });
    expect(result.skippedNoRule).toBeGreaterThan(0);
    const created = await deps.db
      .select()
      .from(tasks)
      .where(eq(tasks.orgId, orgId));
    expect(created.find((t) => t.title?.includes('already done'))).toBeUndefined();
  });
});
