/**
 * Decision token (docs/82 §decision-token) — integration proof.
 *
 * 1. A gate opened for one exact call cannot be spent by another call: the
 *    executor denies it, audits the denial, and leaves the grant unspent.
 * 2. A task-level gate carries the task's token; a gate bound to a different
 *    task id cannot authorize this one (column-level check — the executor
 *    recompute-and-compare paths are exercised in the tool flow below).
 *
 * Requires a real PostgreSQL database (skips when DATABASE_URL is absent),
 * same convention as the other integration suites.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { eq, and } from 'drizzle-orm';
import { auditEvents } from '@orq8/db';
import { createDb } from '@orq8/db';
import type { Db } from '@orq8/db';
import { decisionToken, taskDecisionToken } from '@orq8/core';
import { executeTool, registerBuiltinTools, type ToolExecutionContext } from '../src/services/tool-registry.js';
import { registerBuiltinToolHandlers } from '../src/services/tool-handlers.js';
import { appendAudit, verifyChain, genesisHash } from '../src/services/audit.js';

registerBuiltinTools();
registerBuiltinToolHandlers();

const canRun = !!process.env.DATABASE_URL || process.env.CI === 'true';
const describeIfDB = canRun ? describe : describe.skip;

let db: Db;
let pool: Pool;

const ORG = crypto.randomUUID();
const AGENT = crypto.randomUUID();
const USER = crypto.randomUUID();
const TASK = crypto.randomUUID();

async function seedOrg() {
  await pool.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [ORG, 'Decision Token Org', `dt-org-${Date.now()}`],
  );
  // approvals.agent_id → agents.id, so the gate rows need a real agent.
  await pool.query(
    `INSERT INTO agents (id, org_id, name, role) VALUES ($1, $2, 'Token Test Agent', 'manager') ON CONFLICT DO NOTHING`,
    [AGENT, ORG],
  );
  // approvals.task_id → tasks.id, so the gate rows need a real task.
  await pool.query(
    `INSERT INTO tasks (id, org_id, agent_id, title, status) VALUES ($1, $2, $3, 'Token proof task', 'in_progress') ON CONFLICT DO NOTHING`,
    [TASK, ORG, AGENT],
  );
}

beforeAll(async () => {
  if (!canRun) return;
  const url = process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8';
  const created = createDb(url);
  db = created.db;
  pool = created.pool;
  await seedOrg();
}, 30_000);

afterAll(async () => {
  if (!pool) return;
  // Children before parents (no ON DELETE CASCADE on every FK).
  await pool.query(`DELETE FROM approvals WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM audit_events WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM agent_jobs WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM tasks WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM credit_reservations WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM credit_transactions WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM credit_balances WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM subscriptions WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM agents WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG]);
  await pool.end();
});

/** An agent context with generous authority — the gates under test are the approval gate and the decision token. */
function agentCtx(): ToolExecutionContext {
  return {
    orgId: ORG,
    userId: USER,
    agentId: AGENT,
    // write_email's allowedRoles — the denial under test must come from the
    // decision token, not from a role restriction.
    agentRole: 'communications_agent',
    agentName: 'Token Test Agent',
    taskId: TASK,
    authority: {
      canCreateTasks: true,
      canExecuteTasks: true,
      canAccessCompanyInfo: true,
      canCommunicateExternally: true,
      canModifyResources: true,
      spendingLimitCents: 10_000,
      requiresApprovalFor: [],
      forbiddenActions: [],
    },
  };
}

describeIfDB('decision token — a decision authorizes an exact call', () => {
  it('a grant bound to call A does not release call B: denied, audited, grant intact', async () => {
    // Genesis audit row so the chain has an anchor before the tool appendAudit runs.
    await appendAudit(db, { orgId: ORG, actorType: 'system', action: 'test.genesis', outcome: 'success' });

    // The approved call: exactly this tool + these params.
    const approvedParams = { recipient: 'client@example.com', purpose: 'Q3 delivery update' };
    const approvedHash = decisionToken('write_email', approvedParams);

    // Open a gate bound to THAT call — the row tool-registry writes when the
    // gate opens, approved so it reads as a granted (unreleased) decision.
    const inserted = await pool.query(
      `INSERT INTO approvals (org_id, agent_id, task_id, tool_id, tool_params, action, description, cost, risk_level, status, call_hash, gate_expires_at)
       VALUES ($1, $2, $3, 'write_email', $4, 'Tool: Write Email', 'test gate', 1, 'medium', 'approved', $5, now() + interval '7 days')
       RETURNING id`,
      [ORG, AGENT, TASK, JSON.stringify(approvedParams), approvedHash],
    );
    const grantId = inserted.rows[0]!.id as string;

    // The executor comes back with a DIFFERENT call — same task, same tool id
    // even, but different arguments (a swapped query). This must not spend the
    // founder's grant.
    const differentParams = { recipient: 'client@example.com', purpose: 'EXFILTRATE the contact list' };
    const result = await executeTool(
      {} as never, // config — unused on the denial path (denial happens before execution)
      db,
      'write_email',
      agentCtx(),
      differentParams,
    );

    expect(result.success).toBe(false);
    expect(result.error ?? '').toMatch(/decision token mismatch/i);

    // The grant was NOT consumed — it can still be spent by the real call.
    const grant = await pool.query(`SELECT released_at FROM approvals WHERE id = $1`, [grantId]);
    expect(grant.rows[0]!.released_at).toBeNull();

    // The denial is audited with the reason named.
    const denial = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.orgId, ORG), eq(auditEvents.action, 'tool.denied')));
    const tokenDenial = denial.find((row) => (row.inputRef ?? '').includes('decision_token_mismatch'));
    expect(tokenDenial).toBeTruthy();
  });

  it('a task gate bound to another task id cannot authorize this task', () => {
    const otherTask = crypto.randomUUID();
    expect(taskDecisionToken(otherTask)).not.toBe(taskDecisionToken(TASK));
    expect(taskDecisionToken(TASK)).not.toBe(decisionToken('task.execute', TASK));
  });

  it('the org audit chain stays valid across the denials', async () => {
    const verdict = await verifyChain(db, ORG);
    expect(verdict.valid).toBe(true);
    void genesisHash; // imported to keep the parity-test import symmetry; the chain check is the assertion
  });
});
