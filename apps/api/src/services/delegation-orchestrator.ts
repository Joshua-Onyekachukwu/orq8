/**
 * ORQ8 Delegation Orchestrator
 *
 * Sits between the Executive Agent and the multi-agent system.
 * When the Executive Agent creates tasks, this orchestrator:
 * 1. Determines which tasks should be delegated to which agents
 * 2. Creates delegation requests via the multi-agent system
 * 3. Monitors sub-task completion
 * 4. Aggregates results back to the Executive Agent
 * 5. Handles the feedback loop (agents report back)
 *
 * This is the "nervous system" that makes agent-to-agent collaboration work.
 */

import { eq, and, desc } from 'drizzle-orm';
import { agents, tasks, activityEvents, type Db } from '@orq8/db';
import { delegateTask, submitFeedback, aggregateSubTaskResults } from './multi-agent.js';
import { appendAudit } from './audit.js';
import { broadcastToOrg } from './realtime.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DelegationPlan {
  /** Tasks to delegate directly to an agent */
  directAssignments: Array<{
    taskTitle: string;
    targetAgentId: string;
    targetAgentName: string;
    role: string;
  }>;
  /** Tasks that need delegation to another agent (sub-tasks) */
  delegations: Array<{
    parentTaskTitle: string;
    subTaskTitle: string;
    subTaskDescription: string;
    delegatingAgentId: string;
    targetAgentId: string;
    targetAgentName: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
  }>;
  /** Tasks with no matching agent */
  unassigned: Array<{
    taskTitle: string;
    reason: string;
  }>;
}

export interface DelegationResult {
  plan: DelegationPlan;
  createdTaskIds: string[];
  delegatedCount: number;
  unassignedCount: number;
}

// ─── Orchestration ──────────────────────────────────────────────────────────

/**
 * Create a delegation plan from the Executive Agent's task decomposition.
 *
 * For each task in the decomposition:
 * - If a matching agent exists → direct assignment
 * - If no matching agent but a related agent exists → delegation
 * - If no suitable agent → marked as unassigned
 */
export async function createDelegationPlan(
  db: Db,
  orgId: string,
  taskDecomposition: Array<{
    title: string;
    description: string;
    suggestedAgentRole: string;
    priority?: string;
  }>,
): Promise<DelegationPlan> {
  const plan: DelegationPlan = {
    directAssignments: [],
    delegations: [],
    unassigned: [],
  };

  // Get all active agents for this org
  const activeAgents = await db
    .select()
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.status, 'active')));

  // Find the Executive Agent (or the most senior agent)
  const executiveAgent = activeAgents.find(a => a.role === 'executive_agent') ?? activeAgents[0];

  for (const task of taskDecomposition) {
    // Find agents matching the suggested role
    const matchingAgents = activeAgents.filter(a => a.role === task.suggestedAgentRole);

    if (matchingAgents.length > 0) {
      // Direct assignment — agent with matching role exists
      const agent = matchingAgents[0]!;
      plan.directAssignments.push({
        taskTitle: task.title,
        targetAgentId: agent.id,
        targetAgentName: agent.name,
        role: agent.role,
      });
    } else if (executiveAgent) {
      // No matching agent — delegate from Executive Agent to a related agent
      // Find the closest matching agent by role similarity
      const relatedAgent = findRelatedAgent(activeAgents, task.suggestedAgentRole);
      if (relatedAgent) {
        plan.delegations.push({
          parentTaskTitle: task.title,
          subTaskTitle: task.title,
          subTaskDescription: task.description,
          delegatingAgentId: executiveAgent.id,
          targetAgentId: relatedAgent.id,
          targetAgentName: relatedAgent.name,
          priority: (task.priority as any) ?? 'normal',
        });
      } else {
        plan.unassigned.push({
          taskTitle: task.title,
          reason: `No agent with role "${task.suggestedAgentRole}" available`,
        });
      }
    } else {
      plan.unassigned.push({
        taskTitle: task.title,
        reason: 'No active agents in organization',
      });
    }
  }

  return plan;
}

/**
 * Execute a delegation plan — create tasks and delegate as planned.
 */
export async function executeDelegationPlan(
  db: Db,
  orgId: string,
  plan: DelegationPlan,
  intentDecomposition: Array<{
    title: string;
    description: string;
    suggestedAgentRole: string;
    priority?: string;
  }>,
): Promise<DelegationResult> {
  const createdTaskIds: string[] = [];
  let delegatedCount = 0;
  let unassignedCount = 0;

  // 1. Direct assignments — create tasks with agent assigned
  for (const assignment of plan.directAssignments) {
    const taskDef = intentDecomposition.find(t => t.title === assignment.taskTitle);
    if (!taskDef) continue;

    const [created] = await db
      .insert(tasks)
      .values({
        orgId,
        title: assignment.taskTitle,
        description: taskDef.description,
        agentId: assignment.targetAgentId,
        priority: (taskDef as any).priority ?? 'normal',
        status: 'pending',
        cost: 0,
      })
      .returning();

    if (created) {
      createdTaskIds.push(created.id);

      // Record activity
      await db.insert(activityEvents).values({
        orgId,
        agentId: assignment.targetAgentId,
        taskId: created.id,
        type: 'assigned',
        summary: `Task assigned to ${assignment.targetAgentName}: ${assignment.taskTitle}`,
        reason: `Executive Agent assigned based on role match (${assignment.role})`,
        cost: 0,
        department: null,
      }).catch(() => {});

      delegatedCount++;
    }
  }

  // 2. Delegations — create sub-tasks via multi-agent system
  for (const delegation of plan.delegations) {
    const result = await delegateTask(db, {
      orgId,
      delegatingAgentId: delegation.delegatingAgentId,
      targetAgentId: delegation.targetAgentId,
      parentTaskId: createdTaskIds[0] ?? '', // First task as parent reference
      title: delegation.subTaskTitle,
      description: delegation.subTaskDescription,
      priority: delegation.priority,
      context: `Delegated by Executive Agent. Original task: ${delegation.parentTaskTitle}`,
    });

    if (result.status === 'created' && result.subTaskId) {
      createdTaskIds.push(result.subTaskId);
      delegatedCount++;
    }
  }

  // 3. Unassigned — create tasks without agent assignment
  for (const unassigned of plan.unassigned) {
    const taskDef = intentDecomposition.find(t => t.title === unassigned.taskTitle);
    if (!taskDef) continue;

    const [created] = await db
      .insert(tasks)
      .values({
        orgId,
        title: unassigned.taskTitle,
        description: `${taskDef.description}\n\n⚠️ ${unassigned.reason}`,
        agentId: null,
        priority: (taskDef as any).priority ?? 'normal',
        status: 'pending',
        cost: 0,
      })
      .returning();

    if (created) {
      createdTaskIds.push(created.id);
      unassignedCount++;
    }
  }

  // 4. Broadcast delegation summary
  broadcastToOrg(orgId, {
    type: 'command.processed',
    commandId: `delegation-${Date.now()}`,
    summary: `Delegation plan executed: ${delegatedCount} delegated, ${unassignedCount} unassigned`,
  });

  // 5. Audit
  await appendAudit(db, {
    orgId,
    actorType: 'system',
    action: 'delegation.executed',
    tool: 'delegation_orchestrator',
    cost: 0,
    outcome: 'success',
    inputRef: JSON.stringify({
      directAssignments: plan.directAssignments.length,
      delegations: plan.delegations.length,
      unassigned: plan.unassigned.length,
    }),
  }).catch(() => {});

  return {
    plan,
    createdTaskIds,
    delegatedCount,
    unassignedCount,
  };
}

/**
 * Monitor sub-task completion and aggregate results.
 * Called periodically or after a task completes to check if parent tasks
 * should be updated based on sub-task status.
 */
export async function monitorDelegations(
  db: Db,
  orgId: string,
  parentTaskId: string,
): Promise<{
  allComplete: boolean;
  completed: number;
  total: number;
  results: Array<{ taskId: string; title: string; status: string; result?: string; agentName: string }>;
}> {
  const aggregation = await aggregateSubTaskResults(db, orgId, parentTaskId);

  return {
    allComplete: aggregation.completed === aggregation.total && aggregation.total > 0,
    completed: aggregation.completed,
    total: aggregation.total,
    results: aggregation.results,
  };
}

/**
 * Handle agent feedback — when an agent reports a blocker, completion, or question.
 * Routes the feedback to the appropriate handler.
 */
export async function handleAgentFeedback(
  db: Db,
  orgId: string,
  agentId: string,
  taskId: string | undefined,
  feedbackType: 'completion' | 'blocker' | 'question' | 'recommendation' | 'escalation',
  summary: string,
  details?: string,
): Promise<{ handled: boolean; action: string }> {
  // Get agent info
  const [agent] = await db
    .select({ name: agents.name, role: agents.role })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    return { handled: false, action: 'agent_not_found' };
  }

  // Submit feedback via multi-agent system
  await submitFeedback(db, {
    orgId,
    agentId,
    taskId,
    feedbackType,
    summary,
    details,
    requiresFounderAttention: feedbackType === 'escalation' || feedbackType === 'blocker',
  });

  // If it's a completion, update the task status
  if (feedbackType === 'completion' && taskId) {
    await db
      .update(tasks)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    // Update agent stats
    await db
      .update(agents)
      .set({
        tasksCompleted: sql`${agents.tasksCompleted} + 1`,
        currentTask: null,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));
  }

  // If it's a blocker, pause the task
  if (feedbackType === 'blocker' && taskId) {
    await db
      .update(tasks)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  return { handled: true, action: feedbackType };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Find the most related agent for a given role.
 * Uses role similarity to find the best match when no exact match exists.
 */
function findRelatedAgent(
  activeAgents: Array<{ id: string; name: string; role: string }>,
  targetRole: string,
): { id: string; name: string; role: string } | null {
  if (activeAgents.length === 0) return null;

  // Role similarity mapping
  const roleSimilarity: Record<string, string[]> = {
    market_researcher: ['data_analyst', 'financial_analyst'],
    content_writer: ['communications_agent', 'market_researcher'],
    communications_agent: ['content_writer', 'operations_manager'],
    software_engineer: ['data_analyst', 'operations_manager'],
    data_analyst: ['financial_analyst', 'market_researcher'],
    operations_manager: ['executive_agent', 'data_analyst'],
    financial_analyst: ['data_analyst', 'operations_manager'],
    executive_agent: ['operations_manager', 'data_analyst'],
  };

  const similar = roleSimilarity[targetRole] ?? [];

  // Try similar roles first
  for (const simRole of similar) {
    const agent = activeAgents.find(a => a.role === simRole);
    if (agent) return agent;
  }

  // Fall back to any active agent
  return activeAgents[0] ?? null;
}

import { sql } from 'drizzle-orm';
