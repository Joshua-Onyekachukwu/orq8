import { eq, and, desc, sql } from 'drizzle-orm';
import { agents, type Db } from '@orq8/db';

type AnyRecord = Record<string, any>;

/** Core agent columns that always exist (pre-migration safe). */
const coreColumns = {
  id: agents.id,
  orgId: agents.orgId,
  name: agents.name,
  role: agents.role,
  department: agents.department,
  status: agents.status,
  weeklyCost: agents.weeklyCost,
  tasksCompleted: agents.tasksCompleted,
  tasksFailed: agents.tasksFailed,
  creditsUsed: agents.creditsUsed,
  currentTask: agents.currentTask,
  config: agents.config,
  lastActiveAt: agents.lastActiveAt,
  createdAt: agents.createdAt,
  updatedAt: agents.updatedAt,
};

/** Check if the new columns exist (departmentId, authority, capabilities). */
let newColumnsExist: boolean | null = null;
async function checkNewColumns(db: Db): Promise<boolean> {
  if (newColumnsExist !== null) return newColumnsExist;
  try {
    const result = await db
      .select({ hasDept: sql<boolean>` EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'department_id')` })
      .from(sql`(SELECT 1) AS _check`);
    newColumnsExist = result[0]?.hasDept ?? false;
  } catch {
    newColumnsExist = false;
  }
  return newColumnsExist;
}

/** Build the full column set depending on which columns exist. */
async function getColumns(db: Db) {
  const hasNew = await checkNewColumns(db);
  if (hasNew) {
    return { ...coreColumns, departmentId: agents.departmentId, authority: agents.authority, capabilities: agents.capabilities };
  }
  return coreColumns;
}

/** Find all agents for an org, most recently created first. */
export async function findByOrg(
  db: Db,
  orgId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<AnyRecord[]> {
  const cols = await getColumns(db);
  return db
    .select(cols)
    .from(agents)
    .where(eq(agents.orgId, orgId))
    .orderBy(desc(agents.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

/** Find a single agent by id, scoped to org. */
export async function findById(
  db: Db,
  orgId: string,
  id: string,
): Promise<AnyRecord | undefined> {
  const cols = await getColumns(db);
  const rows = await db
    .select(cols)
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
    .limit(1);
  return rows[0];
}

/** Create a new agent. */
export async function createAgent(
  db: Db,
  data: Record<string, unknown>,
): Promise<AnyRecord> {
  // Try with all columns first; if it fails due to missing columns, retry with core columns only
  try {
    const rows = await db.insert(agents).values(data as any).returning();
    const row = rows[0];
    if (!row) throw new Error('createAgent returned no row');
    return row;
  } catch (err: any) {
    if (err?.code === '42703' || err?.message?.includes('does not exist')) {
      // Column doesn't exist — retry with only core columns
      const coreData: Record<string, unknown> = {};
      for (const key of ['orgId', 'name', 'role', 'department', 'status', 'weeklyCost', 'tasksCompleted', 'tasksFailed', 'creditsUsed', 'currentTask', 'config', 'lastActiveAt', 'createdAt', 'updatedAt']) {
        if (data[key] !== undefined) coreData[key] = data[key];
      }
      const rows = await db.insert(agents).values(coreData as any).returning();
      const row = rows[0];
      if (!row) throw new Error('createAgent returned no row');
      return row;
    }
    throw err;
  }
}

/** Update agent status (active/paused/archived). */
export async function updateStatus(
  db: Db,
  orgId: string,
  id: string,
  status: string,
): Promise<AnyRecord | undefined> {
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
