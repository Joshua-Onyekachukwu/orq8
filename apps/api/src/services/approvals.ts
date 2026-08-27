import { eq, and, desc } from 'drizzle-orm';
import { approvals, type Approval, type NewApproval, type Db } from '@orq8/db';

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
  return rows[0];
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
