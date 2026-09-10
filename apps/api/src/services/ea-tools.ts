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

/**
 * §15: recommend an organization from the Department Template Catalog for the
 * given workforce stage (1 idea … 5 enterprise). Reads the SAME catalog the
 * Departments page and company builder use — never a parallel definition.
 * Read-only: the founder decides what to actually activate.
 */
export async function recommendOrgStage(
  ctx: ToolContext,
  params: { stage?: number; companyDescription?: string },
): Promise<ToolResult> {
  const { recommendOrgForStage, parseTemplateStage } = await import('./org-recommendation.js');
  const stageInput = params?.stage;
  let stage: number;
  if (Number.isFinite(stageInput) && (stageInput as number) >= 1 && (stageInput as number) <= 5) {
    stage = stageInput as number;
  } else {
    // Infer from the org's current shape — the honest default when the founder
    // didn't specify a stage: count departments (a Stage-1 company has few).
    const deptRows = await ctx.db.select({ id: departments.id }).from(departments).where(eq(departments.orgId, ctx.orgId));
    stage = Math.min(5, Math.max(1, Math.ceil((deptRows.length || 0) / 5)));
  }
  const rec = await recommendOrgForStage(ctx.db, ctx.orgId, stage as 1 | 2 | 3 | 4 | 5);
  return {
    success: true,
    tool: 'recommend_org_stage',
    message: `Stage ${rec.stage}: recommend ${rec.recommended.map((t) => t.name).join(', ')} (${rec.recommended.length} departments; ${rec.deferred.length} deferred). ${rec.rationale}`,
    data: {
      stage: rec.stage,
      recommended: rec.recommended.map((t) => ({ id: t.id, name: t.name, slug: t.slug, stage: t.stage })),
      deferred: rec.deferred.map((t) => ({ name: t.name, stage: t.stage })),
      rationale: rec.rationale,
    },
  };
}

/**
 * §15: activate one department from the SAME catalog as the Departments page.
 * Same idempotent activation path the founder's one-click uses. Creates the
 * department + its teams (real entities the architecture supports); does NOT
 * fabricate employees/goals/budgets the architecture doesn't seed here.
 */
export async function activateDepartmentFromCatalog(
  ctx: ToolContext,
  params: { templateName?: string; templateId?: string },
): Promise<ToolResult> {
  const { activateDepartmentTemplate, getCatalog } = await import('./org-recommendation.js');
  const catalog = await getCatalog(ctx.db, ctx.orgId);
  let template = null;
  if (params?.templateId) {
    template = catalog.find((t) => t.id === params.templateId) ?? null;
  } else if (params?.templateName) {
    const wanted = params.templateName.trim().toLowerCase();
    template =
      catalog.find((t) => t.name.toLowerCase() === wanted) ??
      catalog.find((t) => t.slug === wanted) ??
      catalog.find((t) => t.name.toLowerCase().includes(wanted)) ??
      null;
  }
  if (!template) {
    return {
      success: false,
      tool: 'activate_department',
      message: `No catalog department matches ${params?.templateName ?? params?.templateId ?? '(none given)'}. Available: ${catalog.map((t) => t.name).join(', ')}.`,
      error: 'not_found',
    };
  }
  const outcome = await activateDepartmentTemplate(ctx.db, { orgId: ctx.orgId, userId: ctx.userId }, template.id);
  if (!outcome.ok) {
    return { success: false, tool: 'activate_department', message: 'Template not found.', error: 'not_found' };
  }
  const { departmentId, activated } = outcome.result;
  const parts: string[] = [];
  parts.push(activated.departments.length ? `created department "${activated.departments[0]}"` : `department "${template.name}" already existed`);
  if (activated.teams.length) parts.push(`teams: ${activated.teams.join(', ')}`);
  return {
    success: true,
    tool: 'activate_department',
    message: `Activated "${template.name}" from the catalog — ${parts.join('; ')}.`,
    data: { departmentId, activated, stage: template.stage, stageLabel: template.stageLabel },
  };
}

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
  if (status === 'archived') updates.retiredAt = new Date(); // preserve lifecycle history
  if (status === 'active' || status === 'paused') updates.retiredAt = null;
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

/**
 * Delegate a software-engineering objective to the Engineering Manager.
 *
 * The Engineering Manager performs capability search → team assembly →
 * task decomposition with an idempotency guard, so repeated EA calls for
 * the same objective return the existing plan instead of duplicating work.
 */
export async function planEngineering(
  ctx: ToolContext,
  params: { objective?: unknown; description?: unknown; constraints?: unknown; priority?: unknown },
): Promise<ToolResult> {
  const objective = typeof params.objective === 'string' ? params.objective.trim() : '';
  if (!objective) {
    return { success: false, tool: 'plan_engineering', message: 'Objective is required.', error: 'missing_objective' };
  }
  if (objective.length > 1000) {
    return { success: false, tool: 'plan_engineering', message: 'Objective must be 1000 characters or less.', error: 'objective_too_long' };
  }

  const description = typeof params.description === 'string' && params.description.trim() ? params.description.trim().slice(0, 4000) : undefined;
  const constraints = typeof params.constraints === 'string' && params.constraints.trim() ? params.constraints.trim().slice(0, 1000) : undefined;
  const priority =
    params.priority === 'low' || params.priority === 'normal' || params.priority === 'high' || params.priority === 'urgent'
      ? params.priority
      : undefined;

  try {
    const { planEngineeringRequest } = await import('./engineering-manager.js');
    const plan = await planEngineeringRequest(ctx.db, ctx.orgId, ctx.userId, {
      objective,
      description,
      constraints,
      priority,
    });

    return {
      success: true,
      tool: 'plan_engineering',
      message: plan.alreadyPlanned
        ? `Engineering plan already exists for this objective (${plan.tasks.length} tasks, team of ${plan.team.length}).`
        : `Engineering Manager assembled a team of ${plan.team.length} and created ${plan.tasks.length} tasks for: ${objective}`,
      data: {
        requestId: plan.requestId,
        alreadyPlanned: plan.alreadyPlanned,
        teamSize: plan.team.length,
        taskCount: plan.tasks.length,
        capabilitiesReused: plan.capabilitiesReused.length,
        capabilityGaps: plan.capabilityGaps,
        report: plan.report,
      },
    };
  } catch (err) {
    return {
      success: false,
      tool: 'plan_engineering',
      message: err instanceof Error ? err.message : 'Failed to plan engineering request.',
      error: 'plan_failed',
    };
  }
}

/**
 * "Who should handle this?" — given a work description, rank the active
 * workforce by capability match, utilization and historical performance.
 * Read-only: recommendation only, never an assignment.
 */
export async function findBestAgent(
  ctx: ToolContext,
  params: { task?: unknown },
): Promise<ToolResult> {
  const task = typeof params.task === 'string' ? params.task.trim() : '';
  if (!task) {
    return { success: false, tool: 'find_best_agent', message: 'Task description is required.', error: 'missing_task' };
  }
  try {
    const { recommendAgents } = await import('./agent-recommendation.js');
    const recs = await recommendAgents(ctx.db, ctx.orgId, task, 3);
    const top = recs[0];
    if (!top) {
      return {
        success: true,
        tool: 'find_best_agent',
        message: 'No active AI employees exist yet — hire agents with the capabilities this work needs.',
        data: { recommendations: [] },
      };
    }
    return {
      success: true,
      tool: 'find_best_agent',
      message: `Best match: ${top.name} (${top.role}) — score ${top.score}/100, ${top.utilization}% utilized.`,
      data: {
        recommendations: recs.map((r) => ({
          agentId: r.agentId,
          name: r.name,
          role: r.role,
          department: r.departmentName,
          score: r.score,
          reasons: r.reasons,
          utilization: r.utilization,
          performanceScore: r.performanceScore,
        })),
      },
    };
  } catch (err) {
    return {
      success: false,
      tool: 'find_best_agent',
      message: err instanceof Error ? err.message : 'Failed to rank agents.',
      error: 'recommendation_failed',
    };
  }
}

/**
 * Workforce analysis — real utilization/coverage numbers per department and
 * team, so the EA can answer "who is overloaded?" from measured data.
 * Read-only.
 */
export async function analyzeWorkforce(ctx: ToolContext): Promise<ToolResult> {
  try {
    const { calculateOrgWorkforceSummary } = await import('./workforce-engine.js');
    const summary = await calculateOrgWorkforceSummary(ctx.db, ctx.orgId);
    const stressedDepts = summary.departments.filter(
      (d) => d.coverageStatus === 'over_capacity' || d.coverageStatus === 'understaffed' || d.coverageStatus === 'severely_understaffed',
    );
    return {
      success: true,
      tool: 'analyze_workforce',
      message: `${summary.activeAgents} active of ${summary.totalAgents} agents across ${summary.totalDepartments} departments — average utilization ${summary.avgUtilization}%.${stressedDepts.length ? ` Needs attention: ${stressedDepts.map((d) => d.departmentName).join(', ')}.` : ' No overloaded units.'}`,
      data: {
        totalAgents: summary.totalAgents,
        activeAgents: summary.activeAgents,
        totalDepartments: summary.totalDepartments,
        totalTeams: summary.totalTeams,
        avgUtilization: summary.avgUtilization,
        departments: summary.departments.map((d) => ({
          name: d.departmentName,
          status: d.coverageStatus,
          utilizationPct: d.utilizationPct,
          agentCount: d.agentCount,
          capabilityGap: d.capabilityGap,
        })),
        unassignedAgents: summary.unassignedAgents.length,
        bloatWarning: summary.bloatWarning,
      },
    };
  } catch (err) {
    return {
      success: false,
      tool: 'analyze_workforce',
      message: err instanceof Error ? err.message : 'Failed to analyze workforce.',
      error: 'analysis_failed',
    };
  }
}

/**
 * Archive (or restore) a department. Archives preserve all history — agents,
 * tasks and memory keep their references; nothing is destroyed.
 */
export async function archiveDepartment(
  ctx: ToolContext,
  params: { departmentId?: unknown; restore?: unknown },
): Promise<ToolResult> {
  const departmentId = typeof params.departmentId === 'string' ? params.departmentId.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(departmentId)) {
    return { success: false, tool: 'archive_department', message: 'A valid departmentId is required.', error: 'invalid_id' };
  }
  const restore = params.restore === true;
  try {
    const deptService = await import('./departments.js');
    const dept = await deptService.findById(ctx.db, ctx.orgId, departmentId);
    if (!dept) {
      return { success: false, tool: 'archive_department', message: 'Department not found in this organization.', error: 'not_found' };
    }
    if (!restore && dept.status === 'archived') {
      return { success: true, tool: 'archive_department', message: `"${dept.name}" is already archived.`, data: { departmentId, name: dept.name, status: dept.status } };
    }
    if (restore && dept.status !== 'archived') {
      return { success: true, tool: 'archive_department', message: `"${dept.name}" is already active.`, data: { departmentId, name: dept.name, status: dept.status } };
    }
    const updated = await deptService.updateDepartment(ctx.db, ctx.orgId, departmentId, { status: restore ? 'active' : 'archived' });
    if (!updated) {
      return { success: false, tool: 'archive_department', message: 'Failed to update department status.', error: 'update_failed' };
    }
    await appendAudit(ctx.db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: restore ? 'department.restored' : 'department.archived',
      outcome: 'success',
      inputRef: JSON.stringify({ departmentId, name: dept.name }),
    });
    return {
      success: true,
      tool: 'archive_department',
      message: `${restore ? 'Restored' : 'Archived'} department "${dept.name}". History and references are preserved.`,
      data: { departmentId, name: dept.name, status: updated.status },
    };
  } catch (err) {
    return {
      success: false,
      tool: 'archive_department',
      message: err instanceof Error ? err.message : 'Failed to archive department.',
      error: 'archive_failed',
    };
  }
}

/**
 * Archive (or restore) a team. Same history-preserving contract as
 * archive_department.
 */
export async function archiveTeam(
  ctx: ToolContext,
  params: { teamId?: unknown; restore?: unknown },
): Promise<ToolResult> {
  const teamId = typeof params.teamId === 'string' ? params.teamId.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) {
    return { success: false, tool: 'archive_team', message: 'A valid teamId is required.', error: 'invalid_id' };
  }
  const restore = params.restore === true;
  try {
    const teamService = await import('./teams.js');
    const team = await teamService.findById(ctx.db, ctx.orgId, teamId);
    if (!team) {
      return { success: false, tool: 'archive_team', message: 'Team not found in this organization.', error: 'not_found' };
    }
    if (!restore && team.status === 'archived') {
      return { success: true, tool: 'archive_team', message: `"${team.name}" is already archived.`, data: { teamId, name: team.name, status: team.status } };
    }
    if (restore && team.status !== 'archived') {
      return { success: true, tool: 'archive_team', message: `"${team.name}" is already active.`, data: { teamId, name: team.name, status: team.status } };
    }
    const updated = await teamService.updateTeam(ctx.db, ctx.orgId, teamId, { status: restore ? 'active' : 'archived' });
    if (!updated) {
      return { success: false, tool: 'archive_team', message: 'Failed to update team status.', error: 'update_failed' };
    }
    await appendAudit(ctx.db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: restore ? 'team.restored' : 'team.archived',
      outcome: 'success',
      inputRef: JSON.stringify({ teamId, name: team.name }),
    });
    return {
      success: true,
      tool: 'archive_team',
      message: `${restore ? 'Restored' : 'Archived'} team "${team.name}". History and references are preserved.`,
      data: { teamId, name: team.name, status: updated.status },
    };
  } catch (err) {
    return {
      success: false,
      tool: 'archive_team',
      message: err instanceof Error ? err.message : 'Failed to archive team.',
      error: 'archive_failed',
    };
  }
}
