import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import { companyMemory, type CompanyMemoryEntry, type NewCompanyMemoryEntry, type Db } from '@orq8/db';

/**
 * Company Memory Service
 *
 * Manages organizational knowledge: facts, decisions, lessons, preferences, workflows, context.
 * Memory is org-scoped and grows over time as the AI employees execute tasks.
 *
 * Design: docs/34 Work Domain, company_memory table
 */

export type MemoryCategory = 'fact' | 'decision' | 'lesson' | 'preference' | 'workflow' | 'context';

export interface MemorySearchParams {
  query?: string;
  category?: MemoryCategory;
  minImportance?: number;
  agentId?: string;
  limit?: number;
  offset?: number;
}

export interface MemoryStats {
  totalEntries: number;
  byCategory: Record<string, number>;
  avgImportance: number;
  recentActivity: number; // entries in last 7 days
}

/** Find memory entries for an org with optional filtering. */
export async function findByOrg(
  db: Db,
  orgId: string,
  opts: MemorySearchParams = {},
): Promise<CompanyMemoryEntry[]> {
  const conditions = [eq(companyMemory.orgId, orgId)];

  if (opts.category) {
    conditions.push(eq(companyMemory.category, opts.category));
  }
  if (opts.minImportance) {
    conditions.push(sql`${companyMemory.importance} >= ${opts.minImportance}`);
  }
  if (opts.agentId) {
    conditions.push(eq(companyMemory.agentId, opts.agentId));
  }
  if (opts.query) {
    conditions.push(
      or(
        ilike(companyMemory.content, `%${opts.query}%`),
        ilike(companyMemory.source, `%${opts.query}%`),
      )!,
    );
  }

  return db
    .select()
    .from(companyMemory)
    .where(and(...conditions))
    .orderBy(desc(companyMemory.importance), desc(companyMemory.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

/** Find a single memory entry by id, scoped to org. */
export async function findById(
  db: Db,
  orgId: string,
  id: string,
): Promise<CompanyMemoryEntry | undefined> {
  const rows = await db
    .select()
    .from(companyMemory)
    .where(and(eq(companyMemory.id, id), eq(companyMemory.orgId, orgId)))
    .limit(1);
  return rows[0];
}

/** Create a new memory entry. */
export async function createMemory(
  db: Db,
  data: NewCompanyMemoryEntry,
): Promise<CompanyMemoryEntry> {
  const rows = await db.insert(companyMemory).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createMemory returned no row');
  return row;
}

/** Update a memory entry (content, importance, category). */
export async function updateMemory(
  db: Db,
  orgId: string,
  id: string,
  updates: { content?: string; importance?: number; category?: MemoryCategory },
): Promise<CompanyMemoryEntry | undefined> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.content !== undefined) updateData.content = updates.content;
  if (updates.importance !== undefined) updateData.importance = updates.importance;
  if (updates.category !== undefined) updateData.category = updates.category;

  const rows = await db
    .update(companyMemory)
    .set(updateData)
    .where(and(eq(companyMemory.id, id), eq(companyMemory.orgId, orgId)))
    .returning();
  return rows[0] ?? undefined;
}

/** Delete a memory entry. */
export async function deleteMemory(
  db: Db,
  orgId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(companyMemory)
    .where(and(eq(companyMemory.id, id), eq(companyMemory.orgId, orgId)))
    .returning();
  return rows.length > 0;
}

/** Get memory statistics for an org. */
export async function getStats(db: Db, orgId: string): Promise<MemoryStats> {
  // Total entries
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companyMemory)
    .where(eq(companyMemory.orgId, orgId));

  // By category
  const categoryRows = await db
    .select({
      category: companyMemory.category,
      count: sql<number>`count(*)::int`,
    })
    .from(companyMemory)
    .where(eq(companyMemory.orgId, orgId))
    .groupBy(companyMemory.category);

  // Average importance
  const [avgResult] = await db
    .select({ avg: sql<number>`coalesce(avg(${companyMemory.importance}), 0)` })
    .from(companyMemory)
    .where(eq(companyMemory.orgId, orgId));

  // Recent activity (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [recentResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companyMemory)
    .where(and(eq(companyMemory.orgId, orgId), sql`${companyMemory.createdAt} >= ${sevenDaysAgo}`));

  const byCategory: Record<string, number> = {};
  for (const row of categoryRows) {
    byCategory[row.category] = row.count;
  }

  return {
    totalEntries: totalResult?.count ?? 0,
    byCategory,
    avgImportance: Number(avgResult?.avg ?? 0),
    recentActivity: recentResult?.count ?? 0,
  };
}

/**
 * Retrieve relevant memory for context building.
 * Used by the Executive Agent to load organizational context.
 * Returns the most important and recent entries, limited to prevent context overflow.
 */
export async function retrieveForContext(
  db: Db,
  orgId: string,
  opts: { maxEntries?: number; categories?: MemoryCategory[] } = {},
): Promise<CompanyMemoryEntry[]> {
  const { maxEntries = 20, categories } = opts;

  const conditions = [eq(companyMemory.orgId, orgId)];

  if (categories && categories.length > 0) {
    conditions.push(sql`${companyMemory.category} IN ${categories}`);
  }

  return db
    .select()
    .from(companyMemory)
    .where(and(...conditions))
    .orderBy(desc(companyMemory.importance), desc(companyMemory.createdAt))
    .limit(maxEntries);
}

/**
 * Bulk create memory entries (used by Executive Agent after command execution).
 */
export async function bulkCreate(
  db: Db,
  entries: NewCompanyMemoryEntry[],
): Promise<CompanyMemoryEntry[]> {
  if (entries.length === 0) return [];
  const rows = await db.insert(companyMemory).values(entries).returning();
  return rows;
}
