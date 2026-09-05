import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, simulations, departments, teams, agents, goals, approvals, auditEvents, type Simulation } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySimulation,
  buildApprovalDescription,
  createSimulation,
  riskFromSimulation,
  saveProposal,
  type OrgProposal,
} from '../src/services/simulation.js';
import { decide } from '../src/services/approvals.js';
import type { AppDeps } from '../src/types.js';

// ─── Pure unit tests (no DB) ────────────────────────────────────────────────

describe('simulation apply — pure helpers', () => {
  const baseSim = {
    id: 'sim-1',
    name: 'Growth Expansion',
    changeDescription: 'Add a growth department',
    projectedRisk: 'high',
  } as unknown as Simulation;

  const proposal: OrgProposal = {
    proposalId: 'prop-1',
    createdAt: new Date().toISOString(),
    rationale: 'Scale the org to handle 2× workload',
    departments: [
      {
        name: 'Growth',
        teams: [
          { name: 'Acquisition', agents: [{ name: 'Researcher', role: 'market_researcher' }] },
          { name: 'Retention', agents: [{ name: 'Writer', role: 'content_writer' }] },
        ],
      },
    ],
  };

  it('maps simulation risk onto approval risk levels', () => {
    expect(riskFromSimulation({ ...baseSim, projectedRisk: 'critical' } as Simulation)).toBe('high');
    expect(riskFromSimulation({ ...baseSim, projectedRisk: 'high' } as Simulation)).toBe('high');
    expect(riskFromSimulation({ ...baseSim, projectedRisk: 'medium' } as Simulation)).toBe('medium');
    expect(riskFromSimulation({ ...baseSim, projectedRisk: 'low' } as Simulation)).toBe('low');
    expect(riskFromSimulation({ ...baseSim, projectedRisk: null } as unknown as Simulation)).toBe('low');
  });

  it('builds a decision-relevant approval description', () => {
    const description = buildApprovalDescription(baseSim, proposal);
    expect(description).toContain('Growth Expansion');
    expect(description).toContain('1 department(s) (Growth)');
    expect(description).toContain('2 team(s) and 2 AI employee(s)');
    expect(description).toContain('Scale the org');
    expect(description).toContain('Risk: high');
  });
});

// ─── DB-gated integration test ──────────────────────────────────────────────

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

let orgId: string | undefined;

async function cleanupOrg(id: string): Promise<void> {
  await deps.db.delete(agents).where(eq(agents.orgId, id));
  await deps.db.delete(teams).where(eq(teams.orgId, id));
  await deps.db.delete(departments).where(eq(departments.orgId, id));
  await deps.db.delete(goals).where(eq(goals.orgId, id));
  await deps.db.delete(approvals).where(eq(approvals.orgId, id));
  await deps.db.delete(auditEvents).where(eq(auditEvents.orgId, id));
  await deps.db.delete(simulations).where(eq(simulations.orgId, id));
  await deps.db.delete(organizations).where(eq(organizations.id, id));
}

run('simulation apply — founder-approved materialization', () => {
  beforeAll(async () => {
    const [org] = await deps.db
      .insert(organizations)
      .values({ name: `sim-test-${randomUUID()}`, slug: `sim-test-${randomUUID()}` })
      .returning();
    orgId = org!.id;
  });

  afterAll(async () => {
    if (orgId) await cleanupOrg(orgId);
    await deps.pool.end();
  });

  let sim: Simulation;
  const proposalPayload = {
    rationale: 'Hire two teams to scale delivery',
    departments: [
      {
        name: 'Engineering',
        description: 'Builds the product',
        head: 'Tech Lead',
        teams: [
          {
            name: 'Platform',
            lead: 'Lead Platform Engineer',
            agents: [
              { name: 'Engineer Alpha', role: 'software_engineer', weeklyCost: 1000, capabilities: ['typescript', 'postgres'] },
              { name: 'Engineer Beta', role: 'software_engineer', reportsTo: 'Engineer Alpha', weeklyCost: 800 },
            ],
          },
          {
            name: 'QA',
            agents: [{ name: 'QA Gamma', role: 'qa_engineer', weeklyCost: 600 }],
          },
        ],
      },
      {
        name: 'Marketing',
        teams: [{ name: 'Content', agents: [{ name: 'Writer Delta', role: 'content_writer' }] }],
      },
    ],
    goals: [{ title: 'Ship v2 by end of quarter', description: 'Platform + QA capacity' }],
  };

  it('rejects applying without a proposal', async () => {
    sim = (await createSimulation(deps.db, orgId!, {
      name: 'Org Restructure',
      changeDescription: 'Add engineering + marketing',
      state: 'proposed',
    } as never)) as Simulation;
    await expect(applySimulation(deps.db, orgId!, sim.id, 'tester')).rejects.toThrow(/proposal/);
  });

  it('saves a structured proposal and sets state to proposed', async () => {
    const proposal = await saveProposal(deps.db, orgId!, sim.id, proposalPayload);
    expect(proposal.proposalId).toBeTruthy();
    expect(proposal.departments).toHaveLength(2);

    const stored = await deps.db.select().from(simulations).where(eq(simulations.id, sim.id)).limit(1);
    expect(stored[0]!.state).toBe('proposed');
    expect((stored[0]!.proposal as OrgProposal).proposalId).toBe(proposal.proposalId);
  });

  it('creating the approval gate does NOT materialize anything', async () => {
    const result = await applySimulation(deps.db, orgId!, sim.id, 'tester');
    expect(result.status).toBe('pending_approval');
    if (result.status !== 'pending_approval') return;

    expect(await deps.db.select().from(departments).where(eq(departments.orgId, orgId!))).toHaveLength(0);
    expect(await deps.db.select().from(teams).where(eq(teams.orgId, orgId!))).toHaveLength(0);
    expect(await deps.db.select().from(agents).where(eq(agents.orgId, orgId!))).toHaveLength(0);
    expect(await deps.db.select().from(goals).where(eq(goals.orgId, orgId!))).toHaveLength(0);

    // Repeated apply while pending must reuse the same approval (idempotent).
    const again = await applySimulation(deps.db, orgId!, sim.id, 'tester');
    expect(again.status).toBe('pending_approval');
    if (again.status === 'pending_approval') {
      expect(again.approvalId).toBe(result.approvalId);
    }
  });

  it('applies transactionally and idempotently after founder approval', async () => {
    const pending = (await deps.db.select().from(approvals).where(and(eq(approvals.orgId, orgId!), eq(approvals.action, `simulation.apply:${sim.id}`))))[0]!;
    const decided = await decide(deps.db, orgId!, pending.id, 'approved', 'Approved by founder');
    expect(decided?.status).toBe('approved');

    const result = await applySimulation(deps.db, orgId!, sim.id, 'founder');
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.created).toEqual({ departments: 2, teams: 3, agents: 4, goals: 1 });

    const deptRows = await deps.db.select().from(departments).where(eq(departments.orgId, orgId!)).orderBy(departments.name);
    expect(deptRows.map((d) => d.name).sort()).toEqual(['Engineering', 'Marketing']);

    const teamRows = await deps.db.select().from(teams).where(eq(teams.orgId, orgId!)).orderBy(teams.name);
    expect(teamRows).toHaveLength(3);
    const platform = teamRows.find((t) => t.name === 'Platform');
    const engineering = deptRows.find((d) => d.name === 'Engineering');
    expect(platform?.departmentId).toBe(engineering!.id);
    expect(platform?.lead).toBe('Lead Platform Engineer');

    const agentRows = await deps.db.select().from(agents).where(eq(agents.orgId, orgId!)).orderBy(agents.name);
    expect(agentRows).toHaveLength(4);
    const alpha = agentRows.find((a) => a.name === 'Engineer Alpha');
    expect(alpha?.teamId).toBe(platform!.id);
    expect(alpha?.departmentId).toBe(engineering!.id);
    expect(alpha?.weeklyCost).toBe(1000);
    expect((alpha?.config as Record<string, unknown>).sourceSimulationId).toBe(sim.id);
    expect((alpha?.config as Record<string, unknown>).reportsTo).toBeNull();
    const beta = agentRows.find((a) => a.name === 'Engineer Beta');
    expect((beta?.config as Record<string, unknown>).reportsTo).toBe('Engineer Alpha');

    const goalRows = await deps.db.select().from(goals).where(eq(goals.orgId, orgId!));
    expect(goalRows.map((g) => g.title)).toContain('Ship v2 by end of quarter');
  });

  it('second apply is a no-op — no duplicates, state stays applied', async () => {
    const before = {
      depts: (await deps.db.select().from(departments).where(eq(departments.orgId, orgId!))).length,
      teams: (await deps.db.select().from(teams).where(eq(teams.orgId, orgId!))).length,
      agents: (await deps.db.select().from(agents).where(eq(agents.orgId, orgId!))).length,
    };
    const result = await applySimulation(deps.db, orgId!, sim.id, 'founder');
    expect(result.status).toBe('already_applied');

    expect((await deps.db.select().from(departments).where(eq(departments.orgId, orgId!))).length).toBe(before.depts);
    expect((await deps.db.select().from(teams).where(eq(teams.orgId, orgId!))).length).toBe(before.teams);
    expect((await deps.db.select().from(agents).where(eq(agents.orgId, orgId!))).length).toBe(before.agents);
  });

  it('a rejected proposal cannot be applied', async () => {
    const sim2 = (await createSimulation(deps.db, orgId!, {
      name: 'Rejected Plan',
      changeDescription: 'A plan that will be rejected',
      state: 'proposed',
    } as never)) as Simulation;
    await saveProposal(deps.db, orgId!, sim2.id, {
      rationale: 'Testing rejection',
      departments: [{ name: 'Doomed', teams: [{ name: 'Doomed Team', agents: [{ name: 'Doomed Agent', role: 'engineer' }] }] }],
    });

    const first = await applySimulation(deps.db, orgId!, sim2.id, 'tester');
    expect(first.status).toBe('pending_approval');
    if (first.status !== 'pending_approval') return;
    await decide(deps.db, orgId!, first.approvalId, 'rejected', 'Not now');

    const second = await applySimulation(deps.db, orgId!, sim2.id, 'tester');
    expect(second.status).toBe('rejected');
    expect((await deps.db.select().from(departments).where(eq(departments.orgId, orgId!))).filter((d) => d.name === 'Doomed')).toHaveLength(0);
  });
});