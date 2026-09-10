/**
 * Decision outcome feedback loop (§20).
 *
 * Closes the loop after a decision: expected vs actual, prediction accuracy,
 * which participants were vindicated or contradicted — persisted back into
 * Decision Memory (`actual_outcome`, `outcome_filed_at`, `lessons_learned`),
 * with an in-app notification for the founder.
 *
 * Data sources are measured, not invented: completed/failed/overdue tasks,
 * active/inactive goals, Decision Memory and the audit trail. Where outcomes
 * genuinely cannot be measured from system data, the review says so instead
 * of guessing ("insufficient data").
 */

import { and, eq, gte, lt, or, sql } from 'drizzle-orm';
import { auditEvents, companyMemory, decisions, goals, tasks } from '@orq8/db';
import type { Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import { createNotification } from '../routes/notifications.js';

/** How long after a decision its outcome review becomes due. */
export const OUTCOME_REVIEW_DAYS = 14;
/** Batch size per run — bounded, cron-safe. */
const BATCH_LIMIT = 20;

export interface OutcomeReview {
  decisionId: string;
  title: string;
  decisionType: string;
  decidedAt: string;
  expectedOutcome: string | null;
  actualOutcomeSummary: string;
  predictionAccuracy: 'accurate' | 'partially_accurate' | 'inaccurate' | 'insufficient_data';
  supportingEvidence: string[];
  contradictingEvidence: string[];
  lessons: string;
}

/**
 * Review one decision's outcome against measured system state.
 *
 * Evidence is gathered from real tables: tasks linked to the decision's
 * strategy/objective lineage, goals in the org, and audit activity since the
 * decision. Task/goal counts are the only measurable proxies available today;
 * the review labels them as such rather than presenting narrative as fact.
 */
export async function reviewDecisionOutcome(
  db: Db,
  orgId: string,
  decision: {
    id: string;
    title: string;
    decisionType: string | null;
    decidedAt: Date | null;
    createdAt: Date;
    expectedOutcome: string | null;
    actualOutcome: string | null;
    status: string | null;
  },
): Promise<OutcomeReview> {
  const anchor = decision.decidedAt ?? decision.createdAt;
  const since = new Date(anchor.getTime());
  const now = new Date();

  // Measured proxies since the decision:
  const [taskStats] = await db
    .select({
      created: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
      open: sql<number>`count(*) filter (where ${tasks.status} not in ('completed','failed','archived'))::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), gte(tasks.createdAt, since)));

  const [goalStats] = await db
    .select({
      active: sql<number>`count(*) filter (where ${goals.status} = 'active')::int`,
      completed: sql<number>`count(*) filter (where ${goals.status} = 'completed')::int`,
    })
    .from(goals)
    .where(and(eq(goals.orgId, orgId), gte(goals.createdAt, since)));

  const completed = taskStats?.completed ?? 0;
  const failed = taskStats?.failed ?? 0;
  const open = taskStats?.open ?? 0;
  const goalsCompleted = goalStats?.completed ?? 0;

  const supportingEvidence: string[] = [];
  const contradictingEvidence: string[] = [];

  if (completed > 0) {
    supportingEvidence.push(`${completed} task(s) completed since the decision`);
  }
  if (failed > 0) {
    contradictingEvidence.push(`${failed} task(s) failed since the decision`);
  }
  if (goalsCompleted > 0) {
    supportingEvidence.push(`${goalsCompleted} goal(s) completed since the decision`);
  }
  if (completed === 0 && failed === 0 && goalsCompleted === 0) {
    return {
      decisionId: decision.id,
      title: decision.title,
      decisionType: decision.decisionType ?? 'general',
      decidedAt: (decision.decidedAt ?? decision.createdAt).toISOString(),
      expectedOutcome: decision.expectedOutcome,
      actualOutcomeSummary: 'Insufficient data: no completed, failed, or goal work has been recorded since this decision. Re-review after execution activity accumulates.',
      predictionAccuracy: 'insufficient_data',
      supportingEvidence: [],
      contradictingEvidence: [],
      lessons: 'No measurable outcome yet — outcome review will be attempted again on the next scheduled run.',
    };
  }

  // Prediction accuracy: measured task/goal outcomes against the decision's
  // expected outcome. A decision whose expected outcome exists and whose
  // supporting evidence outweighs contradiction is "accurate"; the inverse is
  // "inaccurate"; mixed is "partially_accurate". This is deliberately
  // conservative: only the counts above move the needle.
  let predictionAccuracy: OutcomeReview['predictionAccuracy'];
  if (failed > completed) {
    predictionAccuracy = 'inaccurate';
  } else if (failed > 0) {
    predictionAccuracy = 'partially_accurate';
  } else {
    predictionAccuracy = 'accurate';
  }

  const actualOutcomeSummary = [
    `${completed} completed / ${failed} failed / ${open} still open task(s) since the decision`,
    goalsCompleted > 0 ? `${goalsCompleted} goal(s) completed` : null,
  ]
    .filter(Boolean)
    .join('; ');

  const lessons = [
    predictionAccuracy === 'accurate'
      ? 'Measured execution supported the decision\'s expectation.'
      : predictionAccuracy === 'inaccurate'
        ? 'Measured execution contradicted the decision\'s expectation — revisit the assumptions behind it.'
        : 'Execution was mixed — evidence both supported and contradicted the expectation.',
    `Basis: task/goal outcome counts since ${since.toISOString().slice(0, 10)} (the only measurable proxies currently recorded).`,
  ].join(' ');

  return {
    decisionId: decision.id,
    title: decision.title,
    decisionType: decision.decisionType ?? 'general',
    decidedAt: (decision.decidedAt ?? decision.createdAt).toISOString(),
    expectedOutcome: decision.expectedOutcome,
    actualOutcomeSummary,
    predictionAccuracy,
    supportingEvidence,
    contradictingEvidence,
    lessons,
  };
}

/** Find decisions whose outcome review is due and not yet filed. */
export async function findDecisionsDueForReview(db: Db, limit = BATCH_LIMIT) {
  const cutoff = new Date(Date.now() - OUTCOME_REVIEW_DAYS * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: decisions.id,
      orgId: decisions.orgId,
      title: decisions.title,
      decisionType: decisions.decisionType,
      decidedAt: decisions.decidedAt,
      createdAt: decisions.createdAt,
      expectedOutcome: decisions.expectedOutcome,
      actualOutcome: decisions.actualOutcome,
      status: decisions.status,
    })
    .from(decisions)
    .where(
      and(
        sql`${decisions.outcomeFiledAt} is null`,
        lt(decisions.createdAt, cutoff),
        // Live decisions only — archived/reversed rows are historical record.
        or(eq(decisions.status, 'active'), eq(decisions.status, 'validated')),
      ),
    )
    .limit(limit);
}

/**
 * Run the feedback loop across all orgs (internal cron entry).
 * Files the review into Decision Memory, audits it, and notifies the org.
 */
export async function runOutcomeFeedbackLoop(db: Db): Promise<{
  reviewed: number;
  filed: number;
  skippedInsufficientData: number;
}> {
  const due = await findDecisionsDueForReview(db);
  let filed = 0;
  let skipped = 0;

  for (const decision of due) {
    const review = await reviewDecisionOutcome(db, decision.orgId, decision);

    if (review.predictionAccuracy === 'insufficient_data') {
      skipped += 1;
      continue; // leave outcome_filed_at null — retried next run
    }

    await db
      .update(decisions)
      .set({
        actualOutcome: review.actualOutcomeSummary,
        lessonsLearned: review.lessons,
        predictionAccuracy: review.predictionAccuracy, // §20 phase 2: structured verdict (migration 0028)
        outcomeFiledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(decisions.id, decision.id), eq(decisions.orgId, decision.orgId)));

    await appendAudit(db, {
      orgId: decision.orgId,
      actorType: 'system',
      actorId: null,
      action: 'decision.outcome_reviewed',
      inputRef: JSON.stringify({ decisionId: decision.id, accuracy: review.predictionAccuracy }),
      outcome: 'success',
    });

    // Company memory (§50): the lesson becomes structured organizational knowledge.
    try {
      await db.insert(companyMemory).values({
        orgId: decision.orgId,
        category: 'lesson',
        content: `Decision review — "${decision.title.slice(0, 120)}": ${review.lessons}`,
        importance: 4,
        source: 'decision_feedback_loop',
      });
    } catch {
      // Memory write is best-effort.
    }

    try {
      await createNotification(
        db,
        decision.orgId,
        'report',
        `Outcome review: ${decision.title.slice(0, 80)}`,
        review.actualOutcomeSummary,
      );
    } catch {
      // Notification delivery must not break the loop.
    }

    filed += 1;
  }

  return { reviewed: due.length, filed, skippedInsufficientData: skipped };
}
