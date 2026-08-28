import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { activityEvents, type ActivityEvent, type NewActivityEvent, type Db } from '@orq8/db';

/** Find activity events for an org, optionally filtered by agent. */
export async function findByOrg(
  db: Db,
  orgId: string,
  opts: { agentId?: string; limit?: number; offset?: number } = {},
): Promise<ActivityEvent[]> {
  const conditions = [eq(activityEvents.orgId, orgId)];
  if (opts.agentId) conditions.push(eq(activityEvents.agentId, opts.agentId));
  return db
    .select()
    .from(activityEvents)
    .where(and(...conditions))
    .orderBy(desc(activityEvents.occurredAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

/** Create a new activity event. */
export async function createEvent(
  db: Db,
  data: NewActivityEvent,
): Promise<ActivityEvent> {
  const rows = await db.insert(activityEvents).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createEvent returned no row');
  return row;
}

/** Count events for an org in the current week. */
export async function countThisWeek(
  db: Db,
  orgId: string,
): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(and(eq(activityEvents.orgId, orgId), gte(activityEvents.occurredAt, weekAgo)));
  return result?.count ?? 0;
}
