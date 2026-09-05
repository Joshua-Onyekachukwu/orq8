/**
 * Embeddings service (Phase 9 — semantic company memory).
 *
 * Uses pgvector on company_memory.embedding (768-dim default, ADR-012).
 * Embedding *generation* goes through any OpenAI-compatible /embeddings
 * endpoint (EMBEDDING_BASE_URL — e.g. LiteLLM → Ollama nomic-embed-text, or a
 * hosted provider). When no embedding provider is configured or a call fails,
 * every path degrades gracefully: writes skip the embedding, retrieval falls
 * back to the existing keyword (ilike) search. An embedding failure must never
 * break a memory write or an agent execution.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { companyMemory, type CompanyMemoryEntry, type Db } from '@orq8/db';
import type { AppConfig } from '@orq8/core';
import type { MemoryCategory } from './memory.js';

const EMBEDDING_TIMEOUT_MS = 15_000;
const DEFAULT_MODEL = 'nomic-embed-text';

/** Cosine similarity between two equal-length vectors. 0 when either is empty. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Parse a pgvector value into a number[].
 * pgvector returns vectors as strings like "[0.1,0.2,…]"; drizzle may also
 * hand back a number[] when the driver parses it. Accepts both.
 */
export function parseVector(value: string | number[] | null | undefined): number[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === 'number') ? (value as number[]) : null;
  }
  if (typeof value === 'string') {
    const m = value.match(/^\[([\d\s,.\-eE]+)\]$/);
    if (!m) return null;
    const nums = m[1]!.split(',').map((s) => Number(s.trim()));
    if (nums.some((n) => Number.isNaN(n))) return null;
    return nums;
  }
  return null;
}

/**
 * Generate an embedding for text via the configured embeddings endpoint.
 * Returns null (never throws) when EMBEDDING_BASE_URL is unset or the call fails.
 */
export async function generateEmbedding(text: string, config: AppConfig): Promise<number[] | null> {
  const baseUrl = config.EMBEDDING_BASE_URL;
  if (!baseUrl) return null;
  const model = config.EMBEDDING_MODEL || DEFAULT_MODEL;
  const key = config.EMBEDDING_API_KEY;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/embeddings`;
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (key) headers.authorization = `Bearer ${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: text.slice(0, 8000), model }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        data?: Array<{ embedding?: unknown }>;
      };
      const emb = data.data?.[0]?.embedding;
      if (!Array.isArray(emb)) return null;
      const nums = emb as number[];
      if (nums.length === 0 || nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;
      return nums;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Timeout, network failure, provider outage — degrade to keyword search.
    return null;
  }
}

/**
 * Semantic memory retrieval: order the org's memory by cosine similarity to a
 * query embedding. Returns null when no query embedding could be produced —
 * callers fall back to keyword search.
 */
export async function searchSemantic(
  db: Db,
  orgId: string,
  query: string,
  config: AppConfig,
  opts: {
    category?: MemoryCategory;
    minImportance?: number;
    agentId?: string;
    limit?: number;
    threshold?: number;
  } = {},
): Promise<CompanyMemoryEntry[] | null> {
  const queryEmbedding = await generateEmbedding(query, config);
  if (!queryEmbedding) return null;

  const conditions = [eq(companyMemory.orgId, orgId)];
  if (opts.category) conditions.push(eq(companyMemory.category, opts.category));
  if (opts.minImportance) {
    conditions.push(sql`${companyMemory.importance} >= ${opts.minImportance}`);
  }
  if (opts.agentId) conditions.push(eq(companyMemory.agentId, opts.agentId));

  const candidates = await db
    .select()
    .from(companyMemory)
    .where(and(...conditions))
    .orderBy(desc(companyMemory.importance))
    .limit(500);

  const threshold = opts.threshold ?? 0.25;
  const limit = opts.limit ?? 10;

  const scored: Array<{ entry: CompanyMemoryEntry; score: number }> = [];
  for (const entry of candidates) {
    const vec = parseVector(entry.embedding);
    if (!vec) continue;
    const score = cosineSimilarity(queryEmbedding, vec);
    if (score >= threshold) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}