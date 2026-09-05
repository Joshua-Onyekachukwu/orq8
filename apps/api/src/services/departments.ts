import { eq, and, sql, desc } from 'drizzle-orm';
import { departments, agents, type Department, type Db } from '@orq8/db';

/** Check if the departments table exists in the database. */
async function tableExists(db: Db): Promise<boolean> {
  try {
    await db.select({ count: sql<number>`1` }).from(departments).limit(1);
    return true;
  } catch {
    return false;
  }
}

/** Find all departments for an org with agent counts. */
export async function findByOrg(
  db: Db,
  orgId: string,
): Promise<(Department & { agentCount: number })[]> {
  if (!(await tableExists(db))) return [];
  try {
    const rows = await db
      .select({
        id: departments.id,
        orgId: departments.orgId,
        name: departments.name,
        description: departments.description,
        head: departments.head,
        budget: departments.budget,
        status: departments.status,
        createdAt: departments.createdAt,
        updatedAt: departments.updatedAt,
        agentCount: sql<number>`coalesce(count(${agents.id}), 0)::int`,
      })
      .from(departments)
      .leftJoin(agents, eq(agents.departmentId, departments.id))
      .where(eq(departments.orgId, orgId))
      .groupBy(departments.id)
      .orderBy(desc(departments.createdAt));
    return rows;
  } catch {
    return [];
  }
}

/** Find a department by name within an org. */
export async function findByName(
  db: Db,
  orgId: string,
  name: string,
): Promise<Department | undefined> {
  if (!(await tableExists(db))) return undefined;
  try {
    const rows = await db
      .select()
      .from(departments)
      .where(and(eq(departments.orgId, orgId), eq(departments.name, name)))
      .limit(1);
    return rows[0];
  } catch {
    return undefined;
  }
}

/** Find a department by id within an org. */
export async function findById(
  db: Db,
  orgId: string,
  id: string,
): Promise<Department | undefined> {
  if (!(await tableExists(db))) return undefined;
  try {
    const rows = await db
      .select()
      .from(departments)
      .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
      .limit(1);
    return rows[0];
  } catch {
    return undefined;
  }
}

/** Create a new department. */
export async function createDepartment(
  db: Db,
  data: { orgId: string; name: string; description?: string; budget?: number; head?: string },
): Promise<Department> {
  if (!(await tableExists(db))) {
    throw new Error('Departments feature not available yet — database migration needed');
  }
  const rows = await db
    .insert(departments)
    .values({
      orgId: data.orgId,
      name: data.name,
      description: data.description ?? null,
      budget: data.budget ?? null,
      head: data.head ?? null,
      status: 'active',
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('createDepartment returned no row');
  return row;
}

/** Update a department. */
export async function updateDepartment(
  db: Db,
  orgId: string,
  id: string,
  data: { name?: string; description?: string; budget?: number; head?: string; status?: string },
): Promise<Department | undefined> {
  if (!(await tableExists(db))) return undefined;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.budget !== undefined) updates.budget = data.budget;
  if (data.head !== undefined) updates.head = data.head;
  if (data.status !== undefined) updates.status = data.status;

  const rows = await db
    .update(departments)
    .set(updates)
    .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
    .returning();
  return rows[0];
}

/** Delete a department (only if no agents are assigned). */
export async function deleteDepartment(
  db: Db,
  orgId: string,
  id: string,
): Promise<boolean> {
  if (!(await tableExists(db))) return false;

  // Check for assigned agents
  const [agentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(eq(agents.departmentId, id), eq(agents.orgId, orgId)));

  if (agentCount && agentCount.count > 0) {
    throw new Error(`Cannot delete department — ${agentCount.count} agent(s) still assigned`);
  }

  const result = await db
    .delete(departments)
    .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
    .returning();
  return result.length > 0;
}
