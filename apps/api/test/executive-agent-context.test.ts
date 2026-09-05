import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, departments, teams, agents, goals, tasks } from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContext, formatOrgStructure, type OrgStructure, type OrgStructureTeam } from '../src/services/executive-agent.js';
import type { AppDeps } from '../src/types.js';

// ─── Pure formatter tests (no DB) ───────────────────────────────────────────

const sampleStructure: OrgStructure = {
  departments: [
    { id: 'd-eng', name: 'Engineering', status: 'active' },
    { id: 'd-mkt', name: 'Marketing', status: 'active' },
    { id: 'd-old', name: 'Legacy', status: 'archived' },
  ],
  teams: [
    {
      id: 't-platform',
      name: 'Platform',
      departmentId: 'd-eng',
      departmentName: 'Engineering',
      lead: 'Engineer Alpha',
      status: 'active',
      members: [
        { id: 'a1', name: 'Engineer Alpha', role: 'software_engineer', status: 'active', currentTask: 'Build auth' },
        { id: 'a2', name: 'Engineer Beta', role: 'software_engineer', status: 'paused', currentTask: null },
      ],
      work: { activeTasks: 3, blockedTasks: 1, overdueTasks: 2 },
    },
    {
      id: 't-orphan',
      name: 'Growth',
      departmentId: null,
      departmentName: null,
      lead: null,
      status: 'active',
      members: [],
      work: { activeTasks: 0, blockedTasks: 0, overdueTasks: 0 },
    },
  ],
  unassignedAgents: 1,
  counts: { departments: 3, teams: 2, agents: 3, activeAgents: 2 },
};

describe('formatOrgStructure', () => {
  it('renders a compact header with counts', () => {
    const block = formatOrgStructure(sampleStructure);
    expect(block).toContain('3 departments, 2 teams, 3 AI employees, 1 unassigned');
  });

  it('lists departments with team/member counts and skips archived', () => {
    const block = formatOrgStructure(sampleStructure);
    expect(block).toContain('Department: Engineering (1 teams, 2 members)');
    expect(block).toContain('Department: Marketing (0 teams, 0 members)');
    expect(block).not.toContain('Legacy');
  });

  it('shows team owner, members and work flags', () => {
    const block = formatOrgStructure(sampleStructure);
    expect(block).toContain('Team: Platform, owner: Engineer Alpha [3 active, BLOCKED: 1 failed, OVERDUE: 2]');
    expect(block).toContain('Engineer Alpha (software_engineer, active) — Build auth');
    expect(block).toContain('Engineer Beta (software_engineer, paused)');
  });

  it('flags teams without a department', () => {
    const block = formatOrgStructure(sampleStructure);
    expect(block).toContain('Teams without a department: Growth');
  });

  it('handles an empty org deterministically', () => {
    const empty: OrgStructure = {
      departments: [],
      teams: [],
      unassignedAgents: 0,
      counts: { departments: 0, teams: 0, agents: 0, activeAgents: 0 },
    };
    const block = formatOrgStructure(empty);
    expect(block).toContain('No teams exist yet');
  });

  it('the same input always renders the same output', () => {
    expect(formatOrgStructure(sampleStructure)).toBe(formatOrgStructure(structuredClone(sampleStructure)));
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

let orgA: string | undefined;
let orgB: string | undefined;
let teamPlatform: string | undefined;
let agentAlpha: string | undefined;

async function cleanupOrg(id: string): Promise<void> {
  await deps.db.delete(tasks).where(eq(tasks.orgId, id));
  await deps.db.delete(agents).where(eq(agents.orgId, id));
  await deps.db.delete(teams).where(eq(teams.orgId, id));
  await deps.db.delete(departments).where(eq(departments.orgId, id));
  await deps.db.delete(goals).where(eq(goals.orgId, id));
  await deps.db.delete(organizations).where(eq(organizations.id, id));
}

run('executive agent org-structure context', () => {
  beforeAll(async () => {
    const [orgARow] = await deps.db
      .insert(organizations)
      .values({ name: `exec-ctx-a-${randomUUID()}`, slug: `exec-ctx-a-${randomUUID()}` })
      .returning();
    orgA = orgARow!.id;
    const [orgBRow] = await deps.db
      .insert(organizations)
      .values({ name: `exec-ctx-b-${randomUUID()}`, slug: `exec-ctx-b-${randomUUID()}` })
      .returning();
    orgB = orgBRow!.id;

    const [dept] = await deps.db
      .insert(departments)
      .values({ orgId: orgA, name: 'Engineering', description: 'Builds things', status: 'active' })
      .returning();
    const [team] = await deps.db
      .insert(teams)
      .values({ orgId: orgA, departmentId: dept!.id, name: 'Platform', lead: 'Engineer Alpha', status: 'active' })
      .returning();
    teamPlatform = team!.id;
    const [alpha] = await deps.db
      .insert(agents)
      .values({
        orgId: orgA,
        name: 'Engineer Alpha',
        role: 'software_engineer',
        departmentId: dept!.id,
        teamId: team!.id,
        status: 'active',
        currentTask: 'Building auth',
      })
      .returning();
    agentAlpha = alpha!.id;

    // A task on the Platform team (active) and one overdue.
    await deps.db.insert(tasks).values({
      orgId: orgA,
      agentId: agentAlpha,
      teamId: teamPlatform,
      title: 'Active task',
      status: 'in_progress',
    });
    const overdue = new Date(Date.now() - 2 * 86400000);
    await deps.db.insert(tasks).values({
      orgId: orgA,
      agentId: agentAlpha,
      teamId: teamPlatform,
      title: 'Overdue task',
      status: 'pending',
      dueDate: overdue,
    });
    await deps.db.insert(tasks).values({
      orgId: orgA,
      agentId: agentAlpha,
      teamId: teamPlatform,
      title: 'Failed task',
      status: 'failed',
    });
    await deps.db.insert(tasks).values({
      orgId: orgA,
      agentId: agentAlpha,
      teamId: teamPlatform,
      title: 'Done task',
      status: 'completed',
    });

    // A decoy team in the OTHER org with an identically-named agent.
    await deps.db.insert(teams).values({ orgId: orgB, name: 'Platform', status: 'active' });
    await deps.db.insert(agents).values({ orgId: orgB, name: 'Engineer Alpha', role: 'software_engineer', status: 'active' });
  });

  afterAll(async () => {
    if (orgA) await cleanupOrg(orgA);
    if (orgB) await cleanupOrg(orgB);
    await deps.pool.end();
  });

  it('buildContext includes the full org structure for org A', async () => {
    const ctx = await buildContext(deps.db, orgA!);
    expect(ctx.orgStructure.departments.map((d) => d.name)).toContain('Engineering');
    expect(ctx.orgStructure.counts).toMatchObject({ departments: 1, teams: 1, agents: 1, activeAgents: 1 });

    const platform = ctx.orgStructure.teams.find((t: OrgStructureTeam) => t.name === 'Platform');
    expect(platform).toBeDefined();
    expect(platform!.departmentName).toBe('Engineering');
    expect(platform!.lead).toBe('Engineer Alpha');
    expect(platform!.members.map((m) => m.name)).toContain('Engineer Alpha');
    expect(platform!.members[0]!.currentTask).toBe('Building auth');
    expect(platform!.work).toEqual({ activeTasks: 2, blockedTasks: 1, overdueTasks: 1 });
  });

  it('the prompt includes the structure so the agent can answer ownership questions', async () => {
    const ctx = await buildContext(deps.db, orgA!);
    const block = formatOrgStructure(ctx.orgStructure);
    expect(block).toContain('Team: Platform, owner: Engineer Alpha [2 active, BLOCKED: 1 failed, OVERDUE: 1]');
    expect(block).toContain('Department: Engineering (1 teams, 1 members)');
  });

  it('org B never sees org A structure — identical names stay isolated', async () => {
    const ctxB = await buildContext(deps.db, orgB!);
    expect(ctxB.orgStructure.teams).toHaveLength(1);
    expect(ctxB.orgStructure.departments).toHaveLength(0);
    expect(ctxB.orgStructure.teams[0]!.departmentName).toBeNull();
    expect(ctxB.orgStructure.teams[0]!.members).toHaveLength(1);
    expect(ctxB.orgStructure.teams[0]!.members[0]!.name).toBe('Engineer Alpha');
    expect(ctxB.orgStructure.teams[0]!.work.activeTasks).toBe(0);
  });
});
