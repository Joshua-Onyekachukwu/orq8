/**
 * Budget policy, kill switch and delegation recursion guard (docs/80 Phase 2).
 *
 * The company constitution already *stored* a `budgetPolicy` and nothing read
 * it; these tests pin the behaviour that now enforces it — org daily/monthly
 * ceilings, the approval threshold, per-agent budgets, the org AI-spend kill
 * switch, and the delegation depth/sibling caps that close abuse todo #2.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { agents, organizations, tasks, users, createDb } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';
import {
  resolveBudgetPolicy,
  resolveAgentBudget,
  readKillSwitch,
  evaluateBudget,
  getBudgetOverview,
  BudgetExceededError,
  BudgetApprovalRequiredError,
} from '../src/services/ai-budget.js';
import {
  reserveCredits,
  settleReservation,
} from '../src/services/credits.js';
import { delegateTask } from '../src/services/multi-agent.js';
import { checkDelegationGuard, countChildren } from '../src/services/delegation-guard.js';
import { executeDelegationPlan, type DelegationPlan } from '../src/services/delegation-orchestrator.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
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

const guardLimits = { maxDepth: 2, maxChildrenPerTask: 1, maxTasksPerCommand: 50 };

async function registerOrg(label: string): Promise<{ token: string; orgId: string }> {
  const email = `budget-${label}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `Budget Test ${label}` },
  });
  expect(res.statusCode).toBe(201);
  await deps.db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.email, email.trim().toLowerCase()));
  const body = res.json();
  return { token: body.data.token as string, orgId: body.data.org.id as string };
}

async function setSettings(orgId: string, patch: Record<string, unknown>): Promise<void> {
  const [row] = await deps.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const settings = { ...((row?.settings as Record<string, unknown>) ?? {}), ...patch };
  await deps.db.update(organizations).set({ settings }).where(eq(organizations.id, orgId));
}

async function setBudgetPolicy(orgId: string, policy: Record<string, number>): Promise<void> {
  const [row] = await deps.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const settings = (row?.settings as Record<string, unknown>) ?? {};
  const constitution = (settings.constitution as Record<string, unknown>) ?? {};
  await deps.db
    .update(organizations)
    .set({ settings: { ...settings, constitution: { ...constitution, budgetPolicy: policy } } })
    .where(eq(organizations.id, orgId));
}

// ─── Pure resolution ─────────────────────────────────────────────────────────

describe('budget policy resolution (pure)', () => {
  it('reads the stored constitution.budgetPolicy and coerces junk to 0', () => {
    expect(resolveBudgetPolicy(null)).toEqual({ dailyLimit: 0, monthlyLimit: 0, requiresApprovalAbove: 0 });
    expect(
      resolveBudgetPolicy({
        constitution: { budgetPolicy: { dailyLimit: 50, monthlyLimit: '200', requiresApprovalAbove: -4 } },
      }),
    ).toEqual({ dailyLimit: 50, monthlyLimit: 200, requiresApprovalAbove: 0 });
  });

  it('reads agents.config.budget and treats absent fields as no ceiling', () => {
    expect(resolveAgentBudget({})).toEqual({ dailyCredits: 0, monthlyCredits: 0, perTaskCredits: 0 });
    expect(resolveAgentBudget({ budget: { dailyCredits: 7, perTaskCredits: 3 } })).toEqual({
      dailyCredits: 7,
      monthlyCredits: 0,
      perTaskCredits: 3,
    });
  });

  it('reads the kill switch state', () => {
    expect(readKillSwitch({}).paused).toBe(false);
    const state = readKillSwitch({ aiSpend: { paused: true, reason: 'runaway', at: 'now', by: 'u1' } });
    expect(state).toEqual({ paused: true, reason: 'runaway', at: 'now', by: 'u1' });
  });
});

// ─── Enforcement ─────────────────────────────────────────────────────────────

const run = dbUp ? describe : describe.skip;

run('budget enforcement (docs/80 Phase 2)', () => {
  it('enforces the org daily ceiling at reservation', async () => {
    const { orgId } = await registerOrg('daily');
    await setBudgetPolicy(orgId, { dailyLimit: 5, monthlyLimit: 0, requiresApprovalAbove: 0 });

    await expect(
      reserveCredits(deps.db, orgId, { estimate: 6, reason: 'task.execute' }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    // Within the ceiling it is allowed.
    const ok = await reserveCredits(deps.db, orgId, { estimate: 3, reason: 'task.execute' });
    expect(ok.status).toBe('active');
    await settleReservation(deps.db, ok.id, { actualCredits: 3, description: 'daily' });

    // Now 3 of 5 is spent: a further 3 would cross the ceiling.
    const evaluation = await evaluateBudget(deps.db, { orgId, estimate: 3 });
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toBe('org_daily_limit');
  });

  it('enforces the org monthly ceiling', async () => {
    const { orgId } = await registerOrg('monthly');
    await setBudgetPolicy(orgId, { dailyLimit: 0, monthlyLimit: 5, requiresApprovalAbove: 0 });
    await expect(
      reserveCredits(deps.db, orgId, { estimate: 6, reason: 'task.execute' }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('stops work above the approval threshold until a grant is presented', async () => {
    const { orgId } = await registerOrg('threshold');
    await setBudgetPolicy(orgId, { dailyLimit: 0, monthlyLimit: 0, requiresApprovalAbove: 5 });

    const blocked = await reserveCredits(deps.db, orgId, { estimate: 6, reason: 'task.execute' }).catch((e) => e);
    expect(blocked).toBeInstanceOf(BudgetApprovalRequiredError);
    expect((blocked as BudgetApprovalRequiredError).threshold).toBe(5);

    // `approved: true` is the executor consuming a founder's grant: it passes.
    const ok = await reserveCredits(deps.db, orgId, { estimate: 6, reason: 'task.execute', approved: true });
    expect(ok.status).toBe('active');
  });

  it('enforces a per-agent per-task ceiling', async () => {
    const { orgId } = await registerOrg('agent-task');
    const [agent] = await deps.db
      .insert(agents)
      .values({ orgId, name: 'Nova', role: 'market_researcher', config: { budget: { perTaskCredits: 5 } } })
      .returning();

    await expect(
      reserveCredits(deps.db, orgId, { estimate: 6, agentId: agent!.id, reason: 'task.execute' }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    const ok = await reserveCredits(deps.db, orgId, { estimate: 4, agentId: agent!.id, reason: 'task.execute' });
    expect(ok.status).toBe('active');
  });

  it('enforces a per-agent daily ceiling from measured agent spend', async () => {
    const { orgId } = await registerOrg('agent-day');
    const [agent] = await deps.db
      .insert(agents)
      .values({ orgId, name: 'Remy', role: 'data_analyst', config: { budget: { dailyCredits: 5 } } })
      .returning();

    const first = await reserveCredits(deps.db, orgId, { estimate: 4, agentId: agent!.id, reason: 'task.execute' });
    await settleReservation(deps.db, first.id, { actualCredits: 4, description: 'agent day' });

    await expect(
      reserveCredits(deps.db, orgId, { estimate: 3, agentId: agent!.id, reason: 'task.execute' }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('refuses all spend while the org kill switch is on, then resumes', async () => {
    const { orgId } = await registerOrg('kill');
    await setSettings(orgId, { aiSpend: { paused: true, reason: 'runaway loop', at: new Date().toISOString(), by: 'u1' } });

    const blocked = await reserveCredits(deps.db, orgId, { estimate: 3, reason: 'task.execute' }).catch((e) => e);
    expect(blocked).toBeInstanceOf(BudgetExceededError);
    expect((blocked as BudgetExceededError).budgetReason).toBe('kill_switch');

    await setSettings(orgId, { aiSpend: { paused: false, reason: null, at: new Date().toISOString(), by: 'u1' } });
    const ok = await reserveCredits(deps.db, orgId, { estimate: 3, reason: 'task.execute' });
    expect(ok.status).toBe('active');
  });

  it('exposes policy, spend and kill switch over HTTP; owner can flip the switch', async () => {
    const { token, orgId } = await registerOrg('route');
    await setBudgetPolicy(orgId, { dailyLimit: 42, monthlyLimit: 0, requiresApprovalAbove: 7 });

    const get = await app.inject({ method: 'GET', url: '/v1/budgets', headers: { authorization: `Bearer ${token}` } });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.policy).toEqual({ dailyLimit: 42, monthlyLimit: 0, requiresApprovalAbove: 7 });

    const post = await app.inject({
      method: 'POST',
      url: '/v1/budgets/kill-switch',
      headers: { authorization: `Bearer ${token}` },
      payload: { paused: true, reason: 'stop the loop' },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json().data.paused).toBe(true);

    const overview = await getBudgetOverview(deps.db, orgId);
    expect(overview.killSwitch.paused).toBe(true);
  });
});

// ─── Delegation recursion guard (abuse todo #2) ─────────────────────────────

run('delegation recursion guard (docs/80 Phase 2)', () => {
  async function seedAgents(orgId: string): Promise<{ delegator: string; target: string }> {
    const [delegator] = await deps.db
      .insert(agents)
      .values({ orgId, name: 'Atlas', role: 'executive_agent', authority: { canCreateTasks: true } })
      .returning();
    const [target] = await deps.db
      .insert(agents)
      .values({ orgId, name: 'Nova', role: 'market_researcher', authority: { canCreateTasks: true } })
      .returning();
    return { delegator: delegator!.id, target: target!.id };
  }

  it('refuses a sub-task that would exceed the depth cap, and terminates', async () => {
    const { orgId } = await registerOrg('depth');
    const { delegator, target } = await seedAgents(orgId);
    const [root] = await deps.db.insert(tasks).values({ orgId, title: 'Root', agentId: delegator }).returning();

    // depth 1 under root
    const one = await delegateTask(deps.db, {
      orgId,
      delegatingAgentId: delegator,
      targetAgentId: target,
      parentTaskId: root!.id,
      title: 'Level 1',
      description: 'work',
      priority: 'normal',
      limits: guardLimits,
    });
    expect(one.status).toBe('created');

    const [childOne] = await deps.db.select().from(tasks).where(eq(tasks.id, one.subTaskId)).limit(1);
    expect(childOne?.parentTaskId).toBe(root!.id);

    // depth 2 under level 1 (== maxDepth, allowed)
    const two = await delegateTask(deps.db, {
      orgId,
      delegatingAgentId: delegator,
      targetAgentId: target,
      parentTaskId: one.subTaskId,
      title: 'Level 2',
      description: 'work',
      priority: 'normal',
      limits: guardLimits,
    });
    expect(two.status).toBe('created');

    // depth 3 would exceed maxDepth 2 → blocked, the loop terminates.
    const three = await delegateTask(deps.db, {
      orgId,
      delegatingAgentId: delegator,
      targetAgentId: target,
      parentTaskId: two.subTaskId,
      title: 'Level 3',
      description: 'work',
      priority: 'normal',
      limits: guardLimits,
    });
    expect(three.status).toBe('blocked');
    expect(three.reason).toMatch(/depth/i);

    // The parent link is persisted, which is what the guard walks.
    const [child] = await deps.db.select().from(tasks).where(eq(tasks.id, one.subTaskId)).limit(1);
    expect(child?.parentTaskId).toBe(root!.id);
  });

  it('refuses a second child once the sibling cap is reached', async () => {
    const { orgId } = await registerOrg('children');
    const { delegator, target } = await seedAgents(orgId);
    const [root] = await deps.db.insert(tasks).values({ orgId, title: 'Root', agentId: delegator }).returning();

    const first = await delegateTask(deps.db, {
      orgId,
      delegatingAgentId: delegator,
      targetAgentId: target,
      parentTaskId: root!.id,
      title: 'Child A',
      description: 'work',
      priority: 'normal',
      limits: guardLimits,
    });
    expect(first.status).toBe('created');

    expect(await countChildren(deps.db, orgId, root!.id)).toBe(1);
    const guard = await checkDelegationGuard(deps.db, orgId, root!.id, {
      maxDepth: 2,
      maxChildrenPerTask: 1,
      maxTasksPerCommand: 50,
    });
    expect(guard).toMatchObject({ allowed: false, reason: 'delegation_children' });

    const second = await delegateTask(deps.db, {
      orgId,
      delegatingAgentId: delegator,
      targetAgentId: target,
      parentTaskId: root!.id,
      title: 'Child B',
      description: 'work',
      priority: 'normal',
      limits: guardLimits,
    });
    expect(second.status).toBe('blocked');
    expect(second.reason).toMatch(/sub-tasks/i);
  });

  it('caps how many tasks one delegation plan may create', async () => {
    const { orgId } = await registerOrg('command-cap');
    const { target } = await seedAgents(orgId);

    const plan: DelegationPlan = {
      directAssignments: [
        { taskTitle: 'A', targetAgentId: target, targetAgentName: 'Nova', role: 'market_researcher' },
        { taskTitle: 'B', targetAgentId: target, targetAgentName: 'Nova', role: 'market_researcher' },
      ],
      delegations: [],
      unassigned: [],
    };
    const decomposition = [
      { title: 'A', description: 'work a', suggestedAgentRole: 'market_researcher' },
      { title: 'B', description: 'work b', suggestedAgentRole: 'market_researcher' },
    ];

    const result = await executeDelegationPlan(deps.db, orgId, plan, decomposition, {
      ...config,
      DELEGATION_MAX_TASKS_PER_COMMAND: 1,
    });
    expect(result.createdTaskIds).toHaveLength(1);
    expect(result.skippedCount).toBe(1);
  });
});
