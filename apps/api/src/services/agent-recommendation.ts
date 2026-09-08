/**
 * Agent Recommendation Engine
 *
 * Answers "Who should handle this?" and "What should I do next?" using
 * real organizational data: capabilities, utilization, performance, and goals.
 */

import { eq, and, sql, asc, desc } from 'drizzle-orm';
import {
  type Db,
  agents,
  departments,
  teams,
  tasks,
  goals,
  activityEvents,
} from '@orq8/db';

// ─── Types ────────────────────────────────────────────────────────────────

export interface AgentRecommendation {
  agentId: string;
  name: string;
  role: string;
  departmentName: string | null;
  score: number;
  reasons: string[];
  capabilities: string[];
  utilization: number; // 0-100
  performanceScore: number;
  availableCapacity: number;
}

export interface PriorityAction {
  type: 'task' | 'goal' | 'decision' | 'risk' | 'opportunity';
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  urgency: number; // 0-100
  impact: number; // 0-100
  effort: number; // 0-100
  suggestedAgent?: string;
  suggestedAction: string;
  evidence: string[];
}

// ─── "Who should handle this?" ────────────────────────────────────────────

/**
 * Recommend agents for a given task description.
 * Scores agents based on capability match, utilization, and performance.
 */
export async function recommendAgents(
  db: Db,
  orgId: string,
  taskDescription: string,
  limit: number = 5,
): Promise<AgentRecommendation[]> {
  const descLower = taskDescription.toLowerCase();

  // Get all active agents with their department info
  const allAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
      capabilities: agents.capabilities,
      status: agents.status,
      tasksCompleted: agents.tasksCompleted,
      tasksFailed: agents.tasksFailed,
      departmentId: agents.departmentId,
      teamId: agents.teamId,
      orgId: agents.orgId,
    })
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.status, 'active')));

  // Get department names
  const deptMap = new Map<string, string>();
  const depts = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.orgId, orgId));
  for (const d of depts) deptMap.set(d.id, d.name);

  // Get task counts per agent (utilization)
  const agentTaskCounts = await db
    .select({
      agentId: tasks.agentId,
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${tasks.status} in ('pending','in_progress'))::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), sql`${tasks.agentId} is not null`))
    .groupBy(tasks.agentId);

  const taskCountMap = new Map<string, { total: number; active: number; completed: number; failed: number }>();
  for (const tc of agentTaskCounts) {
    taskCountMap.set(tc.agentId!, {
      total: tc.total,
      active: tc.active,
      completed: tc.completed,
      failed: tc.failed,
    });
  }

  // Score each agent
  const recommendations: AgentRecommendation[] = [];

  for (const agent of allAgents) {
    const caps = (agent.capabilities as string[]) || [];
    const score = calculateMatchScore(descLower, agent.role, caps);
    if (score <= 0) continue;

    const tc = taskCountMap.get(agent.id) || { total: 0, active: 0, completed: 0, failed: 0 };
    const maxActiveTasks = 10; // Assume each agent can handle ~10 active tasks
    const utilization = Math.min(100, Math.round((tc.active / maxActiveTasks) * 100));
    const availableCapacity = Math.max(0, maxActiveTasks - tc.active);
    const perfScore = tc.total > 0
      ? Math.round((tc.completed / Math.max(1, tc.total)) * 100)
      : 75; // Default for agents with no tasks yet
    const successRate = tc.total > 0 ? (tc.completed / tc.total) * 100 : 80;

    // Final score: capability match + low utilization + high performance
    const finalScore = Math.round(
      score * 0.5 +
      (100 - utilization) * 0.25 +
      (perfScore * 0.15) +
      (successRate * 0.1)
    );

    const reasons: string[] = [];
    if (score > 50) reasons.push(`Strong capability match for "${taskDescription.slice(0, 40)}..."`);
    if (utilization < 50) reasons.push(`Available capacity (${utilization}% utilized)`);
    if (perfScore > 80) reasons.push(`High performance score (${perfScore})`);
    if (successRate > 90) reasons.push(`Excellent success rate (${Math.round(successRate)}%)`);
    if (tc.active === 0) reasons.push('No active tasks — fully available');

    recommendations.push({
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      departmentName: agent.departmentId ? deptMap.get(agent.departmentId) ?? null : null,
      score: finalScore,
      reasons,
      capabilities: caps,
      utilization,
      performanceScore: perfScore,
      availableCapacity,
    });
  }

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations.slice(0, limit);
}

/**
 * Calculate how well an agent's role and capabilities match a task description.
 * Returns 0-100.
 */
function calculateMatchScore(
  taskDesc: string,
  role: string,
  capabilities: string[],
): number {
  let score = 0;
  const roleLower = role.toLowerCase();

  // Direct role keyword match
  const roleKeywords = roleLower.split(/\s+/);
  for (const kw of roleKeywords) {
    if (kw.length > 2 && taskDesc.includes(kw)) score += 30;
  }

  // Capability match
  for (const cap of capabilities) {
    const capLower = cap.toLowerCase().replace(/[-_]/g, ' ');
    const capWords = capLower.split(/\s+/);
    for (const w of capWords) {
      if (w.length > 2 && taskDesc.includes(w)) score += 15;
    }
  }

  // Category heuristic matches
  const categoryMap: Record<string, string[]> = {
    engineering: ['build', 'code', 'deploy', 'fix', 'bug', 'test', 'api', 'database', 'server', 'frontend', 'backend', 'devops', 'infrastructure'],
    marketing: ['marketing', 'content', 'blog', 'seo', 'social', 'campaign', 'brand', 'copywriting', 'newsletter'],
    sales: ['sales', 'lead', 'deal', 'pipeline', 'prospect', 'demo', 'proposal', 'closing', 'outreach'],
    'customer-success': ['customer', 'support', 'onboard', 'retention', 'satisfaction', 'ticket', 'escalation'],
    finance: ['finance', 'budget', 'revenue', 'expense', 'forecast', 'accounting', 'financial'],
    operations: ['operations', 'workflow', 'process', 'coordinate', 'project', 'vendor', 'logistics'],
    product: ['product', 'feature', 'roadmap', 'user', 'design', 'ux', 'wireframe', 'spec'],
    data: ['data', 'analytics', 'dashboard', 'query', 'model', 'ml', 'machine learning', 'insight'],
  };

  for (const [cat, keywords] of Object.entries(categoryMap)) {
    if (roleLower.includes(cat) || capabilities.some(c => c.toLowerCase().includes(cat))) {
      for (const kw of keywords) {
        if (taskDesc.includes(kw)) score += 10;
      }
    }
  }

  return Math.min(100, score);
}

// ─── "What should I do next?" ─────────────────────────────────────────────

/**
 * Generate prioritized action recommendations based on current company state.
 */
export async function recommendPriorities(
  db: Db,
  orgId: string,
  limit: number = 10,
): Promise<PriorityAction[]> {
  const actions: PriorityAction[] = [];

  // 1. Overdue tasks
  const overdueTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      priority: tasks.priority,
      agentId: tasks.agentId,
      status: tasks.status,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        eq(tasks.status, 'in_progress'),
        sql`${tasks.updatedAt} < now() - interval '3 days'`,
      ),
    )
    .orderBy(asc(tasks.updatedAt))
    .limit(5);

  for (const t of overdueTasks) {
    actions.push({
      type: 'task',
      title: `Overdue: ${t.title}`,
      description: t.description || 'Task has been in progress for over 3 days without completion.',
      priority: t.priority === 'urgent' ? 'critical' : 'high',
      urgency: 85,
      impact: 60,
      effort: 30,
      suggestedAction: t.agentId ? 'Check agent progress and reassign if stuck' : 'Assign to an available agent',
      evidence: [`Task in progress for >3 days`, `Priority: ${t.priority}`],
    });
  }

  // 2. Unassigned high-priority tasks
  const unassignedTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.orgId, orgId),
        eq(tasks.status, 'pending'),
        sql`${tasks.agentId} is null`,
        sql`${tasks.priority} in ('high', 'urgent')`,
      ),
    )
    .limit(5);

  for (const t of unassignedTasks) {
    actions.push({
      type: 'task',
      title: `Unassigned: ${t.title}`,
      description: t.description || 'High-priority task waiting for assignment.',
      priority: t.priority === 'urgent' ? 'critical' : 'high',
      urgency: 75,
      impact: 70,
      effort: 10,
      suggestedAction: 'Assign to the most capable available agent',
      evidence: [`Priority: ${t.priority}`, 'No agent assigned'],
    });
  }

  // 3. Stalled goals (no recent progress)
  const stalledGoals = await db
    .select({
      id: goals.id,
      title: goals.title,
      description: goals.description,
      priority: goals.priority,
    })
    .from(goals)
    .where(
      and(
        eq(goals.orgId, orgId),
        eq(goals.status, 'active'),
        sql`${goals.updatedAt} < now() - interval '7 days'`,
      ),
    )
    .limit(3);

  for (const g of stalledGoals) {
    actions.push({
      type: 'goal',
      title: `Stalled goal: ${g.title}`,
      description: g.description || 'Goal has had no activity for over a week.',
      priority: 'high',
      urgency: 60,
      impact: 80,
      effort: 40,
      suggestedAction: 'Review progress, create tasks, or adjust the goal',
      evidence: ['No activity for >7 days', `Priority: ${g.priority}`],
    });
  }

  // 4. Failed tasks needing attention
  const failedTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      agentId: tasks.agentId,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.status, 'failed')))
    .orderBy(desc(tasks.updatedAt))
    .limit(3);

  for (const t of failedTasks) {
    actions.push({
      type: 'risk',
      title: `Failed task: ${t.title}`,
      description: t.description || 'Task failed and may need investigation or retry.',
      priority: 'medium',
      urgency: 50,
      impact: 50,
      effort: 20,
      suggestedAction: 'Review failure reason, fix root cause, and retry',
      evidence: ['Task status: failed'],
    });
  }

  // 5. Goals with no tasks (not being executed)
  const goalsWithoutTasks = await db
    .select({
      id: goals.id,
      title: goals.title,
      description: goals.description,
    })
    .from(goals)
    .where(and(eq(goals.orgId, orgId), eq(goals.status, 'active')))
    .limit(10);

  for (const g of goalsWithoutTasks) {
    const [taskCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.orgId, orgId), eq(tasks.goalId, g.id)));

    if ((taskCount?.count ?? 0) === 0) {
      actions.push({
        type: 'opportunity',
        title: `Goal needs tasks: ${g.title}`,
        description: g.description || 'Active goal has no tasks — work may not be starting.',
        priority: 'medium',
        urgency: 40,
        impact: 70,
        effort: 30,
        suggestedAction: 'Create tasks to break this goal into actionable work',
        evidence: ['0 tasks linked to this goal'],
      });
    }
  }

  // Sort by urgency * impact (highest first)
  actions.sort((a, b) => (b.urgency * b.impact) - (a.urgency * a.impact));

  return actions.slice(0, limit);
}

/**
 * Get summary text for EA context: who's available and what needs attention.
 */
export async function getWorkforceIntelligence(
  db: Db,
  orgId: string,
): Promise<string> {
  const [counts] = await db
    .select({
      totalAgents: sql<number>`count(*)::int`,
      activeAgents: sql<number>`count(*) filter (where ${agents.status} = 'active')::int`,
    })
    .from(agents)
    .where(eq(agents.orgId, orgId));

  const [taskStats] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${tasks.status} = 'pending')::int`,
      active: sql<number>`count(*) filter (where ${tasks.status} = 'in_progress')::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
    })
    .from(tasks)
    .where(eq(tasks.orgId, orgId));

  const [deptCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(departments)
    .where(and(eq(departments.orgId, orgId), eq(departments.status, 'active')));

  const lines: string[] = [];
  lines.push(`Organization: ${deptCount?.count ?? 0} departments, ${counts?.activeAgents ?? 0}/${counts?.totalAgents ?? 0} active agents`);
  lines.push(`Work: ${taskStats?.pending ?? 0} pending, ${taskStats?.active ?? 0} in progress, ${taskStats?.completed ?? 0} completed, ${taskStats?.failed ?? 0} failed`);

  if ((taskStats?.failed ?? 0) > 0) {
    lines.push(`⚠️ ${taskStats!.failed} task(s) have failed — may need attention`);
  }

  if ((taskStats?.pending ?? 0) > 5) {
    lines.push(`⚠️ ${taskStats!.pending} tasks are pending — consider assigning agents`);
  }

  return lines.join('\n');
}
