/**
 * ORQ8 Learning System — Structured Learning from AI Task Failures & Successes
 *
 * When an agent makes a mistake or succeeds, this system:
 * 1. Captures structured learning events
 * 2. Categorizes learning (episodic, semantic, procedural)
 * 3. Validates learning before promoting to company-wide rules
 * 4. Retrieves relevant lessons before similar future tasks
 * 5. Tracks learning effectiveness over time
 */

import type { Db } from '@orq8/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { companyMemory, agents, tasks } from '@orq8/db';
import type { FailureAnalysis } from './failure-analyzer.js';
import type { QAEvaluation } from './qa-evaluator.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LearningScope = 'task' | 'agent' | 'department' | 'company';
export type LearningType = 'episodic' | 'semantic' | 'procedural';

export interface LearningEvent {
  id: string;
  orgId: string;
  taskId: string;
  agentId: string | null;
  type: LearningType;
  scope: LearningScope;
  trigger: 'success' | 'failure' | 'revision' | 'feedback';
  summary: string;
  lesson: string;
  procedure: string | null;
  evidence: string;
  validated: boolean;
  validatedBy: string | null;
  appliedCount: number;
  effectivenessScore: number | null; // 0-100, null = not yet measured
  createdAt: string;
}

// ─── Learning Capture ───────────────────────────────────────────────────────

/**
 * Capture a learning event from task execution.
 */
export async function captureLearning(
  db: Db,
  orgId: string,
  taskId: string,
  agentId: string | null,
  trigger: LearningEvent['trigger'],
  evaluation: QAEvaluation | null,
  analysis: FailureAnalysis | null,
  taskResult: string,
): Promise<LearningEvent> {
  const [agent] = agentId
    ? await db.select().from(agents).where(eq(agents.id, agentId))
    : [];

  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId));

  // Determine learning type and content
  const learning = determineLearning(trigger, evaluation, analysis, agent, task, taskResult, taskId, agentId, orgId);

  // Store as company memory with structured format
  const content = formatLearningContent(learning);

  await db.insert(companyMemory).values({
    orgId,
    category: learning.type === 'procedural' ? 'workflow' : 'lesson',
    content,
    source: `learning-system:${trigger}`,
    agentId,
    taskId,
    importance: trigger === 'failure' ? 7 : trigger === 'feedback' ? 8 : 5,
  });

  return learning;
}

// ─── Learning Determination ─────────────────────────────────────────────────

function determineLearning(
  trigger: LearningEvent['trigger'],
  evaluation: QAEvaluation | null,
  analysis: FailureAnalysis | null,
  agent: { id: string; name: string; role: string } | undefined,
  task: { title: string; description: string | null } | undefined,
  taskResult: string,
  taskId: string,
  agentId: string | null,
  orgId: string,
): LearningEvent {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (trigger === 'failure' && analysis) {
    return {
      id,
      orgId: analysis.orgId,
      taskId: analysis.taskId,
      agentId: analysis.agentId,
      type: analysis.preventionRule ? 'procedural' : 'episodic',
      scope: 'agent',
      trigger: 'failure',
      summary: `Task "${task?.title}" failed: ${analysis.description}`,
      lesson: analysis.description,
      procedure: analysis.preventionRule,
      evidence: `Failure category: ${analysis.failureCategory}. Root cause: ${analysis.rootCause}. Recovery: ${analysis.recoveryStrategy}`,
      validated: false,
      validatedBy: null,
      appliedCount: 0,
      effectivenessScore: null,
      createdAt: now,
    };
  }

  if (trigger === 'success' && evaluation) {
    return {
      id,
      orgId,
      taskId,
      agentId,
      type: 'episodic',
      scope: 'task',
      trigger: 'success',
      summary: `Task "${task?.title}" completed successfully (QA score: ${evaluation.score})`,
      lesson: `Successful approach for ${task?.title}`,
      procedure: null,
      evidence: `QA score: ${evaluation.score}. Verdict: ${evaluation.verdict}`,
      validated: false,
      validatedBy: null,
      appliedCount: 0,
      effectivenessScore: null,
      createdAt: now,
    };
  }

  if (trigger === 'revision' && evaluation) {
    return {
      id,
      orgId,
      taskId,
      agentId,
      type: 'procedural',
      scope: 'agent',
      trigger: 'revision',
      summary: `Task "${task?.title}" required revision: ${evaluation.revisionInstructions || 'Quality issue'}`,
      lesson: evaluation.revisionInstructions || 'Work needs improvement',
      procedure: evaluation.revisionInstructions,
      evidence: `QA verdict: ${evaluation.verdict}. Score: ${evaluation.score}`,
      validated: false,
      validatedBy: null,
      appliedCount: 0,
      effectivenessScore: null,
      createdAt: now,
    };
  }

  // Default: feedback or unknown trigger
  return {
    id,
    orgId,
    taskId,
    agentId,
    type: 'episodic',
    scope: 'task',
    trigger,
    summary: `Learning event from task "${task?.title}"`,
    lesson: 'Task completed with feedback',
    procedure: null,
    evidence: `Trigger: ${trigger}`,
    validated: false,
    validatedBy: null,
    appliedCount: 0,
    effectivenessScore: null,
    createdAt: now,
  };
}

// ─── Format Learning Content ────────────────────────────────────────────────

function formatLearningContent(learning: LearningEvent): string {
  const parts = [
    `[LEARNING-${learning.type.toUpperCase()}] ${learning.summary}`,
    `Lesson: ${learning.lesson}`,
  ];

  if (learning.procedure) {
    parts.push(`Procedure: ${learning.procedure}`);
  }

  parts.push(`Evidence: ${learning.evidence}`);
  parts.push(`Scope: ${learning.scope} | Trigger: ${learning.trigger}`);

  return parts.join('\n');
}

// ─── Learning Retrieval ─────────────────────────────────────────────────────

/**
 * Retrieve relevant lessons for a new task.
 * Returns lessons that match the task type, agent, or department.
 */
export async function retrieveRelevantLessons(
  db: Db,
  orgId: string,
  agentId: string | null,
  taskTitle: string,
  limit: number = 5,
): Promise<string[]> {
  // Get procedural and semantic learnings (most actionable)
  const memories = await db
    .select()
    .from(companyMemory)
    .where(
      and(
        eq(companyMemory.orgId, orgId),
        sql`${companyMemory.category} IN ('workflow', 'lesson')`,
      )
    )
    .orderBy(desc(companyMemory.importance))
    .limit(20);

  // Simple relevance matching: find lessons related to this task type
  const keywords = taskTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const relevant = memories.filter((m) => {
    const content = m.content.toLowerCase();
    return keywords.some((kw) => content.includes(kw)) ||
           content.includes('procedure') ||
           content.includes('LEARNING-PROCEDURAL');
  });

  return relevant
    .slice(0, limit)
    .map((m) => m.content);
}

// ─── Learning Validation ────────────────────────────────────────────────────

/**
 * Validate a learning event (founder or system approves it).
 */
export async function validateLearning(
  db: Db,
  orgId: string,
  learningId: string,
  validatedBy: string,
): Promise<void> {
  // Find the memory entry and update its importance
  // In a real system, this would update a dedicated learnings table
  // For now, we bump the importance to make it more influential
  await db
    .update(companyMemory)
    .set({ importance: 10 })
    .where(
      and(
        eq(companyMemory.orgId, orgId),
        sql`content LIKE '%LEARNING-%' AND content LIKE '%${learningId}%'`,
      ),
    );
}
