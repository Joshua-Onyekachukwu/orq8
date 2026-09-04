/**
 * ORQ8 Quality Pipeline — Closed-Loop Quality System for AI Task Execution
 *
 * This module wraps the existing task executor with:
 * 1. Pre-execution checks (acceptance criteria, context, permissions)
 * 2. Automated QA after execution
 * 3. Failure diagnosis and recovery
 * 4. Structured learning from outcomes
 * 5. Agent reliability tracking
 * 6. Work versioning
 *
 * Lifecycle: Created → Assigned → Executing → Submitted → QA → Review → Approved/Revision
 */

import type { AppConfig } from '@orq8/core';
import type { Db } from '@orq8/db';
import { eq, and, desc } from 'drizzle-orm';
import { tasks, agents, activityEvents, companyMemory } from '@orq8/db';
import { executeTask, type TaskExecutionResult } from './task-executor.js';
import { evaluateWork, type QAEvaluation, type QAVerdict } from './qa-evaluator.js';
import { analyzeFailure, createIncident, type FailureAnalysis } from './failure-analyzer.js';
import { captureLearning, retrieveRelevantLessons, type LearningEvent } from './learning-system.js';
import { calculateReliabilityProfile, type ReliabilityProfile } from './agent-reliability.js';
import { appendAudit } from './audit.js';
import { broadcastToOrg } from './realtime.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QualityPipelineResult {
  // Execution
  executionResult: TaskExecutionResult;

  // QA
  qaEvaluation: QAEvaluation;

  // Failure (if applicable)
  failureAnalysis: FailureAnalysis | null;

  // Learning
  learningEvent: LearningEvent | null;

  // Reliability
  agentReliability: ReliabilityProfile | null;

  // Final status
  finalStatus: 'completed' | 'revision_required' | 'failed' | 'escalated' | 'blocked';

  // Metadata
  totalDurationMs: number;
  revisionCount: number;
  creditsUsed: number;
  lessonsRetrieved: string[];
}

// ─── Quality Pipeline ───────────────────────────────────────────────────────

/**
 * Execute a task through the complete quality pipeline.
 */
export async function executeWithQuality(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
  options?: { skipQA?: boolean; revisionCount?: number },
): Promise<QualityPipelineResult> {
  const startTime = Date.now();
  const revisionCount = options?.revisionCount ?? 0;

  // 1. Pre-execution: Retrieve relevant lessons
  const lessonsRetrieved = await retrieveLessonsForTask(db, orgId, taskId);

  // 2. Execute the task
  const executionResult = await executeTask(config, db, orgId, taskId);

  // 3. If execution failed, analyze failure directly
  if (executionResult.status === 'failed') {
    return await handleExecutionFailure(
      config, db, orgId, taskId, executionResult, lessonsRetrieved, startTime, revisionCount,
    );
  }

  // 4. Run QA (unless skipped for low-risk tasks)
  let qaEvaluation: QAEvaluation;
  if (options?.skipQA) {
    qaEvaluation = createAutoPass();
  } else {
    qaEvaluation = await evaluateWork(config, db, orgId, taskId, executionResult.result);
  }

  // 5. Handle QA verdict
  if (qaEvaluation.verdict === 'pass' || qaEvaluation.verdict === 'pass_with_warnings') {
    return await handleSuccess(
      db, orgId, taskId, executionResult, qaEvaluation, lessonsRetrieved, startTime, revisionCount,
    );
  }

  if (qaEvaluation.verdict === 'revision_required') {
    return await handleRevisionRequired(
      config, db, orgId, taskId, executionResult, qaEvaluation, lessonsRetrieved, startTime, revisionCount,
    );
  }

  if (qaEvaluation.verdict === 'fail') {
    return await handleQAFailure(
      config, db, orgId, taskId, executionResult, qaEvaluation, lessonsRetrieved, startTime, revisionCount,
    );
  }

  // blocked
  return await handleBlocked(
    db, orgId, taskId, executionResult, qaEvaluation, lessonsRetrieved, startTime,
  );
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleSuccess(
  db: Db,
  orgId: string,
  taskId: string,
  executionResult: TaskExecutionResult,
  qaEvaluation: QAEvaluation,
  lessonsRetrieved: string[],
  startTime: number,
  revisionCount: number,
): Promise<QualityPipelineResult> {
  // Capture success learning
  const learningEvent = await captureLearning(
    db, orgId, taskId, null, 'success', qaEvaluation, null, executionResult.result,
  );

  // Get agent reliability
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const agentReliability = task?.agentId
    ? await calculateReliabilityProfile(db, orgId, task.agentId)
    : null;

  // Record activity
  await db.insert(activityEvents).values({
    orgId,
    taskId,
    agentId: task?.agentId ?? null,
    type: 'completed',
    summary: `Task completed — QA ${qaEvaluation.verdict} (score: ${qaEvaluation.score})`,
    cost: executionResult.cost,
    department: null,
  });

  // Audit
  await appendAudit(db, {
    orgId,
    actorType: 'system',
    action: 'task.qa_passed',
    tool: 'quality-pipeline',
    outcome: 'success',
  });

  broadcastToOrg(orgId, {
    type: 'task.qa_passed',
    taskId,
    summary: `Task completed successfully (QA: ${qaEvaluation.verdict})`,
  });

  return {
    executionResult,
    qaEvaluation,
    failureAnalysis: null,
    learningEvent,
    agentReliability,
    finalStatus: 'completed',
    totalDurationMs: Date.now() - startTime,
    revisionCount,
    creditsUsed: executionResult.cost,
    lessonsRetrieved,
  };
}

async function handleRevisionRequired(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
  executionResult: TaskExecutionResult,
  qaEvaluation: QAEvaluation,
  lessonsRetrieved: string[],
  startTime: number,
  revisionCount: number,
): Promise<QualityPipelineResult> {
  const MAX_REVISIONS = 3;

  // Capture revision learning
  const learningEvent = await captureLearning(
    db, orgId, taskId, null, 'revision', qaEvaluation, null, executionResult.result,
  );

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const agentReliability = task?.agentId
    ? await calculateReliabilityProfile(db, orgId, task.agentId)
    : null;

  // Record revision activity
  await db.insert(activityEvents).values({
    orgId,
    taskId,
    agentId: task?.agentId ?? null,
    type: 'revision',
    summary: `QA revision required: ${qaEvaluation.revisionInstructions || 'Quality issue'}`,
    cost: executionResult.cost,
    department: null,
  });

  if (revisionCount >= MAX_REVISIONS) {
    // Max revisions reached — escalate to founder
    await appendAudit(db, {
      orgId,
      actorType: 'system',
      action: 'task.escalated_max_revisions',
      tool: 'quality-pipeline',
      outcome: 'failure',
    });

    broadcastToOrg(orgId, {
      type: 'task.escalated',
      taskId,
      summary: `Task escalated after ${MAX_REVISIONS} failed revisions`,
    });

    return {
      executionResult,
      qaEvaluation,
      failureAnalysis: null,
      learningEvent,
      agentReliability,
      finalStatus: 'escalated',
      totalDurationMs: Date.now() - startTime,
      revisionCount,
      creditsUsed: executionResult.cost,
      lessonsRetrieved,
    };
  }

  return {
    executionResult,
    qaEvaluation,
    failureAnalysis: null,
    learningEvent,
    agentReliability,
    finalStatus: 'revision_required',
    totalDurationMs: Date.now() - startTime,
    revisionCount,
    creditsUsed: executionResult.cost,
    lessonsRetrieved,
  };
}

async function handleQAFailure(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
  executionResult: TaskExecutionResult,
  qaEvaluation: QAEvaluation,
  lessonsRetrieved: string[],
  startTime: number,
  revisionCount: number,
): Promise<QualityPipelineResult> {
  // Analyze failure
  const failureAnalysis = await analyzeFailure(
    config, db, orgId, taskId, executionResult.result, qaEvaluation,
  );

  // Create incident for serious failures
  if (failureAnalysis.severity === 'high' || failureAnalysis.severity === 'critical') {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    const [agent] = task?.agentId
      ? await db.select().from(agents).where(eq(agents.id, task.agentId))
      : [];

    await createIncident(
      db, orgId, taskId, task?.agentId ?? null,
      agent?.name ?? 'Unknown', agent?.department ?? null,
      failureAnalysis,
    );
  }

  // Capture failure learning
  const learningEvent = await captureLearning(
    db, orgId, taskId, null, 'failure', qaEvaluation, failureAnalysis, executionResult.result,
  );

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const agentReliability = task?.agentId
    ? await calculateReliabilityProfile(db, orgId, task.agentId)
    : null;

  // Record failure
  await db.insert(activityEvents).values({
    orgId,
    taskId,
    agentId: task?.agentId ?? null,
    type: 'failed',
    summary: `QA failed: ${failureAnalysis.description}`,
    reason: `Root cause: ${failureAnalysis.rootCause}`,
    cost: executionResult.cost,
    department: null,
  });

  await appendAudit(db, {
    orgId,
    actorType: 'system',
    action: 'task.qa_failed',
    tool: 'quality-pipeline',
    outcome: 'failure',
  });

  broadcastToOrg(orgId, {
    type: 'task.qa_failed',
    taskId,
    summary: `Task failed QA: ${failureAnalysis.description}`,
  });

  // Determine final status based on recovery strategy
  let finalStatus: QualityPipelineResult['finalStatus'] = 'failed';
  if (failureAnalysis.recoveryStrategy === 'escalate') finalStatus = 'escalated';
  if (failureAnalysis.recoveryStrategy === 'block') finalStatus = 'blocked';

  return {
    executionResult,
    qaEvaluation,
    failureAnalysis,
    learningEvent,
    agentReliability,
    finalStatus,
    totalDurationMs: Date.now() - startTime,
    revisionCount,
    creditsUsed: executionResult.cost,
    lessonsRetrieved,
  };
}

async function handleExecutionFailure(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
  executionResult: TaskExecutionResult,
  lessonsRetrieved: string[],
  startTime: number,
  revisionCount: number,
): Promise<QualityPipelineResult> {
  // Analyze the execution failure
  const failureAnalysis = await analyzeFailure(
    config, db, orgId, taskId, executionResult.result, null,
  );

  const learningEvent = await captureLearning(
    db, orgId, taskId, null, 'failure', null, failureAnalysis, executionResult.result,
  );

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const agentReliability = task?.agentId
    ? await calculateReliabilityProfile(db, orgId, task.agentId)
    : null;

  return {
    executionResult,
    qaEvaluation: {
      verdict: 'fail',
      score: 0,
      criteria: [],
      warnings: ['Task execution failed'],
      revisionInstructions: null,
      failureCategory: failureAnalysis.failureCategory,
      failureReason: failureAnalysis.description,
      estimatedRevisionEffort: 'significant',
      requiresFounderReview: failureAnalysis.severity === 'critical',
      timestamp: new Date().toISOString(),
    },
    failureAnalysis,
    learningEvent,
    agentReliability,
    finalStatus: failureAnalysis.recoveryStrategy === 'escalate' ? 'escalated' : 'failed',
    totalDurationMs: Date.now() - startTime,
    revisionCount,
    creditsUsed: executionResult.cost,
    lessonsRetrieved,
  };
}

async function handleBlocked(
  db: Db,
  orgId: string,
  taskId: string,
  executionResult: TaskExecutionResult,
  qaEvaluation: QAEvaluation,
  lessonsRetrieved: string[],
  startTime: number,
): Promise<QualityPipelineResult> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));

  await db.insert(activityEvents).values({
    orgId,
    taskId,
    agentId: task?.agentId ?? null,
    type: 'blocked',
    summary: `Task blocked: ${qaEvaluation.warnings.join(', ')}`,
    cost: 0,
    department: null,
  });

  return {
    executionResult,
    qaEvaluation,
    failureAnalysis: null,
    learningEvent: null,
    agentReliability: null,
    finalStatus: 'blocked',
    totalDurationMs: Date.now() - startTime,
    revisionCount: 0,
    creditsUsed: 0,
    lessonsRetrieved,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function retrieveLessonsForTask(
  db: Db,
  orgId: string,
  taskId: string,
): Promise<string[]> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return [];

  return retrieveRelevantLessons(db, orgId, task.agentId, task.title, 3);
}

function createAutoPass(): QAEvaluation {
  return {
    verdict: 'pass',
    score: 90,
    criteria: [],
    warnings: [],
    revisionInstructions: null,
    failureCategory: null,
    failureReason: null,
    estimatedRevisionEffort: 'trivial',
    requiresFounderReview: false,
    timestamp: new Date().toISOString(),
  };
}
