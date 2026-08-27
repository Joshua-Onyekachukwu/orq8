import { eq, and, desc } from 'drizzle-orm';
import { agents, type Agent, type NewAgent, type Db } from '@orq8/db';

/** Find all agents for an org, most recently created first. */
export async function findByOrg(
  db: Db,
  orgId: string,
): Promise<Agent[]> {
  return db
    .select()
    .from(agents)
    .where(eq(agents.orgId, orgId))
    .orderBy(desc(agents.createdAt));
}

/** Find a single agent by id, scoped to org. */
export async function findById(
  db: Db,
  orgId: string,
  id: string,
): Promise<Agent | undefined> {
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
    .limit(1);
  return rows[0];
}

/** Create a new agent. */
export async function createAgent(
  db: Db,
  data: NewAgent,
): Promise<Agent> {
  const rows = await db.insert(agents).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createAgent returned no row');
  return row;
}

/** Update agent status (active/paused/archived). */
export async function updateStatus(
  db: Db,
  orgId: string,
  id: string,
  status: string,
): Promise<Agent | undefined> {
  const rows = await db
    .update(agents)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
    .returning();
  return rows[0] ?? undefined;
}

/** Count active agents for an org. */
export async function countActive(
  db: Db,
  orgId: string,
): Promise<number> {
  const rows = await db
    .select({ count: agents.id })
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.status, 'active')));
  return rows.length;
}
