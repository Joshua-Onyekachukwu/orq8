/**
 * ORQ8 Agent Context Pipeline
 *
 * Builds the full context that agents receive before executing tasks.
 *
 * Context hierarchy:
 *   Constitution (company values/rules) →
 *   Company Memory (learned facts/decisions) →
 *   Active Goals (what we're working toward) →
 *   Current Tasks (what's been assigned) →
 *   Agent Role & Permissions (what they can do) →
 *   Task-Specific Context (what this task needs)
 *
 * Design principle: Send ONLY relevant context. Don't dump the entire database.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import {
  agents,
  goals,
  tasks,
  companyMemory,
  activityEvents,
  approvals,
  type Db,
} from '@orq8/db';

export interface AgentContext {
  /** Company constitution / values */
  constitution: string;
  /** Relevant company memory entries */
  memory: Array<{ content: string; category: string; importance: number }>;
  /** Agent's own memory — lessons, patterns, preferences learned over time */
  agentMemory: Array<{ content: string; category: string; importance: number }>;
  /** Active goals the agent should be aware of */
  goals: Array<{ id: string; title: string; status: string; priority: string; progress: number }>;
  /** Recent tasks for this agent */
  recentTasks: Array<{ id: string; title: string; status: string; result?: string }>;
  /** Pending approvals */
  pendingApprovals: number;
  /** Agent's authority profile */
  authority: Record<string, unknown>;
  /** Agent's department info */
  department: { name: string; description?: string } | null;
  /** Recent activity for this agent */
  recentActivity: Array<{ summary: string; type: string; occurredAt: Date }>;
}

/**
 * Build full context for an agent executing a task.
 *
 * @param db - Database connection
 * @param orgId - Organization ID
 * @param agentId - Agent ID
 * @param taskId - Optional specific task ID for task-specific context
 */
export async function buildAgentContext(
  db: Db,
  orgId: string,
  agentId: string,
  taskId?: string,
): Promise<AgentContext> {
  // 8. Get agent-specific memory (lessons, patterns, preferences)
  const agentMemoryEntries = await db
    .select()
    .from(companyMemory)
    .where(and(
      eq(companyMemory.orgId, orgId),
      eq(companyMemory.agentId, agentId),
      eq(companyMemory.source, 'agent_memory'),
    ))
    .orderBy(desc(companyMemory.importance), desc(companyMemory.createdAt))
    .limit(10);

  const [
    agent,
    orgGoals,
    agentTasks,
    recentActivity,
    pendingApprovals,
    memoryEntries,
    constitutionEntries,
  ] = await Promise.all([
    // 1. Get agent details with authority
    db.select().from(agents).where(eq(agents.id, agentId)).limit(1),

    // 2. Get active goals (most important first)
    db.select().from(goals)
      .where(eq(goals.orgId, orgId))
      .orderBy(desc(goals.priority), desc(goals.createdAt))
      .limit(5),

    // 3. Get this agent's recent tasks
    db.select().from(tasks)
      .where(eq(tasks.agentId, agentId))
      .orderBy(desc(tasks.createdAt))
      .limit(10),

    // 4. Get recent activity for this agent
    db.select({
      summary: activityEvents.summary,
      type: activityEvents.type,
      occurredAt: activityEvents.occurredAt,
    }).from(activityEvents)
      .where(eq(activityEvents.agentId, agentId))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(5),

    // 5. Count pending approvals
    db.select({ count: sql<number>`count(*)::int` }).from(approvals)
      .where(and(eq(approvals.orgId, orgId), eq(approvals.status, 'pending'))),

    // 6. Get relevant memory (high importance, recent)
    db.select().from(companyMemory)
      .where(eq(companyMemory.orgId, orgId))
      .orderBy(desc(companyMemory.importance), desc(companyMemory.createdAt))
      .limit(15),

    // 7. Get constitution entries (company rules/values)
    db.select().from(companyMemory)
      .where(and(eq(companyMemory.orgId, orgId), eq(companyMemory.category, 'workflow')))
      .orderBy(desc(companyMemory.importance))
      .limit(5),
  ]);

  const agentData = agent[0];
  const authority = (agentData?.authority as Record<string, unknown>) ?? {};

  return {
    constitution: constitutionEntries.map(e => e.content).join('\n') || 'No company constitution set.',
    memory: memoryEntries.map(e => ({
      content: e.content,
      category: e.category,
      importance: e.importance,
    })),
    agentMemory: agentMemoryEntries.map(e => ({
      content: e.content.replace(/^\[tags:[^\]]+\]\s*/, ''),
      category: e.category,
      importance: e.importance,
    })),
    goals: orgGoals.map(g => ({
      id: g.id,
      title: g.title,
      status: g.status,
      priority: g.priority,
      progress: g.progress,
    })),
    recentTasks: agentTasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      result: t.result ?? undefined,
    })),
    pendingApprovals: pendingApprovals[0]?.count ?? 0,
    authority,
    department: agentData?.department ? { name: agentData.department } : null,
    recentActivity: recentActivity.map(a => ({
      summary: a.summary,
      type: a.type,
      occurredAt: a.occurredAt,
    })),
  };
}

/**
 * Build the context prompt for the LLM from the agent context.
 * This is what agents actually see before executing.
 */
export function buildContextPrompt(
  ctx: AgentContext,
  agentName: string,
  agentRole: string,
): string {
  const parts: string[] = [];

  // Constitution
  if (ctx.constitution && ctx.constitution !== 'No company constitution set.') {
    parts.push(`## Company Values & Rules\n${ctx.constitution}`);
  }

  // Goals
  if (ctx.goals.length > 0) {
    const goalList = ctx.goals
      .map(g => `- [${g.status}] ${g.title} (${g.priority}, ${g.progress}% complete)`)
      .join('\n');
    parts.push(`## Active Goals\n${goalList}`);
  }

  // Recent tasks
  if (ctx.recentTasks.length > 0) {
    const taskList = ctx.recentTasks
      .map(t => `- [${t.status}] ${t.title}${t.result ? ` — Result: ${t.result.slice(0, 100)}` : ''}`)
      .join('\n');
    parts.push(`## Your Recent Tasks\n${taskList}`);
  }

  // Relevant memory
  if (ctx.memory.length > 0) {
    const memList = ctx.memory
      .map(m => `- [${m.category}/${m.importance}] ${m.content.slice(0, 200)}`)
      .join('\n');
    parts.push(`## Company Memory\n${memList}`);
  }

  // Agent's own memory — lessons, patterns, preferences
  if (ctx.agentMemory.length > 0) {
    const agentMemList = ctx.agentMemory
      .map(m => `- [${m.category}] ${m.content.slice(0, 200)}`)
      .join('\n');
    parts.push(`## Your Learned Knowledge\n${agentMemList}`);
  }

  // Pending approvals
  if (ctx.pendingApprovals > 0) {
    parts.push(`## Pending Approvals: ${ctx.pendingApprovals}\nSome actions are waiting for founder approval.`);
  }

  // Department
  if (ctx.department) {
    parts.push(`## Your Department\n${ctx.department.name}`);
  }

  // Authority
  const canExecute = ctx.authority.canExecuteTasks !== false;
  const canCommunicate = ctx.authority.canCommunicateExternally === true;
  const canModify = ctx.authority.canModifyResources === true;

  parts.push(`## Your Permissions\n- Execute tasks: ${canExecute ? 'Yes' : 'No'}\n- External communications: ${canCommunicate ? 'Yes' : 'No (requires approval)'}\n- Modify resources: ${canModify ? 'Yes' : 'No (requires approval)'}`);

  // Recent activity
  if (ctx.recentActivity.length > 0) {
    const actList = ctx.recentActivity
      .map(a => `- [${a.type}] ${a.summary}`)
      .join('\n');
    parts.push(`## Recent Activity\n${actList}`);
  }

  return parts.join('\n\n');
}
