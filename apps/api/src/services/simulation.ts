import { eq, and, desc } from 'drizzle-orm';
import {
  simulations,
  analyticsEvents,
  type Db,
  type Simulation,
  type NewSimulation,
  type AnalyticsEvent,
  type NewAnalyticsEvent,
} from '@orq8/db';
import { appendAudit } from './audit.js';

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

export async function applySimulation(
  db: Db,
  orgId: string,
  simId: string,
  appliedBy: string,
): Promise<Simulation | undefined> {
  const sim = await getSimulation(db, orgId, simId);
  if (!sim) return undefined;
  if (sim.state !== 'proposed' && sim.state !== 'reviewed') {
    throw new Error(`Simulation is in state "${sim.state}" and cannot be applied`);
  }

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
  });

  return updated;
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
