/**
 * ORQ8 Decision Memory Service
 *
 * Records every significant organizational decision with full context:
 * what was decided, why, alternatives, evidence, assumptions, expected vs
 * actual outcome, confidence level, and reversal conditions.
 *
 * This is the core moat — every decision makes future decisions better.
 * The Executive Agent uses Decision Memory to answer:
 *   - "Have we tried this before?"
 *   - "What happened when we did X?"
 *   - "Last time we did X, the outcome was Y — I recommend Z."
 */

import { and, eq, desc, sql, count as countFn, gte } from 'drizzle-orm';
import { decisions, tasks, type Db, type Decision, type NewDecision } from '@orq8/db';
import { appendAudit } from './audit.js';
import { classifyFounderOutcome } from './decision-feedback.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type DecisionType = 'strategic' | 'operational' | 'hiring' | 'resource_allocation' | 'technical' | 'partnership' | 'product' | 'marketing' | 'financial';
export type DecisionStatus = 'pending' | 'active' | 'validated' | 'reversed' | 'archived';
export type Confidence = 'high' | 'medium' | 'low';

export interface DecisionSummary {
  totalDecisions: number;
  activeDecisions: number;
  validatedDecisions: number;
  reversedDecisions: number;
  learningScore: number; // % of resolved decisions that were validated
  byType: Array<{ type: string; count: number }>;
  recentDecisions: Decision[];
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function createDecision(
  db: Db,
  orgId: string,
  userId: string,
  data: {
    title: string;
    decisionType?: DecisionType;
    confidence?: Confidence;
    decisionMakerType?: string;
    decisionMakerId?: string;
    decisionMakerName?: string;
    whatWasDecided: string;
    rationale?: string;
    alternatives?: Array<{ name: string; reasonRejected: string }>;
    evidence?: Array<{ source: string; type: string; summary: string }>;
    assumptions?: string[];
    expectedOutcome?: string;
    /** Full Decision Council session (§11/§47) — participants, rounds,
     * disagreements, budget. Null/undefined for non-council decisions. */
    councilDetail?: Record<string, unknown> | null;
    reversalConditions?: string[];
    strategyId?: string;
    objectiveId?: string;
    taskId?: string;
    decidedAt?: string;
  },
): Promise<Decision> {
  const rows = await db.insert(decisions).values({
    orgId,
    title: data.title,
    decisionType: data.decisionType ?? 'operational',
    status: 'active',
    confidence: data.confidence ?? 'medium',
    decisionMakerType: data.decisionMakerType ?? 'user',
    decisionMakerId: data.decisionMakerId ?? null,
    decisionMakerName: data.decisionMakerName ?? null,
    whatWasDecided: data.whatWasDecided,
    rationale: data.rationale ?? null,
    alternatives: data.alternatives ?? [],
    evidence: data.evidence ?? [],
    assumptions: data.assumptions ?? [],
    expectedOutcome: data.expectedOutcome ?? null,
    councilDetail: (data.councilDetail ?? null) as never,
    reversalConditions: data.reversalConditions ?? [],
    strategyId: data.strategyId ?? null,
    objectiveId: data.objectiveId ?? null,
    taskId: data.taskId ?? null,
    decidedAt: data.decidedAt ? new Date(data.decidedAt) : new Date(),
  }).returning();

  const row = rows[0];
  if (!row) throw new Error('Failed to create decision');

  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'decision.created',
    inputRef: JSON.stringify({ title: data.title, type: data.decisionType }),
    outcome: 'success',
  });

  return row;
}

export async function listDecisions(
  db: Db,
  orgId: string,
  opts: {
    decisionType?: string;
    status?: string;
    decisionMakerType?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ decisions: Decision[]; total: number }> {
  const conditions = [eq(decisions.orgId, orgId)];
  if (opts.decisionType) conditions.push(eq(decisions.decisionType, opts.decisionType));
  if (opts.status) conditions.push(eq(decisions.status, opts.status));
  if (opts.decisionMakerType) conditions.push(eq(decisions.decisionMakerType, opts.decisionMakerType));

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(decisions)
    .where(and(...conditions));

  const rows = await db
    .select()
    .from(decisions)
    .where(and(...conditions))
    .orderBy(desc(decisions.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);

  return { decisions: rows, total: totalRow?.count ?? 0 };
}

export async function getDecision(db: Db, orgId: string, id: string): Promise<Decision | undefined> {
  const [row] = await db.select().from(decisions)
    .where(and(eq(decisions.id, id), eq(decisions.orgId, orgId)));
  return row;
}

export async function updateDecision(
  db: Db,
  orgId: string,
  userId: string,
  id: string,
  data: Partial<{
    status: DecisionStatus;
    actualOutcome: string;
    lessonsLearned: string;
    confidence: Confidence;
    rationale: string;
    reversalConditions: string[];
  }>,
): Promise<Decision | undefined> {
  const updateData: Record<string, unknown> = { ...data };
  if (data.actualOutcome) {
    updateData.outcomeFiledAt = new Date();
    // §20 phase 2: a founder-filed outcome is classified NOW, not left for the
    // scheduled reviewer (which only visits rows older than OUTCOME_REVIEW_DAYS
    // — a fresh filing would otherwise sit with prediction_accuracy null and
    // the org's accuracy mix stuck on 'unclassified'). The founder's narrative
    // is ground truth for WHAT happened; the classifier derives the structured
    // verdict from their words plus measured execution counts since the
    // decision was made.
    const [existing] = await db
      .select({ decidedAt: decisions.decidedAt, createdAt: decisions.createdAt })
      .from(decisions)
      .where(and(eq(decisions.id, id), eq(decisions.orgId, orgId)))
      .limit(1);
    const anchor = existing?.decidedAt ?? existing?.createdAt ?? new Date(0);
    const [stats] = await db
      .select({
        completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.orgId, orgId), gte(tasks.createdAt, anchor)));
    updateData.predictionAccuracy = classifyFounderOutcome(
      data.actualOutcome,
      stats?.completed ?? 0,
      stats?.failed ?? 0,
    );
  }

  const [row] = await db.update(decisions)
    .set(updateData)
    .where(and(eq(decisions.id, id), eq(decisions.orgId, orgId)))
    .returning();

  if (row) {
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: userId,
      action: 'decision.updated',
      inputRef: JSON.stringify({ id, changes: Object.keys(data) }),
      outcome: 'success',
    });
  }

  return row;
}

// ── Summary ─────────────────────────────────────────────────────────────────

export async function getDecisionSummary(db: Db, orgId: string): Promise<DecisionSummary> {
  const allDecisions = await db.select().from(decisions)
    .where(eq(decisions.orgId, orgId))
    .orderBy(desc(decisions.createdAt));

  const total = allDecisions.length;
  const active = allDecisions.filter(d => d.status === 'active').length;
  const validated = allDecisions.filter(d => d.status === 'validated').length;
  const reversed = allDecisions.filter(d => d.status === 'reversed').length;
  const resolved = validated + reversed;
  const learningScore = resolved > 0 ? Math.round((validated / resolved) * 100) : 0;

  // Group by type
  const typeMap = new Map<string, number>();
  for (const d of allDecisions) {
    typeMap.set(d.decisionType, (typeMap.get(d.decisionType) ?? 0) + 1);
  }
  const byType = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalDecisions: total,
    activeDecisions: active,
    validatedDecisions: validated,
    reversedDecisions: reversed,
    learningScore,
    byType,
    recentDecisions: allDecisions.slice(0, 10),
  };
}

// ── EA Context ──────────────────────────────────────────────────────────────

export async function getDecisionContext(db: Db, orgId: string, query?: string): Promise<string> {
  const summary = await getDecisionSummary(db, orgId);
  if (summary.totalDecisions === 0) return '';

  const lines: string[] = ['### Decision Memory'];

  // Learning score
  const resolved = summary.validatedDecisions + summary.reversedDecisions;
  if (resolved > 0) {
    lines.push(`Learning score: ${summary.learningScore}% (${summary.validatedDecisions} validated, ${summary.reversedDecisions} reversed out of ${resolved} resolved)`);
  }

  // Active decisions
  if (summary.activeDecisions > 0) {
    lines.push(`Active decisions: ${summary.activeDecisions}`);
  }

  // Recent decisions (most relevant for the EA)
  const recent = summary.recentDecisions.slice(0, 5);
  if (recent.length > 0) {
    lines.push('Recent decisions:');
    for (const d of recent) {
      const outcome = d.actualOutcome ? ` → ${d.actualOutcome}` : '';
      lines.push(`- [${d.status}] "${d.title}" (${d.decisionType}, confidence: ${d.confidence})${outcome}`);
    }
  }

  // Reversed decisions (lessons from failures)
  const reversed = allDecisionsRecent(db, orgId, 'reversed', 3);
  if ((await reversed).length > 0) {
    lines.push('Lessons from reversed decisions:');
    for (const d of (await reversed)) {
      if (d.lessonsLearned) {
        lines.push(`- "${d.title}": ${d.lessonsLearned}`);
      }
    }
  }

  return lines.join('\n');
}

async function allDecisionsRecent(db: Db, orgId: string, status: string, limit: number): Promise<Decision[]> {
  return db.select().from(decisions)
    .where(and(eq(decisions.orgId, orgId), eq(decisions.status, status)))
    .orderBy(desc(decisions.createdAt))
    .limit(limit);
}
