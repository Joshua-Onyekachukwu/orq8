/**
 * Workforce Engine — calculates organizational capacity, capability coverage,
 * and staffing health for departments and teams.
 *
 * This is the intelligence layer that answers:
 *   - What work needs to happen?
 *   - What capabilities are required?
 *   - Who can do it?
 *   - Does the current workforce have enough capacity?
 *   - Should we consolidate, reassign, automate, specialize, or hire?
 *
 * All calculations use real data from the database — no mock metrics.
 */

import { eq, and, sql, desc } from 'drizzle-orm';
import { departments, teams, agents, tasks, goals, type Db } from '@orq8/db';

// ─── Types ───────────────────────────────────────────────────────────────

export interface AgentWorkload {
  agentId: string;
  agentName: string;
  role: string;
  status: string;
  lifecycleState: string;
  departmentId: string | null;
  teamId: string | null;
  workloadHours: number;
  capacityHours: number;
  utilizationPct: number;
  activeTaskCount: number;
  capabilities: string[];
}

export interface DepartmentCoverage {
  departmentId: string;
  departmentName: string;
  description: string | null;
  mission: string | null;
  functions: string[];
  agentCount: number;
  activeAgentCount: number;
  totalCapacityHours: number;
  totalWorkloadHours: number;
  utilizationPct: number;
  coverageStatus: CoverageStatus;
  coveragePct: number;
  agents: AgentWorkload[];
  capabilityGap: string[];
  teamCount: number;
}

export interface TeamCoverage {
  teamId: string;
  teamName: string;
  departmentId: string | null;
  departmentName: string | null;
  mission: string | null;
  agentCount: number;
  activeAgentCount: number;
  totalCapacityHours: number;
  totalWorkloadHours: number;
  utilizationPct: number;
  coverageStatus: CoverageStatus;
  coveragePct: number;
  agents: AgentWorkload[];
  activeTaskCount: number;
  overdueTaskCount: number;
}

export type CoverageStatus =
  | 'healthy'          // ≥80% coverage, ≤90% utilization
  | 'near_capacity'    // 80-95% utilization
  | 'over_capacity'    // >95% utilization
  | 'understaffed'     // <60% of estimated need
  | 'severely_understaffed'  // <30%
  | 'unstaffed'        // 0 agents
  | 'overstaffed';     // >130% of estimated need

export interface OrgWorkforceSummary {
  totalAgents: number;
  activeAgents: number;
  totalDepartments: number;
  totalTeams: number;
  avgUtilization: number;
  departments: DepartmentCoverage[];
  unassignedAgents: AgentWorkload[];
  bloatWarning: string | null;
}

// ─── Capacity estimation ─────────────────────────────────────────────────

/** Estimated hours/week an agent can meaningfully execute tasks. */
const DEFAULT_AGENT_CAPACITY_HOURS = 40;

/** Weighted task complexity factors. */
const TASK_COMPLEXITY_HOURS: Record<string, number> = {
  low: 2,
  normal: 4,
  high: 8,
  urgent: 6,
};

function estimateTaskHours(task: { priority: string; status: string }): number {
  if (task.status === 'completed' || task.status === 'cancelled') return 0;
  return TASK_COMPLEXITY_HOURS[task.priority] ?? 4;
}

// ─── Workload calculation ────────────────────────────────────────────────

async function getAgentWorkloads(
  db: Db,
  orgId: string,
): Promise<AgentWorkload[]> {
  // Get all agents for the org
  const orgAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.orgId, orgId))
    .orderBy(desc(agents.tasksCompleted));

  // Get active task counts per agent
  const taskCounts = await db
    .select({
      agentId: tasks.agentId,
      count: sql<number>`count(*)::int`,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), sql`${tasks.status} not in ('completed','cancelled')`))
    .groupBy(tasks.agentId, tasks.priority);

  // Build agent task maps
  const tasksByAgent = new Map<string, { count: number; hours: number }>();
  for (const tc of taskCounts) {
    if (!tc.agentId) continue;
    const existing = tasksByAgent.get(tc.agentId) ?? { count: 0, hours: 0 };
    existing.count += tc.count;
    existing.hours += tc.count * estimateTaskHours({ priority: tc.priority, status: 'in_progress' });
    tasksByAgent.set(tc.agentId, existing);
  }

  return orgAgents.map((agent) => {
    const taskInfo = tasksByAgent.get(agent.id) ?? { count: 0, hours: 0 };
    const capacityHours = (agent as any).capacityHours ?? DEFAULT_AGENT_CAPACITY_HOURS;
    const workloadHours = (agent as any).workloadHours ?? taskInfo.hours;
    const utilization = capacityHours > 0 ? Math.min((workloadHours / capacityHours) * 100, 100) : 0;

    return {
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      status: agent.status,
      lifecycleState: (agent as any).lifecycleState ?? agent.status,
      departmentId: agent.departmentId,
      teamId: agent.teamId,
      workloadHours,
      capacityHours,
      utilizationPct: Math.round(utilization),
      activeTaskCount: taskInfo.count,
      capabilities: (agent.capabilities as string[]) ?? [],
    };
  });
}

// ─── Coverage status determination ───────────────────────────────────────

function determineCoverageStatus(
  agentCount: number,
  utilizationPct: number,
): CoverageStatus {
  if (agentCount === 0) return 'unstaffed';
  if (utilizationPct > 95) return 'over_capacity';
  if (utilizationPct > 80) return 'near_capacity';
  return 'healthy';
}

function coveragePctFromStatus(status: CoverageStatus, utilizationPct: number): number {
  switch (status) {
    case 'unstaffed': return 0;
    case 'severely_understaffed': return 20;
    case 'understaffed': return 45;
    case 'near_capacity': return 85;
    case 'over_capacity': return 100;
    case 'healthy': return Math.max(80, Math.min(100, utilizationPct + 15));
    case 'overstaffed': return 100;
    default: return 50;
  }
}

// ─── Department coverage ─────────────────────────────────────────────────

export async function calculateDepartmentCoverage(
  db: Db,
  orgId: string,
): Promise<DepartmentCoverage[]> {
  const orgDepartments = await db
    .select()
    .from(departments)
    .where(and(eq(departments.orgId, orgId), eq(departments.status, 'active')));

  const orgTeams = await db
    .select()
    .from(teams)
    .where(and(eq(teams.orgId, orgId), eq(teams.status, 'active')));

  const agentWorkloads = await getAgentWorkloads(db, orgId);

  // Get active task counts per department (via agent -> dept)
  const deptTaskCounts = await db
    .select({
      departmentId: agents.departmentId,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .innerJoin(agents, eq(tasks.agentId, agents.id))
    .where(and(eq(tasks.orgId, orgId), sql`${tasks.status} not in ('completed','cancelled')`))
    .groupBy(agents.departmentId);

  const deptTaskMap = new Map(deptTaskCounts.map((r) => [r.departmentId ?? '__none__', r.count]));

  // Also count tasks on unassigned agents
  const unassignedTaskCount = deptTaskMap.get('__none__') ?? 0;

  return orgDepartments.map((dept) => {
    const deptAgents = agentWorkloads.filter((a) => a.departmentId === dept.id);
    const activeAgents = deptAgents.filter((a) => a.status === 'active');
    const deptTeams = orgTeams.filter((t) => t.departmentId === dept.id);

    const totalCapacity = activeAgents.reduce((sum, a) => sum + a.capacityHours, 0);
    const totalWorkload = activeAgents.reduce((sum, a) => sum + a.workloadHours, 0);
    const utilization = totalCapacity > 0 ? Math.round((totalWorkload / totalCapacity) * 100) : 0;

    const coverageStatus = determineCoverageStatus(activeAgents.length, utilization);
    const coveragePct = coveragePctFromStatus(coverageStatus, utilization);

    // Capability gap: functions listed on the department but not covered by any agent
    const deptFunctions = ((dept as any).functions as string[]) ?? [];
    const allCapabilities = new Set(activeAgents.flatMap((a) => a.capabilities));
    const capabilityGap = deptFunctions.filter((f) => !allCapabilities.has(f) && !allCapabilities.has(f.replace(/_/g, '-')));

    return {
      departmentId: dept.id,
      departmentName: dept.name,
      description: dept.description,
      mission: (dept as any).mission ?? null,
      functions: deptFunctions,
      agentCount: deptAgents.length,
      activeAgentCount: activeAgents.length,
      totalCapacityHours: totalCapacity,
      totalWorkloadHours: totalWorkload,
      utilizationPct: utilization,
      coverageStatus,
      coveragePct,
      agents: deptAgents,
      capabilityGap,
      teamCount: deptTeams.length,
    };
  });
}

// ─── Team coverage ───────────────────────────────────────────────────────

export async function calculateTeamCoverage(
  db: Db,
  orgId: string,
): Promise<TeamCoverage[]> {
  const orgTeams = await db
    .select()
    .from(teams)
    .where(and(eq(teams.orgId, orgId), eq(teams.status, 'active')));

  const agentWorkloads = await getAgentWorkloads(db, orgId);

  // Get active + overdue tasks per team
  const teamTaskCounts = await db
    .select({
      teamId: tasks.teamId,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), sql`${tasks.status} not in ('completed','cancelled')`))
    .groupBy(tasks.teamId);

  const teamOverdueCounts = await db
    .select({
      teamId: tasks.teamId,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        sql`${tasks.status} not in ('completed','cancelled')`,
        sql`${tasks.dueDate} is not null and ${tasks.dueDate} < now()`,
      ),
    )
    .groupBy(tasks.teamId);

  const teamTaskMap = new Map(teamTaskCounts.map((r) => [r.teamId ?? '__none__', r.count]));
  const teamOverdueMap = new Map(teamOverdueCounts.map((r) => [r.teamId ?? '__none__', r.count]));

  // Get department names for reference
  const deptNames = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.orgId, orgId));

  const deptNameMap = new Map(deptNames.map((d) => [d.id, d.name]));

  return orgTeams.map((team) => {
    const teamAgents = agentWorkloads.filter((a) => a.teamId === team.id);
    const activeAgents = teamAgents.filter((a) => a.status === 'active');

    const totalCapacity = activeAgents.reduce((sum, a) => sum + a.capacityHours, 0);
    const totalWorkload = activeAgents.reduce((sum, a) => sum + a.workloadHours, 0);
    const utilization = totalCapacity > 0 ? Math.round((totalWorkload / totalCapacity) * 100) : 0;

    const coverageStatus = determineCoverageStatus(activeAgents.length, utilization);
    const coveragePct = coveragePctFromStatus(coverageStatus, utilization);

    return {
      teamId: team.id,
      teamName: team.name,
      departmentId: team.departmentId,
      departmentName: team.departmentId ? (deptNameMap.get(team.departmentId) ?? null) : null,
      mission: (team as any).mission ?? null,
      agentCount: teamAgents.length,
      activeAgentCount: activeAgents.length,
      totalCapacityHours: totalCapacity,
      totalWorkloadHours: totalWorkload,
      utilizationPct: utilization,
      coverageStatus,
      coveragePct,
      agents: teamAgents,
      activeTaskCount: teamTaskMap.get(team.id) ?? 0,
      overdueTaskCount: teamOverdueMap.get(team.id) ?? 0,
    };
  });
}

// ─── Org-wide summary ────────────────────────────────────────────────────

export async function calculateOrgWorkforceSummary(
  db: Db,
  orgId: string,
): Promise<OrgWorkforceSummary> {
  const departments = await calculateDepartmentCoverage(db, orgId);
  const agentWorkloads = await getAgentWorkloads(db, orgId);

  const activeAgents = agentWorkloads.filter((a) => a.status === 'active');
  const unassigned = agentWorkloads.filter((a) => !a.departmentId);

  const totalCapacity = agentWorkloads.reduce((sum, a) => sum + a.capacityHours, 0);
  const totalWorkload = agentWorkloads.reduce((sum, a) => sum + a.workloadHours, 0);
  const avgUtilization = totalCapacity > 0 ? Math.round((totalWorkload / totalCapacity) * 100) : 0;

  // Bloat detection: many departments but few agents
  const totalTeams = departments.reduce((sum, d) => sum + d.teamCount, 0);
  let bloatWarning: string | null = null;
  if (departments.length > 3 && activeAgents.length > 0 && departments.length > activeAgents.length * 2) {
    bloatWarning = `Your organization has ${departments.length} departments but only ${activeAgents.length} active AI employee${activeAgents.length !== 1 ? 's' : ''}. Consider consolidating departments or assigning existing agents across departments.`;
  }

  return {
    totalAgents: agentWorkloads.length,
    activeAgents: activeAgents.length,
    totalDepartments: departments.length,
    totalTeams,
    avgUtilization,
    departments,
    unassignedAgents: unassigned,
    bloatWarning,
  };
}
