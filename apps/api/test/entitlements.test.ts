import { describe, it, expect, beforeAll, afterAll, describe as dbDescribe } from 'vitest';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { loadConfig } from '@orq8/core';
import {
  createDb,
  organizations,
  memberships,
  users,
  subscriptions,
  agents,
  departments,
  type Db,
} from '@orq8/db';
import { randomUUID } from 'node:crypto';
import { PLANS, TRIAL_CAPS } from '../src/services/billing.js';
import { resolveCaps, getEntitlements, enforceResourceLimit } from '../src/services/entitlements.js';
import { fitPlanToAgentLimit, type CompanyPlan, type ProposedAgent } from '../src/services/company-builder.js';

// ─── Pure unit tests ───────────────────────────────────────────────────────

describe('canonical plan config', () => {
  it('uses the canonical 10 / 25 / 50 AI employee limits with structured caps', () => {
    expect(PLANS.founder!.maxAgents).toBe(10);
    expect(PLANS.team!.maxAgents).toBe(25);
    expect(PLANS.company!.maxAgents).toBe(50);
    expect(PLANS.founder!.departments).toBeGreaterThan(0);
    expect(PLANS.team!.teams).toBeGreaterThan(PLANS.team!.departments);
    expect(PLANS.company!.connectors).toBeGreaterThan(PLANS.founder!.connectors);
    expect(PLANS.founder!.autonomy).toBe('execute_with_approval');
    expect(PLANS.company!.autonomy).toBe('autonomous');
  });

  it('trial defaults are lean', () => {
    expect(TRIAL_CAPS.maxAgents).toBe(3);
    expect(TRIAL_CAPS.connectors).toBe(1);
  });
});

describe('resolveCaps', () => {
  it('maps known plans to their table and honors stored overrides', () => {
    const team = resolveCaps('team', null);
    expect(team.maxAgents).toBe(25);
    expect(team.departments).toBe(10);
    const stored = resolveCaps('team', 40);
    expect(stored.maxAgents).toBe(40); // legacy subscription keeps its grant
  });

  it('treats trial/no-subscription like trial caps', () => {
    expect(resolveCaps('trial', null).maxAgents).toBe(3);
    expect(resolveCaps(undefined, null).departments).toBe(TRIAL_CAPS.departments);
    expect(resolveCaps('unknown-plan', null).maxAgents).toBe(3);
  });

  it('enterprise is effectively unlimited on structured resources', () => {
    const ent = resolveCaps('enterprise', null);
    expect(ent.departments).toBe(0);
    expect(ent.teams).toBe(0);
    expect(ent.connectors).toBe(0);
    expect(ent.mcpServers).toBe(0);
    expect(ent.maxAgents).toBe(250);
    expect(resolveCaps('enterprise', 120).maxAgents).toBe(120);
  });
});

describe('fitPlanToAgentLimit', () => {
  function agent(department: string, name: string): ProposedAgent {
    return {
      name,
      role: name,
      department,
      responsibilities: [`${name} responsibilities`],
      capabilities: ['cap'],
      tools: ['tool'],
    };
  }
  const plan: CompanyPlan = {
    departments: [{ name: 'A', description: 'A' }, { name: 'B', description: 'B' }, { name: 'C', description: 'C' }],
    agents: [agent('A', 'Lead-A'), agent('B', 'Lead-B'), agent('C', 'Lead-C'), agent('A', 'Extra-A1'), agent('B', 'Extra-B1'), agent('A', 'Extra-A2')],
    goals: [],
    tasks: [],
    rationale: 'full team',
  };

  it('returns the plan unchanged when it already fits', () => {
    const fitted = fitPlanToAgentLimit(plan, 10);
    expect(fitted.limitedFrom).toBe(6);
    expect(fitted.limitedTo).toBe(6);
    expect(fitted.plan.agents.length).toBe(6);
  });

  it('keeps every department lead first, then fills with extras to the cap', () => {
    const fitted = fitPlanToAgentLimit(plan, 4);
    expect(fitted.limitedFrom).toBe(6);
    expect(fitted.limitedTo).toBe(4);
    const names = fitted.plan.agents.map((a) => a.name);
    expect(names.slice(0, 3)).toEqual(['Lead-A', 'Lead-B', 'Lead-C']); // one per department
    expect(names).toContain('Extra-A1'); // first extra fills the 4th slot
    const departmentsPresent = new Set(fitted.plan.agents.map((a) => a.department));
    expect(departmentsPresent.size).toBe(3); // no department loses its lead
  });

  it('explains the constraint in the rationale', () => {
    const fitted = fitPlanToAgentLimit(plan, 3);
    expect(fitted.plan.rationale).toContain('sized to the plan');
  });
});

// ─── DB-gated integration tests (skip without Postgres) ────────────────────

const config = loadConfig();
let pool: Pool | null = null;
let dbUp = false;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
} catch {
  await pool?.end().catch(() => undefined);
  pool = null;
}

const run = dbUp ? dbDescribe : dbDescribe.skip;

run('entitlement enforcement', () => {
  const { db } = createDb(config.DATABASE_URL);
  const orgTrial = randomUUID();
  const orgFounder = randomUUID();
  const userA = randomUUID();
  const period = new Date();

  beforeAll(async () => {
    if (!pool) return;
    await pool.query('begin');
    await db.insert(organizations).values({ id: orgTrial, name: 'Ent Trial', slug: `ent-t-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(organizations).values({ id: orgFounder, name: 'Ent Founder', slug: `ent-f-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(users).values({ id: userA, email: `ent-${randomUUID()}@test.orq8`, name: 'A', passwordHash: 'x', status: 'active' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgTrial, userId: userA, role: 'owner' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgFounder, userId: userA, role: 'owner' }).onConflictDoNothing();
    // Founder plan subscription (no stored override → config caps 10 agents / 4 departments).
    await db.insert(subscriptions).values({
      orgId: orgFounder, plan: 'founder', billingCycle: 'monthly', status: 'active',
      includedCredits: 1000, maxAgents: 10,
      currentPeriodStart: period, currentPeriodEnd: new Date(period.getTime() + 30 * 86400000),
    }).onConflictDoNothing();
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('rollback');
    await pool.end();
    pool = null;
  });

  it('trial orgs are capped at 2 departments and reject the third', async () => {
    await db.insert(departments).values({ orgId: orgTrial, name: 'Dept-1' });
    await db.insert(departments).values({ orgId: orgTrial, name: 'Dept-2' });
    await expect(enforceResourceLimit(db, orgTrial, 'departments')).rejects.toThrow(/plan allows 2 departments/);
    const entitlements = await getEntitlements(db, orgTrial);
    const depts = entitlements.resources.find((r) => r.resource === 'departments');
    expect(depts?.used).toBe(2);
    expect(depts?.reached).toBe(true);
  });

  it('founder org can create departments up to 4 and no further', async () => {
    // enforceResourceLimit is a pre-flight gate: it must pass BEFORE each
    // insert (while count < limit) and reject once the org holds 4.
    for (let i = 0; i < 4; i++) {
      await expect(enforceResourceLimit(db, orgFounder, 'departments')).resolves.toBeUndefined();
      await db.insert(departments).values({ orgId: orgFounder, name: `Dept-${i}` });
    }
    await expect(enforceResourceLimit(db, orgFounder, 'departments')).rejects.toThrow(/plan allows 4 departments/);
  });

  it('archived agents do not consume the agent quota', async () => {
    for (let i = 0; i < 9; i++) {
      await db.insert(agents).values({ orgId: orgFounder, name: `Agent-${i}`, role: 'specialist', department: 'Ops', status: 'active', capabilities: [] });
    }
    await db.insert(agents).values({ orgId: orgFounder, name: 'Archived-1', role: 'specialist', department: 'Ops', status: 'archived', capabilities: [] });
    // 9 active + 1 archived — archived must not block the 10th active hire.
    await expect(enforceResourceLimit(db, orgFounder, 'agents')).resolves.toBeUndefined();
    await db.insert(agents).values({ orgId: orgFounder, name: 'Agent-10', role: 'specialist', department: 'Ops', status: 'active', capabilities: [] });
    await expect(enforceResourceLimit(db, orgFounder, 'agents')).rejects.toThrow(/plan allows 10 AI employees/);
  });

  it('entitlements report a full used/limit matrix with the right plan', async () => {
    const entitlements = await getEntitlements(db, orgFounder);
    expect(entitlements.plan).toBe('founder');
    expect(entitlements.planName).toBe('Founder');
    expect(entitlements.maxAgents).toBe(10);
    const agentUsage = entitlements.resources.find((r) => r.resource === 'agents');
    expect(agentUsage?.used).toBe(10);
    expect(agentUsage?.remaining).toBe(0);
    expect(agentUsage?.reached).toBe(true);
  });
});
