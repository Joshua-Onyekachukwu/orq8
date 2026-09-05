import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import { companyMemory, type CompanyMemoryEntry, type NewCompanyMemoryEntry, type Db } from '@orq8/db';
import type { AppConfig } from '@orq8/core';
import { generateEmbedding, searchSemantic } from './embeddings.js';

/**
 * Company Memory Service
 *
 * Manages organizational knowledge: facts, decisions, lessons, preferences, workflows, context.
 * Memory is org-scoped and grows over time as the AI employees execute tasks.
 *
 * Design: docs/34 Work Domain, company_memory table
 *
 * Semantic retrieval: when an embedding provider is configured, keyword search
 * is augmented by pgvector cosine similarity (services/embeddings). Writing an
 * embedding is best-effort — a missing/failed embedding provider degrades to
 * keyword-only search and never breaks a memory write.
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

/**
 * Find memory entries for an org with optional filtering.
 *
 * When `query` is provided and an embedding provider is configured, results are
 * ordered by semantic similarity (cosine) instead of keyword match — falling
 * back to ilike transparently when no query embedding can be produced.
 */
export async function findByOrg(
  db: Db,
  orgId: string,
  opts: MemorySearchParams = {},
  config?: AppConfig,
): Promise<CompanyMemoryEntry[]> {
  // Semantic path: same filters, similarity-ordered. Falls back on null.
  if (opts.query && config) {
    const semantic = await searchSemantic(db, orgId, opts.query, config, {
      category: opts.category,
      minImportance: opts.minImportance,
      agentId: opts.agentId,
      limit: opts.limit ?? 50,
    });
    if (semantic) return semantic;
  }

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

/**
 * Create a new memory entry. When `config` is provided, the content is embedded
 * best-effort so the entry participates in semantic retrieval.
 */
export async function createMemory(
  db: Db,
  data: NewCompanyMemoryEntry,
  config?: AppConfig,
): Promise<CompanyMemoryEntry> {
  const rows = await db.insert(companyMemory).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createMemory returned no row');

  // Best-effort embedding — never fail the write when embeddings are unavailable.
  if (config) {
    try {
      const embedding = await generateEmbedding(data.content ?? '', config);
      if (embedding) {
        await db
          .update(companyMemory)
          .set({ embedding: embedding as never })
          .where(eq(companyMemory.id, row.id));
        return { ...row, embedding: `[${embedding.join(',')}]` as never };
      }
    } catch {
      // ignore — keyword fallback remains
    }
  }
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
