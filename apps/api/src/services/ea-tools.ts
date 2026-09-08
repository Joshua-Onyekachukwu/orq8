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
import { agents, departments, teams, goals, tasks, organizations, type Db } from '@orq8/db';
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
 * Rename a department. Validates org ownership and duplicate names.
 */
export async function renameDepartment(
  ctx: ToolContext,
  params: { departmentId: string; newName: string },
): Promise<ToolResult> {
  const { departmentId, newName } = params;

  if (!newName?.trim()) return { success: false, tool: 'rename_department', message: 'New name is required.', error: 'invalid_name' };
  if (newName.length > 100) return { success: false, tool: 'rename_department', message: 'Name must be 100 characters or less.', error: 'name_too_long' };

  const dept = await deptService.findById(ctx.db, ctx.orgId, departmentId);
  if (!dept) return { success: false, tool: 'rename_department', message: 'Department not found.', error: 'not_found' };

  if (dept.name === newName.trim()) {
    return { success: true, tool: 'rename_department', message: `Department is already named "${newName}".`, data: { departmentId, name: dept.name } };
  }

  const existing = await deptService.findByName(ctx.db, ctx.orgId, newName.trim());
  if (existing && existing.id !== departmentId) {
    return { success: false, tool: 'rename_department', message: `A department named "${newName}" already exists.`, error: 'duplicate_name' };
  }

  const updated = await deptService.updateDepartment(ctx.db, ctx.orgId, departmentId, { name: newName.trim() });
  if (!updated) return { success: false, tool: 'rename_department', message: 'Failed to rename department.', error: 'update_failed' };

  await appendAudit(ctx.db, {
    orgId: ctx.orgId, actorType: 'user', actorId: ctx.userId,
    action: 'department.renamed', inputRef: JSON.stringify({ previousName: dept.name, newName: newName.trim() }), outcome: 'success',
  });

  return { success: true, tool: 'rename_department', message: `Renamed department "${dept.name}" to "${newName.trim()}".`, data: { departmentId, previousName: dept.name, newName: newName.trim() } };
}

/**
 * Rename a team.
 */
export async function renameTeam(
  ctx: ToolContext,
  params: { teamId: string; newName: string },
): Promise<ToolResult> {
  const { teamId, newName } = params;

  if (!newName?.trim()) return { success: false, tool: 'rename_team', message: 'New name is required.', error: 'invalid_name' };
  if (newName.length > 100) return { success: false, tool: 'rename_team', message: 'Name must be 100 characters or less.', error: 'name_too_long' };

  const team = await teamService.findById(ctx.db, ctx.orgId, teamId);
  if (!team) return { success: false, tool: 'rename_team', message: 'Team not found.', error: 'not_found' };

  if (team.name === newName.trim()) {
    return { success: true, tool: 'rename_team', message: `Team is already named "${newName}".`, data: { teamId, name: team.name } };
  }

  const existing = await teamService.findByName(ctx.db, ctx.orgId, newName.trim());
  if (existing && existing.id !== teamId) {
    return { success: false, tool: 'rename_team', message: `A team named "${newName}" already exists.`, error: 'duplicate_name' };
  }

  const updated = await teamService.updateTeam(ctx.db, ctx.orgId, teamId, { name: newName.trim() });
  if (!updated) return { success: false, tool: 'rename_team', message: 'Failed to rename team.', error: 'update_failed' };

  await appendAudit(ctx.db, {
    orgId: ctx.orgId, actorType: 'user', actorId: ctx.userId,
    action: 'team.renamed', inputRef: JSON.stringify({ previousName: team.name, newName: newName.trim() }), outcome: 'success',
  });

  return { success: true, tool: 'rename_team', message: `Renamed team "${team.name}" to "${newName.trim()}".`, data: { teamId, previousName: team.name, newName: newName.trim() } };
}

/**
 * Update an agent: assign to department/team, change status (pause/resume/retire).
 */
export async function updateAgent(
  ctx: ToolContext,
  params: { agentId: string; departmentId?: string; teamId?: string; status?: string; autonomyLevel?: string },
): Promise<ToolResult> {
  const { agentId, departmentId, teamId, status, autonomyLevel } = params;

  const [agent] = await ctx.db
    .select().from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.orgId, ctx.orgId)))
    .limit(1);
  if (!agent) return { success: false, tool: 'update_agent', message: 'Agent not found.', error: 'not_found' };

  // Validate department if provided
  if (departmentId) {
    const dept = await deptService.findById(ctx.db, ctx.orgId, departmentId);
    if (!dept) return { success: false, tool: 'update_agent', message: 'Department not found.', error: 'dept_not_found' };
  }

  // Validate team if provided
  if (teamId) {
    const team = await teamService.findById(ctx.db, ctx.orgId, teamId);
    if (!team) return { success: false, tool: 'update_agent', message: 'Team not found.', error: 'team_not_found' };
  }

  // Validate status
  const validStatuses = ['active', 'paused', 'archived'];
  if (status && !validStatuses.includes(status)) {
    return { success: false, tool: 'update_agent', message: `Invalid status. Must be: ${validStatuses.join(', ')}`, error: 'invalid_status' };
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (departmentId !== undefined) updates.departmentId = departmentId;
  if (teamId !== undefined) updates.teamId = teamId;
  if (status) updates.status = status;
  if (autonomyLevel) updates.autonomyLevel = autonomyLevel;

  const [updated] = await ctx.db
    .update(agents)
    .set(updates)
    .where(eq(agents.id, agentId))
    .returning();

  if (!updated) return { success: false, tool: 'update_agent', message: 'Failed to update agent.', error: 'update_failed' };

  const changes: string[] = [];
  if (departmentId) changes.push(`department`);
  if (teamId) changes.push(`team`);
  if (status) changes.push(`status → ${status}`);
  if (autonomyLevel) changes.push(`autonomy → ${autonomyLevel}`);

  await appendAudit(ctx.db, {
    orgId: ctx.orgId, actorType: 'user', actorId: ctx.userId, agentId,
    action: 'agent.updated', inputRef: JSON.stringify({ changes }), outcome: 'success',
  });

  return { success: true, tool: 'update_agent', message: `Updated agent "${agent.name}" (${changes.join(', ')}).`, data: { agentId, name: agent.name, changes } };
}

/**
 * Update a goal: title, description, priority, status, assign department/team.
 */
export async function updateGoal(
  ctx: ToolContext,
  params: { goalId: string; title?: string; description?: string; priority?: string; status?: string; departmentId?: string; teamId?: string },
): Promise<ToolResult> {
  const { goalId, title, description, priority, status, departmentId, teamId } = params;

  const [goal] = await ctx.db
    .select().from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.orgId, ctx.orgId)))
    .limit(1);
  if (!goal) return { success: false, tool: 'update_goal', message: 'Goal not found.', error: 'not_found' };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title) updates.title = title.trim();
  if (description !== undefined) updates.description = description;
  if (priority) updates.priority = priority;
  if (status) updates.status = status;
  if (departmentId !== undefined) updates.departmentId = departmentId;
  if (teamId !== undefined) updates.teamId = teamId;

  const [updated] = await ctx.db
    .update(goals)
    .set(updates)
    .where(eq(goals.id, goalId))
    .returning();

  if (!updated) return { success: false, tool: 'update_goal', message: 'Failed to update goal.', error: 'update_failed' };

  await appendAudit(ctx.db, {
    orgId: ctx.orgId, actorType: 'user', actorId: ctx.userId,
    action: 'goal.updated', inputRef: JSON.stringify({ goalId, updates: Object.keys(updates).filter(k => k !== 'updatedAt') }), outcome: 'success',
  });

  return { success: true, tool: 'update_goal', message: `Updated goal "${goal.title}".`, data: { goalId, title: goal.title } };
}

/**
 * Update a task: assign agent, change priority, update status, set deadline.
 */
export async function updateTask(
  ctx: ToolContext,
  params: { taskId: string; agentId?: string; priority?: string; status?: string; title?: string; description?: string; dueDate?: string },
): Promise<ToolResult> {
  const { taskId, agentId, priority, status, title, description, dueDate } = params;

  const [task] = await ctx.db
    .select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, ctx.orgId)))
    .limit(1);
  if (!task) return { success: false, tool: 'update_task', message: 'Task not found.', error: 'not_found' };

  // Validate agent if provided
  if (agentId) {
    const [agent] = await ctx.db
      .select({ id: agents.id, status: agents.status })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.orgId, ctx.orgId)))
      .limit(1);
    if (!agent) return { success: false, tool: 'update_task', message: 'Agent not found.', error: 'agent_not_found' };
    if (agent.status === 'archived') return { success: false, tool: 'update_task', message: 'Cannot assign to archived agent.', error: 'agent_archived' };
  }

  const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
  if (status && !validStatuses.includes(status)) {
    return { success: false, tool: 'update_task', message: `Invalid status. Must be: ${validStatuses.join(', ')}`, error: 'invalid_status' };
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (agentId !== undefined) updates.agentId = agentId;
  if (priority) updates.priority = priority;
  if (status) updates.status = status;
  if (title) updates.title = title.trim();
  if (description !== undefined) updates.description = description;
  if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;

  const [updated] = await ctx.db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, taskId))
    .returning();

  if (!updated) return { success: false, tool: 'update_task', message: 'Failed to update task.', error: 'update_failed' };

  await appendAudit(ctx.db, {
    orgId: ctx.orgId, actorType: 'user', actorId: ctx.userId, agentId: agentId ?? null, taskId,
    action: 'task.updated', inputRef: JSON.stringify({ updates: Object.keys(updates).filter(k => k !== 'updatedAt') }), outcome: 'success',
  });

  return { success: true, tool: 'update_task', message: `Updated task "${task.title}".`, data: { taskId, title: task.title } };
}

/**
 * Rename the organization (Executive Agent self-identity).
 * The EA's "name" is the organization name — changing it changes how the EA identifies itself.
 */
export async function renameOrganization(
  ctx: ToolContext,
  params: { newName: string },
): Promise<ToolResult> {
  const { newName } = params;

  if (!newName?.trim()) return { success: false, tool: 'rename_organization', message: 'New name is required.', error: 'invalid_name' };
  if (newName.length > 200) return { success: false, tool: 'rename_organization', message: 'Name must be 200 characters or less.', error: 'name_too_long' };

  const [org] = await ctx.db
    .select().from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  if (!org) return { success: false, tool: 'rename_organization', message: 'Organization not found.', error: 'not_found' };

  if (org.name === newName.trim()) {
    return { success: true, tool: 'rename_organization', message: `Organization is already named "${newName}".`, data: { orgId: ctx.orgId, name: org.name } };
  }

  const previousName = org.name;
  await ctx.db
    .update(organizations)
    .set({ name: newName.trim() })
    .where(eq(organizations.id, ctx.orgId));

  await appendAudit(ctx.db, {
    orgId: ctx.orgId, actorType: 'user', actorId: ctx.userId,
    action: 'organization.renamed', inputRef: JSON.stringify({ previousName, newName: newName.trim() }), outcome: 'success',
  });

  return { success: true, tool: 'rename_organization', message: `Renamed organization from "${previousName}" to "${newName.trim()}".`, data: { orgId: ctx.orgId, previousName, newName: newName.trim() } };
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
