import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import {
  agents as agentsTable,
  approvals as approvalsTable,
  auditEvents as auditEventsTable,
  createDb,
  tasks as tasksTable,
} from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

/**
 * Gap A and Gap C (docs/66 §66.14) — an approval names the work it gates, and
 * deciding it moves that work.
 *
 * Before this, an approval carried an `action` string and nothing else. The
 * founder was shown a sentence and asked to rule on it, and the product had no
 * way to connect the answer back to the work: approving released nothing,
 * rejecting stopped nothing, and the task sat in `pending` forever while the
 * Command Center reported the request as handled. Separately, `executePendingTasks`
 * had no caller at all, so queued work only ever moved when someone asked for one
 * task by name.
 *
 * What is asserted here is the whole loop, through HTTP, against a real database:
 *
 *   gate       work that needs a founder decision stops in `awaiting_approval`
 *              with an approval naming the task — not `pending`, not `failed`
 *   approve    the decision resumes that exact task, and the grant is single-use
 *   reject     the decision stops it for good, with the founder's reason on the
 *              record the agent and the next reader both see
 *   retry      a task the system failed can be re-run on purpose
 *   runner     the pending-work runner is reachable, and never touches work
 *              that is waiting on a person
 *   audit      both decisions name the work they moved, in the hash-chained
 *              trail, as structured references and not only as prose
 *
 * Only the LLM boundary is stubbed. Everything the test is actually about — the
 * approval rows, the task status transitions, the HTTP surface, the batched
 * runner — runs against the real database. Without the stub the executor falls
 * back to structured output and reports 'failed', so "the work resumed" would be
 * indistinguishable from "the work failed", which is precisely the distinction
 * this file exists to pin down.
 */
vi.mock('../src/services/llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/llm.js')>()),
  chat: async () => 'Stubbed executive answer: the work was performed.',
}));

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];
try {
  const probe = new (await import('pg')).Pool({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 1500,
  });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

let app: FastifyInstance;
let token = '';
let orgId = '';
// Two employees carry every case: one whose autonomy level makes its work need a
// founder (`recommend`), one that may just work (`autonomous`).
let gatedAgentId = '';
let autonomousAgentId = '';

const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

run('an approval gates real work, and deciding it moves that work', () => {
  beforeAll(async () => {
    const created = createDb(config.DATABASE_URL);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config, db, pool, logger: createLogger(config) });
    await app.ready();

    const email = `gate-${Date.now()}@test.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'TestPass123!', org_name: 'Approval Gate Org' },
    });
    expect(reg.statusCode, reg.payload).toBe(201);
    const body = JSON.parse(reg.payload) as { data: { token: string; org: { id: string } } };
    token = body.data.token;
    orgId = body.data.org.id;

    // The email gate lives in requireAuth and is covered by auth.integration —
    // this suite needs the product APIs, so confirm the address as the link does.
    const { users } = await import('@orq8/db');
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email.toLowerCase()));

    // Employees are seeded straight into the org rather than hired through
    // /v1/agents: a Trial org is capped at three AI employees (and registration
    // already seeds them), so hiring here would make this suite a test of plan
    // limits. The cap itself is covered by entitlements.test.ts.
    const authority = {
      canCreateTasks: true,
      canExecuteTasks: true,
      canAccessCompanyInfo: true,
      canCommunicateExternally: false,
      canModifyResources: false,
      spendingLimitCents: 0,
      requiresApprovalFor: [],
      forbiddenActions: [],
    };
    const hire = async (name: string, autonomyLevel: string) => {
      const [row] = await db
        .insert(agentsTable)
        .values({ orgId, name, role: 'analyst', status: 'active', autonomyLevel, authority })
        .returning();
      return row!.id as string;
    };
    gatedAgentId = await hire('Gated Worker', 'recommend');
    autonomousAgentId = await hire('Autonomous Worker', 'autonomous');
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  async function createTask(title: string, agentId: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: auth(),
      payload: { title, description: 'Gate this work.', agentId },
    });
    return JSON.parse(res.payload).data.id as string;
  }

  async function taskRow(taskId: string) {
    const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1);
    return row;
  }

  async function approvalFor(taskId: string) {
    const [row] = await db
      .select()
      .from(approvalsTable)
      .where(and(eq(approvalsTable.taskId, taskId), eq(approvalsTable.orgId, orgId)))
      .limit(1);
    return row;
  }

  it('stops work that needs a decision instead of running it anyway', async () => {
    // `recommend` is the level whose whole meaning is "this may run, but the
    // founder decides" — enforceAutonomy returns requiresApproval for it, and the
    // executor used to drop that flag on the floor and run the task.
    const taskId = await createTask('Recommend a go-to-market plan', gatedAgentId);

    const exec = await app.inject({
      method: 'POST',
      url: `/v1/commands/tasks/${taskId}/execute`,
      headers: auth(),
    });
    expect(exec.statusCode).toBe(200);
    expect(JSON.parse(exec.payload).status).toBe('awaiting_approval');

    const task = await taskRow(taskId);
    expect(task?.status).toBe('awaiting_approval'); // not 'pending': nothing will run it
    expect(task?.cost).toBe(0); // no work was done, so nothing is charged
    expect(task?.result).toContain('Awaiting founder approval');

    // The request names the work it is about. This is the whole of Gap A.
    const approval = await approvalFor(taskId);
    expect(approval?.status).toBe('pending');
    expect(approval?.taskId).toBe(taskId);
    expect(approval?.action).toContain('Recommend a go-to-market plan');
  });

  it('hands the founder the work each open gate blocks, by name', async () => {
    // The columns landed with migration 0036, but a card that still shows only
    // `action` asks the founder to rule on a sentence. The list resolves the
    // gated task so the decision surface can name what moves.
    const title = 'Approve the partner term sheet';
    const taskId = await createTask(title, gatedAgentId);
    await app.inject({
      method: 'POST',
      url: `/v1/commands/tasks/${taskId}/execute`,
      headers: auth(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/approvals?status=pending&limit=200',
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);

    const rows = JSON.parse(res.payload).data as Array<{
      taskId: string | null;
      gatedWork: {
        taskId: string | null;
        taskTitle: string | null;
        taskStatus: string | null;
        toolId: string | null;
      } | null;
    }>;
    const row = rows.find((a) => a.taskId === taskId);

    expect(row).toBeDefined();
    expect(row?.gatedWork?.taskId).toBe(taskId);
    expect(row?.gatedWork?.taskTitle).toBe(title);
    expect(row?.gatedWork?.taskStatus).toBe('awaiting_approval');
  });

  it('does not stack a second question about the same task', async () => {
    const taskId = await createTask('Draft the pricing memo', gatedAgentId);

    await app.inject({ method: 'POST', url: `/v1/commands/tasks/${taskId}/execute`, headers: auth() });
    await app.inject({ method: 'POST', url: `/v1/commands/tasks/${taskId}/execute`, headers: auth() });

    const rows = await db.select().from(approvalsTable).where(eq(approvalsTable.taskId, taskId));
    expect(rows).toHaveLength(1);
  });

  it('resumes the gated task when the founder approves, and spends the grant', async () => {
    const taskId = await createTask('Write the launch brief', gatedAgentId);
    await app.inject({ method: 'POST', url: `/v1/commands/tasks/${taskId}/execute`, headers: auth() });
    const approval = await approvalFor(taskId);

    const decide = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${approval!.id}`,
      headers: auth(),
      payload: { status: 'approved' },
    });
    expect(decide.statusCode).toBe(200);

    // The decision releases the work through the queue — never inline (the
    // gateway does not run model calls on the request path). The PATCH answers
    // with the enqueue; the worker, shared with every other release path, does
    // the run and consumes the grant single-use against its decision token.
    const body = JSON.parse(decide.payload) as { resumed: { taskId: string; status: string } | null };
    expect(body.resumed?.taskId, decide.payload).toBe(taskId);
    expect(body.resumed?.status, decide.payload).toBe('queued');

    // The PATCH enqueues the release and fires one immediate drain of its own,
    // so the run belongs to whichever runner claims the job. Await the JOB row
    // until it settles — never polling the task against a runner that may still
    // legitimately be mid-flight, and never re-running the work from the test.
    const { agentJobs } = await import('@orq8/db');
    let jobStatus: string | undefined;
    const settledBy = Date.now() + 15_000;
    while (Date.now() < settledBy) {
      const [job] = await db
        .select({ status: agentJobs.status })
        .from(agentJobs)
        .where(eq(agentJobs.taskId, taskId))
        .limit(1);
      jobStatus = job?.status;
      if (jobStatus === 'done' || jobStatus === 'dead') break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(jobStatus).toBe('done');

    const task = await taskRow(taskId);
    expect(task?.status).toBe('completed');
    expect(task?.result).toBeTruthy();

    // Single-use: the grant is stamped as spent, so the same yes cannot release
    // a second run of the same request.
    const spent = await approvalFor(taskId);
    expect(spent?.releasedAt).not.toBeNull();
  });

  it('refuses to stop gated work without a reason', async () => {
    const taskId = await createTask('Rewrite the homepage copy', gatedAgentId);
    await app.inject({ method: 'POST', url: `/v1/commands/tasks/${taskId}/execute`, headers: auth() });
    const approval = await approvalFor(taskId);

    const bare = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${approval!.id}`,
      headers: auth(),
      payload: { status: 'rejected' },
    });
    expect(bare.statusCode).toBe(400);
    expect(JSON.parse(bare.payload).error.code).toBe('reason_required');

    // Still waiting, untouched by the refused decision.
    expect((await taskRow(taskId))?.status).toBe('awaiting_approval');
  });

  it('stops the gated task for good when the founder rejects it, and keeps the reason', async () => {
    const taskId = await createTask('Rebrand the whole site', gatedAgentId);
    await app.inject({ method: 'POST', url: `/v1/commands/tasks/${taskId}/execute`, headers: auth() });
    const approval = await approvalFor(taskId);

    const decide = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${approval!.id}`,
      headers: auth(),
      payload: { status: 'rejected', note: 'Off-brand — we are not touching the site this quarter.' },
    });
    expect(decide.statusCode).toBe(200);

    const task = await taskRow(taskId);
    expect(task?.status).toBe('cancelled');
    expect(task?.result).toContain('Off-brand');
    expect(task?.cost).toBe(0);

    // And it stays stopped: the manual execute path cannot quietly undo the
    // founder's answer, because the guard lives at the deepest boundary.
    const again = await app.inject({
      method: 'POST',
      url: `/v1/commands/tasks/${taskId}/execute`,
      headers: auth(),
    });
    const againBody = JSON.parse(again.payload) as { data: { status: string; result: string } };
    expect(againBody.data.status).toBe('failed');
    expect(againBody.data.result).toContain('cancelled by a founder decision');
    expect((await taskRow(taskId))?.status).toBe('cancelled');
  });

  it('audits what each decision did to the work, on both paths', async () => {
    // A decision that moves work has to be as visible in the trail as the work
    // itself: an approval card that cannot be joined to the task it governed
    // leaves the founder unable to answer "what did I approve, and what happened
    // when I did?". Both rows carry the approval id and the task id outright.
    const approvedTask = await createTask('Audit the approve path', gatedAgentId);
    await app.inject({ method: 'POST', url: `/v1/commands/tasks/${approvedTask}/execute`, headers: auth() });
    const approval = await approvalFor(approvedTask);
    await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${approval!.id}`,
      headers: auth(),
      payload: { status: 'approved' },
    });

    const resumed = await db
      .select()
      .from(auditEventsTable)
      .where(and(
        eq(auditEventsTable.orgId, orgId),
        eq(auditEventsTable.action, 'approval.resumed_work'),
        eq(auditEventsTable.approvalId, approval!.id),
      ));
    expect(resumed).toHaveLength(1);
    expect(resumed[0]?.taskId).toBe(approvedTask);

    const rejectedTask = await createTask('Audit the reject path', gatedAgentId);
    await app.inject({ method: 'POST', url: `/v1/commands/tasks/${rejectedTask}/execute`, headers: auth() });
    const rejected = await approvalFor(rejectedTask);
    await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${rejected!.id}`,
      headers: auth(),
      payload: { status: 'rejected', note: 'Not this quarter.' },
    });

    const stopped = await db
      .select()
      .from(auditEventsTable)
      .where(and(
        eq(auditEventsTable.orgId, orgId),
        eq(auditEventsTable.action, 'approval.stopped_work'),
        eq(auditEventsTable.approvalId, rejected!.id),
      ));
    expect(stopped).toHaveLength(1);
    expect(stopped[0]?.taskId).toBe(rejectedTask);
    expect(stopped[0]?.resultRef).toContain(rejectedTask);
  });

  it('retries a failed task on purpose and completes it', async () => {
    const taskId = await createTask('Summarize the pipeline', autonomousAgentId);

    // The system stopped it: this is the state a retry exists for.
    await db
      .update(tasksTable)
      .set({ status: 'failed', result: 'Provider timeout' })
      .where(eq(tasksTable.id, taskId));

    const retry = await app.inject({
      method: 'POST',
      url: `/v1/commands/tasks/${taskId}/retry`,
      headers: auth(),
    });
    expect(retry.statusCode).toBe(200);
    const body = JSON.parse(retry.payload) as { data: { status: string } };
    expect(body.data.status, retry.payload).toBe('completed');

    const task = await taskRow(taskId);
    expect(task?.status).toBe('completed');
    expect(task?.result ?? '').not.toContain('Provider timeout'); // the failure is not the result any more
  });

  it('refuses to retry work a person has not settled', async () => {
    const taskId = await createTask('Settle this first', gatedAgentId);
    await app.inject({ method: 'POST', url: `/v1/commands/tasks/${taskId}/execute`, headers: auth() });

    const retry = await app.inject({
      method: 'POST',
      url: `/v1/commands/tasks/${taskId}/retry`,
      headers: auth(),
    });
    expect(retry.statusCode).toBe(409);
    expect(JSON.parse(retry.payload).error.message).toContain('waiting on your decision');
    expect((await taskRow(taskId))?.status).toBe('awaiting_approval');
  });

  it('runs the queued work, and never the work waiting on a person', async () => {
    const runnableId = await createTask('Queued: inventory the assets', autonomousAgentId);
    const gatedId = await createTask('Gated: change the pricing', gatedAgentId);
    await app.inject({ method: 'POST', url: `/v1/commands/tasks/${gatedId}/execute`, headers: auth() });

    const batch = await app.inject({
      method: 'POST',
      url: '/v1/commands/tasks/execute-pending',
      headers: auth(),
    });
    expect(batch.statusCode).toBe(200);
    const body = JSON.parse(batch.payload) as { data: { executed: number; completed: number } };
    expect(body.data.executed, batch.payload).toBeGreaterThanOrEqual(1);
    expect(body.data.completed, batch.payload).toBeGreaterThanOrEqual(1);

    expect((await taskRow(runnableId))?.status).toBe('completed');
    // The runner selects `pending`. A task stopped on a founder decision is not
    // pending, so a background pass cannot answer a question put to a person.
    expect((await taskRow(gatedId))?.status).toBe('awaiting_approval');
  });
});
