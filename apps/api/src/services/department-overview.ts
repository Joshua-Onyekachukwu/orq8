import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import {
  activityEvents,
  agentJobs,
  agents,
  approvals,
  auditEvents,
  departments,
  tasks,
  webhookEvents,
  type Db,
} from '@orq8/db';

/**
 * Executive department strip + workflow run history (docs/85 §6, P3).
 *
 * Two reads that exist because the executive surface could not answer two
 * founder questions with real data:
 *
 *   1. "What is each department's state right now?" — the dashboard had the
 *      company composite and a per-department employee list, but no per-
 *      DEPARTMENT state or health. This returns exactly the counts a state and
 *      a health score are built from, so the web layer can compute both with
 *      one shared formula instead of the API inventing a second one.
 *
 *   2. "What did this department's workflows actually do?" — docs/85 §6 asks for
 *      job lineage per rule. A run is a matched webhook event; its outcome is
 *      recorded in the hash-chained audit log (`event.rule.task_created` /
 *      `event.rule.approval_created`, keyed by `input_ref` = the event id), and
 *      the job that ran the created task lives in `agent_jobs`. This traces
 *      rule → run → task → job from rows that were really written, never by
 *      guessing from a task title.
 *
 * Nothing here fabricates a number: every field is a count or a timestamp read
 * out of the org's own rows. Goal scoring is deliberately absent — goals are
 * org-scoped and have no department column, so a per-department health score
 * cannot honestly include them (the web composite says the same thing).
 */

export type DepartmentState =
  | 'needs_you'
  | 'blocked'
  | 'working'
  | 'queued'
  | 'idle'
  | 'empty'
  | 'archived';

export interface DepartmentOverviewCounts {
  /** 0..100 inputs for the workforce dimension. */
  membersTotal: number;
  membersActive: number;
  membersPaused: number;
  /** 0..100 inputs for the execution dimension (30-day window). */
  tasksDone30d: number;
  tasksFailed30d: number;
  tasksWorking: number;
  tasksQueued: number;
  /** Pending founder gates addressed to this department's members. */
  gatesPending: number;
  /** Age of the oldest open gate, in hours; null when none is open. */
  oldestGateHours: number | null;
  /** Credit budget inputs. `null` budget means the dimension is not scored. */
  budgetAmount: number | null;
  budgetRemaining: number | null;
}

export interface DepartmentOverviewRow {
  id: string;
  name: string;
  description: string | null;
  templateSlug: string | null;
  head: string | null;
  state: DepartmentState;
  counts: DepartmentOverviewCounts;
  /** Newest activity event from any member; null when the department has none. */
  lastActivityAt: Date | null;
}

const WINDOW_DAYS = 30;
const ACTIVITY_SCAN = 2000;

/**
 * The department state vocabulary, in the priority docs/85 §4 fixes: a founder
 * decision outranks a failure, a failure outranks progress, and a department
 * with nothing at all is `empty` rather than a fake `idle`.
 *
 * `blocked` is derived, not a task status: ORQ8 has no `blocked` task state, so
 * the honest definition is "this department has a recent failure and nothing is
 * progressing" — a failure that has already been followed by new work is not
 * a block.
 */
function deriveState(input: {
  status: string;
  gatesPending: number;
  failed30d: number;
  working: number;
  queued: number;
  membersTotal: number;
}): DepartmentState {
  if (input.status === 'archived') return 'archived';
  if (input.gatesPending > 0) return 'needs_you';
  if (input.failed30d > 0 && input.working === 0) return 'blocked';
  if (input.working > 0) return 'working';
  if (input.queued > 0) return 'queued';
  if (input.membersTotal > 0) return 'idle';
  return 'empty';
}

/**
 * The executive department strip: one row per department with the counts its
 * state and health are built from. Org-scoped first, like every other read.
 */
export async function departmentOverview(
  db: Db,
  orgId: string,
): Promise<DepartmentOverviewRow[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [deptRows, agentRows] = await Promise.all([
    db
      .select({
        id: departments.id,
        name: departments.name,
        description: departments.description,
        head: departments.head,
        budget: departments.budget,
        status: departments.status,
        settings: departments.settings,
      })
      .from(departments)
      .where(eq(departments.orgId, orgId))
      .orderBy(desc(departments.createdAt)),
    db
      .select({
        id: agents.id,
        departmentId: agents.departmentId,
        status: agents.status,
        creditsUsed: agents.creditsUsed,
      })
      .from(agents)
      .where(eq(agents.orgId, orgId)),
  ]);

  const agentDept = new Map(agentRows.map((a) => [a.id, a.departmentId] as const));
  const memberIdsByDept = new Map<string, string[]>();
  const memberStats = new Map<string, { total: number; active: number; paused: number }>();
  const lifetimeCreditsByDept = new Map<string, number>();
  for (const agent of agentRows) {
    if (!agent.departmentId) continue;
    const list = memberIdsByDept.get(agent.departmentId) ?? [];
    list.push(agent.id);
    memberIdsByDept.set(agent.departmentId, list);
    const stats = memberStats.get(agent.departmentId) ?? { total: 0, active: 0, paused: 0 };
    stats.total += 1;
    if (agent.status === 'active') stats.active += 1;
    else if (agent.status === 'paused') stats.paused += 1;
    memberStats.set(agent.departmentId, stats);
    lifetimeCreditsByDept.set(
      agent.departmentId,
      (lifetimeCreditsByDept.get(agent.departmentId) ?? 0) + (agent.creditsUsed ?? 0),
    );
  }

  const allMemberIds = agentRows.map((a) => a.id);
  const empty: DepartmentOverviewRow['counts'] = {
    membersTotal: 0,
    membersActive: 0,
    membersPaused: 0,
    tasksDone30d: 0,
    tasksFailed30d: 0,
    tasksWorking: 0,
    tasksQueued: 0,
    gatesPending: 0,
    oldestGateHours: null,
    budgetAmount: null,
    budgetRemaining: null,
  };

  if (allMemberIds.length === 0) {
    return deptRows.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      templateSlug: (d.settings as { templateSlug?: string } | null)?.templateSlug ?? null,
      head: d.head,
      state: deriveState({
        status: d.status,
        gatesPending: 0,
        failed30d: 0,
        working: 0,
        queued: 0,
        membersTotal: 0,
      }),
      counts: { ...empty },
      lastActivityAt: null,
    }));
  }

  // Recent tasks for this org's members — the execution dimension. Bounded by
  // the 30-day window so a large org's history cannot make the strip slow.
  const taskByDept = new Map<
    string,
    { done: number; failed: number; working: number; queued: number; awaiting: number }
  >();
  const gateRows: Array<{ agentId: string | null; createdAt: Date }> = [];
  const activityByDept = new Map<string, Date>();

  const [taskRows, pendingGates, recentActivity] = await Promise.all([
    db
      .select({ agentId: tasks.agentId, status: tasks.status })
      .from(tasks)
      .where(
        and(
          eq(tasks.orgId, orgId),
          inArray(tasks.agentId, allMemberIds),
          gte(tasks.createdAt, since),
        ),
      ),
    db
      .select({ agentId: approvals.agentId, createdAt: approvals.createdAt })
      .from(approvals)
      .where(
        and(
          eq(approvals.orgId, orgId),
          eq(approvals.status, 'pending'),
          inArray(approvals.agentId, allMemberIds),
        ),
      ),
    db
      .select({ agentId: activityEvents.agentId, occurredAt: activityEvents.occurredAt })
      .from(activityEvents)
      .where(and(eq(activityEvents.orgId, orgId), inArray(activityEvents.agentId, allMemberIds)))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(ACTIVITY_SCAN),
  ]);

  for (const task of taskRows) {
    const deptId = task.agentId ? agentDept.get(task.agentId) : null;
    if (!deptId) continue;
    const bucket =
      taskByDept.get(deptId) ?? { done: 0, failed: 0, working: 0, queued: 0, awaiting: 0 };
    if (task.status === 'completed') bucket.done += 1;
    else if (task.status === 'failed') bucket.failed += 1;
    else if (task.status === 'in_progress') bucket.working += 1;
    else if (task.status === 'awaiting_approval') bucket.awaiting += 1;
    else if (task.status === 'pending') bucket.queued += 1;
    taskByDept.set(deptId, bucket);
  }

  for (const gate of pendingGates) gateRows.push(gate);
  const gatesByDept = new Map<string, { pending: number; oldest: Date | null }>();
  for (const gate of gateRows) {
    const deptId = gate.agentId ? agentDept.get(gate.agentId) : null;
    if (!deptId) continue;
    const bucket = gatesByDept.get(deptId) ?? { pending: 0, oldest: null };
    bucket.pending += 1;
    if (!bucket.oldest || gate.createdAt < bucket.oldest) bucket.oldest = gate.createdAt;
    gatesByDept.set(deptId, bucket);
  }

  for (const event of recentActivity) {
    const deptId = event.agentId ? agentDept.get(event.agentId) : null;
    if (!deptId) continue;
    const current = activityByDept.get(deptId);
    if (!current || event.occurredAt > current) activityByDept.set(deptId, event.occurredAt);
  }

  return deptRows.map((d) => {
    const stats = memberStats.get(d.id) ?? { total: 0, active: 0, paused: 0 };
    const work = taskByDept.get(d.id) ?? { done: 0, failed: 0, working: 0, queued: 0, awaiting: 0 };
    const gates = gatesByDept.get(d.id) ?? { pending: 0, oldest: null };
    const budget = d.budget && d.budget > 0 ? d.budget : null;
    const burned = lifetimeCreditsByDept.get(d.id) ?? 0;
    const counts: DepartmentOverviewCounts = {
      membersTotal: stats.total,
      membersActive: stats.active,
      membersPaused: stats.paused,
      tasksDone30d: work.done,
      tasksFailed30d: work.failed,
      // Awaiting work is stopped by a founder gate, so it reads as neither
      // working nor queued — it is counted in `gatesPending`, and folding it
      // into `queued` would double it.
      tasksWorking: work.working,
      tasksQueued: work.queued,
      gatesPending: gates.pending,
      oldestGateHours: gates.oldest
        ? Math.round(((Date.now() - gates.oldest.getTime()) / 3_600_000) * 10) / 10
        : null,
      budgetAmount: budget,
      budgetRemaining: budget === null ? null : Math.max(0, budget - burned),
    };
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      templateSlug: (d.settings as { templateSlug?: string } | null)?.templateSlug ?? null,
      head: d.head,
      state: deriveState({
        status: d.status,
        gatesPending: counts.gatesPending,
        failed30d: counts.tasksFailed30d,
        working: counts.tasksWorking,
        queued: counts.tasksQueued,
        membersTotal: counts.membersTotal,
      }),
      counts,
      lastActivityAt: activityByDept.get(d.id) ?? null,
    };
  });
}

// ─── Workflow run history ────────────────────────────────────────────────────

export interface WorkflowRunJob {
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  updatedAt: Date;
}

export interface WorkflowRun {
  /** The matched webhook event — one run of the rule. */
  eventId: string;
  provider: string;
  eventType: string;
  title: string | null;
  /** webhook_events.status: pending | processed | failed | dead. */
  status: string;
  receivedAt: Date;
  processedAt: Date | null;
  retryCount: number;
  lastError: string | null;
  /** What the rule did with this run, from the audit trail. */
  outcome: 'task' | 'approval' | 'ignored' | 'unresolved';
  taskId: string | null;
  approvalId: string | null;
  /** The job that ran the created task, when one exists. */
  job: WorkflowRunJob | null;
}

const RUNS_PER_RULE = 6;
const EVENT_SCAN = 500;

/**
 * Recent runs for a set of rules, keyed by rule id.
 *
 * The lineage is read, not inferred:
 *   rule (provider + eventType)  →  webhook_events of that key  →  the task or
 *   approval the audit log records against that event id  →  the job for that
 *   task in agent_jobs.
 *
 * A rule that has never fired returns an empty list, which is the truth and is
 * rendered as "no runs recorded" rather than hidden.
 */
export async function workflowRunHistory(
  db: Db,
  orgId: string,
  rules: Array<{ id: string; provider: string; eventType: string }>,
): Promise<Record<string, WorkflowRun[]>> {
  const byRule: Record<string, WorkflowRun[]> = {};
  for (const rule of rules) byRule[rule.id] = [];
  if (rules.length === 0) return byRule;

  const providers = [...new Set(rules.map((r) => r.provider))];
  const events = await db
    .select({
      id: webhookEvents.id,
      provider: webhookEvents.provider,
      eventType: webhookEvents.eventType,
      title: webhookEvents.title,
      status: webhookEvents.status,
      receivedAt: webhookEvents.receivedAt,
      processedAt: webhookEvents.processedAt,
      retryCount: webhookEvents.retryCount,
      lastError: webhookEvents.lastError,
    })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.orgId, orgId), inArray(webhookEvents.provider, providers)))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(EVENT_SCAN);

  if (events.length === 0) return byRule;

  const eventIds = events.map((e) => e.id);
  const outcomes = await db
    .select({
      action: auditEvents.action,
      inputRef: auditEvents.inputRef,
      taskId: auditEvents.taskId,
      approvalId: auditEvents.approvalId,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.orgId, orgId),
        inArray(auditEvents.inputRef, eventIds),
      ),
    );

  const outcomeByEvent = new Map<string, { taskId: string | null; approvalId: string | null }>();
  for (const row of outcomes) {
    if (!row.inputRef) continue;
    if (!row.action.startsWith('event.rule.')) continue;
    const current = outcomeByEvent.get(row.inputRef) ?? { taskId: null, approvalId: null };
    if (row.taskId) current.taskId = row.taskId;
    if (row.approvalId) current.approvalId = row.approvalId;
    outcomeByEvent.set(row.inputRef, current);
  }

  const taskIds = [...outcomeByEvent.values()]
    .map((o) => o.taskId)
    .filter((id): id is string => !!id);
  const jobByTask = new Map<string, WorkflowRunJob>();
  if (taskIds.length > 0) {
    const jobRows = await db
      .select({
        taskId: agentJobs.taskId,
        status: agentJobs.status,
        attempts: agentJobs.attempts,
        maxAttempts: agentJobs.maxAttempts,
        lastError: agentJobs.lastError,
        updatedAt: agentJobs.updatedAt,
      })
      .from(agentJobs)
      .where(and(eq(agentJobs.orgId, orgId), inArray(agentJobs.taskId, taskIds)))
      .orderBy(desc(agentJobs.updatedAt));
    for (const job of jobRows) {
      if (!job.taskId) continue;
      // Newest job per task wins (the list is already newest-first).
      if (!jobByTask.has(job.taskId)) {
        jobByTask.set(job.taskId, {
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          lastError: job.lastError,
          updatedAt: job.updatedAt,
        });
      }
    }
  }

  for (const rule of rules) {
    const runs: WorkflowRun[] = [];
    for (const event of events) {
      if (event.provider !== rule.provider || event.eventType !== rule.eventType) continue;
      if (runs.length >= RUNS_PER_RULE) break;
      const outcome = outcomeByEvent.get(event.id) ?? null;
      const taskId = outcome?.taskId ?? null;
      runs.push({
        eventId: event.id,
        provider: event.provider,
        eventType: event.eventType,
        title: event.title,
        status: event.status,
        receivedAt: event.receivedAt,
        processedAt: event.processedAt,
        retryCount: event.retryCount,
        lastError: event.lastError,
        outcome: taskId ? 'task' : outcome?.approvalId ? 'approval' : 'unresolved',
        taskId,
        approvalId: outcome?.approvalId ?? null,
        job: taskId ? (jobByTask.get(taskId) ?? null) : null,
      });
    }
    byRule[rule.id] = runs;
  }

  return byRule;
}
