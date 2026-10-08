import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import {
  agents as agentsTable,
  approvals as approvalsTable,
  auditEvents as auditEventsTable,
  agentJobs as agentJobsTable,
  createDb,
  creditTransactions as creditTransactionsTable,
  tasks as tasksTable,
  users as usersTable,
} from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

/**
 * A task can use a tool — through the same gate as everything else (MVP-030).
 *
 * `executeTool` carries the whole tool contract: role and authority checks, the
 * approval gate, an idempotency key, the credit charge and an audit row for a
 * denial as well as an execution. It had no caller anywhere in the API, so an AI
 * employee asked to research a market, analyse data or write an email could only
 * answer from the model's head, and the registry's gate had never run.
 *
 * The executor is the caller now. What is asserted here is that the gate is real
 * and not decorative:
 *
 *   allowed    a tool the role may use runs, is charged, and is audited
 *   forbidden  an agent authority forbids it → refused, audited as denied, and
 *              nothing is charged
 *   gated      a tool that needs the founder stops the task in
 *              `awaiting_approval`; approving it resumes the task, the grant is
 *              consumed, and the call then really runs
 *
 * The model is the boundary that is stubbed (it must ask for the tool), and the
 * tool handlers themselves are LLM-backed, so they run for real against the stub:
 * everything else — the registry, the approval row, the ledger, the audit trail,
 * the task state machine — is the production code on a real database.
 */
vi.mock('../src/services/llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/llm.js')>()),
  chat: async (_config: unknown, _system: unknown, user: unknown) => {
    const prompt = String(user);
    // A follow-up carries the tool's outcome. Having read it, the model answers
    // in prose — it does not ask for the same tool again.
    if (
      prompt.includes('succeeded. Output:') ||
      prompt.includes('did not run:') ||
      prompt.includes("founder's approval")
    )
      return 'Final answer grounded in the tool output.';
    if (prompt.includes('Email the pilot team'))
      return '```tool\n{"toolId": "write_email", "params": {"recipient": "pilot@orq8.test", "purpose": "pilot update"}}\n```';
    if (prompt.includes('Analyze the pilot metrics'))
      return '```tool\n{"toolId": "analyze_data", "params": {"data_description": "pilot metrics"}}\n```';
    // Anything else is a tool handler producing its own output.
    return 'Handler output: the pilot numbers are holding.';
  },
}));

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
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

const AUTHORITY = {
  canCreateTasks: true,
  canExecuteTasks: true,
  canAccessCompanyInfo: true,
  canCommunicateExternally: false,
  canModifyResources: false,
  spendingLimitCents: 0,
  requiresApprovalFor: [] as string[],
  forbiddenActions: [] as string[],
};

let app: FastifyInstance;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];
let token = '';
let orgId = '';

const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

run('a task uses tools through the registry, with its gate', () => {
  beforeAll(async () => {
    const created = createDb(config.DATABASE_URL);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config, db, pool, logger: createLogger(config) });
    await app.ready();

    const email = `tools-${Date.now()}@test.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'TestPass123!', org_name: 'Tool Org' },
    });
    expect(reg.statusCode, reg.payload).toBe(201);
    const body = JSON.parse(reg.payload) as { data: { token: string; org: { id: string } } };
    token = body.data.token;
    orgId = body.data.org.id;

    await db
      .update(usersTable)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(usersTable.email, email.toLowerCase()));
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  async function seedAgent(role: string, authority: Partial<typeof AUTHORITY> = {}): Promise<string> {
    const [row] = await db
      .insert(agentsTable)
      .values({
        orgId,
        name: `${role} worker`,
        role,
        status: 'active',
        autonomyLevel: 'autonomous',
        authority: { ...AUTHORITY, ...authority },
      })
      .returning();
    return row!.id as string;
  }

  async function runTask(title: string, agentId: string): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: auth(),
      payload: { title, description: 'Work that needs a tool.', agentId },
    });
    expect(created.statusCode, created.payload).toBe(201);
    const taskId = JSON.parse(created.payload).data.id as string;

    const executed = await app.inject({
      method: 'POST',
      url: `/v1/commands/tasks/${taskId}/execute`,
      headers: auth(),
      payload: {},
    });
    expect(executed.statusCode, executed.payload).toBe(200);
    return taskId;
  }

  async function taskRow(taskId: string) {
    const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1);
    return row;
  }

  async function ledgerFor(taskId: string) {
    return db
      .select({ description: creditTransactionsTable.description, amount: creditTransactionsTable.amount })
      .from(creditTransactionsTable)
      .where(
        and(eq(creditTransactionsTable.orgId, orgId), eq(creditTransactionsTable.referenceId, taskId)),
      );
  }

  async function auditsFor(taskId: string, action: string) {
    return db
      .select({ id: auditEventsTable.id, outcome: auditEventsTable.outcome, tool: auditEventsTable.tool })
      .from(auditEventsTable)
      .where(and(eq(auditEventsTable.orgId, orgId), eq(auditEventsTable.taskId, taskId), eq(auditEventsTable.action, action)));
  }

  it('runs a tool the role may use, charges it, and audits it', async () => {
    const agentId = await seedAgent('data_analyst');
    const taskId = await runTask('Analyze the pilot metrics', agentId);

    const task = await taskRow(taskId);
    expect(task?.status).toBe('completed');
    // What the work did is on the record, not only what the model said.
    expect(task?.result).toContain('Tools used: analyze_data: ran in');

    const executed = await auditsFor(taskId, 'tool.executed');
    expect(executed).toHaveLength(1);
    expect(executed[0]?.tool).toBe('analyze_data');

    // The task row reports the whole cost and the ledger agrees with it: the
    // model's tokens plus the tool's own 2 credits, charged separately by the
    // registry as the tool ran (so the two are never billed twice).
    const ledger = await ledgerFor(taskId);
    const charged = ledger.reduce((sum, row) => sum + Math.abs(row.amount), 0);
    expect(charged).toBe(task?.cost);
    expect(charged).toBeGreaterThanOrEqual(3);
    expect(
      ledger.some(
        (row) =>
          (row.description ?? '').includes('Tool: Analyze Data') && Math.abs(row.amount) === 2,
      ),
    ).toBe(true);
  });

  it('refuses a tool the agent authority forbids, and charges nothing for it', async () => {
    const agentId = await seedAgent('data_analyst', { forbiddenActions: ['analyze_data'] });
    const taskId = await runTask('Analyze the pilot metrics', agentId);

    const denied = await auditsFor(taskId, 'tool.denied');
    expect(denied).toHaveLength(1);
    expect(denied[0]?.outcome).toBe('denied');
    expect(await auditsFor(taskId, 'tool.executed')).toHaveLength(0);

    const task = await taskRow(taskId);
    // The refusal is on the record rather than hidden behind a plausible answer.
    expect(task?.result).toContain('analyze_data: refused');
    expect(task?.result).toContain('forbidden');

    // Only the model cost is charged — the refused tool never ran, so it has no
    // line in the ledger and the task row carries no tool money.
    const ledger = await ledgerFor(taskId);
    expect(ledger.length).toBeGreaterThan(0);
    expect(ledger.some((row) => (row.description ?? '').includes('Tool:'))).toBe(false);
    expect(ledger.reduce((sum, row) => sum + Math.abs(row.amount), 0)).toBe(task?.cost);
  });

  it('stops a task on a tool the founder must authorise, then runs it once approved', async () => {
    const agentId = await seedAgent('communications_agent');
    const taskId = await runTask('Email the pilot team', agentId);

    // Stopped at the gate, naming the tool and the exact arguments.
    const gated = await taskRow(taskId);
    expect(gated?.status).toBe('awaiting_approval');
    expect(gated?.cost).toBe(0);
    expect(gated?.result).toContain('write_email');

    const [approval] = await db
      .select()
      .from(approvalsTable)
      .where(and(eq(approvalsTable.taskId, taskId), eq(approvalsTable.status, 'pending')));
    expect(approval?.toolId).toBe('write_email');
    expect(approval?.toolParams).toMatchObject({ recipient: 'pilot@orq8.test' });
    expect(await auditsFor(taskId, 'tool.executed')).toHaveLength(0);

    // The founder approves: the decision enqueues the release (the gateway
    // never runs a model call on the request path), and the queue worker
    // consumes the grant — single-use, against its decision token — when it
    // really runs the call.
    const decided = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${approval!.id}`,
      headers: auth(),
      payload: { status: 'approved' },
    });
    expect(decided.statusCode, decided.payload).toBe(200);
    expect(JSON.parse(decided.payload).resumed?.status, decided.payload).toBe('queued');    // The PATCH enqueues the release and fires one immediate drain of its own,
    // so the run belongs to whichever runner claims the job. Await the JOB row
    // until it settles: an async release finishes when its runner finishes,
    // not when the PATCH answers.
    let jobStatus: string | undefined;
    const settledBy = Date.now() + 15_000;
    while (Date.now() < settledBy) {
      const [job] = await db
        .select({ status: agentJobsTable.status })
        .from(agentJobsTable)
        .where(eq(agentJobsTable.taskId, taskId))
        .limit(1);
      jobStatus = job?.status;
      if (jobStatus === 'done' || jobStatus === 'dead') break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(jobStatus).toBe('done');

    const completed = await taskRow(taskId);
    expect(completed?.result).toContain('Tools used: write_email: ran in');

    const executed = await auditsFor(taskId, 'tool.executed');
    expect(executed).toHaveLength(1);
    expect(executed[0]?.tool).toBe('write_email');

    // The founder approved a price, so the ledger must charge that price.
    //
    // This is the assertion that catches a whole class of billing bug: the
    // approval card quotes `tool.creditCost` while the registry used to charge
    // `OPERATION_COSTS["tool.…"]`, which is absent from the table and therefore
    // fell through to its default of 2. Every tool priced at anything other than
    // the operation default was billed an amount the founder never agreed to,
    // and `analyze_data` (cost 2, default 2) hides it completely — so the test
    // asserts the *invariant* here, not the number.
    const quoted = approval?.cost ?? 0;
    expect(quoted).toBeGreaterThan(0);

    const ledger = await ledgerFor(taskId);
    const toolLine = ledger.find((row) => (row.description ?? '').includes('Tool: Write Email'));
    expect(toolLine).toBeTruthy();
    expect(Math.abs(toolLine!.amount)).toBe(quoted);

    // And the record the founder reads reports the same charge.
    expect(completed?.result).toMatch(/write_email: ran in [\d.]+s, 1 credit\b/);
  });
});
