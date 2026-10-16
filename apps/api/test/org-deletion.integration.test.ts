/**
 * Account-close integration tests (AUD-004, docs/38.4).
 *
 *   1. Export downloads: GET /v1/settings/export is 200 and carries the org.
 *   2. Non-owner cannot delete (403); wrong slug confirmation is 400.
 *   3. Owner + correct slug purges: org row gone, every seeded org table empty,
 *      sessions dead, orphaned users erased, second org untouched.
 *   4. Coverage guard: every public table with an org_id column is either in
 *      ORG_PURGE_TABLES or handled explicitly (files) — a new org-scoped table
 *      fails this test until the purge list covers it.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { COVERED_ORG_TABLES } from '../src/services/org-deletion.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: process.env.DATABASE_URL } as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000 });
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

async function registerOwner(tag: string): Promise<{ token: string; orgId: string; email: string; slug: string }> {
  const email = `${tag}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `${tag} Org` },
  });
  expect(res.statusCode).toBe(201);
  const { users: usersTable } = await import('@orq8/db');
  const { eq: eqFn } = await import('drizzle-orm');
  await deps.db.update(usersTable).set({ emailVerifiedAt: new Date() }).where(eqFn(usersTable.email, email.trim().toLowerCase()));
  const me = await app.inject({ method: 'GET', url: '/v1/org', headers: { authorization: `Bearer ${res.json().data.token}` } });
  return { token: res.json().data.token as string, orgId: res.json().data.org.id as string, email, slug: me.json().data.slug as string };
}

function tableSql(table: string): ReturnType<typeof sql.raw> {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`unsafe table name: ${table}`);
  return sql.raw(`public.${table}`);
}

function asRows<T>(result: unknown): Array<T> {
  if (Array.isArray(result)) return result as Array<T>;
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Array<T> }).rows;
  }
  throw new Error('unexpected db.execute result shape');
}

async function orgRowCount(table: string, orgId: string): Promise<number> {
  const result = await deps.db.execute(
    sql`SELECT COUNT(*)::int AS n FROM ${tableSql(table)} WHERE org_id = ${orgId}`,
  );
  return asRows<{ n: number }>(result)[0]?.n ?? 0;
}

const run = dbUp ? describe : describe.skip;

run('account close (DELETE /v1/org)', () => {
  it('covers every org_id table in the purge list', async () => {
    const schemaResult = await deps.db.execute(
      sql.raw(`SELECT table_name FROM information_schema.columns WHERE column_name = 'org_id' AND table_schema = 'public'`),
    );
    const rows = asRows<{ table_name: string }>(schemaResult);
    const missing = rows.map((r) => r.table_name).filter((t) => !COVERED_ORG_TABLES.has(t));
    expect(missing).toEqual([]);
  });

  it('exports, refuses bad confirmation, then purges the whole org', async () => {
    const a = await registerOwner('close-a');
    const b = await registerOwner('close-b');
    const db = deps.db;
    const {
      departments, teams, agents, goals, tasks, approvals, agentJobs, companyMemory,
      knowledgeEntities, knowledgeRelations, companyDecisions, squads, squadAgents,
      mcpServers, mcpTools, integrationProviders, simulations, notifications, briefings,
      activityEvents, strategies, objectives, keyResults, initiatives, decisions, deals,
      tickets, businessImports, capabilityRegistry, onboardingStates, analyticsEvents,
      webhookEvents, eventRules, llmPerformance, creditAlerts, planRevisions, subscriptions,
      creditBalances, creditTransactions, creditReservations, memberships, users,
    } = await import('@orq8/db');

    // ── Seed a representative company graph in org A ──
    const deptId = randomUUID();
    await db.insert(departments).values({ id: deptId, orgId: a.orgId, name: 'Eng', status: 'active', settings: {} });
    const teamId = randomUUID();
    await db.insert(teams).values({ id: teamId, orgId: a.orgId, name: 'Core', departmentId: deptId });
    const agentId = randomUUID();
    await db.insert(agents).values({ id: agentId, orgId: a.orgId, name: 'Ada', role: 'engineer', departmentId: deptId, teamId, status: 'active' });
    const goalId = randomUUID();
    await db.insert(goals).values({ id: goalId, orgId: a.orgId, title: 'Ship it', status: 'active' });
    const taskId = randomUUID();
    await db.insert(tasks).values({ id: taskId, orgId: a.orgId, title: 'Build', status: 'pending', goalId, agentId });
    await db.insert(approvals).values({ orgId: a.orgId, agentId, action: 'deploy', status: 'pending' });
    await db.insert(agentJobs).values({ orgId: a.orgId, taskId, type: 'task.execute', status: 'pending', payload: {} });
    await db.insert(companyMemory).values({ orgId: a.orgId, category: 'fact', content: 'We ship.' });
    const [ent] = await db.insert(knowledgeEntities).values({ orgId: a.orgId, type: 'customer', name: 'Acme' }).returning({ id: knowledgeEntities.id });
    const [ent2] = await db.insert(knowledgeEntities).values({ orgId: a.orgId, type: 'product', name: 'Widget' }).returning({ id: knowledgeEntities.id });
    await db.insert(knowledgeRelations).values({ orgId: a.orgId, fromEntityId: ent!.id, toEntityId: ent2!.id, relationType: 'related_to' });
    await db.insert(companyDecisions).values({ orgId: a.orgId, title: 'Use TS' });
    const squadId = randomUUID();
    await db.insert(squads).values({ id: squadId, orgId: a.orgId, name: 'Alpha', objective: 'Win' });
    await db.insert(squadAgents).values({ orgId: a.orgId, squadId, agentId });
    const serverId = randomUUID();
    await db.insert(mcpServers).values({ id: serverId, orgId: a.orgId, name: 'gh', provider: 'github' });
    await db.insert(mcpTools).values({ orgId: a.orgId, serverId, name: 'create_issue' });
    const providerId = randomUUID();
    await db.insert(integrationProviders).values({ id: providerId, orgId: a.orgId, name: 'GitHub', provider: 'github', status: 'connected' });
    await db.insert(simulations).values({ orgId: a.orgId, name: 'What-if', changeDescription: 'Test scenario', state: 'draft' });
    await db.insert(notifications).values({ orgId: a.orgId, type: 'info', title: 'Hi', message: 'Hello', read: false });
    await db.insert(briefings).values({ orgId: a.orgId, kind: 'weekly', periodStart: new Date(Date.now() - 86400000), periodEnd: new Date(), status: 'draft' });
    await db.insert(activityEvents).values({ orgId: a.orgId, agentId, taskId, type: 'analyzed', summary: 'Seed event' });
    const strategyId = randomUUID();
    await db.insert(strategies).values({ id: strategyId, orgId: a.orgId, title: 'Grow' });
    const objectiveId = randomUUID();
    await db.insert(objectives).values({ id: objectiveId, orgId: a.orgId, strategyId, title: 'Revenue' });
    await db.insert(keyResults).values({ orgId: a.orgId, objectiveId, title: 'MRR', metricTarget: '10000' });
    await db.insert(initiatives).values({ orgId: a.orgId, objectiveId, title: 'Launch' });
    await db.insert(decisions).values({ orgId: a.orgId, title: 'Price rise', whatWasDecided: 'Raise prices 5%', decisionType: 'pricing', status: 'decided' });
    await db.insert(deals).values({ orgId: a.orgId, accountName: 'Acme', title: 'Pilot', stage: 'discovery', valueCents: 1000, probability: 10 });
    await db.insert(tickets).values({ orgId: a.orgId, accountName: 'Acme', subject: 'Help', status: 'open', priority: 'low', channel: 'email' });
    await db.insert(businessImports).values({ orgId: a.orgId, websiteUrl: 'https://example.com', sourceFingerprint: 'fp-test-1', status: 'pending' });
    await db.insert(capabilityRegistry).values({ orgId: a.orgId, name: 'deploy', category: 'workflow' });
    const [ownerUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, a.email.trim().toLowerCase())).limit(1);
    await db.insert(onboardingStates).values({ userId: ownerUser!.id, orgId: a.orgId, step: 'organization' });
    await db.insert(analyticsEvents).values({ orgId: a.orgId, eventName: 'page.view' });
    await db.insert(webhookEvents).values({ orgId: a.orgId, provider: 'github', eventType: 'push', status: 'received', payload: {} });
    await db.insert(eventRules).values({ orgId: a.orgId, provider: 'github', eventType: 'push', action: 'notify' });
    await db.insert(llmPerformance).values({ orgId: a.orgId, provider: 'test', model: 'test', phase: 'test', routingSource: 'test', success: true });
    await db.insert(creditAlerts).values({ orgId: a.orgId, type: 'low_balance', threshold: 10, message: 'Low' });
    await db.insert(planRevisions).values({ orgId: a.orgId, rev: 1, title: 'v1', authorName: 'Ada' });
    const [sub] = await db.insert(subscriptions).values({ orgId: a.orgId, plan: 'trial', status: 'active', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86400000) }).returning({ id: subscriptions.id });
    await db.insert(creditBalances).values({ orgId: a.orgId, subscriptionId: sub!.id, periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400000), includedCredits: 100, purchasedCredits: 0, usedCredits: 0 });
    await db.insert(creditTransactions).values({ orgId: a.orgId, type: 'grant', amount: 100, description: 'Trial' });
    await db.insert(creditReservations).values({ orgId: a.orgId, status: 'active', estimateCredits: 10, expiresAt: new Date(Date.now() + 60000) });
    // One file with a real blob (local backend in tests).
    const { uploadFile } = await import('../src/services/files.js');
    const uploaded = await uploadFile(deps.config, db, a.orgId, { name: 'note.txt', mimeType: 'text/plain', body: Buffer.from('hello') });

    // ── 1. Export downloads ──
    const exp = await app.inject({ method: 'GET', url: '/v1/settings/export', headers: { authorization: `Bearer ${a.token}` } });
    expect(exp.statusCode).toBe(200);
    expect(exp.json().data.organization.id).toBe(a.orgId);
    expect(exp.json().data.agents.length).toBeGreaterThan(0);

    // ── 2a. Member (non-owner) cannot delete ──
    const { users: usersTable } = await import('@orq8/db');
    const memberEmail = `close-member-${randomUUID().slice(0, 8)}@test.example.com`;
    const memberReg = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: memberEmail, password: 'Test1234!', org_name: 'Member Org' } });
    expect(memberReg.statusCode).toBe(201);
    // Same confirmation the owners get above: without it the switch 403s on
    // email_not_verified and the test would prove nothing about the role gate.
    await deps.db.update(usersTable).set({ emailVerifiedAt: new Date() }).where(eq(usersTable.email, memberEmail.trim().toLowerCase()));
    const memberToken = memberReg.json().data.token as string;
    // Move the member into org A as a viewer via direct membership.
    const [memberUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, memberEmail.trim().toLowerCase())).limit(1);
    await db.insert(memberships).values({ orgId: a.orgId, userId: memberUser!.id, role: 'viewer', status: 'active' });
    // Act in org A as the viewer, then attempt the delete → 403 (owner only).
    const switched = await app.inject({ method: 'POST', url: '/v1/org/switch', payload: { org_id: a.orgId }, headers: { authorization: `Bearer ${memberToken}` } });
    expect(switched.statusCode).toBe(200);
    const denied = await app.inject({ method: 'DELETE', url: '/v1/org', payload: { confirm: a.slug }, headers: { authorization: `Bearer ${memberToken}` } });
    expect(denied.statusCode).toBe(403);

    // ── 2b. Wrong slug confirmation is rejected ──
    const wrong = await app.inject({ method: 'DELETE', url: '/v1/org', payload: { confirm: 'not-the-slug' }, headers: { authorization: `Bearer ${a.token}` } });
    expect(wrong.statusCode).toBe(400);

    // ── 3. Owner + correct slug purges ──
    const del = await app.inject({ method: 'DELETE', url: '/v1/org', payload: { confirm: a.slug }, headers: { authorization: `Bearer ${a.token}` } });
    expect(del.statusCode).toBe(200);
    const receipt = del.json().data;
    expect(receipt.orgId).toBe(a.orgId);
    expect(receipt.signedOut).toBe(true);
    expect(receipt.audit.action).toBe('org.deleted');
    expect(receipt.purgedTables['agents']).toBeGreaterThan(0);
    expect(receipt.filesRemoved).toBe(1);

    // Org row gone (by its own PK — organizations has no org_id column);
    // every seeded table empty for org A.
    const { organizations: orgsTable } = await import('@orq8/db');
    const orgGone = await db.select({ id: orgsTable.id }).from(orgsTable).where(eq(orgsTable.id, a.orgId)).limit(1);
    expect(orgGone.length).toBe(0);
    for (const table of ['departments', 'teams', 'agents', 'goals', 'tasks', 'approvals', 'agent_jobs', 'company_memory', 'knowledge_entities', 'knowledge_relations', 'company_decisions', 'squads', 'squad_agents', 'mcp_servers', 'mcp_tools', 'integration_providers', 'simulations', 'notifications', 'briefings', 'activity_events', 'strategies', 'objectives', 'key_results', 'initiatives', 'decisions', 'deals', 'tickets', 'business_imports', 'capability_registry', 'onboarding_states', 'analytics_events', 'webhook_events', 'event_rules', 'llm_performance', 'credit_alerts', 'plan_revisions', 'subscriptions', 'credit_balances', 'credit_transactions', 'credit_reservations', 'files', 'audit_events', 'memberships', 'invitations', 'sessions']) {
      expect(await orgRowCount(table, a.orgId), `${table} should be purged`).toBe(0);
    }

    // Blob gone from storage (row gone → lookup returns null).
    const { readFileBytes } = await import('../src/services/files.js');
    await expect(readFileBytes(deps.config, db, a.orgId, uploaded.id)).resolves.toBeNull();

    // Old token is dead.
    const dead = await app.inject({ method: 'GET', url: '/v1/org', headers: { authorization: `Bearer ${a.token}` } });
    expect(dead.statusCode).toBe(401);

    // Orphaned founder account erased (owner A had no other orgs).
    const stillThere = await db.select({ id: users }).from(users).where(eq(users.email, a.email.trim().toLowerCase())).limit(1);
    expect(stillThere.length).toBe(0);

    // Org B untouched: owner B still works, org row + membership intact.
    const bMe = await app.inject({ method: 'GET', url: '/v1/org', headers: { authorization: `Bearer ${b.token}` } });
    expect(bMe.statusCode).toBe(200);
    expect(bMe.json().data.id).toBe(b.orgId);

    // The viewer member keeps their own account (they still belong to Member Org).
    const memberSurvives = await db.select({ id: users }).from(users).where(eq(users.email, memberEmail.trim().toLowerCase())).limit(1);
    expect(memberSurvives.length).toBe(1);
  });
});
