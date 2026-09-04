/**
 * ORQ8 Agent Memory System
 *
 * Per-agent memory that persists across tasks, helping agents learn and
 * improve over time. Each agent accumulates:
 * - Lessons learned from task execution
 * - Preferences discovered during work
 * - Patterns identified in data
 * - Relationships with other agents
 * - Organizational knowledge
 *
 * Memory is org-scoped and agent-scoped, with importance ratings and
 * automatic relevance retrieval for context building.
 */

import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import { companyMemory, type Db } from '@orq8/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentMemoryCategory =
  | 'lesson'        // What the agent learned from executing tasks
  | 'preference'    // Discovered preferences (tone, format, style)
  | 'pattern'       // Patterns identified in data or workflows
  | 'relationship'  // Knowledge about other agents and how to work with them
  | 'technique'     // Effective approaches for specific task types
  | 'context'       // Organizational context relevant to the agent's role
  | 'feedback';     // Feedback received from founder or other agents

export interface AgentMemoryEntry {
  id: string;
  orgId: string;
  agentId: string;
  category: AgentMemoryCategory;
  content: string;
  importance: number; // 1-10
  taskIds: string[]; // Tasks that generated this memory
  tags: string[]; // searchable tags
  useCount: number; // how often this memory has been retrieved
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreAgentMemoryOpts {
  orgId: string;
  agentId: string;
  category: AgentMemoryCategory;
  content: string;
  importance?: number; // default 5
  taskId?: string;
  tags?: string[];
}

export interface RetrieveAgentMemoryOpts {
  orgId: string;
  agentId: string;
  category?: AgentMemoryCategory;
  query?: string;
  tags?: string[];
  minImportance?: number;
  limit?: number; // default 10
}

// ─── Storage ────────────────────────────────────────────────────────────────

/**
 * Store a memory entry for an agent.
 * Uses the existing company_memory table with agent_id as the scoping mechanism.
 * Tags are stored in the content prefix for retrieval.
 */
export async function storeAgentMemory(
  db: Db,
  opts: StoreAgentMemoryOpts,
): Promise<string | null> {
  const importance = opts.importance ?? 5;
  const tags = opts.tags ?? [];
  const tagPrefix = tags.length > 0 ? `[tags:${tags.join(',')}] ` : '';

  const [entry] = await db
    .insert(companyMemory)
    .values({
      orgId: opts.orgId,
      agentId: opts.agentId,
      category: opts.category,
      content: `${tagPrefix}${opts.content}`,
      source: `agent_memory`,
      taskId: opts.taskId ?? null,
      importance: Math.min(10, Math.max(1, importance)),
    })
    .returning();

  return entry?.id ?? null;
}

/**
 * Retrieve relevant memories for an agent.
 * Used during context building to give agents their accumulated knowledge.
 */
export async function retrieveAgentMemory(
  db: Db,
  opts: RetrieveAgentMemoryOpts,
): Promise<AgentMemoryEntry[]> {
  const conditions = [
    eq(companyMemory.orgId, opts.orgId),
    eq(companyMemory.agentId, opts.agentId),
    eq(companyMemory.source, 'agent_memory'),
  ];

  if (opts.category) {
    conditions.push(eq(companyMemory.category, opts.category));
  }

  if (opts.minImportance) {
    conditions.push(sql`${companyMemory.importance} >= ${opts.minImportance}`);
  }

  if (opts.query) {
    conditions.push(
      or(
        ilike(companyMemory.content, `%${opts.query}%`),
      )!,
    );
  }

  const entries = await db
    .select()
    .from(companyMemory)
    .where(and(...conditions))
    .orderBy(desc(companyMemory.importance), desc(companyMemory.createdAt))
    .limit(opts.limit ?? 10);

  // Parse tags from content prefix
  return entries.map((e) => {
    const tagMatch = e.content.match(/^\[tags:([^\]]+)\]\s*/);
    const tags = tagMatch ? tagMatch[1]!.split(',') : [];
    const cleanContent = tagMatch ? e.content.slice(tagMatch[0].length) : e.content;

    return {
      id: String(e.id),
      orgId: e.orgId,
      agentId: e.agentId ?? '',
      category: (e.category as AgentMemoryCategory) ?? 'context',
      content: cleanContent,
      importance: e.importance,
      taskIds: e.taskId ? [e.taskId] : [],
      tags,
      useCount: 0,
      lastUsedAt: null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  });
}

/**
 * Auto-store memory from task execution.
 * Called after a task completes to capture lessons and patterns.
 */
export async function autoStoreFromTaskCompletion(
  db: Db,
  orgId: string,
  agentId: string,
  taskId: string,
  taskTitle: string,
  result: string,
): Promise<void> {
  // Store a memory entry from the task result
  const importance = result.length > 100 ? 6 : 4; // Longer results = more important

  await storeAgentMemory(db, {
    orgId,
    agentId,
    category: 'lesson',
    content: `Completed "${taskTitle}": ${result.slice(0, 500)}`,
    importance,
    taskId,
    tags: ['auto', 'task_completion'],
  }).catch(() => {});
}

/**
 * Auto-store memory from task failure.
 * Captures what went wrong so the agent can avoid it next time.
 */
export async function autoStoreFromTaskFailure(
  db: Db,
  orgId: string,
  agentId: string,
  taskId: string,
  taskTitle: string,
  error: string,
): Promise<void> {
  await storeAgentMemory(db, {
    orgId,
    agentId,
    category: 'lesson',
    content: `Failed "${taskTitle}": ${error.slice(0, 500)}`,
    importance: 7, // Failures are high importance — agent should learn from them
    taskId,
    tags: ['auto', 'task_failure'],
  }).catch(() => {});
}

/**
 * Get memory stats for an agent.
 */
export async function getAgentMemoryStats(
  db: Db,
  orgId: string,
  agentId: string,
): Promise<{
  totalEntries: number;
  byCategory: Record<string, number>;
  avgImportance: number;
  recentEntries: number;
}> {
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companyMemory)
    .where(and(
      eq(companyMemory.orgId, orgId),
      eq(companyMemory.agentId, agentId),
      eq(companyMemory.source, 'agent_memory'),
    ));

  const categoryRows = await db
    .select({
      category: companyMemory.category,
      count: sql<number>`count(*)::int`,
    })
    .from(companyMemory)
    .where(and(
      eq(companyMemory.orgId, orgId),
      eq(companyMemory.agentId, agentId),
      eq(companyMemory.source, 'agent_memory'),
    ))
    .groupBy(companyMemory.category);

  const [avgResult] = await db
    .select({ avg: sql<number>`coalesce(avg(${companyMemory.importance}), 0)` })
    .from(companyMemory)
    .where(and(
      eq(companyMemory.orgId, orgId),
      eq(companyMemory.agentId, agentId),
      eq(companyMemory.source, 'agent_memory'),
    ));

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [recentResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companyMemory)
    .where(and(
      eq(companyMemory.orgId, orgId),
      eq(companyMemory.agentId, agentId),
      eq(companyMemory.source, 'agent_memory'),
      sql`${companyMemory.createdAt} >= ${sevenDaysAgo}`,
    ));

  const byCategory: Record<string, number> = {};
  for (const row of categoryRows) {
    byCategory[row.category] = row.count;
  }

  return {
    totalEntries: totalResult?.count ?? 0,
    byCategory,
    avgImportance: Number(avgResult?.avg ?? 0),
    recentEntries: recentResult?.count ?? 0,
  };
}
