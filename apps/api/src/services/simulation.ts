import { randomUUID } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import {
  simulations,
  departments,
  teams,
  agents,
  goals,
  analyticsEvents,
  type Db,
  type Simulation,
  type NewSimulation,
  type AnalyticsEvent,
  type NewAnalyticsEvent,
} from '@orq8/db';
import { appendAudit } from './audit.js';
import { findByOrg as findApprovalsByOrg, createApproval } from './approvals.js';

// ─── Simulation Engine ───────────────────────────────────────────────────────

interface SimulationInput {
  name: string;
  objective?: string;
  changeDescription: string;
  proposedDepartments?: number;
  proposedAgents?: number;
  currentDepartments?: number;
  currentAgents?: number;
  currentTasksPerWeek?: number;
  proposedTasksPerWeek?: number;
  avgCreditsPerTask?: number;
}

interface SimulationResult {
  id: string;
  projectedWorkload: {
    currentTasksPerWeek: number;
    projectedTasksPerWeek: number;
    increasePercent: number;
  };
  projectedCost: {
    currentWeeklyCredits: number;
    projectedWeeklyCredits: number;
    increaseCents: number;
    monthlyProjectionCents: number;
  };
  projectedRisk: 'low' | 'medium' | 'high' | 'critical';
  bottlenecks: string[];
  metrics: Record<string, unknown>;
  recommendation: string;
}

export async function createSimulation(db: Db, orgId: string, data: NewSimulation): Promise<Simulation> {
  const rows = await db.insert(simulations).values({ ...data, orgId }).returning();
  const row = rows[0];
  if (!row) throw new Error('createSimulation returned no row');
  await appendAudit(db, {
    orgId,
    actorType: 'user',
    action: 'simulation.created',
    outcome: 'success',
  });
  return row;
}

export async function listSimulations(db: Db, orgId: string): Promise<Simulation[]> {
  return db
    .select()
    .from(simulations)
    .where(eq(simulations.orgId, orgId))
    .orderBy(desc(simulations.createdAt));
}

export async function getSimulation(db: Db, orgId: string, id: string): Promise<Simulation | undefined> {
  const rows = await db
    .select()
    .from(simulations)
    .where(and(eq(simulations.id, id), eq(simulations.orgId, orgId)))
    .limit(1);
  return rows[0];
}

export async function updateSimulation(
  db: Db,
  id: string,
  updates: Partial<Omit<Simulation, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>>,
): Promise<Simulation | undefined> {
  const rows = await db
    .update(simulations)
    .set({ ...updates, updatedAt: new Date() } as Partial<Simulation>)
    .where(eq(simulations.id, id))
    .returning();
  return rows[0];
}

export async function runSimulation(db: Db, orgId: string, simId: string, input: SimulationInput): Promise<SimulationResult> {
  const sim = await getSimulation(db, orgId, simId);
  if (!sim) throw new Error('Simulation not found');

  const currentAgents = input.currentAgents ?? 0;
  const proposedAgents = input.proposedAgents ?? currentAgents;
  const currentTasks = input.currentTasksPerWeek ?? 0;
  const proposedTasks = input.proposedTasksPerWeek ?? currentTasks;
  const avgCost = input.avgCreditsPerTask ?? 50; // cents default

  const increasePercent = currentTasks > 0 ? Math.round(((proposedTasks - currentTasks) / currentTasks) * 100) : 0;
  const currentWeekly = currentTasks * avgCost;
  const projectedWeekly = proposedTasks * avgCost;

  // Risk assessment heuristic
  let risk: 'low' | 'medium' | 'high' | 'critical' = 'low';
  const bottlenecks: string[] = [];

  if (increasePercent > 100) risk = 'high';
  if (increasePercent > 200) risk = 'critical';
  if (proposedAgents > currentAgents * 3) {
    risk = risk === 'critical' ? 'critical' : 'high';
    bottlenecks.push('Agent sprawl — proposed agent count is 3× current. Review necessity of each role.');
  }
  if (proposedTasks > currentTasks * 2 && proposedAgents <= currentAgents) {
    bottlenecks.push('Workload imbalance — task volume doubled but agent count unchanged. Existing agents may be overloaded.');
  }
  if (proposedAgents === 0 && proposedTasks > 0) {
    bottlenecks.push('No agents proposed but work exists — tasks will be unassigned.');
  }
  if (proposedAgents - currentAgents > 5) {
    bottlenecks.push('Large hiring spike — add agents incrementally and monitor cost impact.');
  }
  if (projectedWeekly > currentWeekly * 5) {
    risk = risk === 'critical' ? 'critical' : 'high';
    bottlenecks.push('Cost projection is 5× current spend. Review budget alignment.');
  }

  // Build recommendation
  const recommendation = buildRecommendation(input, { increasePercent, projectedWeekly, risk, bottlenecks });

  const result: SimulationResult = {
    id: sim.id,
    projectedWorkload: {
      currentTasksPerWeek: currentTasks,
      projectedTasksPerWeek: proposedTasks,
      increasePercent,
    },
    projectedCost: {
      currentWeeklyCredits: currentWeekly,
      projectedWeeklyCredits: projectedWeekly,
      increaseCents: projectedWeekly - currentWeekly,
      monthlyProjectionCents: projectedWeekly * 4,
    },
    projectedRisk: risk,
    bottlenecks,
    metrics: {
      currentAgents,
      proposedAgents,
      currentTasksPerWeek: currentTasks,
      proposedTasksPerWeek: proposedTasks,
      avgCreditsPerTask: avgCost,
      agentUtilization: currentTasks > 0 && currentAgents > 0
        ? Math.round((currentTasks / currentAgents) * 10) / 10
        : 0,
      projectedUtilization: proposedAgents > 0
        ? Math.round((proposedTasks / proposedAgents) * 10) / 10
        : 0,
    },
    recommendation,
  };

  // Persist results into the simulation record
  await updateSimulation(db, simId, {
    proposedDepartments: input.proposedDepartments ? [{ count: input.proposedDepartments }] : undefined,
    proposedAgents: input.proposedAgents ? [{ count: input.proposedAgents }] : undefined,
    projectedWorkload: result.projectedWorkload,
    projectedCost: result.projectedCost,
    projectedRisk: result.projectedRisk,
    bottlenecks: result.bottlenecks,
    metrics: result.metrics,
    recommendation: result.recommendation,
    state: 'proposed',
  });

  return result;
}

function buildRecommendation(
  input: SimulationInput,
  result: { increasePercent: number; projectedWeekly: number; risk: string; bottlenecks: string[] },
): string {
  const lines: string[] = [];
  lines.push(`Scenario: ${input.changeDescription}`);

  if (result.bottlenecks.length > 0) {
    lines.push('Bottlenecks identified:');
    for (const b of result.bottlenecks) {
      lines.push(`  • ${b}`);
    }
  }

  if (result.increasePercent > 50) {
    lines.push(`Workload increases ${result.increasePercent}%. Consider phasing the rollout rather than activating all at once.`);
  }

  if (result.projectedWeekly > 5000) {
    lines.push(`Projected weekly cost exceeds 5,000 credits. Review against your plan budget before activating.`);
  }

  lines.push(`Risk level: ${result.risk}. ${riskRecommendation(result.risk)}`);

  return lines.join('\n');
}

function riskRecommendation(risk: string): string {
  switch (risk) {
    case 'low':
      return 'Projected changes look manageable. Proceed with activation after review.';
    case 'medium':
      return 'Moderate risk detected. Review bottlenecks and consider a phased rollout.';
    case 'high':
      return 'Significant risk. We recommend activating in stages, monitoring cost and capacity weekly, and revisiting after each stage.';
    case 'critical':
      return 'Critical risk. Do not activate all proposed changes at once. Break into smaller phases and re-run simulation for each phase.';
    default:
      return '';
  }
}

// ─── Structured proposal + founder-approved apply (Task 5) ──────────────────

export interface ProposalAgent {
  name: string;
  role: string;
  reportsTo?: string;
  weeklyCost?: number;
  capabilities?: string[];
}

export interface ProposalTeam {
  name: string;
  description?: string;
  lead?: string;
  agents?: ProposalAgent[];
}

export interface ProposalDepartment {
  name: string;
  description?: string;
  head?: string;
  teams?: ProposalTeam[];
}

export interface OrgProposal {
  proposalId: string;
  createdAt: string;
  rationale: string;
  departments: ProposalDepartment[];
  goals?: { title: string; description?: string }[];
}

export type SimulationApplyResult =
  | { status: 'pending_approval'; approvalId: string; simulation: Simulation }
  | { status: 'rejected'; approvalId: string; simulation: Simulation }
  | { status: 'already_applied'; simulation: Simulation }
  | {
      status: 'applied';
      simulation: Simulation;
      created: { departments: number; teams: number; agents: number; goals: number };
    };

/**
 * Persist a structured organizational proposal onto a simulation. The proposal
 * becomes the contract that the founder approves before anything is created.
 * Amending an existing proposal preserves its proposalId for provenance.
 */
export async function saveProposal(
  db: Db,
  orgId: string,
  simId: string,
  input: Omit<OrgProposal, 'proposalId' | 'createdAt'>,
): Promise<OrgProposal> {
  const sim = await getSimulation(db, orgId, simId);
  if (!sim) throw new Error('Simulation not found');
  if (sim.state === 'applied') {
    throw new Error('Simulation is already applied — proposals cannot be amended');
  }

  const previous = (sim.proposal ?? null) as OrgProposal | null;
  const proposal: OrgProposal = {
    proposalId: previous?.proposalId ?? randomUUID(),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    rationale: input.rationale,
    departments: input.departments,
    goals: input.goals,
  };

  await updateSimulation(db, simId, {
    proposal: proposal as unknown as Record<string, unknown>,
    state: 'proposed',
  });

  await appendAudit(db, {
    orgId,
    actorType: 'user',
    action: 'simulation.proposal.saved',
    outcome: 'success',
    resultRef: JSON.stringify({ simulationId: simId, proposalId: proposal.proposalId, departments: proposal.departments.length }),
  });

  return proposal;
}

export function riskFromSimulation(sim: Simulation): 'low' | 'medium' | 'high' {
  switch (sim.projectedRisk) {
    case 'critical':
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    default:
      return 'low';
  }
}

export function buildApprovalDescription(sim: Simulation, proposal: OrgProposal): string {
  const deptCount = proposal.departments.length;
  const teamCount = proposal.departments.reduce((n, d) => n + (d.teams?.length ?? 0), 0);
  const agentCount = proposal.departments.reduce(
    (n, d) => n + (d.teams?.reduce((m, t) => m + (t.agents?.length ?? 0), 0) ?? 0),
    0,
  );
  const deptNames = proposal.departments.map((d) => d.name).join(', ');
  return (
    `Apply simulation "${sim.name}": create ${deptCount} department(s) (${deptNames}), ` +
    `${teamCount} team(s) and ${agentCount} AI employee(s). ` +
    `Rationale: ${proposal.rationale}. ` +
    `Risk: ${sim.projectedRisk ?? 'low'}.`
  );
}

async function findByName(db: Db, table: 'department' | 'team' | 'agent', orgId: string, name: string) {
  if (table === 'department') {
    const rows = await db.select().from(departments).where(and(eq(departments.orgId, orgId), eq(departments.name, name))).limit(1);
    return rows[0];
  }
  if (table === 'team') {
    const rows = await db.select().from(teams).where(and(eq(teams.orgId, orgId), eq(teams.name, name))).limit(1);
    return rows[0];
  }
  const rows = await db.select().from(agents).where(and(eq(agents.orgId, orgId), eq(agents.name, name))).limit(1);
  return rows[0];
}

/**
 * Materialize the approved proposal inside a single transaction. Idempotent:
 * entities that already exist (same org + name) are skipped, so a retried or
 * partially-failed apply never duplicates or orphans records. Every creation is
 * audited with its provenance (source simulation + proposal).
 */
async function materializeProposal(
  db: Db,
  orgId: string,
  sim: Simulation,
  proposal: OrgProposal,
  actorId: string,
): Promise<{ departments: number; teams: number; agents: number; goals: number }> {
  const created = { departments: 0, teams: 0, agents: 0, goals: 0 };

  await db.transaction(async (tx) => {
    const deptIds: Record<string, string> = {};

    for (const dept of proposal.departments) {
      let existing = await findByName(tx, 'department', orgId, dept.name);
      if (!existing) {
        existing = (
          await tx
            .insert(departments)
            .values({
              orgId,
              name: dept.name,
              description: dept.description ?? null,
              head: dept.head ?? null,
              status: 'active',
            })
            .returning()
        )[0];
        created.departments += 1;
        await appendAudit(tx, {
          orgId,
          actorType: 'user',
          actorId,
          action: 'simulation.apply.department_created',
          outcome: 'success',
          resultRef: JSON.stringify({ simulationId: sim.id, proposalId: proposal.proposalId, name: dept.name }),
        });
      }
      deptIds[dept.name] = existing!.id;

      for (const team of dept.teams ?? []) {
        let teamRow = await findByName(tx, 'team', orgId, team.name);
        if (!teamRow) {
          teamRow = (
            await tx
              .insert(teams)
              .values({
                orgId,
                departmentId: deptIds[dept.name],
                name: team.name,
                description: team.description ?? null,
                lead: team.lead ?? null,
                status: 'active',
              })
              .returning()
          )[0];
          created.teams += 1;
          await appendAudit(tx, {
            orgId,
            actorType: 'user',
            actorId,
            action: 'simulation.apply.team_created',
            outcome: 'success',
            resultRef: JSON.stringify({ simulationId: sim.id, proposalId: proposal.proposalId, department: dept.name, name: team.name }),
          });
        }
        const teamId = teamRow!.id;

        for (const agent of team.agents ?? []) {
          let agentRow = await findByName(tx, 'agent', orgId, agent.name);
          if (!agentRow) {
            agentRow = (
              await tx
                .insert(agents)
                .values({
                  orgId,
                  name: agent.name,
                  role: agent.role,
                  departmentId: deptIds[dept.name],
                  teamId,
                  status: 'active',
                  weeklyCost: agent.weeklyCost ?? 0,
                  capabilities: agent.capabilities ?? [],
                  // Provenance — never silently created; traceable to source.
                  config: {
                    sourceSimulationId: sim.id,
                    sourceProposalId: proposal.proposalId,
                    reportsTo: agent.reportsTo ?? null,
                  },
                })
                .returning()
            )[0];
            created.agents += 1;
            await appendAudit(tx, {
              orgId,
              actorType: 'user',
              actorId,
              action: 'simulation.apply.agent_created',
              outcome: 'success',
              resultRef: JSON.stringify({
                simulationId: sim.id,
                proposalId: proposal.proposalId,
                department: dept.name,
                team: team.name,
                name: agent.name,
                role: agent.role,
              }),
            });
          }
        }
      }
    }

    for (const goal of proposal.goals ?? []) {
      const rows = await tx.select().from(goals).where(and(eq(goals.orgId, orgId), eq(goals.title, goal.title))).limit(1);
      if (rows.length === 0) {
        await tx.insert(goals).values({ orgId, title: goal.title, description: goal.description ?? null, status: 'active' });
        created.goals += 1;
        await appendAudit(tx, {
          orgId,
          actorType: 'user',
          actorId,
          action: 'simulation.apply.goal_created',
          outcome: 'success',
          resultRef: JSON.stringify({ simulationId: sim.id, proposalId: proposal.proposalId, title: goal.title }),
        });
      }
    }
  });

  return created;
}

/**
 * Founder-approved simulation apply. Never materializes without an approved
 * approval record: the first call creates the pending approval (the gate), the
 * call after the founder approves materializes the proposal transactionally.
 * Idempotent — an already-applied simulation returns without re-creating.
 */
export async function applySimulation(
  db: Db,
  orgId: string,
  simId: string,
  appliedBy: string,
): Promise<SimulationApplyResult> {
  const sim = await getSimulation(db, orgId, simId);
  if (!sim) throw new Error('Simulation not found');
  if (sim.state === 'applied') {
    return { status: 'already_applied', simulation: sim };
  }
  if (sim.state !== 'proposed' && sim.state !== 'reviewed') {
    throw new Error(`Simulation is in state "${sim.state}" — create a proposal first`);
  }

  const proposal = (sim.proposal ?? null) as OrgProposal | null;
  if (!proposal || proposal.departments.length === 0) {
    throw new Error('Simulation has no structured proposal — submit one via the proposal endpoint first');
  }

  const actionKey = `simulation.apply:${simId}`;
  const existing = (await findApprovalsByOrg(db, orgId, { limit: 100 })).find((a) => a.action === actionKey);

  if (existing && existing.status === 'pending') {
    return { status: 'pending_approval', approvalId: existing.id, simulation: sim };
  }
  if (existing && existing.status === 'rejected') {
    return { status: 'rejected', approvalId: existing.id, simulation: sim };
  }
  if (existing && existing.status === 'approved') {
    const created = await materializeProposal(db, orgId, sim, proposal, appliedBy);
    const updated = await updateSimulation(db, simId, {
      state: 'applied',
      appliedAt: new Date(),
      appliedBy,
    });
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: appliedBy,
      action: 'simulation.applied',
      outcome: 'success',
      resultRef: JSON.stringify({ simulationId: simId, proposalId: proposal.proposalId, ...created }),
    });
    return { status: 'applied', simulation: updated!, created };
  }

  // No approval record yet → create the approval gate. Nothing is created.
  const approval = await createApproval(db, {
    orgId,
    agentId: null,
    action: actionKey,
    description: buildApprovalDescription(sim, proposal),
    cost: 0,
    riskLevel: riskFromSimulation(sim),
    status: 'pending',
  });

  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: appliedBy,
    action: 'simulation.apply.requested',
    outcome: 'success',
    resultRef: JSON.stringify({ simulationId: simId, approvalId: approval.id, proposalId: proposal.proposalId }),
  });

  return { status: 'pending_approval', approvalId: approval.id, simulation: sim };
}

// ─── Analytics Events (companion log) ────────────────────────────────────────

export async function logAnalyticsEvent(
  db: Db,
  data: NewAnalyticsEvent,
): Promise<AnalyticsEvent> {
  const rows = await db.insert(analyticsEvents).values(data).returning();
  return rows[0]!;
}

export async function listAnalyticsEvents(db: Db, orgId?: string, limit = 50): Promise<AnalyticsEvent[]> {
  const conditions = orgId ? [eq(analyticsEvents.orgId, orgId)] : [];
  return db
    .select()
    .from(analyticsEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(limit);
}
