/**
 * ORQ8 AI Workforce ROI Service
 *
 * Calculates the economic value of the AI workforce using real data from
 * tasks, agents, activity_events, and departments. Answers the founder's
 * most important question: "Why am I paying for this?"
 *
 * All calculations are evidence-based — no fabricated metrics.
 * Estimated hours saved uses configurable human-time baselines per task type.
 */

import { eq, and, desc, sql, gte, lte, count } from 'drizzle-orm';
import {
  tasks, agents, activityEvents, departments, organizations,
  type Db,
} from '@orq8/db';

// ── Types ───────────────────────────────────────────────────────────────────

export interface HourlyRateConfig {
  hourlyRate: number; // dollars per hour (default 75)
  currency: string;   // USD
}

export interface AgentROI {
  agentId: string;
  agentName: string;
  role: string;
  departmentName: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  successRate: number;
  estimatedHoursSaved: number;
  estimatedCostSaved: number;
  activityCount: number;
  creditsUsed: number;
}

export interface DepartmentROI {
  departmentId: string | null;
  departmentName: string;
  agentCount: number;
  tasksCompleted: number;
  estimatedHoursSaved: number;
  estimatedCostSaved: number;
  agentROIs: AgentROI[];
}

export interface WeeklyTrend {
  weekStart: string;
  tasksCompleted: number;
  estimatedHoursSaved: number;
  estimatedCostSaved: number;
  activityCount: number;
}

export interface WorkforceROISummary {
  hourlyRate: number;
  totalAgents: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  overallSuccessRate: number;
  totalEstimatedHoursSaved: number;
  totalEstimatedCostSaved: number;
  totalActivityEvents: number;
  founderTimeReclaimed: number; // hours of orchestration handled by EA
  aiCostPerTask: number;
  humanCostPerTask: number;
  roiMultiplier: number;
  perAgentROI: AgentROI[];
  departmentROI: DepartmentROI[];
  weeklyTrend: WeeklyTrend[];
  monthlyTrend: WeeklyTrend[];
}

// ── Human time estimates (hours per task by category) ───────────────────────

/**
 * Estimated hours a human employee would take for similar work.
 * These are conservative estimates based on typical professional rates.
 */
const HUMAN_TIME_ESTIMATES: Record<string, number> = {
  // Task categories → estimated human hours
  research: 3,
  analysis: 2.5,
  write: 2,
  draft: 1.5,
  review: 1,
  code: 4,
  deploy: 2,
  design: 3,
  communicate: 0.5,
  plan: 1.5,
  manage: 1,
  report: 1.5,
  analyze: 2,
  execute: 2,
  unknown: 1.5, // default
};

/**
 * Map activity event types to human time estimates.
 */
const ACTIVITY_TIME_ESTIMATES: Record<string, number> = {
  analyzed: 2,
  drafted: 1.5,
  reviewed: 1,
  deployed: 2,
  approved: 0.5,
  rejected: 0.25,
  filed: 0.5,
  created: 1,
  updated: 0.5,
  executed: 2,
  completed: 1,
  failed: 0.25,
};

function estimateHumanHours(taskTitle: string, taskResult: string | null): number {
  const combined = `${taskTitle} ${taskResult ?? ''}`.toLowerCase();

  // Match against known categories
  for (const [category, hours] of Object.entries(HUMAN_TIME_ESTIMATES)) {
    if (combined.includes(category)) return hours;
  }

  // Estimate based on result length (longer results = more complex work)
  const resultLength = (taskResult ?? '').length;
  if (resultLength > 2000) return 4;
  if (resultLength > 500) return 2.5;
  if (resultLength > 100) return 1.5;
  return 1;
}

function estimateActivityHours(activityType: string): number {
  return ACTIVITY_TIME_ESTIMATES[activityType] ?? 1;
}

// ── Main Calculation ────────────────────────────────────────────────────────

export async function calculateWorkforceROI(
  db: Db,
  orgId: string,
  hourlyRate: number = 75,
): Promise<WorkforceROISummary> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ── Fetch all data in parallel ──────────────────────────────────────────
  const [allAgents, allTasks, allActivities, allDepts] = await Promise.all([
    db.select().from(agents).where(eq(agents.orgId, orgId)),
    db.select().from(tasks).where(eq(tasks.orgId, orgId)),
    db.select().from(activityEvents)
      .where(and(eq(activityEvents.orgId, orgId), gte(activityEvents.occurredAt, thirtyDaysAgo)))
      .orderBy(desc(activityEvents.occurredAt)),
    db.select().from(departments).where(eq(departments.orgId, orgId)),
  ]);

  const deptMap = new Map(allDepts.map(d => [d.id, d.name]));

  // ── Per-Agent ROI ──────────────────────────────────────────────────────
  const agentTasks = new Map<string, typeof allTasks>();
  for (const task of allTasks) {
    const aid = task.agentId ?? '__unassigned';
    if (!agentTasks.has(aid)) agentTasks.set(aid, []);
    agentTasks.get(aid)!.push(task);
  }

  const agentActivities = new Map<string, typeof allActivities>();
  for (const act of allActivities) {
    const aid = act.agentId ?? '__system';
    if (!agentActivities.has(aid)) agentActivities.set(aid, []);
    agentActivities.get(aid)!.push(act);
  }

  const perAgentROI: AgentROI[] = allAgents.map(agent => {
    const agentTaskList = agentTasks.get(agent.id) ?? [];
    const completed = agentTaskList.filter(t => t.status === 'completed').length;
    const failed = agentTaskList.filter(t => t.status === 'failed').length;
    const total = completed + failed;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Estimate hours saved from tasks
    let hoursSaved = 0;
    for (const task of agentTaskList) {
      if (task.status === 'completed') {
        hoursSaved += estimateHumanHours(task.title, task.result);
      }
    }

    // Add activity-based hours
    const agentActList = agentActivities.get(agent.id) ?? [];
    for (const act of agentActList) {
      if (act.type === 'completed' || act.type === 'executed') {
        hoursSaved += estimateActivityHours(act.type);
      }
    }

    const costSaved = hoursSaved * hourlyRate;

    return {
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      departmentName: agent.departmentId ? (deptMap.get(agent.departmentId) ?? null) : null,
      tasksCompleted: completed,
      tasksFailed: failed,
      successRate,
      estimatedHoursSaved: Math.round(hoursSaved * 10) / 10,
      estimatedCostSaved: Math.round(costSaved),
      activityCount: agentActList.length,
      creditsUsed: agent.creditsUsed,
    };
  });

  // Sort by cost saved descending
  perAgentROI.sort((a, b) => b.estimatedCostSaved - a.estimatedCostSaved);

  // ── Department ROI ─────────────────────────────────────────────────────
  const deptAgents = new Map<string | null, AgentROI[]>();
  for (const aroi of perAgentROI) {
    const key = aroi.departmentName ?? '__unassigned';
    if (!deptAgents.has(key)) deptAgents.set(key, []);
    deptAgents.get(key)!.push(aroi);
  }

  const departmentROI: DepartmentROI[] = [];
  for (const [deptName, agentROIs] of deptAgents) {
    const isUnassigned = deptName === '__unassigned';
    departmentROI.push({
      departmentId: isUnassigned ? null : allDepts.find(d => d.name === deptName)?.id ?? null,
      departmentName: isUnassigned ? 'Unassigned' : (deptName ?? 'Unknown'),
      agentCount: agentROIs.length,
      tasksCompleted: agentROIs.reduce((sum, a) => sum + a.tasksCompleted, 0),
      estimatedHoursSaved: Math.round(agentROIs.reduce((sum, a) => sum + a.estimatedHoursSaved, 0) * 10) / 10,
      estimatedCostSaved: agentROIs.reduce((sum, a) => sum + a.estimatedCostSaved, 0),
      agentROIs,
    });
  }
  departmentROI.sort((a, b) => b.estimatedCostSaved - a.estimatedCostSaved);

  // ── Weekly Trend (last 8 weeks) ───────────────────────────────────────
  const weeklyTrend = calculateWeeklyTrend(allTasks, allActivities, hourlyRate, 8);

  // ── Monthly Trend (last 6 months) ─────────────────────────────────────
  const monthlyTrend = calculateMonthlyTrend(allTasks, allActivities, hourlyRate, 6);

  // ── Totals ─────────────────────────────────────────────────────────────
  const totalCompleted = perAgentROI.reduce((sum, a) => sum + a.tasksCompleted, 0);
  const totalFailed = perAgentROI.reduce((sum, a) => sum + a.tasksFailed, 0);
  const totalHours = perAgentROI.reduce((sum, a) => sum + a.estimatedHoursSaved, 0);
  const totalCost = perAgentROI.reduce((sum, a) => sum + a.estimatedCostSaved, 0);
  const totalActivity = perAgentROI.reduce((sum, a) => sum + a.activityCount, 0);
  const overallSuccess = (totalCompleted + totalFailed) > 0
    ? Math.round((totalCompleted / (totalCompleted + totalFailed)) * 100) : 0;

  // Founder time reclaimed = orchestration activities (approvals, planning, reports)
  const orchestrationTypes = ['approved', 'planned', 'reviewed', 'reported'];
  const orchestrationCount = allActivities.filter(a => orchestrationTypes.includes(a.type)).length;
  const founderTimeReclaimed = Math.round(orchestrationCount * 0.5 * 10) / 10; // 30 min each

  // Cost metrics
  const totalCredits = perAgentROI.reduce((sum, a) => sum + a.creditsUsed, 0);
  const aiCostPerTask = totalCompleted > 0 ? Math.round((totalCredits / totalCompleted) * 100) / 100 : 0;
  const humanCostPerTask = totalCompleted > 0 ? Math.round((totalHours / totalCompleted) * hourlyRate) : 0;
  const roiMultiplier = aiCostPerTask > 0 ? Math.round((humanCostPerTask / aiCostPerTask) * 10) / 10 : 0;

  return {
    hourlyRate,
    totalAgents: allAgents.length,
    totalTasksCompleted: totalCompleted,
    totalTasksFailed: totalFailed,
    overallSuccessRate: overallSuccess,
    totalEstimatedHoursSaved: Math.round(totalHours * 10) / 10,
    totalEstimatedCostSaved: Math.round(totalCost),
    totalActivityEvents: totalActivity,
    founderTimeReclaimed,
    aiCostPerTask,
    humanCostPerTask,
    roiMultiplier,
    perAgentROI,
    departmentROI,
    weeklyTrend,
    monthlyTrend,
  };
}

// ── Trend Calculations ──────────────────────────────────────────────────────

function calculateWeeklyTrend(
  allTasks: any[],
  allActivities: any[],
  hourlyRate: number,
  weeks: number,
): WeeklyTrend[] {
  const now = new Date();
  const trends: WeeklyTrend[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);

    const weekTasks = allTasks.filter(t => {
      const created = new Date(t.createdAt);
      return created >= weekStart && created < weekEnd && t.status === 'completed';
    });

    const weekActivities = allActivities.filter(a => {
      const occurred = new Date(a.occurredAt);
      return occurred >= weekStart && occurred < weekEnd;
    });

    let hoursSaved = 0;
    for (const task of weekTasks) {
      hoursSaved += estimateHumanHours(task.title, task.result);
    }
    for (const act of weekActivities) {
      if (act.type === 'completed' || act.type === 'executed') {
        hoursSaved += estimateActivityHours(act.type);
      }
    }

    trends.push({
      weekStart: weekStart.toISOString().split('T')[0] ?? weekStart.toISOString().slice(0, 10),
      tasksCompleted: weekTasks.length,
      estimatedHoursSaved: Math.round(hoursSaved * 10) / 10,
      estimatedCostSaved: Math.round(hoursSaved * hourlyRate),
      activityCount: weekActivities.length,
    });
  }

  return trends;
}

function calculateMonthlyTrend(
  allTasks: any[],
  allActivities: any[],
  hourlyRate: number,
  months: number,
): WeeklyTrend[] {
  const now = new Date();
  const trends: WeeklyTrend[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

    const monthTasks = allTasks.filter(t => {
      const created = new Date(t.createdAt);
      return created >= monthStart && created < monthEnd && t.status === 'completed';
    });

    const monthActivities = allActivities.filter(a => {
      const occurred = new Date(a.occurredAt);
      return occurred >= monthStart && occurred < monthEnd;
    });

    let hoursSaved = 0;
    for (const task of monthTasks) {
      hoursSaved += estimateHumanHours(task.title, task.result);
    }
    for (const act of monthActivities) {
      if (act.type === 'completed' || act.type === 'executed') {
        hoursSaved += estimateActivityHours(act.type);
      }
    }

    trends.push({
      weekStart: monthStart.toISOString().split('T')[0] ?? monthStart.toISOString().slice(0, 10),
      tasksCompleted: monthTasks.length,
      estimatedHoursSaved: Math.round(hoursSaved * 10) / 10,
      estimatedCostSaved: Math.round(hoursSaved * hourlyRate),
      activityCount: monthActivities.length,
    });
  }

  return trends;
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getHourlyRate(db: Db, orgId: string): Promise<HourlyRateConfig> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const roi = settings.roi as Record<string, unknown> | undefined;
  return {
    hourlyRate: typeof roi?.hourlyRate === 'number' ? roi.hourlyRate : 75,
    currency: 'USD',
  };
}

export async function setHourlyRate(db: Db, orgId: string, hourlyRate: number): Promise<void> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const settings = ((org?.settings ?? {}) as Record<string, unknown>);
  settings.roi = { ...((settings.roi as Record<string, unknown>) ?? {}), hourlyRate };
  await db
    .update(organizations)
    .set({ settings: settings as any })
    .where(eq(organizations.id, orgId));
}
