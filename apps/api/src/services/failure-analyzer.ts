/**
 * ORQ8 Failure Analyzer — Root Cause Analysis for AI Task Failures
 *
 * When a task fails or QA rejects work, this system:
 * 1. Categorizes the failure
 * 2. Identifies root cause
 * 3. Determines recovery strategy
 * 4. Generates correction instructions
 * 5. Records the incident for learning
 */

import type { AppConfig } from '@orq8/core';
import type { Db } from '@orq8/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { tasks, agents, companyMemory, activityEvents } from '@orq8/db';
import { chat, chatJson } from './llm.js';
import { broadcastToOrg } from './realtime.js';
import type { FailureCategory, QAEvaluation } from './qa-evaluator.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RootCause =
  | 'agent'       // Poor execution by the agent
  | 'instruction' // Ambiguous or incorrect task instructions
  | 'context'     // Missing company information
  | 'tool'        // Tool malfunction
  | 'model'       // Model limitation or hallucination
  | 'provider'    // API/provider failure
  | 'data'        // Incorrect or incomplete data
  | 'system'      // ORQ8 platform bug
  | 'human';      // Incorrect approval or instruction

export type RecoveryStrategy =
  | 'retry'           // Retry the same task with same/adjusted params
  | 'revise'          // Send back to agent with correction instructions
  | 'reassign'        // Assign to a different agent
  | 'escalate'        // Escalate to founder
  | 'block'           // Block until issue resolved
  | 'skip'            // Skip this task, continue with others
  | 'decompose';      // Break into smaller tasks

export interface FailureAnalysis {
  failureId: string;
  taskId: string;
  agentId: string | null;
  orgId: string;
  failureCategory: FailureCategory;
  rootCause: RootCause;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string[];
  recoveryStrategy: RecoveryStrategy;
  correctionInstructions: string;
  preventionRule: string | null;
  shouldRetry: boolean;
  retryCount: number;
  maxRetries: number;
  creditsLost: number;
  timestamp: string;
}

export interface Incident {
  id: string;
  orgId: string;
  taskId: string;
  agentId: string | null;
  agentName: string;
  department: string | null;
  failureCategory: FailureCategory;
  rootCause: RootCause;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  recoveryAction: string;
  finalResolution: string | null;
  preventiveAction: string | null;
  resolved: boolean;
  createdAt: string;
}

// ─── Failure Analysis ───────────────────────────────────────────────────────

/**
 * Analyze a task failure and determine root cause and recovery strategy.
 */
export async function analyzeFailure(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
  taskResult: string,
  qaEvaluation: QAEvaluation | null,
): Promise<FailureAnalysis> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)));

  const [agent] = task?.agentId
    ? await db.select().from(agents).where(eq(agents.id, task.agentId))
    : [];

  // Get recent failure history for this agent
  const recentFailures = await getAgentFailureHistory(db, orgId, task?.agentId ?? null);

  // Build analysis prompt
  const analysisPrompt = buildAnalysisPrompt(task, agent, taskResult, qaEvaluation, recentFailures);

  try {
    const result = await chatJson(
      config,
      'You are an incident analyst for an AI workforce. Analyze why a task failed and determine the best recovery strategy. Be precise and actionable.',
      analysisPrompt,
      { temperature: 0.1, max_tokens: 1500 },
    );

    if (!result) {
      return createDefaultAnalysis(taskId, task?.agentId ?? null, orgId, qaEvaluation);
    }

    return parseAnalysisResult(result, taskId, task?.agentId ?? null, orgId);
  } catch {
    return createDefaultAnalysis(taskId, task?.agentId ?? null, orgId, qaEvaluation);
  }
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

function buildAnalysisPrompt(
  task: { title: string; description: string | null; priority: string } | undefined,
  agent: { name: string; role: string } | undefined,
  taskResult: string,
  qaEvaluation: QAEvaluation | null,
  recentFailures: Array<{ summary: string; category: string; occurredAt: Date }>,
): string {
  return `Analyze this AI task failure and determine root cause and recovery strategy.

## Task
- Title: ${task?.title || 'Unknown'}
- Description: ${task?.description || 'No description'}
- Priority: ${task?.priority || 'normal'}
- Agent: ${agent ? `${agent.name} (${agent.role})` : 'Unknown'}

## Agent Output (Failed)
${taskResult.slice(0, 2000)}

## QA Evaluation
${qaEvaluation ? JSON.stringify({
  verdict: qaEvaluation.verdict,
  score: qaEvaluation.score,
  warnings: qaEvaluation.warnings,
  failureCategory: qaEvaluation.failureCategory,
  failureReason: qaEvaluation.failureReason,
  revisionInstructions: qaEvaluation.revisionInstructions,
}, null, 2) : 'No QA evaluation available'}

## Recent Failure History for This Agent
${recentFailures.length > 0
  ? recentFailures.map((f) => `- ${f.summary} (${f.category}, ${f.occurredAt})`).join('\n')
  : 'No recent failures'
}

## Analysis Required
Determine:
1. Root cause category
2. Severity level
3. Best recovery strategy
4. Correction instructions
5. Prevention rule for future similar tasks

## Required Output (JSON)
{
  "root_cause": "agent" | "instruction" | "context" | "tool" | "model" | "provider" | "data" | "system" | "human",
  "severity": "low" | "medium" | "high" | "critical",
  "description": "<clear description of what went wrong>",
  "evidence": ["<evidence 1>", ...],
  "recovery_strategy": "retry" | "revise" | "reassign" | "escalate" | "block" | "skip" | "decompose",
  "correction_instructions": "<specific instructions for fixing the issue>",
  "prevention_rule": "<rule to prevent this in the future, or null>",
  "should_retry": <true/false>,
  "credits_lost": <estimated credits wasted>
}`;
}

// ─── Parse Result ───────────────────────────────────────────────────────────

function parseAnalysisResult(
  raw: unknown,
  taskId: string,
  agentId: string | null,
  orgId: string,
): FailureAnalysis {
  const data = raw as Record<string, unknown>;

  return {
    failureId: crypto.randomUUID(),
    taskId,
    agentId,
    orgId,
    failureCategory: validateFailureCat(data.root_cause),
    rootCause: validateRootCause(data.root_cause),
    severity: validateSeverity(data.severity),
    description: String(data.description || 'Failure analyzed'),
    evidence: Array.isArray(data.evidence) ? data.evidence.map(String) : [],
    recoveryStrategy: validateRecoveryStrategy(data.recovery_strategy),
    correctionInstructions: String(data.correction_instructions || ''),
    preventionRule: data.prevention_rule ? String(data.prevention_rule) : null,
    shouldRetry: Boolean(data.should_retry),
    retryCount: 0,
    maxRetries: 3,
    creditsLost: Number(data.credits_lost) || 0,
    timestamp: new Date().toISOString(),
  };
}

// ─── Failure History ────────────────────────────────────────────────────────

async function getAgentFailureHistory(
  db: Db,
  orgId: string,
  agentId: string | null,
): Promise<Array<{ summary: string; category: string; occurredAt: Date }>> {
  if (!agentId) return [];

  const events = await db
    .select()
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.orgId, orgId),
        eq(activityEvents.agentId, agentId),
      )
    )
    .orderBy(desc(activityEvents.occurredAt))
    .limit(20);

  return events
    .filter((e) => e.type.includes('failed') || e.type.includes('error'))
    .map((e) => ({
      summary: e.summary,
      category: e.type,
      occurredAt: e.occurredAt,
    }));
}

// ─── Incident Creation ──────────────────────────────────────────────────────

/**
 * Create an incident record for a serious failure.
 */
export async function createIncident(
  db: Db,
  orgId: string,
  taskId: string,
  agentId: string | null,
  agentName: string,
  department: string | null,
  analysis: FailureAnalysis,
): Promise<void> {
  // Store incident as high-importance memory
  await db.insert(companyMemory).values({
    orgId,
    category: 'decision',
    content: `INCIDENT: ${analysis.description}. Root cause: ${analysis.rootCause}. Recovery: ${analysis.recoveryStrategy}. Prevention: ${analysis.preventionRule || 'None defined'}`,
    source: 'incident-tracker',
    agentId,
    taskId,
    importance: analysis.severity === 'critical' ? 10 : analysis.severity === 'high' ? 8 : 6,
  });

  // Broadcast incident to org
  broadcastToOrg(orgId, {
    type: 'task.qa_failed',
    taskId,
    summary: `Incident: ${analysis.description} (agent: ${agentName}, severity: ${analysis.severity})`,
  });
}

// ─── Validators ─────────────────────────────────────────────────────────────

function validateRootCause(v: unknown): RootCause {
  const valid: RootCause[] = ['agent', 'instruction', 'context', 'tool', 'model', 'provider', 'data', 'system', 'human'];
  return valid.includes(v as RootCause) ? (v as RootCause) : 'agent';
}

function validateFailureCat(v: unknown): FailureCategory {
  // Map root cause to failure category
  const map: Record<string, FailureCategory> = {
    agent: 'bad_reasoning',
    instruction: 'ambiguous_instructions',
    context: 'insufficient_context',
    tool: 'tool_failure',
    model: 'model_failure',
    provider: 'provider_failure',
    data: 'invalid_data',
    system: 'tool_failure',
    human: 'ambiguous_instructions',
  };
  return map[String(v)] || 'bad_reasoning';
}

function validateSeverity(v: unknown): FailureAnalysis['severity'] {
  const valid: FailureAnalysis['severity'][] = ['low', 'medium', 'high', 'critical'];
  return valid.includes(v as FailureAnalysis['severity']) ? (v as FailureAnalysis['severity']) : 'medium';
}

function validateRecoveryStrategy(v: unknown): RecoveryStrategy {
  const valid: RecoveryStrategy[] = ['retry', 'revise', 'reassign', 'escalate', 'block', 'skip', 'decompose'];
  return valid.includes(v as RecoveryStrategy) ? (v as RecoveryStrategy) : 'retry';
}

function createDefaultAnalysis(
  taskId: string,
  agentId: string | null,
  orgId: string,
  qaEvaluation: QAEvaluation | null,
): FailureAnalysis {
  return {
    failureId: crypto.randomUUID(),
    taskId,
    agentId,
    orgId,
    failureCategory: qaEvaluation?.failureCategory || 'bad_reasoning',
    rootCause: 'agent',
    severity: 'medium',
    description: qaEvaluation?.failureReason || 'Task failed — analysis unavailable',
    evidence: [],
    recoveryStrategy: 'retry',
    correctionInstructions: qaEvaluation?.revisionInstructions || 'Retry the task with clearer instructions',
    preventionRule: null,
    shouldRetry: true,
    retryCount: 0,
    maxRetries: 3,
    creditsLost: 0,
    timestamp: new Date().toISOString(),
  };
}
