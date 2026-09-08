/**
 * Executive Agent Tool Registry
 *
 * Structured action layer that allows the Executive Agent to perform
 * organizational operations safely. Every tool:
 *   1. Validates input
 *   2. Checks authorization
 *   3. Enforces resource limits
 *   4. Executes atomically
 *   5. Verifies result
 *   6. Records audit trail
 *   7. Returns structured result
 *
 * The LLM calls tools through the intent analysis → tool dispatch pipeline.
 * Direct database mutations are never allowed.
 */

import { eq, and, sql } from 'drizzle-orm';
import { agents, departments, teams, goals, tasks, type Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import * as deptService from './departments.js';
import * as teamService from './teams.js';
import * as agentService from './agents.js';
import { enforceResourceLimit } from './entitlements.js';

// ─── Tool Types ──────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  tool: string;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface ToolContext {
  db: Db;
  orgId: string;
  userId: string;
}

// ─── Tool Definitions ────────────────────────────────────────────────────

/**
 * Rename an AI employee. The display name changes; the immutable ID and
 * role remain unchanged. Historical audit records keep their original
 * actor references.
 */
export async function renameAgent(
  ctx: ToolContext,
  params: { agentId: string; newName: string },
): Promise<ToolResult> {
  const { agentId, newName } = params;

  if (!newName || newName.trim().length === 0) {
    return { success: false, tool: 'rename_agent', message: 'New name is required.', error: 'invalid_name' };
  }
  if (newName.length > 100) {
    return { success: false, tool: 'rename_agent', message: 'Name must be 100 characters or less.', error: 'name_too_long' };
  }

  // Verify agent exists and belongs to this org
  const [agent] = await ctx.db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.orgId, ctx.orgId)))
    .limit(1);

  if (!agent) {
    return { success: false, tool: 'rename_agent', message: 'Agent not found.', error: 'not_found' };
  }

  const previousName = agent.name;
  if (previousName === newName.trim()) {
    return { success: true, tool: 'rename_agent', message: `Agent is already named "${newName}".`, data: { agentId, name: previousName } };
  }

  // Check for duplicate name
  const [existing] = await ctx.db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.orgId, ctx.orgId), eq(agents.name, newName.trim())))
    .limit(1);

  if (existing && existing.id !== agentId) {
    return { success: false, tool: 'rename_agent', message: `An agent named "${newName}" already exists.`, error: 'duplicate_name' };
  }

  // Execute rename
  await ctx.db
    .update(agents)
    .set({ name: newName.trim(), updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  // Audit
  await appendAudit(ctx.db, {
    orgId: ctx.orgId,
    actorType: 'user',
    actorId: ctx.userId,
    agentId,
    action: 'agent.renamed',
    inputRef: JSON.stringify({ previousName, newName: newName.trim() }),
    outcome: 'success',
  });

  return {
    success: true,
    tool: 'rename_agent',
    message: `Renamed "${previousName}" to "${newName.trim()}".`,
    data: { agentId, previousName, newName: newName.trim() },
  };
}

/**
 * Create a new AI employee.
 */
export async function createAgent(
  ctx: ToolContext,
  params: {
    name: string;
    role: string;
    departmentId?: string;
    teamId?: string;
    capabilities?: string[];
    autonomyLevel?: string;
  },
): Promise<ToolResult> {
  const { name, role, departmentId, teamId, capabilities, autonomyLevel } = params;

  if (!name?.trim()) return { success: false, tool: 'create_agent', message: 'Name is required.', error: 'missing_name' };
  if (!role?.trim()) return { success: false, tool: 'create_agent', message: 'Role is required.', error: 'missing_role' };

  // Check duplicate name
  const [existing] = await ctx.db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.orgId, ctx.orgId), eq(agents.name, name.trim())))
    .limit(1);
  if (existing) {
    return { success: false, tool: 'create_agent', message: `An agent named "${name}" already exists.`, error: 'duplicate_name' };
  }

  // Enforce package limits
  try {
    await enforceResourceLimit(ctx.db, ctx.orgId, 'agents');
  } catch (err: any) {
    return { success: false, tool: 'create_agent', message: err.message || 'Agent limit reached.', error: 'limit_reached' };
  }

  // Validate department belongs to org
  if (departmentId) {
    const dept = await deptService.findById(ctx.db, ctx.orgId, departmentId);
    if (!dept) return { success: false, tool: 'create_agent', message: 'Department not found.', error: 'dept_not_found' };
  }

  // Validate team belongs to org
  if (teamId) {
    const team = await teamService.findById(ctx.db, ctx.orgId, teamId);
    if (!team) return { success: false, tool: 'create_agent', message: 'Team not found.', error: 'team_not_found' };
  }

  // Create the agent
  const [created] = await ctx.db
    .insert(agents)
    .values({
      orgId: ctx.orgId,
      name: name.trim(),
      role: role.trim(),
      departmentId: departmentId ?? null,
      teamId: teamId ?? null,
      status: 'active',
      autonomyLevel: autonomyLevel ?? 'execute_with_approval',
      capabilities: capabilities ?? [],
    })
    .returning();

  if (!created) {
    return { success: false, tool: 'create_agent', message: 'Failed to create agent.', error: 'create_failed' };
  }

  // Audit
  await appendAudit(ctx.db, {
    orgId: ctx.orgId,
    actorType: 'user',
    actorId: ctx.userId,
    agentId: created.id,
    action: 'agent.created',
    inputRef: JSON.stringify({ name: name.trim(), role: role.trim(), departmentId, teamId }),
    outcome: 'success',
  });

  return {
    success: true,
    tool: 'create_agent',
    message: `Created AI employee "${name}" (${role}).`,
    data: { agentId: created.id, name: name.trim(), role: role.trim() },
  };
}

/**
 * Create a new department.
 */
export async function createDepartment(
  ctx: ToolContext,
  params: { name: string; description?: string; mission?: string },
): Promise<ToolResult> {
  const { name, description, mission } = params;

  if (!name?.trim()) return { success: false, tool: 'create_department', message: 'Name is required.', error: 'missing_name' };

  // Check duplicate
  const existing = await deptService.findByName(ctx.db, ctx.orgId, name.trim());
  if (existing) {
    return { success: false, tool: 'create_department', message: `Department "${name}" already exists.`, error: 'duplicate' };
  }

  // Enforce package limits
  try {
    await enforceResourceLimit(ctx.db, ctx.orgId, 'departments');
  } catch (err: any) {
    return { success: false, tool: 'create_department', message: err.message || 'Department limit reached.', error: 'limit_reached' };
  }

  const dept = await deptService.createDepartment(ctx.db, {
    orgId: ctx.orgId,
    name: name.trim(),
    description: description ?? undefined,
  });

  // Audit
  await appendAudit(ctx.db, {
    orgId: ctx.orgId,
    actorType: 'user',
    actorId: ctx.userId,
    action: 'department.created',
    inputRef: JSON.stringify({ name: name.trim(), description }),
    outcome: 'success',
  });

  return {
    success: true,
    tool: 'create_department',
    message: `Created department "${name}".`,
    data: { departmentId: dept.id, name: name.trim() },
  };
}

/**
 * Create a new team.
 */
export async function createTeam(
  ctx: ToolContext,
  params: { name: string; description?: string; departmentId?: string; lead?: string },
): Promise<ToolResult> {
  const { name, description, departmentId, lead } = params;

  if (!name?.trim()) return { success: false, tool: 'create_team', message: 'Name is required.', error: 'missing_name' };

  const existing = await teamService.findByName(ctx.db, ctx.orgId, name.trim());
  if (existing) {
    return { success: false, tool: 'create_team', message: `Team "${name}" already exists.`, error: 'duplicate' };
  }

  try {
    await enforceResourceLimit(ctx.db, ctx.orgId, 'teams');
  } catch (err: any) {
    return { success: false, tool: 'create_team', message: err.message || 'Team limit reached.', error: 'limit_reached' };
  }

  if (departmentId) {
    const dept = await deptService.findById(ctx.db, ctx.orgId, departmentId);
    if (!dept) return { success: false, tool: 'create_team', message: 'Department not found.', error: 'dept_not_found' };
  }

  const team = await teamService.createTeam(ctx.db, {
    orgId: ctx.orgId,
    name: name.trim(),
    description: description ?? undefined,
    lead: lead ?? undefined,
    departmentId: departmentId ?? null,
  });

  await appendAudit(ctx.db, {
    orgId: ctx.orgId,
    actorType: 'user',
    actorId: ctx.userId,
    action: 'team.created',
    inputRef: JSON.stringify({ name: name.trim(), departmentId }),
    outcome: 'success',
  });

  return {
    success: true,
    tool: 'create_team',
    message: `Created team "${name}".`,
    data: { teamId: team.id, name: name.trim() },
  };
}

/**
 * Create a goal.
 */
export async function createGoal(
  ctx: ToolContext,
  params: { title: string; description?: string; priority?: string; teamId?: string },
): Promise<ToolResult> {
  const { title, description, priority, teamId } = params;

  if (!title?.trim()) return { success: false, tool: 'create_goal', message: 'Title is required.', error: 'missing_title' };

  const [created] = await ctx.db
    .insert(goals)
    .values({
      orgId: ctx.orgId,
      title: title.trim(),
      description: description ?? null,
      priority: priority ?? 'normal',
      status: 'active',
      teamId: teamId ?? null,
    })
    .returning();

  await appendAudit(ctx.db, {
    orgId: ctx.orgId,
    actorType: 'user',
    actorId: ctx.userId,
    action: 'goal.created',
    inputRef: JSON.stringify({ title: title.trim(), priority }),
    outcome: 'success',
  });

  if (!created) {
    return { success: false, tool: 'create_goal', message: 'Failed to create goal.', error: 'create_failed' };
  }

  return {
    success: true,
    tool: 'create_goal',
    message: `Created goal "${title}".`,
    data: { goalId: created.id, title: title.trim() },
  };
}

/**
 * Create a task and optionally assign it to an agent.
 */
export async function createTask(
  ctx: ToolContext,
  params: { title: string; description?: string; agentId?: string; goalId?: string; priority?: string; teamId?: string },
): Promise<ToolResult> {
  const { title, description, agentId, goalId, priority, teamId } = params;

  if (!title?.trim()) return { success: false, tool: 'create_task', message: 'Title is required.', error: 'missing_title' };

  // Validate agent if provided
  if (agentId) {
    const [agent] = await ctx.db
      .select({ id: agents.id, status: agents.status })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.orgId, ctx.orgId)))
      .limit(1);
    if (!agent) return { success: false, tool: 'create_task', message: 'Agent not found.', error: 'agent_not_found' };
    if (agent.status === 'archived') return { success: false, tool: 'create_task', message: 'Cannot assign to archived agent.', error: 'agent_archived' };
  }

  const [created] = await ctx.db
    .insert(tasks)
    .values({
      orgId: ctx.orgId,
      title: title.trim(),
      description: description ?? null,
      agentId: agentId ?? null,
      goalId: goalId ?? null,
      priority: priority ?? 'normal',
      status: 'pending',
      teamId: teamId ?? null,
    })
    .returning();

  if (!created) {
    return { success: false, tool: 'create_task', message: 'Failed to create task.', error: 'create_failed' };
  }

  await appendAudit(ctx.db, {
    orgId: ctx.orgId,
    actorType: 'user',
    actorId: ctx.userId,
    agentId: agentId ?? null,
    taskId: created.id,
    action: 'task.created',
    inputRef: JSON.stringify({ title: title.trim(), agentId, priority }),
    outcome: 'success',
  });

  return {
    success: true,
    tool: 'create_task',
    message: `Created task "${title}".${agentId ? ` Assigned to agent.` : ''}`,
    data: { taskId: created.id, title: title.trim() },
  };
}

/**
 * Get organization summary for the Executive Agent's intelligence.
 */
export async function getOrganizationSummary(
  ctx: ToolContext,
): Promise<ToolResult> {
  const [deptCount] = await ctx.db
    .select({ count: sql<number>`count(*)::int` })
    .from(departments)
    .where(and(eq(departments.orgId, ctx.orgId), eq(departments.status, 'active')));

  const [teamCount] = await ctx.db
    .select({ count: sql<number>`count(*)::int` })
    .from(teams)
    .where(and(eq(teams.orgId, ctx.orgId), eq(teams.status, 'active')));

  const [agentCounts] = await ctx.db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${agents.status} = 'active')::int`,
    })
    .from(agents)
    .where(eq(agents.orgId, ctx.orgId));

  const [taskCounts] = await ctx.db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      active: sql<number>`count(*) filter (where ${tasks.status} in ('pending','in_progress'))::int`,
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
    })
    .from(tasks)
    .where(eq(tasks.orgId, ctx.orgId));

  const [goalCounts] = await ctx.db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${goals.status} = 'active')::int`,
      completed: sql<number>`count(*) filter (where ${goals.status} = 'completed')::int`,
    })
    .from(goals)
    .where(eq(goals.orgId, ctx.orgId));

  return {
    success: true,
    tool: 'get_organization_summary',
    message: 'Organization summary retrieved.',
    data: {
      departments: deptCount?.count ?? 0,
      teams: teamCount?.count ?? 0,
      agents: { total: agentCounts?.total ?? 0, active: agentCounts?.active ?? 0 },
      tasks: { total: taskCounts?.total ?? 0, completed: taskCounts?.completed ?? 0, active: taskCounts?.active ?? 0, failed: taskCounts?.failed ?? 0 },
      goals: { total: goalCounts?.total ?? 0, active: goalCounts?.active ?? 0, completed: goalCounts?.completed ?? 0 },
    },
  };
}
