import { loadConfig } from '@orq8/core';
import {
  activityEvents,
  agentJobs,
  agents,
  approvals,
  departments,
  eventRules,
  organizations,
  tasks,
  webhookEvents,
  createDb,
} from '@orq8/db';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { departmentOverview, workflowRunHistory } from '../src/services/department-overview.js';
import { appendAudit } from '../src/services/audit.js';
import { deleteOrg } from './helpers/delete-org.js';

/**
 * Executive department strip + workflow run history (docs/85 §6, P3).
 *
 * These pin the claims the two new surfaces make:
 *   * the department state follows the fixed priority (needs you > blocked >
 *     working > queued > idle > empty), and a department with nothing says
 *     `empty` rather than a fake `idle`;
 *   * every count is the department's own — a member of another department, or
 *     of another org, can never move this department's numbers;
 *   * workflow runs are traced rule → matched event → the task the audit trail
 *     records → the job that ran that task, and a rule that never fired reports
 *     no runs rather than a fabricated one.
 */

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
} as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;
const { db } = createDb(config.DATABASE_URL);

const orgId = randomUUID();
const otherOrgId = randomUUID();
const gatedDeptId = randomUUID();
const emptyDeptId = randomUUID();
const busyDeptId = randomUUID();
const gatedAgentId = randomUUID();
const busyAgentId = randomUUID();
const foreignAgentId = randomUUID();
const workingTaskId = randomUUID();
const gateTaskId = randomUUID();
const ruleId = randomUUID();
const ruleAgentId = randomUUID();
const firedEventId = randomUUID();
const jobTaskId = randomUUID();

run('department overview + workflow runs', () => {
  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgId, name: `strip-${orgId.slice(0, 8)}`, slug: `strip-${orgId.slice(0, 8)}` },
      {
        id: otherOrgId,
        name: `strip-other-${otherOrgId.slice(0, 8)}`,
        slug: `strip-other-${otherOrgId.slice(0, 8)}`,
      },
    ]);

    await db.insert(departments).values([
      { id: gatedDeptId, orgId, name: 'Engineering', status: 'active', settings: { templateSlug: 'engineering' } },
      { id: emptyDeptId, orgId, name: 'Research', status: 'active' },
      { id: busyDeptId, orgId, name: 'Marketing', status: 'active' },
    ]);

    await db.insert(agents).values([
      { id: gatedAgentId, orgId, name: 'Ada', role: 'engineering_lead', departmentId: gatedDeptId, status: 'active' },
      { id: busyAgentId, orgId, name: 'Nova', role: 'content_writer', departmentId: busyDeptId, status: 'active' },
      { id: ruleAgentId, orgId, name: 'Ridge', role: 'software_engineer', departmentId: gatedDeptId, status: 'active' },
      // A member of another ORG: must never leak into this org's strip.
      {
        id: foreignAgentId,
        orgId: otherOrgId,
        name: 'Mallory',
        role: 'engineering_lead',
        departmentId: gatedDeptId,
        status: 'active',
      },
    ]);

    await db.insert(tasks).values([
      // Gated department: one failure (nothing progressing) + one queued task.
      { id: workingTaskId, orgId, agentId: gatedAgentId, title: 'Ship the build', status: 'pending' },
      { orgId, agentId: gatedAgentId, title: 'Old failure', status: 'failed' },
      // Busy department: work in flight.
      { orgId, agentId: busyAgentId, title: 'Draft the post', status: 'in_progress' },
      { orgId, agentId: busyAgentId, title: 'Publish', status: 'completed' },
    ]);

    // Gate on the gated department — an approval, not a task.
    await db.insert(approvals).values({
      orgId,
      agentId: gatedAgentId,
      action: 'external.email.send',
      cost: 0,
      riskLevel: 'low',
      status: 'pending',
    });

    await db.insert(activityEvents).values({
      orgId,
      agentId: busyAgentId,
      type: 'drafted',
      summary: 'Nova drafted the launch post',
    });

    // A workflow rule, one matched event, the task it created, the job it ran.
    await db.insert(eventRules).values({
      id: ruleId,
      orgId,
      provider: 'github',
      eventType: 'pr_opened',
      action: 'create_task',
      agentId: ruleAgentId,
      taskTitleTemplate: 'Review PR',
    });
    await db.insert(webhookEvents).values({
      id: firedEventId,
      orgId,
      provider: 'github',
      eventType: 'pr_opened',
      title: 'PR #12 opened',
      status: 'processed',
    });
    await db.insert(tasks).values({
      id: jobTaskId,
      orgId,
      agentId: ruleAgentId,
      title: 'Review PR',
      status: 'completed',
    });
    await db.insert(agentJobs).values({
      orgId,
      type: 'task.execute',
      payload: { taskId: jobTaskId },
      status: 'done',
      taskId: jobTaskId,
      attempts: 1,
      maxAttempts: 3,
    });
    // The lineage row the webhook processor writes when a rule creates a task.
    await appendAudit(db, {
      orgId,
      actorType: 'system',
      action: 'event.rule.task_created',
      taskId: jobTaskId,
      outcome: 'success',
      inputRef: firedEventId,
    });
  });

  afterAll(async () => {
    if (pool) {
      await deleteOrg(pool, orgId).catch(() => undefined);
      await deleteOrg(pool, otherOrgId).catch(() => undefined);
    }
    await pool?.end().catch(() => undefined);
  });

  it('derives state by the fixed priority and never invents a member', async () => {
    const rows = await departmentOverview(db, orgId);
    const byId = new Map(rows.map((r) => [r.id, r]));

    // A pending gate outranks the recent failure.
    expect(byId.get(gatedDeptId)?.state).toBe('needs_you');
    // Work in flight is `working`, ahead of its own completed task.
    expect(byId.get(busyDeptId)?.state).toBe('working');
    // No members at all is `empty`, not `idle`.
    expect(byId.get(emptyDeptId)?.state).toBe('empty');
  });

  it('counts only this department\'s own members and work', async () => {
    const rows = await departmentOverview(db, orgId);
    const gated = rows.find((r) => r.id === gatedDeptId);
    expect(gated?.counts.membersTotal).toBe(2); // Ada + Ridge, never Mallory
    expect(gated?.counts.gatesPending).toBe(1);
    expect(gated?.counts.tasksFailed30d).toBe(1);
    // The gate is counted once, and the failure is what makes it `blocked`-ish
    // work — but the gate wins the state, so no member count leaks.
    const empty = rows.find((r) => r.id === emptyDeptId);
    expect(empty?.counts.membersTotal).toBe(0);
    expect(empty?.counts.gatesPending).toBe(0);
  });

  it('is org-scoped — another tenant\'s rows never appear', async () => {
    const other = await departmentOverview(db, otherOrgId);
    expect(other).toEqual([]);
  });

  it('traces a workflow run through the audit trail to its task and job', async () => {
    const runs = await workflowRunHistory(db, orgId, [
      { id: ruleId, provider: 'github', eventType: 'pr_opened' },
    ]);
    const list = runs[ruleId] ?? [];
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe('processed');
    expect(list[0]?.outcome).toBe('task');
    expect(list[0]?.taskId).toBe(jobTaskId);
    expect(list[0]?.job?.status).toBe('done');
  });

  it('reports no runs for a rule that has never fired', async () => {
    const runs = await workflowRunHistory(db, orgId, [
      { id: randomUUID(), provider: 'linear', eventType: 'issue_created' },
    ]);
    expect(Object.values(runs).every((list) => list.length === 0)).toBe(true);
  });
});
