import { eq, and, desc, inArray, isNull, isNotNull, lte, sql } from 'drizzle-orm';
import { approvals, tasks, type Approval, type NewApproval, type Db } from '@orq8/db';
import { captureDecisionFromApproval } from './knowledge-graph.js';

/**
 * How long an unanswered gate stays open (docs/82 §gate-expiry). When it
 * passes, the expiry sweeper expires the approval and pauses its task —
 * silence never approves; the founder decides again when they return.
 */
export const GATE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Find approvals for an org, optionally filtered by status. */
export async function findByOrg(
  db: Db,
  orgId: string,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<Approval[]> {
  const conditions = [eq(approvals.orgId, orgId)];
  if (opts.status) conditions.push(eq(approvals.status, opts.status));
  return db
    .select()
    .from(approvals)
    .where(and(...conditions))
    .orderBy(desc(approvals.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

/** Find a single approval by id, scoped to org. */
export async function findById(
  db: Db,
  orgId: string,
  id: string,
): Promise<Approval | undefined> {
  const rows = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, id), eq(approvals.orgId, orgId)))
    .limit(1);
  return rows[0];
}

/** Create a new approval request. */
export async function createApproval(
  db: Db,
  data: NewApproval,
): Promise<Approval> {
  const rows = await db.insert(approvals).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createApproval returned no row');
  return row;
}

/** Decide on an approval (approve/reject/modify). */
export async function decide(
  db: Db,
  orgId: string,
  id: string,
  status: 'approved' | 'rejected' | 'modified',
  decisionNote?: string,
): Promise<Approval | undefined> {
  const rows = await db
    .update(approvals)
    .set({
      status,
      decisionNote: decisionNote ?? null,
      decidedAt: new Date(),
    })
    .where(and(eq(approvals.id, id), eq(approvals.orgId, orgId), eq(approvals.status, 'pending')))
    .returning();
  const row = rows[0];

  // Decision memory — every resolved approval becomes institutional precedent.
  // Best-effort: a decision-memory failure must never fail the approval itself.
  if (row) {
    try {
      await captureDecisionFromApproval(db, orgId, {
        id: row.id,
        action: row.action,
        description: row.description,
        riskLevel: row.riskLevel,
        status: row.status,
        decisionNote: row.decisionNote,
        decidedAt: row.decidedAt,
      });
    } catch {
      // Non-fatal — the approval outcome is already persisted.
    }
  }

  return row;
}

/**
 * The open decision gating a task, if one exists (migration 0036).
 *
 * Checked before raising a gate so that re-entering a blocked task cannot stack
 * duplicate requests in the founder's queue — the database enforces the same
 * invariant with a partial unique index, and this returns the existing row
 * instead of provoking that conflict.
 */
export async function findOpenGate(
  db: Db,
  orgId: string,
  taskId: string,
): Promise<Approval | undefined> {
  const rows = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.orgId, orgId), eq(approvals.taskId, taskId), eq(approvals.status, 'pending')))
    .limit(1);
  return rows[0];
}

/**
 * A go-ahead decision for this task that the work has not yet consumed.
 *
 * `modified` counts: the founder changed something and let it proceed, which is
 * a yes. Only a rejection is a no. `releasedAt` stays null until the executor
 * actually proceeds, so a founder saying yes releases the work once — not forever.
 */
export async function findGrantedGate(
  db: Db,
  orgId: string,
  taskId: string,
): Promise<Approval | undefined> {
  const rows = await db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.orgId, orgId),
        eq(approvals.taskId, taskId),
        inArray(approvals.status, ['approved', 'modified']),
        isNull(approvals.releasedAt),
      ),
    )
    .orderBy(desc(approvals.decidedAt))
    .limit(1);
  return rows[0];
}

/** Stamp the grant as spent. Called as the gated work resumes. */
export async function markGateReleased(db: Db, approvalId: string): Promise<void> {
  await db.update(approvals).set({ releasedAt: new Date() }).where(eq(approvals.id, approvalId));
}

/** One gate the expiry sweep turned away, for logging and ops surfaces. */
export interface ExpiredGate {
  approvalId: string;
  orgId: string;
  taskId: string | null;
}

/**
 * Expire open gates past their decision window (docs/82 §gate-expiry).
 *
 * The `expired` approval status existed but nothing ever set it. This is the
 * job that sets it: an open gate whose `gate_expires_at` has passed becomes an
 * `expired` decision with a note naming why, and its task returns to `paused`
 * — never to `approved`, never re-run by a background pass. Silence is not a
 * yes. The founder can explicitly re-decide (approve/reject on the expired
 * row, or retry the task) when they come back; a paused task asks again
 * through the normal gates.
 */
export async function expireOpenGates(
  db: Db,
  opts: { now?: Date; limit?: number } = {},
): Promise<ExpiredGate[]> {
  const now = opts.now ?? new Date();

  const due = await db
    .select({ id: approvals.id, orgId: approvals.orgId, taskId: approvals.taskId })
    .from(approvals)
    .where(
      and(
        eq(approvals.status, 'pending'),
        // Rows without a deadline (legacy gates) never expire — only gates
        // created after 0047 carry one.
        isNotNull(approvals.gateExpiresAt),
        lte(approvals.gateExpiresAt, now),
      ),
    )
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500));

  const expired: ExpiredGate[] = [];
  for (const gate of due) {
    // Conditional UPDATE: a founder who decided in the race between the read
    // and the write keeps their decision (0 rows updated → not expired).
    const updated = await db
      .update(approvals)
      .set({ status: 'expired', decisionNote: 'Expired unanswered — silence never approves. Decide again to run this.', decidedAt: now })
      .where(and(eq(approvals.id, gate.id), eq(approvals.status, 'pending')))
      .returning({ id: approvals.id });
    if (updated.length === 0) continue;

    expired.push({ approvalId: gate.id, orgId: gate.orgId, taskId: gate.taskId });

    if (gate.taskId) {
      await db
        .update(tasks)
        .set({ status: 'paused', updatedAt: now })
        .where(and(eq(tasks.id, gate.taskId), eq(tasks.orgId, gate.orgId), eq(tasks.status, 'awaiting_approval')));
    }
  }

  return expired;
}

/** Count pending approvals for an org. */
export async function countPending(
  db: Db,
  orgId: string,
): Promise<number> {
  const rows = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.orgId, orgId), eq(approvals.status, 'pending')));
  return rows.length;
}
