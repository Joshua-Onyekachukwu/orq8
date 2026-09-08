/**
 * ORQ8 Strategy Service — Strategy → Objective → Key Result chain
 *
 * Connects company strategy to execution through measurable objectives
 * and key results. The Executive Agent uses this to answer:
 *   - "Are we working on the right things?"
 *   - "Why does this task exist?"
 *   - "What should we prioritize?"
 *
 * All operations are org-scoped and audited.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import {
  strategies, objectives, keyResults, initiatives, tasks, agents,
  type Db, type Strategy, type NewStrategy,
  type Objective, type NewObjective,
  type KeyResult, type NewKeyResult,
  type Initiative, type NewInitiative,
} from '@orq8/db';
import { appendAudit } from './audit.js';

// ── Strategy CRUD ───────────────────────────────────────────────────────────

export async function createStrategy(
  db: Db, orgId: string, userId: string,
  data: Omit<NewStrategy, 'orgId'>,
): Promise<Strategy> {
  const rows = await db.insert(strategies).values({ ...data, orgId }).returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to create strategy');
  await appendAudit(db, { orgId, actorType: 'user', actorId: userId, action: 'strategy.created', outcome: 'success' });
  return row;
}

export async function listStrategies(db: Db, orgId: string): Promise<Strategy[]> {
  return db.select().from(strategies)
    .where(eq(strategies.orgId, orgId))
    .orderBy(desc(strategies.createdAt));
}

export async function getStrategy(db: Db, orgId: string, id: string): Promise<Strategy | undefined> {
  const [row] = await db.select().from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.orgId, orgId)));
  return row;
}

export async function updateStrategy(
  db: Db, orgId: string, userId: string, id: string,
  data: Partial<Omit<NewStrategy, 'orgId' | 'id'>>,
): Promise<Strategy | undefined> {
  const [row] = await db.update(strategies).set(data)
    .where(and(eq(strategies.id, id), eq(strategies.orgId, orgId)))
    .returning();
  if (row) await appendAudit(db, { orgId, actorType: 'user', actorId: userId, action: 'strategy.updated', outcome: 'success' });
  return row;
}

// ── Objective CRUD ──────────────────────────────────────────────────────────

export async function createObjective(
  db: Db, orgId: string, userId: string,
  data: Omit<NewObjective, 'orgId'>,
): Promise<Objective> {
  const rows = await db.insert(objectives).values({ ...data, orgId }).returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to create objective');
  await appendAudit(db, { orgId, actorType: 'user', actorId: userId, action: 'objective.created', outcome: 'success' });
  return row;
}

export async function listObjectives(db: Db, orgId: string, strategyId?: string): Promise<Objective[]> {
  const conditions = [eq(objectives.orgId, orgId)];
  if (strategyId) conditions.push(eq(objectives.strategyId, strategyId));
  return db.select().from(objectives)
    .where(and(...conditions))
    .orderBy(desc(objectives.createdAt));
}

export async function getObjective(db: Db, orgId: string, id: string): Promise<Objective | undefined> {
  const [row] = await db.select().from(objectives)
    .where(and(eq(objectives.id, id), eq(objectives.orgId, orgId)));
  return row;
}

export async function updateObjective(
  db: Db, orgId: string, userId: string, id: string,
  data: Partial<Omit<NewObjective, 'orgId' | 'id'>>,
): Promise<Objective | undefined> {
  const [row] = await db.update(objectives).set(data)
    .where(and(eq(objectives.id, id), eq(objectives.orgId, orgId)))
    .returning();
  if (row) await appendAudit(db, { orgId, actorType: 'user', actorId: userId, action: 'objective.updated', outcome: 'success' });
  return row;
}

// ── Key Result CRUD ─────────────────────────────────────────────────────────

export async function createKeyResult(
  db: Db, orgId: string, userId: string,
  data: Omit<NewKeyResult, 'orgId'>,
): Promise<KeyResult> {
  const rows = await db.insert(keyResults).values({ ...data, orgId }).returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to create key result');
  await appendAudit(db, { orgId, actorType: 'user', actorId: userId, action: 'key_result.created', outcome: 'success' });
  return row;
}

export async function listKeyResults(db: Db, orgId: string, objectiveId: string): Promise<KeyResult[]> {
  return db.select().from(keyResults)
    .where(and(eq(keyResults.orgId, orgId), eq(keyResults.objectiveId, objectiveId)))
    .orderBy(desc(keyResults.createdAt));
}

export async function updateKeyResult(
  db: Db, orgId: string, userId: string, id: string,
  data: Partial<Omit<NewKeyResult, 'orgId' | 'id'>>,
): Promise<KeyResult | undefined> {
  const [row] = await db.update(keyResults).set(data)
    .where(and(eq(keyResults.id, id), eq(keyResults.orgId, orgId)))
    .returning();
  if (row) await appendAudit(db, { orgId, actorType: 'user', actorId: userId, action: 'key_result.updated', outcome: 'success' });
  return row;
}

// ── Initiative CRUD ─────────────────────────────────────────────────────────

export async function createInitiative(
  db: Db, orgId: string, userId: string,
  data: Omit<NewInitiative, 'orgId'>,
): Promise<Initiative> {
  const rows = await db.insert(initiatives).values({ ...data, orgId }).returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to create initiative');
  await appendAudit(db, { orgId, actorType: 'user', actorId: userId, action: 'initiative.created', outcome: 'success' });
  return row;
}

export async function listInitiatives(db: Db, orgId: string, objectiveId?: string): Promise<Initiative[]> {
  const conditions = [eq(initiatives.orgId, orgId)];
  if (objectiveId) conditions.push(eq(initiatives.objectiveId, objectiveId));
  return db.select().from(initiatives)
    .where(and(...conditions))
    .orderBy(desc(initiatives.createdAt));
}

// ── Strategy Summary (for EA context) ──────────────────────────────────────

export interface StrategySummary {
  activeStrategies: number;
  activeObjectives: number;
  activeKeyResults: number;
  activeInitiatives: number;
  overallProgress: number;
  topPriorities: Array<{
    type: 'strategy' | 'objective' | 'initiative';
    title: string;
    progress: number;
    status: string;
  }>;
}

export async function getStrategySummary(db: Db, orgId: string): Promise<StrategySummary> {
  const stratCountRows = await db.select({ count: sql<number>`count(*)::int` })
    .from(strategies).where(and(eq(strategies.orgId, orgId), eq(strategies.status, 'active')));
  const objCountRows = await db.select({ count: sql<number>`count(*)::int` })
    .from(objectives).where(and(eq(objectives.orgId, orgId), eq(objectives.status, 'active')));
  const krCountRows = await db.select({ count: sql<number>`count(*)::int` })
    .from(keyResults).where(eq(keyResults.orgId, orgId));
  const initCountRows = await db.select({ count: sql<number>`count(*)::int` })
    .from(initiatives).where(and(eq(initiatives.orgId, orgId), eq(initiatives.status, 'active')));

  const stratCount = stratCountRows[0]?.count ?? 0;
  const objCount = objCountRows[0]?.count ?? 0;
  const krCount = krCountRows[0]?.count ?? 0;
  const initCount = initCountRows[0]?.count ?? 0;

  const activeObjectives = await db.select({
    title: objectives.title,
    progress: objectives.progress,
    status: objectives.status,
  }).from(objectives)
    .where(and(eq(objectives.orgId, orgId), eq(objectives.status, 'active')))
    .orderBy(desc(objectives.progress))
    .limit(5);

  const topPriorities = activeObjectives.map(o => ({
    type: 'objective' as const,
    title: o.title,
    progress: o.progress,
    status: o.status,
  }));

  const overallProgress = objCount > 0
    ? Math.round(activeObjectives.reduce((sum, o) => sum + o.progress, 0) / Math.max(objCount, 1))
    : 0;

  return {
    activeStrategies: stratCount,
    activeObjectives: objCount,
    activeKeyResults: krCount,
    activeInitiatives: initCount,
    overallProgress,
    topPriorities,
  };
}
