/**
 * Memory consolidation service (Phase 10).
 *
 * Runs as a scheduled pass (POST /v1/internal/memory/consolidate via cron):
 *   1. exact/near-exact duplicates (normalized content equality) are merged —
 *      the kept row absorbs the highest importance and the dropped rows are
 *      audited, never silently destroyed
 *   2. near-duplicates (embedding cosine ≥ 0.95) get importance promoted so
 *      they rank higher in retrieval
 *
 * Company-isolated: operates on one org at a time, scoped by org_id.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { companyMemory, type CompanyMemoryEntry, type Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import { cosineSimilarity, parseVector } from './embeddings.js';

const MAX_ENTRIES_PER_PASS = 1000;
const NEAR_DUPLICATE_THRESHOLD = 0.95;

export interface ConsolidationSummary {
  orgId: string;
  scanned: number;
  exactDuplicatesMerged: number;
  nearDuplicatePairs: number;
  promoted: number;
}

/** Normalize text for duplicate detection (case, punctuation, whitespace). */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pure duplicate detector. Returns a plan:
 *   - exact: list of [keptIndex, [dupIndexes]] per exact-duplicate cluster
 *   - nearPairs: index pairs with cosine similarity ≥ threshold
 */
export function findDuplicates(
  entries: Array<{ normalized: string; embedding: number[] | null }>,
  threshold = NEAR_DUPLICATE_THRESHOLD,
): { exact: Array<{ keep: number; dups: number[] }>; nearPairs: Array<[number, number]> } {
  const exact: Array<{ keep: number; dups: number[] }> = [];
  const seen = new Map<string, number>(); // normalized text → kept index

  entries.forEach((entry, i) => {
    if (!entry.normalized) return;
    const prev = seen.get(entry.normalized);
    if (prev !== undefined) {
      const cluster = exact.find((c) => c.keep === prev);
      if (cluster) cluster.dups.push(i);
      else exact.push({ keep: prev, dups: [i] });
    } else {
      seen.set(entry.normalized, i);
    }
  });

  const nearPairs: Array<[number, number]> = [];
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i]!.embedding;
    if (!a) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j]!.embedding;
      if (!b) continue;
      if (cosineSimilarity(a, b) >= threshold) nearPairs.push([i, j]);
    }
  }

  return { exact, nearPairs };
}

/**
 * Consolidate one org's memory. Returns a summary; never throws on a single
 * bad row. Kept rows absorb the maximum importance of their cluster; dropped
 * duplicates are deleted with an audit record.
 */
export async function consolidateOrgMemory(
  db: Db,
  orgId: string,
  threshold = NEAR_DUPLICATE_THRESHOLD,
): Promise<ConsolidationSummary> {
  const entries = await db
    .select()
    .from(companyMemory)
    .where(eq(companyMemory.orgId, orgId))
    .orderBy(desc(companyMemory.importance), desc(companyMemory.createdAt))
    .limit(MAX_ENTRIES_PER_PASS);

  const summary: ConsolidationSummary = {
    orgId,
    scanned: entries.length,
    exactDuplicatesMerged: 0,
    nearDuplicatePairs: 0,
    promoted: 0,
  };

  if (entries.length === 0) return summary;

  const decorated = entries.map((e) => ({
    entry: e,
    normalized: normalizeText(e.content ?? ''),
    embedding: parseVector(e.embedding),
  }));

  const { exact, nearPairs } = findDuplicates(decorated, threshold);
  summary.nearDuplicatePairs = nearPairs.length;

  // Merge exact duplicates: keep the highest-importance row, fold max
  // importance into it, delete the rest, audit the merge.
  const toDelete: string[] = [];
  for (const cluster of exact) {
    const kept = decorated[cluster.keep];
    if (!kept) continue;
    const maxImportance = Math.max(
      kept.entry.importance,
      ...cluster.dups.map((i) => decorated[i]?.entry.importance ?? 0),
    );
    if (maxImportance !== kept.entry.importance) {
      await db
        .update(companyMemory)
        .set({ importance: maxImportance, updatedAt: new Date() })
        .where(eq(companyMemory.id, kept.entry.id));
      summary.promoted++;
    }
    for (const dupIdx of cluster.dups) {
      const dup = decorated[dupIdx];
      if (!dup) continue;
      toDelete.push(dup.entry.id);
      summary.exactDuplicatesMerged++;
      await appendAudit(db, {
        orgId,
        actorType: 'system',
        action: 'memory.consolidated',
        inputRef: dup.entry.id,
        resultRef: kept.entry.id,
        outcome: 'success',
      });
    }
  }

  // Near-duplicates: promote importance so both rank higher in retrieval.
  for (const [i, j] of nearPairs) {
    const a = decorated[i];
    const b = decorated[j];
    if (!a || !b) continue;
    const max = Math.max(a.entry.importance, b.entry.importance);
    const raise = Math.min(10, max + 1);
    if (raise !== a.entry.importance) {
      await db
        .update(companyMemory)
        .set({ importance: raise, updatedAt: new Date() })
        .where(eq(companyMemory.id, a.entry.id));
      summary.promoted++;
    }
    if (raise !== b.entry.importance) {
      await db
        .update(companyMemory)
        .set({ importance: raise, updatedAt: new Date() })
        .where(eq(companyMemory.id, b.entry.id));
      summary.promoted++;
    }
  }

  if (toDelete.length > 0) {
    await db
      .delete(companyMemory)
      .where(and(eq(companyMemory.orgId, orgId), inArray(companyMemory.id, toDelete)));
  }

  return summary;
}

/** Consolidate all orgs that have any memory rows. */
export async function consolidateAllOrgs(
  db: Db,
  orgIds: string[],
): Promise<ConsolidationSummary[]> {
  const out: ConsolidationSummary[] = [];
  for (const orgId of orgIds) {
    try {
      out.push(await consolidateOrgMemory(db, orgId));
    } catch {
      // Per-org isolation: one org's failure never blocks the others.
    }
  }
  return out;
}

/** Distinct org ids with memory entries (bounded). */
export async function orgIdsWithMemory(db: Db, limit = 200): Promise<string[]> {
  const rows = await db
    .selectDistinct({ orgId: companyMemory.orgId })
    .from(companyMemory)
    .limit(limit);
  return rows.map((r) => r.orgId);
}

export type { CompanyMemoryEntry };