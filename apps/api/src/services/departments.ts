import { eq, and, sql, desc } from 'drizzle-orm';
import { departments, agents, type Department, type Db } from '@orq8/db';

/** Find all departments for an org with agent counts. */
export async function findByOrg(
  db: Db,
  orgId: string,
): Promise<(Department & { agentCount: number; activeCount: number })[]> {
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
      agentCount: sql<number>`count(${agents.id})::int`,
      activeCount: sql<number>`count(case when ${agents.status} = 'active' then 1 end)::int`,
    })
    .from(departments)
    .leftJoin(agents, eq(departments.id, agents.departmentId))
    .where(and(eq(departments.orgId, orgId), eq(departments.status, 'active')))
    .groupBy(departments.id)
    .orderBy(departments.name);
  return rows;
}

/** Find a department by id, scoped to org. */
export async function findById(
  db: Db,
  orgId: string,
  id: string,
): Promise<Department | undefined> {
  const rows = await db
    .select()
    .from(departments)
    .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
    .limit(1);
  return rows[0];
}

/** Find a department by name, scoped to org. */
export async function findByName(
  db: Db,
  orgId: string,
  name: string,
): Promise<Department | undefined> {
  const rows = await db
    .select()
    .from(departments)
    .where(and(eq(departments.orgId, orgId), eq(departments.name, name)))
    .limit(1);
  return rows[0];
}

/** Create a new department. */
export async function createDepartment(
  db: Db,
  data: { orgId: string; name: string; description?: string | null; head?: string | null; budget?: number | null },
): Promise<Department> {
  const rows = await db.insert(departments).values({
    orgId: data.orgId,
    name: data.name,
    description: data.description ?? null,
    head: data.head ?? null,
    budget: data.budget ?? null,
  }).returning();
  const row = rows[0];
  if (!row) throw new Error('createDepartment returned no row');
  return row;
}

/** Update a department. */
export async function updateDepartment(
  db: Db,
  orgId: string,
  id: string,
  data: Partial<Pick<Department, 'name' | 'description' | 'head' | 'budget' | 'status'>>,
): Promise<Department | undefined> {
  const rows = await db
    .update(departments)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
    .returning();
  return rows[0] ?? undefined;
}

/** Delete (archive) a department. Moves all agents to unassigned. */
export async function archiveDepartment(
  db: Db,
  orgId: string,
  id: string,
): Promise<boolean> {
  await db
    .update(agents)
    .set({ departmentId: null, department: null, updatedAt: new Date() })
    .where(and(eq(agents.departmentId, id), eq(agents.orgId, orgId)));

  const rows = await db
    .update(departments)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(departments.id, id), eq(departments.orgId, orgId)))
    .returning();
  return rows.length > 0;
}

/** Assign an agent to a department. */
export async function assignAgent(
  db: Db,
  orgId: string,
  agentId: string,
  departmentId: string | null,
): Promise<void> {
  const deptName = departmentId
    ? (await findById(db, orgId, departmentId))?.name ?? null
    : null;

  await db
    .update(agents)
    .set({
      departmentId,
      department: deptName,
      updatedAt: new Date(),
    })
    .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)));
}

/** Get all agents in a department. */
export async function getAgents(
  db: Db,
  orgId: string,
  departmentId: string,
) {
  return db
    .select()
    .from(agents)
    .where(and(eq(agents.departmentId, departmentId), eq(agents.orgId, orgId)))
    .orderBy(desc(agents.createdAt));
}
