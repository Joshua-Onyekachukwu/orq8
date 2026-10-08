/**
 * Gate expiry (docs/82 §gate-expiry) — integration proof.
 *
 * An open approval past its decision window is expired by the sweeper and its
 * task pauses — never approved, never re-run by a background pass. Silence is
 * not a yes. The founder explicitly re-decides when they return.
 *
 * Requires a real PostgreSQL database (skips when DATABASE_URL is absent).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createDb } from '@orq8/db';
import type { Db } from '@orq8/db';
import { expireOpenGates, GATE_TTL_MS } from '../src/services/approvals.js';
import { verifyChain } from '../src/services/audit.js';

const canRun = !!process.env.DATABASE_URL || process.env.CI === 'true';
const describeIfDB = canRun ? describe : describe.skip;

let db: Db;
let pool: Pool;

const ORG = crypto.randomUUID();
const TASK = crypto.randomUUID();

beforeAll(async () => {
  if (!canRun) return;
  const url = process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8';
  const created = createDb(url);
  db = created.db;
  pool = created.pool;

  await pool.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [ORG, 'Gate Expiry Org', `gate-exp-${Date.now()}`],
  );
  await pool.query(
    `INSERT INTO tasks (id, org_id, title, status) VALUES ($1, $2, 'Expiry proof task', 'awaiting_approval')`,
    [TASK, ORG],
  );
}, 30_000);

afterAll(async () => {
  if (!pool) return;
  await pool.query(`DELETE FROM approvals WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM tasks WHERE org_id = $1`, [ORG]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG]);
  await pool.end();
});

describeIfDB('gate expiry — silence never approves', () => {
  it('GATE_TTL_MS is 7 days', () => {
    expect(GATE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('an open gate past its deadline expires and the task pauses (never approved)', async () => {
    // A gate whose window has passed.
    const past = await pool.query(
      `INSERT INTO approvals (org_id, task_id, action, status, gate_expires_at)
       VALUES ($1, $2, 'Execute task: Expiry proof task', 'pending', now() - interval '1 minute')
       RETURNING id`,
      [ORG, TASK],
    );
    const pastId = past.rows[0]!.id;

    // A still-open gate must not be touched.
    const open = await pool.query(
      `INSERT INTO approvals (org_id, task_id, action, status, gate_expires_at)
       VALUES ($1, NULL, 'Tool: Web Search', 'pending', now() + interval '6 days')
       RETURNING id`,
      [ORG],
    );
    const openId = open.rows[0]!.id;

    // A decided gate must not be touched.
    const decided = await pool.query(
      `INSERT INTO approvals (org_id, task_id, action, status, decided_at)
       VALUES ($1, NULL, 'Tool: Send Email', 'approved', now()) RETURNING id`,
      [ORG],
    );

    const expired = await expireOpenGates(db);
    const ids = expired.map((g) => g.approvalId);

    expect(ids).toContain(pastId);
    expect(ids).not.toContain(openId);
    expect(ids).not.toContain(decided.rows[0]!.id);

    // The expired gate reads as expired — a pause, never an approval.
    const gate = await pool.query(`SELECT status, decision_note, decided_at FROM approvals WHERE id = $1`, [pastId]);
    expect(gate.rows[0]!.status).toBe('expired');
    expect(gate.rows[0]!.decision_note).toMatch(/silence never approves/i);
    expect(gate.rows[0]!.decided_at).toBeTruthy();

    // The gated task paused; nothing ran.
    const task = await pool.query(`SELECT status FROM tasks WHERE id = $1`, [TASK]);
    expect(task.rows[0]!.status).toBe('paused');

    // An expired row is not a pending row: it cannot be re-expired, and
    // consuming logic that looks for pending/granted gates will not find it.
    const again = await expireOpenGates(db);
    expect(again.map((g) => g.approvalId)).not.toContain(pastId);
  });

  it('legacy gates without a deadline never expire', async () => {
    const legacy = await pool.query(
      `INSERT INTO approvals (org_id, task_id, action, status) VALUES ($1, NULL, 'Legacy webhook gate', 'pending') RETURNING id`,
      [ORG],
    );
    const expired = await expireOpenGates(db);
    expect(expired.map((g) => g.approvalId)).not.toContain(legacy.rows[0]!.id);
    await pool.query(`DELETE FROM approvals WHERE id = $1`, [legacy.rows[0]!.id]);
  });

  it('the org audit chain stays valid across the expiry', async () => {
    const verdict = await verifyChain(db, ORG);
    expect(verdict.valid).toBe(true);
  });
});
