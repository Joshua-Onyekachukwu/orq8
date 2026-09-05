import { eq, and, sql, desc } from 'drizzle-orm';
import { teams, departments, agents, type Db, type Team } from '@orq8/db';

/** Check if the teams table exists in the database. */
async function tableExists(db: Db): Promise<boolean> {
  try {
    await db.select({ count: sql<number>`1` }).from(teams).limit(1);
    return true;
  } catch {
    return false;
  }
}

/** Find all teams for an org (active only) with agent member counts. */
export async function findByOrg(
  db: Db,
  orgId: string,
  includeArchived = false,
): Promise<(Team & { agentCount: number; activeCount: number; department: string | null })[]> {
  if (!(await tableExists(db))) return [];
  try {
    const rows = await db
      .select({
        id: teams.id,
        orgId: teams.orgId,
        departmentId: teams.departmentId,
        name: teams.name,
        description: teams.description,
        lead: teams.lead,
        status: teams.status,
        createdAt: teams.createdAt,
        updatedAt: teams.updatedAt,
        department: departments.name,
        agentCount: sql<number>`coalesce(count(${agents.id}) filter (where ${agents.teamId} is not null), 0)::int`,
        activeCount: sql<number>`coalesce(count(${agents.id}) filter (where ${agents.teamId} is not null and ${agents.status} = 'active'), 0)::int`,
      })
      .from(teams)
      .leftJoin(departments, eq(teams.departmentId, departments.id))
      .leftJoin(agents, eq(agents.teamId, teams.id))
      .where(
        and(
          eq(teams.orgId, orgId),
          includeArchived ? undefined : eq(teams.status, 'active'),
        ),
      )
      .groupBy(teams.id, departments.name)
      .orderBy(desc(teams.createdAt));
    return rows;
  } catch {
    return [];
  }
}

/** Find a team by id within an org. */
export async function findById(db: Db, orgId: string, id: string): Promise<Team | undefined> {
  if (!(await tableExists(db))) return undefined;
  try {
    const rows = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, id), eq(teams.orgId, orgId)))
      .limit(1);
    return rows[0];
  } catch {
    return undefined;
  }
}

/** Find a team by name within an org. */
export async function findByName(db: Db, orgId: string, name: string): Promise<Team | undefined> {
  if (!(await tableExists(db))) return undefined;
  try {
    const rows = await db
      .select()
      .from(teams)
      .where(and(eq(teams.orgId, orgId), eq(teams.name, name)))
      .limit(1);
    return rows[0];
  } catch {
    return undefined;
  }
}

/** Create a new team. */
export async function createTeam(
  db: Db,
  data: { orgId: string; name: string; description?: string; lead?: string; departmentId?: string | null },
): Promise<Team> {
  if (!(await tableExists(db))) {
    throw new Error('Teams feature not available yet — run supabase/migrations/0003_add_teams.sql');
  }
  const rows = await db
    .insert(teams)
    .values({
      orgId: data.orgId,
      name: data.name,
      description: data.description ?? null,
      lead: data.lead ?? null,
      departmentId: data.departmentId ?? null,
      status: 'active',
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('createTeam returned no row');
  return row;
}

/** Update a team. */
export async function updateTeam(
  db: Db,
  orgId: string,
  id: string,
  data: { name?: string; description?: string; lead?: string; departmentId?: string | null; status?: string },
): Promise<Team | undefined> {
  if (!(await tableExists(db))) return undefined;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.lead !== undefined) updates.lead = data.lead;
  if (data.departmentId !== undefined) updates.departmentId = data.departmentId;
  if (data.status !== undefined) updates.status = data.status;

  const rows = await db
    .update(teams)
    .set(updates)
    .where(and(eq(teams.id, id), eq(teams.orgId, orgId)))
    .returning();
  return rows[0];
}

/** Delete a team (only if no agents are members). */
export async function deleteTeam(db: Db, orgId: string, id: string): Promise<boolean> {
  if (!(await tableExists(db))) return false;

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(eq(agents.teamId, id), eq(agents.orgId, orgId)));

  if (memberCount && memberCount.count > 0) {
    throw new Error(`Cannot delete team — ${memberCount.count} AI employee(s) still assigned. Archive it instead or reassign them first.`);
  }

  const result = await db
    .delete(teams)
    .where(and(eq(teams.id, id), eq(teams.orgId, orgId)))
    .returning();
  return result.length > 0;
}