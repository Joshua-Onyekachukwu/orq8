/**
 * ORQ8 Multi-Agent Collaboration
 *
 * Enables agents to delegate work to other agents, creating a real
 * organizational hierarchy where the Executive Agent coordinates and
 * individual agents execute specialized work.
 *
 * Flow:
 *   Executive Agent → delegates to Department Agent → assigns to Specialist →
 *   Specialist executes → reports back → Department Agent aggregates →
 *   Executive Agent receives final result
 */

import { eq, and, desc } from 'drizzle-orm';
import { agents, tasks, activityEvents, companyMemory, type Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import { broadcastToOrg } from './realtime.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DelegationRequest {
  orgId: string;
  /** The agent delegating the work */
  delegatingAgentId: string;
  /** The agent receiving the sub-task */
  targetAgentId: string;
  /** The parent task this is a sub-task of */
  parentTaskId: string;
  /** Sub-task title */
  title: string;
  /** Sub-task description */
  description: string;
  /** Priority */
  priority: 'low' | 'normal' | 'high' | 'urgent';
  /** Context the target agent needs */
  context?: string;
  /** Deadline */
  dueDate?: Date;
}

export interface DelegationResult {
  subTaskId: string;
  status: 'created' | 'rejected' | 'blocked';
  reason?: string;
}

export interface TaskHandoff {
  orgId: string;
  /** Task being handed off */
  taskId: string;
  /** Agent currently holding the task */
  fromAgentId: string;
  /** Agent receiving the task */
  toAgentId: string;
  /** Reason for handoff */
  reason: string;
  /** Context transfer notes */
  transferNotes?: string;
}

export interface AgentFeedback {
  orgId: string;
  agentId: string;
  taskId?: string;
  feedbackType: 'completion' | 'blocker' | 'question' | 'recommendation' | 'escalation';
  summary: string;
  details?: string;
  /** Suggested next action */
  suggestedAction?: string;
  /** Whether this needs founder attention */
  requiresFounderAttention: boolean;
}

// ─── Delegation ─────────────────────────────────────────────────────────────

/**
 * Delegate a sub-task from one agent to another.
 *
 * The delegating agent must:
 * 1. Be active
 * 2. Have canCreateTasks permission
 * 3. Not be delegating to itself
 * 4. The target agent must exist and be active
 */
export async function delegateTask(
  db: Db,
  request: DelegationRequest,
): Promise<DelegationResult> {
  // 1. Validate delegating agent
  const [delegatingAgent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, request.delegatingAgentId), eq(agents.orgId, request.orgId)))
    .limit(1);

  if (!delegatingAgent) {
    return { subTaskId: '', status: 'rejected', reason: 'Delegating agent not found' };
  }

  if (delegatingAgent.status !== 'active') {
    return { subTaskId: '', status: 'rejected', reason: 'Delegating agent is not active' };
  }

  const auth = delegatingAgent.authority as Record<string, unknown> | null;
  if (auth?.canCreateTasks === false) {
    return { subTaskId: '', status: 'rejected', reason: 'Agent does not have permission to create tasks' };
  }

  // 2. Validate target agent
  if (request.targetAgentId === request.delegatingAgentId) {
    return { subTaskId: '', status: 'rejected', reason: 'Agent cannot delegate to itself' };
  }

  const [targetAgent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, request.targetAgentId), eq(agents.orgId, request.orgId)))
    .limit(1);

  if (!targetAgent) {
    return { subTaskId: '', status: 'rejected', reason: 'Target agent not found' };
  }

  if (targetAgent.status !== 'active') {
    return { subTaskId: '', status: 'blocked', reason: 'Target agent is not active' };
  }

  // 3. Create the sub-task
  const description = [
    request.description,
    request.context ? `\n\nContext from ${delegatingAgent.name}:\n${request.context}` : '',
    `\n\nDelegated by: ${delegatingAgent.name} (${delegatingAgent.role})`,
    `\nParent task: ${request.parentTaskId}`,
  ].join('');

  const [subTask] = await db
    .insert(tasks)
    .values({
      orgId: request.orgId,
      agentId: request.targetAgentId,
      title: request.title,
      description,
      priority: request.priority,
      status: 'pending',
      cost: 0,
      dueDate: request.dueDate ?? null,
    })
    .returning();

  if (!subTask) {
    return { subTaskId: '', status: 'rejected', reason: 'Failed to create sub-task' };
  }

  // 4. Record activity
  await db.insert(activityEvents).values({
    orgId: request.orgId,
    agentId: request.delegatingAgentId,
    taskId: subTask.id,
    type: 'delegated',
    summary: `${delegatingAgent.name} delegated "${request.title}" to ${targetAgent.name}`,
    reason: `Agent-to-agent delegation: ${delegatingAgent.role} → ${targetAgent.role}`,
    cost: 0,
    department: null,
  }).catch(() => {});

  // 5. Notify both agents
  broadcastToOrg(request.orgId, {
    type: 'task.started',
    taskId: subTask.id,
    agentId: request.targetAgentId,
    agentName: targetAgent.name,
  });

  // 6. Audit
  await appendAudit(db, {
    orgId: request.orgId,
    actorType: 'agent',
    actorId: request.delegatingAgentId,
    action: 'agent.delegated',
    tool: 'multi_agent',
    cost: 0,
    outcome: 'success',
  }).catch(() => {});

  return { subTaskId: subTask.id, status: 'created' };
}

// ─── Task Handoff ───────────────────────────────────────────────────────────

/**
 * Hand off a task from one agent to another.
 * Used when an agent is blocked, paused, or the task is better suited for another agent.
 */
export async function handoffTask(
  db: Db,
  handoff: TaskHandoff,
): Promise<{ success: boolean; reason?: string }> {
  // 1. Validate the task exists and is assigned to the from agent
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, handoff.taskId), eq(tasks.orgId, handoff.orgId)))
    .limit(1);

  if (!task) {
    return { success: false, reason: 'Task not found' };
  }

  if (task.agentId !== handoff.fromAgentId) {
    return { success: false, reason: 'Task is not assigned to the from agent' };
  }

  if (task.status === 'completed' || task.status === 'cancelled') {
    return { success: false, reason: 'Cannot hand off a completed or cancelled task' };
  }

  // 2. Validate target agent
  const [targetAgent] = await db
    .select({ id: agents.id, name: agents.name, status: agents.status })
    .from(agents)
    .where(and(eq(agents.id, handoff.toAgentId), eq(agents.orgId, handoff.orgId)))
    .limit(1);

  if (!targetAgent) {
    return { success: false, reason: 'Target agent not found' };
  }

  if (targetAgent.status !== 'active') {
    return { success: false, reason: 'Target agent is not active' };
  }

  // 3. Transfer the task
  const newDescription = [
    task.description ?? '',
    `\n\n--- HANDOFF NOTES ---`,
    `Reason: ${handoff.reason}`,
    `From: ${handoff.fromAgentId}`,
    handoff.transferNotes ? `Transfer notes: ${handoff.transferNotes}` : '',
  ].join('\n');

  await db
    .update(tasks)
    .set({
      agentId: handoff.toAgentId,
      description: newDescription,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, handoff.taskId));

  // 4. Clear the from agent's current task
  await db
    .update(agents)
    .set({ currentTask: null, updatedAt: new Date() })
    .where(eq(agents.id, handoff.fromAgentId));

  // 5. Record activity
  const [fromAgent] = await db
    .select({ name: agents.name })
    .from(agents)
    .where(eq(agents.id, handoff.fromAgentId))
    .limit(1);

  await db.insert(activityEvents).values({
    orgId: handoff.orgId,
    agentId: handoff.toAgentId,
    taskId: handoff.taskId,
    type: 'handed_off',
    summary: `Task "${task.title}" handed off from ${fromAgent?.name ?? 'unknown'} to ${targetAgent.name}`,
    reason: handoff.reason,
    cost: 0,
    department: null,
  }).catch(() => {});

  // 6. Audit
  await appendAudit(db, {
    orgId: handoff.orgId,
    actorType: 'agent',
    actorId: handoff.fromAgentId,
    action: 'agent.handoff',
    tool: 'multi_agent',
    cost: 0,
    outcome: 'success',
  }).catch(() => {});

  return { success: true };
}

// ─── Agent Feedback ─────────────────────────────────────────────────────────

/**
 * Submit feedback from an agent to the Executive Agent / founder.
 * This is the reporting chain — agents report blockers, completions,
 * questions, and recommendations upward.
 */
export async function submitFeedback(
  db: Db,
  feedback: AgentFeedback,
): Promise<{ recorded: boolean; notificationId?: string }> {
  // 1. Get agent info
  const [agent] = await db
    .select({ name: agents.name, role: agents.role })
    .from(agents)
    .where(eq(agents.id, feedback.agentId))
    .limit(1);

  const agentName = agent?.name ?? 'Unknown Agent';
  const agentRole = agent?.role ?? 'unknown';

  // 2. Store as company memory (so Executive Agent can see it in context)
  const content = [
    `[${feedback.feedbackType.toUpperCase()}] ${agentName} (${agentRole}): ${feedback.summary}`,
    feedback.details ? `Details: ${feedback.details}` : '',
    feedback.suggestedAction ? `Suggested action: ${feedback.suggestedAction}` : '',
    feedback.requiresFounderAttention ? '⚠️ Requires founder attention' : '',
  ].filter(Boolean).join('\n');

  await db.insert(companyMemory).values({
    orgId: feedback.orgId,
    category: feedback.feedbackType === 'blocker' ? 'lesson' : 'context',
    content,
    source: agentName,
    agentId: feedback.agentId,
    taskId: feedback.taskId ?? null,
    importance: feedback.requiresFounderAttention ? 9 : feedback.feedbackType === 'blocker' ? 8 : 5,
  }).catch(() => {});

  // 3. Record activity event
  await db.insert(activityEvents).values({
    orgId: feedback.orgId,
    agentId: feedback.agentId,
    taskId: feedback.taskId ?? null,
    type: feedback.feedbackType,
    summary: `${agentName}: ${feedback.summary}`,
    reason: feedback.details ?? feedback.suggestedAction ?? null,
    cost: 0,
    department: null,
  }).catch(() => {});

  // 4. Notify founder if needed
  let notificationId: string | undefined;
  if (feedback.requiresFounderAttention) {
    try {
      const { createNotification } = await import('../routes/notifications.js');
      const { shouldNotify, getNotificationPrefs } = await import('./notification-preferences.js');
      const prefs = await getNotificationPrefs(db, feedback.orgId);
      if (shouldNotify(prefs, 'inApp', 'agent')) {
        createNotification(
          db,
          feedback.orgId,
          'agent',
          `${feedback.feedbackType === 'escalation' ? '🚨 Escalation' : '⚠️ Blocker'}: ${agentName}`,
          feedback.summary,
        );
      }
    } catch { /* notification failure is non-fatal */ }
  }

  // 5. Broadcast feedback
  broadcastToOrg(feedback.orgId, {
    type: 'agent.notification',
    agentName,
    title: `${feedback.feedbackType}: ${feedback.summary}`,
    message: feedback.details ?? '',
    notificationType: feedback.feedbackType,
  });

  // 6. Audit
  await appendAudit(db, {
    orgId: feedback.orgId,
    actorType: 'agent',
    actorId: feedback.agentId,
    action: `agent.feedback.${feedback.feedbackType}`,
    tool: 'multi_agent',
    cost: 0,
    outcome: 'success',
  }).catch(() => {});

  return { recorded: true, notificationId };
}

// ─── Sub-Task Aggregation ───────────────────────────────────────────────────

/**
 * Aggregate results from all sub-tasks of a parent task.
 * Used by the Executive Agent to understand the overall status.
 */
export async function aggregateSubTaskResults(
  db: Db,
  orgId: string,
  parentTaskId: string,
): Promise<{
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  failed: number;
  results: Array<{ taskId: string; title: string; status: string; result?: string; agentName: string }>;
}> {
  // Get sub-tasks (tasks that reference this parent in their description)
  const allTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      result: tasks.result,
      agentId: tasks.agentId,
      description: tasks.description,
    })
    .from(tasks)
    .where(eq(tasks.orgId, orgId))
    .orderBy(desc(tasks.createdAt))
    .limit(50);

  // Filter sub-tasks by parent reference in description
  const subTasks = allTasks.filter(t =>
    t.description?.includes(`Parent task: ${parentTaskId}`) ||
    t.description?.includes(`parent task: ${parentTaskId}`)
  );

  // Get agent names
  const agentIds = [...new Set(subTasks.map(t => t.agentId).filter(Boolean))] as string[];
  const agentMap = new Map<string, string>();

  if (agentIds.length > 0) {
    const agentRows = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
    for (const a of agentRows) {
      agentMap.set(a.id, a.name);
    }
  }

  return {
    total: subTasks.length,
    completed: subTasks.filter(t => t.status === 'completed').length,
    inProgress: subTasks.filter(t => t.status === 'in_progress').length,
    pending: subTasks.filter(t => t.status === 'pending').length,
    failed: subTasks.filter(t => t.status === 'failed').length,
    results: subTasks.map(t => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      result: t.result ?? undefined,
      agentName: agentMap.get(t.agentId ?? '') ?? 'Unassigned',
    })),
  };
}
