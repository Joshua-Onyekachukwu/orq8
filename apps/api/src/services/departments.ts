import { eq, and, or, sql, desc, inArray } from 'drizzle-orm';
import {
  departments,
  agents,
  teams,
  tasks,
  approvals,
  activityEvents,
  decisions,
  companyMemory,
  files,
  eventRules,
  type Department,
  type Db,
} from '@orq8/db';

/** One member of a department, as the workspace's Team zone reads them. */
export interface DepartmentMember {
  id: string;
  name: string;
  role: string;
  status: string;
  autonomyLevel: string;
  currentTask: string | null;
  teamId: string | null;
  teamName: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  creditsUsed: number;
  weeklyCost: number;
  lastActiveAt: Date | null;
  authority: unknown;
}

export interface DepartmentTeamRow {
  id: string;
  name: string;
  lead: string | null;
  status: string;
  agentCount: number;
  activeCount: number;
}

export interface DepartmentDetail {
  department: Department & { agentCount: number; activeCount: number };
  members: DepartmentMember[];
  teams: DepartmentTeamRow[];
  now: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    agentId: string | null;
    cost: number;
    dueDate: Date | null;
    createdAt: Date;
  }>;
  needsFounder: Array<{
    id: string;
    action: string;
    description: string | null;
    cost: number;
    riskLevel: string;
    agentId: string | null;
    taskId: string | null;
    createdAt: Date;
  }>;
  /** Approvals this department's members asked for that the founder has ruled on. */
  recentApprovals: Array<{
    id: string;
    action: string;
    description: string | null;
    cost: number;
    riskLevel: string;
    status: string;
    decisionNote: string | null;
    agentId: string | null;
    taskId: string | null;
    decidedAt: Date | null;
    createdAt: Date;
  }>;
  activity: Array<{
    id: number;
    type: string;
    summary: string;
    reason: string | null;
    cost: number;
    agentId: string | null;
    occurredAt: Date;
  }>;
  decisions: Array<{
    id: string;
    title: string;
    decisionType: string;
    status: string;
    confidence: string;
    whatWasDecided: string;
    rationale: string | null;
    decisionMakerName: string | null;
    decidedAt: Date | null;
    createdAt: Date;
  }>;
  memory: Array<{
    id: string;
    category: string;
    content: string;
    importance: number;
    source: string | null;
    agentId: string | null;
    createdAt: Date;
  }>;
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    agentId: string | null;
    createdAt: Date;
  }>;
  /** Accepted work not yet running (tasks.status = 'pending'). */
  queued: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    agentId: string | null;
    cost: number;
    dueDate: Date | null;
    createdAt: Date;
  }>;
  /** Recently finished work — outcomes, not activity. */
  done: Array<{
    id: string;
    title: string;
    status: string;
    agentId: string | null;
    cost: number;
    result: string | null;
    updatedAt: Date;
  }>;
  /** docs/85 §3.3 — the department's operating numbers. */
  metrics: {
    creditsUsed30d: number;
    tasksDone30d: number;
    avgApprovalHours: number | null;
    budgetBurnPct: number | null;
    failed30d: number;
  };
  /** docs/85 §3.3 — event_rules whose assignee belongs to this department. */
  workflows: Array<{
    id: string;
    provider: string;
    eventType: string;
    action: string;
    requiresApproval: boolean;
    enabled: boolean;
    agentId: string | null;
    agentName: string | null;
    taskTitleTemplate: string | null;
  }>;
  /** docs/85 §3.3 — the member acting as department head (manager/router). */
  head: DepartmentMember | null;
}

/** Check if the departments table exists in the database. */
async function tableExists(db: Db): Promise<boolean> {
  try {
    await db.select({ count: sql<number>`1` }).from(departments).limit(1);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find all departments for an org with agent counts.
 *
 * `activeCount` is part of the contract, not a convenience: the department card
 * renders "4 agents · 4 active" and a utilization bar from these two numbers. It
 * was missing from the response while the web page read it anyway, so every card
 * computed `undefined / 4` and printed "NaN%" — a visible defect a founder reads
 * as a broken product. Count it here, where the real status lives.
 */
export async function findByOrg(
  db: Db,
  orgId: string,
): Promise<(Department & { agentCount: number; activeCount: number })[]> {
  if (!(await tableExists(db))) return [];
  try {
    const rows = await db
      .select({
        id: departments.id,
        orgId: departments.orgId,
        name: departments.name,
        description: departments.description,
        head: departments.head,
        budget: departments.budget,
        status: departments.status,
        settings: departments.settings,
        createdAt: departments.createdAt,
        updatedAt: departments.updatedAt,
        agentCount: sql<number>`coalesce(count(${agents.id}), 0)::int`,
        activeCount: sql<number>`coalesce(count(${agents.id}) filter (where ${agents.status} = 'active'), 0)::int`,
      })
      .from(departments)
      .leftJoin(agents, eq(agents.departmentId, departments.id))
      .where(eq(departments.orgId, orgId))
      .groupBy(departments.id)
      .orderBy(desc(departments.createdAt));
    return rows;
  } catch {
    return [];
  }
}

/** Find a department by name within an org. */
export async function findByName(
  db: Db,
  orgId: string,
  name: string,
): Promise<Department | undefined> {
  if (!(await tableExists(db))) return undefined;
  try {
    const rows = await db
      .select()
      .from(departments)
      .where(and(eq(departments.orgId, orgId), eq(departments.name, name)))
      .limit(1);
    return rows[0];
  } catch {
    return undefined;
  }
}

/** Find a department by id within an org. */
export async function findById(
  db: Db,
  orgId: string,
  id: string,
): Promise<Department | undefined> {
  if (!(await tableExists(db))) return undefined;
  try {
    const rows = await db
      .select()
      .from(departments)
      .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
      .limit(1);
    return rows[0];
  } catch {
    return undefined;
  }
}

/**
 * Everything a department workspace reads (docs/71 §G), in one pass.
 *
 * The department owns only its own row. Every other zone is scoped through
 * its members — the people are the scope. `agents.department_id` is the join;
 * the legacy free-text `agents.department` column is deliberately NOT used,
 * because it drifts (that drift is what made every employee read as
 * "Unassigned" until the batch lookup was fixed).
 *
 * Each block is independently guarded: a missing/older table degrades to an
 * empty list rather than a 500 on the founder's department page.
 */
export async function findDetail(
  db: Db,
  orgId: string,
  id: string,
): Promise<DepartmentDetail | undefined> {
  if (!(await tableExists(db))) return undefined;

  const department = await findById(db, orgId, id);
  if (!department) return undefined;

  // Members — the scope for every other zone.
  let memberRows: Array<Omit<DepartmentMember, 'teamName'>> = [];
  try {
    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        role: agents.role,
        status: agents.status,
        autonomyLevel: agents.autonomyLevel,
        currentTask: agents.currentTask,
        teamId: agents.teamId,
        tasksCompleted: agents.tasksCompleted,
        tasksFailed: agents.tasksFailed,
        creditsUsed: agents.creditsUsed,
        weeklyCost: agents.weeklyCost,
        lastActiveAt: agents.lastActiveAt,
        authority: agents.authority,
      })
      .from(agents)
      .where(and(eq(agents.orgId, orgId), eq(agents.departmentId, id)))
      .orderBy(desc(agents.lastActiveAt));
    memberRows = rows;
  } catch {
    memberRows = [];
  }
  const memberIds = memberRows.map((m) => m.id);

  // Teams in this department, with their headcounts resolved from the members
  // we already hold (one query, no N+1).
  let departmentTeams: DepartmentTeamRow[] = [];
  try {
    const rows = await db
      .select({ id: teams.id, name: teams.name, lead: teams.lead, status: teams.status })
      .from(teams)
      .where(and(eq(teams.orgId, orgId), eq(teams.departmentId, id)))
      .orderBy(desc(teams.createdAt));
    departmentTeams = rows.map((t) => {
      const inTeam = memberRows.filter((m) => m.teamId === t.id);
      return {
        ...t,
        agentCount: inTeam.length,
        activeCount: inTeam.filter((m) => m.status === 'active').length,
      };
    });
  } catch {
    departmentTeams = [];
  }

  // Member team names, for the Team zone's rows.
  const teamNameById = new Map(departmentTeams.map((t) => [t.id, t.name]));
  const members: DepartmentMember[] = memberRows.map((m) => ({
    ...m,
    teamName: m.teamId ? (teamNameById.get(m.teamId) ?? null) : null,
  }));

  // Task ids for this department — the join for work, decisions and files.
  let memberTaskIds: string[] = [];
  try {
    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.orgId, orgId), memberIds.length > 0 ? inArray(tasks.agentId, memberIds) : sql`false`))
      .orderBy(desc(tasks.createdAt))
      .limit(400);
    memberTaskIds = rows.map((r) => r.id);
  } catch {
    memberTaskIds = [];
  }

  // NOW — work that is live or waiting, never finished history.
  let now: DepartmentDetail['now'] = [];
  try {
    if (memberIds.length > 0) {
      now = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          agentId: tasks.agentId,
          cost: tasks.cost,
          dueDate: tasks.dueDate,
          createdAt: tasks.createdAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.orgId, orgId),
            inArray(tasks.agentId, memberIds),
            inArray(tasks.status, ['in_progress', 'awaiting_approval']),
          ),
        )
        .orderBy(desc(tasks.createdAt))
        .limit(25);
    }
  } catch {
    now = [];
  }

  // QUEUED — accepted work waiting for a run (docs/85 §3.3). Kept separate so
  // the page can answer "what is running" and "what is lined up" without one
  // blended list that reads as busier than it is.
  let queued: DepartmentDetail['queued'] = [];
  try {
    if (memberIds.length > 0) {
      queued = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          agentId: tasks.agentId,
          cost: tasks.cost,
          dueDate: tasks.dueDate,
          createdAt: tasks.createdAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.orgId, orgId),
            inArray(tasks.agentId, memberIds),
            eq(tasks.status, 'pending'),
          ),
        )
        .orderBy(desc(tasks.createdAt))
        .limit(25);
    }
  } catch {
    queued = [];
  }

  // DONE — recent outcomes with their results (docs/85 §3.3).
  let done: DepartmentDetail['done'] = [];
  try {
    if (memberIds.length > 0) {
      done = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          agentId: tasks.agentId,
          cost: tasks.cost,
          result: tasks.result,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.orgId, orgId),
            inArray(tasks.agentId, memberIds),
            inArray(tasks.status, ['completed', 'failed']),
          ),
        )
        .orderBy(desc(tasks.updatedAt))
        .limit(10);
    }
  } catch {
    done = [];
  }

  // METRICS — the department's operating numbers (docs/85 §3.3). One grouped
  // query over the 30-day window; approval latency comes from the decisions
  // already loaded below, not a second scan.
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let metrics: DepartmentDetail['metrics'] = {
    creditsUsed30d: 0,
    tasksDone30d: 0,
    avgApprovalHours: null,
    budgetBurnPct: null,
    failed30d: 0,
  };
  try {
    if (memberIds.length > 0) {
      const [window] = await db
        .select({
          credits: sql<number>`coalesce(sum(${tasks.cost}), 0)::int`,
          done: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
          failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.orgId, orgId),
            inArray(tasks.agentId, memberIds),
            sql`${tasks.updatedAt} >= ${since30d}`,
          ),
        );
      metrics = {
        creditsUsed30d: window?.credits ?? 0,
        tasksDone30d: window?.done ?? 0,
        avgApprovalHours: null,
        budgetBurnPct:
          department.budget && department.budget > 0
            ? Math.round(
                (members.reduce((a, m) => a + (m.creditsUsed ?? 0), 0) /
                  department.budget) * 100,
              )
            : null,
        failed30d: window?.failed ?? 0,
      };
    }
  } catch {
    // keep zeroed metrics
  }

  // WORKFLOWS — event rules whose assignee belongs to this department
  // (docs/85 §3.3). These are the recurring, trigger-driven processes the
  // department owns; read-only surfacing here, editor in P2.
  let workflows: DepartmentDetail['workflows'] = [];
  try {
    if (memberIds.length > 0) {
      const rows = await db
        .select({
          id: eventRules.id,
          provider: eventRules.provider,
          eventType: eventRules.eventType,
          action: eventRules.action,
          requiresApproval: eventRules.requiresApproval,
          enabled: eventRules.enabled,
          agentId: eventRules.agentId,
          taskTitleTemplate: eventRules.taskTitleTemplate,
        })
        .from(eventRules)
        .where(
          and(
            eq(eventRules.orgId, orgId),
            inArray(eventRules.agentId, memberIds),
          ),
        )
        .orderBy(desc(eventRules.createdAt))
        .limit(20);
      const nameByAgent = new Map(members.map((m) => [m.id, m.name] as const));
      workflows = rows.map((r) => ({
        ...r,
        agentName: r.agentId ? (nameByAgent.get(r.agentId) ?? null) : null,
      }));
    }
  } catch {
    workflows = [];
  }

  // HEAD — the member acting as the department's manager/router (docs/85
  // §3.3). departments.head stores the member's NAME; resolve to the row so
  // the UI can show state + authority, and link the profile.
  const head = department.head
    ? (members.find((m) => m.name === department.head) ?? null)
    : null;

  // Needs founder — pending approvals addressed to this department's members.
  let needsFounder: DepartmentDetail['needsFounder'] = [];
  try {
    if (memberIds.length > 0) {
      needsFounder = await db
        .select({
          id: approvals.id,
          action: approvals.action,
          description: approvals.description,
          cost: approvals.cost,
          riskLevel: approvals.riskLevel,
          agentId: approvals.agentId,
          taskId: approvals.taskId,
          createdAt: approvals.createdAt,
        })
        .from(approvals)
        .where(
          and(
            eq(approvals.orgId, orgId),
            inArray(approvals.agentId, memberIds),
            eq(approvals.status, 'pending'),
          ),
        )
        .orderBy(desc(approvals.createdAt))
        .limit(25);
    }
  } catch {
    needsFounder = [];
  }

  // Recent approvals — the decisions the founder has already made on this
  // department's requests. Pending ones live in `needsFounder`.
  let recentApprovals: DepartmentDetail['recentApprovals'] = [];
  try {
    if (memberIds.length > 0) {
      recentApprovals = await db
        .select({
          id: approvals.id,
          action: approvals.action,
          description: approvals.description,
          cost: approvals.cost,
          riskLevel: approvals.riskLevel,
          status: approvals.status,
          decisionNote: approvals.decisionNote,
          agentId: approvals.agentId,
          taskId: approvals.taskId,
          decidedAt: approvals.decidedAt,
          createdAt: approvals.createdAt,
        })
        .from(approvals)
        .where(
          and(
            eq(approvals.orgId, orgId),
            inArray(approvals.agentId, memberIds),
            sql`${approvals.status} <> 'pending'`,
          ),
        )
        .orderBy(desc(approvals.decidedAt), desc(approvals.createdAt))
        .limit(20);
    }
  } catch {
    recentApprovals = [];
  }

  // Activity — what this department did, from its members' own events.
  let activity: DepartmentDetail['activity'] = [];
  try {
    if (memberIds.length > 0) {
      activity = await db
        .select({
          id: activityEvents.id,
          type: activityEvents.type,
          summary: activityEvents.summary,
          reason: activityEvents.reason,
          cost: activityEvents.cost,
          agentId: activityEvents.agentId,
          occurredAt: activityEvents.occurredAt,
        })
        .from(activityEvents)
        .where(and(eq(activityEvents.orgId, orgId), inArray(activityEvents.agentId, memberIds)))
        .orderBy(desc(activityEvents.occurredAt))
        .limit(25);
    }
  } catch {
    activity = [];
  }

  // Recent decisions — ones a member made, or ones recorded against a task the
  // department ran.
  let recentDecisions: DepartmentDetail['decisions'] = [];
  try {
    if (memberIds.length > 0) {
      recentDecisions = await db
        .select({
          id: decisions.id,
          title: decisions.title,
          decisionType: decisions.decisionType,
          status: decisions.status,
          confidence: decisions.confidence,
          whatWasDecided: decisions.whatWasDecided,
          rationale: decisions.rationale,
          decisionMakerName: decisions.decisionMakerName,
          decidedAt: decisions.decidedAt,
          createdAt: decisions.createdAt,
        })
        .from(decisions)
        .where(
          and(
            eq(decisions.orgId, orgId),
            memberTaskIds.length > 0
              ? or(
                  inArray(decisions.decisionMakerId, memberIds),
                  inArray(decisions.taskId, memberTaskIds),
                )
              : inArray(decisions.decisionMakerId, memberIds),
          ),
        )
        .orderBy(desc(decisions.createdAt))
        .limit(20);
    }
  } catch {
    recentDecisions = [];
  }

  // Department memory — what this department's people know. This is the same
  // company_memory store the runtime hands an employee before a task.
  let memory: DepartmentDetail['memory'] = [];
  try {
    if (memberIds.length > 0) {
      memory = await db
        .select({
          id: companyMemory.id,
          category: companyMemory.category,
          content: companyMemory.content,
          importance: companyMemory.importance,
          source: companyMemory.source,
          agentId: companyMemory.agentId,
          createdAt: companyMemory.createdAt,
        })
        .from(companyMemory)
        .where(and(eq(companyMemory.orgId, orgId), inArray(companyMemory.agentId, memberIds)))
        .orderBy(desc(companyMemory.importance), desc(companyMemory.createdAt))
        .limit(25);
    }
  } catch {
    memory = [];
  }

  // Resources — files this department's members produced or were attached to.
  let departmentFiles: DepartmentDetail['files'] = [];
  try {
    if (memberIds.length > 0) {
      departmentFiles = await db
        .select({
          id: files.id,
          name: files.name,
          mimeType: files.mimeType,
          size: files.size,
          agentId: files.agentId,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(and(eq(files.orgId, orgId), inArray(files.agentId, memberIds)))
        .orderBy(desc(files.createdAt))
        .limit(25);
    }
  } catch {
    departmentFiles = [];
  }

  // Approval latency from the decisions already loaded — how long this
  // department's requests waited on the founder before a ruling.
  const decided = recentApprovals.filter((a) => a.decidedAt);
  if (decided.length > 0) {
    const totalMs = decided.reduce(
      (acc, a) => acc + (new Date(a.decidedAt!).getTime() - new Date(a.createdAt).getTime()),
      0,
    );
    metrics.avgApprovalHours = Math.round((totalMs / decided.length / 3_600_000) * 10) / 10;
  }

  return {
    department: {
      ...department,
      agentCount: members.length,
      activeCount: members.filter((m) => m.status === 'active').length,
    },
    members,
    teams: departmentTeams,
    now,
    queued,
    done,
    metrics,
    workflows,
    head,
    needsFounder,
    recentApprovals,
    activity,
    decisions: recentDecisions,
    memory,
    files: departmentFiles,
  };
}

/** Create a new department. */
export async function createDepartment(
  db: Db,
  data: { orgId: string; name: string; description?: string; budget?: number; head?: string },
): Promise<Department> {
  if (!(await tableExists(db))) {
    throw new Error('Departments feature not available yet — database migration needed');
  }
  const rows = await db
    .insert(departments)
    .values({
      orgId: data.orgId,
      name: data.name,
      description: data.description ?? null,
      budget: data.budget ?? null,
      head: data.head ?? null,
      status: 'active',
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('createDepartment returned no row');
  return row;
}

/** docs/85 §7 — section order + metric emphasis, resolved server-side so the UI never guesses. */
export interface DepartmentPageConfig {
  sections: string[];
  metrics: string[];
}

const CANONICAL_SECTIONS = [
  'now',
  'needsFounder',
  'employees',
  'workflows',
  'metrics',
  'queued',
  'done',
  'decisions',
  'memory',
  'tools',
  'resources',
  'activity',
];

const PAGE_CONFIGS: Record<string, DepartmentPageConfig> = {
  executive_office: {
    sections: ['needsFounder', 'now', 'employees', 'workflows', 'metrics', 'queued', 'done', 'decisions', 'memory', 'tools', 'activity'],
    metrics: ['tasksDone30d', 'creditsUsed30d', 'avgApprovalHours', 'failed30d'],
  },
  engineering: {
    sections: ['now', 'needsFounder', 'employees', 'workflows', 'metrics', 'queued', 'done', 'decisions', 'memory', 'tools', 'resources', 'activity'],
    metrics: ['failed30d', 'tasksDone30d', 'creditsUsed30d', 'budgetBurnPct'],
  },
  marketing: {
    sections: ['now', 'queued', 'needsFounder', 'employees', 'workflows', 'metrics', 'done', 'decisions', 'memory', 'tools', 'activity'],
    metrics: ['tasksDone30d', 'creditsUsed30d', 'budgetBurnPct', 'avgApprovalHours'],
  },
  sales: {
    sections: ['now', 'queued', 'needsFounder', 'employees', 'workflows', 'metrics', 'done', 'decisions', 'memory', 'tools', 'activity'],
    metrics: ['tasksDone30d', 'creditsUsed30d', 'budgetBurnPct', 'avgApprovalHours'],
  },
  finance: {
    sections: ['needsFounder', 'now', 'employees', 'workflows', 'metrics', 'queued', 'done', 'decisions', 'memory', 'tools', 'activity'],
    metrics: ['budgetBurnPct', 'creditsUsed30d', 'avgApprovalHours', 'tasksDone30d'],
  },
  customer_success: {
    sections: ['now', 'needsFounder', 'employees', 'workflows', 'metrics', 'queued', 'done', 'decisions', 'memory', 'tools', 'activity'],
    metrics: ['tasksDone30d', 'failed30d', 'avgApprovalHours', 'creditsUsed30d'],
  },
};

export function defaultPageConfig(templateSlug?: string | null): DepartmentPageConfig {
  return PAGE_CONFIGS[templateSlug ?? ''] ?? { sections: CANONICAL_SECTIONS, metrics: ['tasksDone30d', 'creditsUsed30d', 'budgetBurnPct', 'avgApprovalHours'] };
}

/**
 * Merge a blueprint into departments.settings (docs/85 §3.2). Activation calls
 * this on BOTH the create and reuse paths, so re-activating a template
 * upgrades an existing department with its blueprint instead of silently
 * discarding it.
 */
export async function setDepartmentBlueprint(
  db: Db,
  orgId: string,
  id: string,
  blueprint: {
    templateSlug: string;
    kpis?: unknown;
    typicalGoals?: unknown;
    roles?: unknown;
  },
): Promise<void> {
  if (!(await tableExists(db))) return;
  const [row] = await db
    .select({ settings: departments.settings })
    .from(departments)
    .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
    .limit(1);
  if (!row) return;
  const existing = (row.settings ?? {}) as Record<string, unknown>;
  await db
    .update(departments)
    .set({
      settings: {
        ...existing,
        templateSlug: blueprint.templateSlug,
        kpis: blueprint.kpis ?? existing.kpis ?? [],
        typicalGoals: blueprint.typicalGoals ?? existing.typicalGoals ?? [],
        roles: blueprint.roles ?? existing.roles ?? [],
        pageConfig: defaultPageConfig(blueprint.templateSlug),
      },
      updatedAt: new Date(),
    })
    .where(and(eq(departments.id, id), eq(departments.orgId, orgId)));
}

/** Update a department. */
export async function updateDepartment(
  db: Db,
  orgId: string,
  id: string,
  data: { name?: string; description?: string; budget?: number; head?: string; status?: string },
): Promise<Department | undefined> {
  if (!(await tableExists(db))) return undefined;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.budget !== undefined) updates.budget = data.budget;
  if (data.head !== undefined) updates.head = data.head;
  if (data.status !== undefined) updates.status = data.status;

  const rows = await db
    .update(departments)
    .set(updates)
    .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
    .returning();
  return rows[0];
}

/** Delete a department (only if no agents are assigned). */
export async function deleteDepartment(
  db: Db,
  orgId: string,
  id: string,
): Promise<boolean> {
  if (!(await tableExists(db))) return false;

  // Check for assigned agents
  const [agentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(eq(agents.departmentId, id), eq(agents.orgId, orgId)));

  if (agentCount && agentCount.count > 0) {
    throw new Error(`Cannot delete department — ${agentCount.count} agent(s) still assigned`);
  }

  const result = await db
    .delete(departments)
    .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
    .returning();
  return result.length > 0;
}
