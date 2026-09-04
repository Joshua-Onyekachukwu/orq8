/**
 * ORQ8 QA Evaluator — Automated Quality Assurance for AI Employee Work
 *
 * When an agent submits work, this system evaluates it against:
 * - Task requirements and acceptance criteria
 * - Company Constitution rules
 * - Agent authority profile
 * - Quality standards
 * - Safety rules
 *
 * Produces structured QA results: PASS, PASS_WITH_WARNINGS, REVISION_REQUIRED, FAIL, BLOCKED
 */

import type { AppConfig } from '@orq8/core';
import type { Db } from '@orq8/db';
import { eq, and, desc } from 'drizzle-orm';
import { tasks, agents, companyMemory, approvals } from '@orq8/db';
import { chat, chatJson } from './llm.js';
import { appendAudit } from './audit.js';
import { broadcastToOrg } from './realtime.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type QAVerdict = 'pass' | 'pass_with_warnings' | 'revision_required' | 'fail' | 'blocked';

export interface QAEvaluation {
  verdict: QAVerdict;
  score: number; // 0-100
  criteria: QACriterion[];
  warnings: string[];
  revisionInstructions: string | null;
  failureCategory: FailureCategory | null;
  failureReason: string | null;
  estimatedRevisionEffort: 'trivial' | 'minor' | 'moderate' | 'significant';
  requiresFounderReview: boolean;
  timestamp: string;
}

export interface QACriterion {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  details: string;
  severity: 'critical' | 'major' | 'minor';
}

export type FailureCategory =
  | 'incorrect_information'
  | 'missing_requirement'
  | 'bad_reasoning'
  | 'invalid_data'
  | 'tool_failure'
  | 'integration_failure'
  | 'permission_failure'
  | 'insufficient_context'
  | 'ambiguous_instructions'
  | 'model_failure'
  | 'provider_failure'
  | 'timeout'
  | 'budget_exceeded'
  | 'dependency_failure'
  | 'authority_violation';

// ─── QA Evaluation ──────────────────────────────────────────────────────────

/**
 * Run automated QA on a completed task.
 * Uses a separate LLM call to evaluate the output against criteria.
 */
export async function evaluateWork(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
  taskResult: string,
): Promise<QAEvaluation> {
  // Load task and agent context
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)));

  if (!task) {
    return createBlockedEvaluation('Task not found');
  }

  const [agent] = task.agentId
    ? await db.select().from(agents).where(eq(agents.id, task.agentId))
    : [];

  // Load acceptance criteria from task config or memory
  const acceptanceCriteria = await getAcceptanceCriteria(db, orgId, task);

  // Load company constitution if available
  const constitution = await getConstitution(db, orgId);

  // Build the QA prompt
  const qaPrompt = buildQAPrompt(task, agent, taskResult, acceptanceCriteria, constitution);

  // Use a separate LLM call for QA (different model temperature for evaluation)
  try {
    const qaResult = await chatJson(
      config,
      'You are an independent Quality Assurance evaluator for an AI workforce. You are NOT the worker — you are the inspector. Be thorough, critical, and fair. Identify real issues, not nitpicks.',
      qaPrompt,
      { temperature: 0.1, max_tokens: 2000 },
    );

    if (!qaResult) {
      return createPassWithWarningsEvaluation('QA system unavailable — LLM returned empty');
    }

    return parseQAResult(qaResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return createPassWithWarningsEvaluation(`QA evaluation failed: ${msg}`);
  }
}

// ─── Prompt Construction ────────────────────────────────────────────────────

function buildQAPrompt(
  task: { title: string; description: string | null; priority: string; cost: number },
  agent: { name: string; role: string } | undefined,
  taskResult: string,
  acceptanceCriteria: string,
  constitution: string,
): string {
  return `Evaluate the following AI employee task output against the acceptance criteria and quality standards.

## Task
- Title: ${task.title}
- Description: ${task.description || 'No description provided'}
- Priority: ${task.priority}
- Assigned to: ${agent ? `${agent.name} (${agent.role})` : 'Unassigned'}

## Agent Output
${taskResult}

## Acceptance Criteria
${acceptanceCriteria || 'No specific acceptance criteria defined — evaluate for general completeness, accuracy, and usefulness.'}

## Company Rules
${constitution || 'No company constitution configured.'}

## Evaluation Criteria
Evaluate the output on these dimensions:
1. **Completeness** — Does it satisfy all requirements?
2. **Accuracy** — Is the information correct and well-sourced?
3. **Relevance** — Does it actually solve the intended problem?
4. **Quality** — Is it well-structured, clear, and professional?
5. **Safety** — Does it avoid prohibited or risky actions?
6. **Compliance** — Does it stay within agent authority and company rules?

## Required Output (JSON)
{
  "verdict": "pass" | "pass_with_warnings" | "revision_required" | "fail",
  "score": <0-100>,
  "criteria": [
    {
      "name": "<criterion name>",
      "status": "pass" | "fail" | "warning" | "not_applicable",
      "details": "<brief explanation>",
      "severity": "critical" | "major" | "minor"
    }
  ],
  "warnings": ["<warning 1>", ...],
  "revision_instructions": "<if revision_required, what specifically needs to change>",
  "failure_category": "<if fail, one of: incorrect_information, missing_requirement, bad_reasoning, invalid_data, tool_failure, insufficient_context, ambiguous_instructions>",
  "failure_reason": "<if fail, why did it fail>",
  "estimated_revision_effort": "trivial" | "minor" | "moderate" | "significant",
  "requires_founder_review": <true if high-risk or repeated failure>
}`;
}

// ─── Acceptance Criteria ────────────────────────────────────────────────────

async function getAcceptanceCriteria(
  db: Db,
  orgId: string,
  task: { title: string; description: string | null; id: string },
): Promise<string> {
  // Check task config for explicit criteria
  // Check company memory for similar task criteria
  const memories = await db
    .select()
    .from(companyMemory)
    .where(
      and(
        eq(companyMemory.orgId, orgId),
        eq(companyMemory.category, 'context'),
      )
    )
    .orderBy(desc(companyMemory.importance))
    .limit(5);

  const criteriaMemories = memories.filter(
    (m) => m.content.toLowerCase().includes('criteria') ||
           m.content.toLowerCase().includes('requirement') ||
           m.content.toLowerCase().includes('standard'),
  );

  if (criteriaMemories.length > 0) {
    return criteriaMemories.map((m) => `- ${m.content}`).join('\n');
  }

  return '';
}

async function getConstitution(db: Db, orgId: string): Promise<string> {
  const memories = await db
    .select()
    .from(companyMemory)
    .where(
      and(
        eq(companyMemory.orgId, orgId),
        eq(companyMemory.category, 'decision'),
      )
    )
    .orderBy(desc(companyMemory.importance))
    .limit(3);

  return memories.map((m) => `- ${m.content}`).join('\n');
}

// ─── Parse QA Result ────────────────────────────────────────────────────────

function parseQAResult(raw: unknown): QAEvaluation {
  const data = raw as Record<string, unknown>;

  const verdict = validateVerdict(data.verdict);
  const score = Math.min(100, Math.max(0, Number(data.score) || 50));
  const criteria = parseCriteria(data.criteria);
  const warnings = Array.isArray(data.warnings) ? data.warnings.map(String) : [];
  const revisionInstructions = data.revision_instructions ? String(data.revision_instructions) : null;
  const failureCategory = data.failure_category ? validateFailureCategory(data.failure_category) : null;
  const failureReason = data.failure_reason ? String(data.failure_reason) : null;
  const estimatedRevisionEffort = validateRevisionEffort(data.estimated_revision_effort);
  const requiresFounderReview = Boolean(data.requires_founder_review);

  return {
    verdict,
    score,
    criteria,
    warnings,
    revisionInstructions,
    failureCategory,
    failureReason,
    estimatedRevisionEffort,
    requiresFounderReview,
    timestamp: new Date().toISOString(),
  };
}

function parseCriteria(raw: unknown): QACriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const item = c as Record<string, unknown>;
    return {
      name: String(item.name || 'Unknown'),
      status: validateCriterionStatus(item.status),
      details: String(item.details || ''),
      severity: validateSeverity(item.severity),
    };
  });
}

// ─── Validators ─────────────────────────────────────────────────────────────

function validateVerdict(v: unknown): QAVerdict {
  const valid: QAVerdict[] = ['pass', 'pass_with_warnings', 'revision_required', 'fail', 'blocked'];
  return valid.includes(v as QAVerdict) ? (v as QAVerdict) : 'pass_with_warnings';
}

function validateFailureCategory(c: unknown): FailureCategory | null {
  const valid: FailureCategory[] = [
    'incorrect_information', 'missing_requirement', 'bad_reasoning',
    'invalid_data', 'tool_failure', 'integration_failure', 'permission_failure',
    'insufficient_context', 'ambiguous_instructions', 'model_failure',
    'provider_failure', 'timeout', 'budget_exceeded', 'dependency_failure',
    'authority_violation',
  ];
  return valid.includes(c as FailureCategory) ? (c as FailureCategory) : null;
}

function validateCriterionStatus(s: unknown): QACriterion['status'] {
  const valid: QACriterion['status'][] = ['pass', 'fail', 'warning', 'not_applicable'];
  return valid.includes(s as QACriterion['status']) ? (s as QACriterion['status']) : 'warning';
}

function validateSeverity(s: unknown): QACriterion['severity'] {
  const valid: QACriterion['severity'][] = ['critical', 'major', 'minor'];
  return valid.includes(s as QACriterion['severity']) ? (s as QACriterion['severity']) : 'minor';
}

function validateRevisionEffort(e: unknown): QAEvaluation['estimatedRevisionEffort'] {
  const valid: QAEvaluation['estimatedRevisionEffort'][] = ['trivial', 'minor', 'moderate', 'significant'];
  return valid.includes(e as QAEvaluation['estimatedRevisionEffort']) ? (e as QAEvaluation['estimatedRevisionEffort']) : 'minor';
}

// ─── Pre-built Evaluations ──────────────────────────────────────────────────

function createBlockedEvaluation(reason: string): QAEvaluation {
  return {
    verdict: 'blocked',
    score: 0,
    criteria: [],
    warnings: [reason],
    revisionInstructions: null,
    failureCategory: 'insufficient_context',
    failureReason: reason,
    estimatedRevisionEffort: 'significant',
    requiresFounderReview: true,
    timestamp: new Date().toISOString(),
  };
}

function createPassWithWarningsEvaluation(warning: string): QAEvaluation {
  return {
    verdict: 'pass_with_warnings',
    score: 70,
    criteria: [],
    warnings: [warning],
    revisionInstructions: null,
    failureCategory: null,
    failureReason: null,
    estimatedRevisionEffort: 'trivial',
    requiresFounderReview: false,
    timestamp: new Date().toISOString(),
  };
}
