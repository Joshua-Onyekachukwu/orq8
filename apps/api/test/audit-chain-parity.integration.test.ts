/**
 * Audit chain cross-test (docs/82 §audit-parity).
 *
 * `verifyChain` recomputes each row's hash with the TypeScript `buildPayload`.
 * Rows written through the SQL `append_audit_event` (migration 0016) are only
 * verifiable if the two payload builders agree byte-for-byte. They were never
 * compared — the first drift (a new AuditInput field, an escaping difference)
 * would have failed verification in production on the next SQL-written row.
 * This test computes both for the same event and asserts equality, including
 * the string-escaping edge cases the SQL builder handles by hand.
 *
 * Requires a real PostgreSQL database (skips when DATABASE_URL is absent).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createDb } from '@orq8/db';
import type { Db } from '@orq8/db';
import { sql } from 'drizzle-orm';
import { computeAuditHash, verifyChain } from '../src/services/audit.js';

const canRun = !!process.env.DATABASE_URL || process.env.CI === 'true';
const describeIfDB = canRun ? describe : describe.skip;

let db: Db;
let pool: Pool;

const ORG = crypto.randomUUID();

interface AuditRow {
  prev_hash: string;
  hash: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  occurred_at: Date;
  department_id: string | null;
  agent_id: string | null;
  task_id: string | null;
  tool: string | null;
  input_ref: string | null;
  result_ref: string | null;
  authorization: string | null;
  approval_id: string | null;
  policy_ref: string | null;
  cost: number | null;
  outcome: string;
}

/** Same payload contract as services/audit.ts `buildPayload` (the TS verifier's source of truth). */
function tsPayload(e: {
  departmentId: string | null;
  agentId: string | null;
  taskId: string | null;
  tool: string | null;
  inputRef: string | null;
  resultRef: string | null;
  authorization: string | null;
  approvalId: string | null;
  policyRef: string | null;
  cost: number | null;
  outcome: string;
}): string {
  return JSON.stringify({
    department_id: e.departmentId ?? null,
    agent_id: e.agentId ?? null,
    task_id: e.taskId ?? null,
    tool: e.tool ?? null,
    input_ref: e.inputRef ?? null,
    result_ref: e.resultRef ?? null,
    authorization: e.authorization ?? null,
    approval_id: e.approvalId ?? null,
    policy_ref: e.policyRef ?? null,
    cost: e.cost ?? null,
    outcome: e.outcome,
  });
}

function tsHashFor(args: { prevHash: string; actor: string; action: string; payload: string; occurredAt: Date }): string {
  return computeAuditHash({
    prevHash: args.prevHash,
    orgId: ORG,
    actor: args.actor,
    action: args.action,
    payload: args.payload,
    occurredAt: args.occurredAt,
  });
}

async function lastRow(): Promise<AuditRow> {
  const result = await pool.query(
    `SELECT prev_hash, hash, actor_type, actor_id, action, occurred_at, department_id, agent_id, task_id, tool, input_ref, result_ref, "authorization" AS authorization, approval_id, policy_ref, cost, outcome
     FROM audit_events WHERE org_id = $1 ORDER BY id DESC LIMIT 1`,
    [ORG],
  );
  return result.rows[0] as AuditRow;
}

beforeAll(async () => {
  if (!canRun) return;
  const url = process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8';
  const created = createDb(url);
  db = created.db;
  pool = created.pool;
  await pool.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [ORG, 'Audit Parity Org', `audit-parity-${Date.now()}`],
  );
}, 30_000);

afterAll(async () => {
  if (!pool) return;
  await pool.query(`DELETE FROM audit_events WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG]);
  await pool.end();
});

describeIfDB('audit chain — SQL append_audit_event ↔ TS buildPayload parity', () => {
  it('a row written by the SQL function verifies under the TS verifier', async () => {
    const agentId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const occurredAt = new Date('2026-03-04T05:06:07.891Z');

    // The SQL path — the one production uses through appendAudit.
    await db.execute(sql`select * from append_audit_event(
      ${ORG}, 'agent', ${agentId},
      ${null}, ${agentId}, ${taskId},
      'parity.sql_written_row', 'web_search', 'plain input',
      'plain result', ${null}, ${null},
      ${null}, 7, 'success', ${occurredAt}
    )`);

    const row = await lastRow();
    expect(row).toBeTruthy();

    const payload = tsPayload({
      departmentId: row.department_id,
      agentId: row.agent_id,
      taskId: row.task_id,
      tool: row.tool,
      inputRef: row.input_ref,
      resultRef: row.result_ref,
      authorization: row.authorization,
      approvalId: row.approval_id,
      policyRef: row.policy_ref,
      cost: row.cost,
      outcome: row.outcome,
    });
    const actor = `${row.actor_type}:${row.actor_id ?? ''}`;
    const expected = tsHashFor({ prevHash: row.prev_hash, actor, action: row.action, payload, occurredAt: new Date(row.occurred_at) });
    expect(row.hash).toBe(expected);
  });

  it('string escaping agrees for values with quotes and backslashes', async () => {
    const nasty = 'he said "stop" \\ immediately';
    await db.execute(sql`select * from append_audit_event(
      ${ORG}, 'agent', ${null}, ${null}, ${null}, ${null},
      'parity.escaping_row', ${nasty}, ${null},
      ${null}, ${null}, ${null}, ${null}, ${null}, 'success', ${new Date()}
    )`);

    const row = await lastRow();
    const payload = tsPayload({
      departmentId: null,
      agentId: null,
      taskId: null,
      tool: row.tool,
      inputRef: null,
      resultRef: null,
      authorization: null,
      approvalId: null,
      policyRef: null,
      cost: null,
      outcome: row.outcome,
    });
    const actor = `${row.actor_type}:${row.actor_id ?? ''}`;
    const expected = tsHashFor({ prevHash: row.prev_hash, actor, action: row.action, payload, occurredAt: new Date(row.occurred_at) });
    expect(row.hash).toBe(expected);
  });

  it('verifyChain validates an org whose rows were all written by the SQL path', async () => {
    const verdict = await verifyChain(db, ORG);
    expect(verdict.valid).toBe(true);
  });
});
