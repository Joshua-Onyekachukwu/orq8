import { eq, and, desc, inArray, sql, ilike, or } from 'drizzle-orm';
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
 * Words that carry no retrieval signal. Deliberately small and generic: it only
 * has to keep a natural-language task description from being treated as one
 * giant search string.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'about', 'over',
  'our', 'your', 'their', 'its', 'his', 'her', 'are', 'was', 'were', 'been',
  'has', 'have', 'had', 'not', 'but', 'all', 'any', 'can', 'will', 'would',
  'should', 'could', 'may', 'might', 'must', 'than', 'then', 'them', 'they',
  'you', 'our', 'out', 'off', 'per', 'via', 'use', 'using', 'get', 'got',
  'make', 'made', 'new', 'one', 'two', 'how', 'what', 'when', 'where', 'which',
  'who', 'why', 'please', 'need', 'needs', 'want', 'wants', 'some', 'also',
]);

/**
 * The salient terms of a search query.
 *
 * The previous keyword fallback matched the ENTIRE query string as a single
 * substring of the memory content, so a natural-language query ("review the
 * Acme renewal paperwork") matched nothing unless a memory happened to contain
 * that exact sentence. With no embedding provider configured that was the only
 * retrieval path, which meant a task could never find the knowledge the founder
 * had taught the company. Terms are lowercased, split on non-alphanumerics, and
 * capped so the SQL stays bounded.
 */
export function significantTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (STOPWORDS.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    terms.push(raw);
    if (terms.length >= 12) break;
  }
  return terms;
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

  // Keyword path: match on the query's salient terms and rank by how many of
  // them an entry contains, so a memory written in the founder's words still
  // surfaces for a task phrased differently. A query made only of noise words
  // degrades to importance+recency rather than matching nothing.
  const terms = opts.query ? significantTerms(opts.query) : [];
  if (terms.length > 0) {
    conditions.push(
      or(
        ...terms.map((t) => ilike(companyMemory.content, `%${t}%`)),
        ilike(companyMemory.source, `%${opts.query}%`),
      )!,
    );
  }

  const relevance = terms.length > 0
    ? sql<number>`(${sql.join(
        terms.map((t) => sql`(case when lower(${companyMemory.content}) like ${`%${t}%`} then 1 else 0 end)`),
        sql` + `,
      )})`
    : null;

  return db
    .select()
    .from(companyMemory)
    .where(and(...conditions))
    .orderBy(
      ...(relevance ? [desc(relevance)] : []),
      desc(companyMemory.importance),
      desc(companyMemory.createdAt),
    )
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

/**
 * Record that these entries were put in front of an employee (Gap D, docs/66
 * §66.14). Best-effort: a bookkeeping failure must never break the work that is
 * already retrieving its context.
 *
 * Only the context builders call this — a founder browsing `/v1/memory` is not
 * the company using the knowledge, so reads through the API alone leave the
 * counters alone.
 */
export async function stampMemoryUsage(db: Db, ids: Array<string | number>): Promise<void> {
  if (ids.length === 0) return;
  try {
    await db
      .update(companyMemory)
      .set({
        useCount: sql`${companyMemory.useCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(inArray(companyMemory.id, ids as string[]));
  } catch {
    // Never fail a task because the usage counter could not be written.
  }
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
 * Semantic memory retrieval for agent context builders (Executive Agent and
 * Task Executor). Company-isolated by construction (orgId on every query).
 *
 * Order of preference:
 *   1. Semantic (pgvector cosine) when a query + embedding provider exist —
 *      falls back inside `findByOrg` when an embedding cannot be produced.
 *   2. Keyword (ilike) when no embedding provider is configured.
 *   3. Importance + recency when there is no query at all.
 *
 * Results are bounded so a memory dump can never overflow the prompt, and a
 * missing/failed embedding provider never breaks context building.
 */
export async function retrieveSemanticForContext(
  db: Db,
  orgId: string,
  opts: { query?: string; category?: MemoryCategory; minImportance?: number; maxEntries?: number } = {},
  config?: AppConfig,
): Promise<CompanyMemoryEntry[]> {
  const maxEntries = Math.min(opts.maxEntries ?? 12, 30);
  const rows = opts.query?.trim()
    // findByOrg does semantic search when an embedding is available and
    // transparently degrades to term-matched keyword search otherwise.
    ? await findByOrg(db, orgId, {
        query: opts.query.trim().slice(0, 500),
        category: opts.category,
        minImportance: opts.minImportance,
        limit: maxEntries,
      }, config)
    // No query → deterministic importance-first ordering (still category-aware).
    : await (async () => {
        const conditions = [eq(companyMemory.orgId, orgId)];
        if (opts.category) conditions.push(eq(companyMemory.category, opts.category));
        if (opts.minImportance) conditions.push(sql`${companyMemory.importance} >= ${opts.minImportance}`);
        return db
          .select()
          .from(companyMemory)
          .where(and(...conditions))
          .orderBy(desc(companyMemory.importance), desc(companyMemory.createdAt))
          .limit(maxEntries);
      })();

  // These entries are about to be handed to an employee as working knowledge —
  // that is the moment the company "uses" the memory, so record it.
  await stampMemoryUsage(db, rows.map((r) => String(r.id)));
  return rows;
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
