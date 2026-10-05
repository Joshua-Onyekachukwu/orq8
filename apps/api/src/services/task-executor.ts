import { eq, and } from 'drizzle-orm';
import { ROLE_PROMPT_FALLBACK } from './agent-personas.js';
import { agents, approvals, tasks, activityEvents, companyMemory, type Db } from '@orq8/db';
import { chat } from './llm.js';
import {
  buildToolSection,
  describeToolCall,
  formatToolResultForPrompt,
  parseToolRequest,
  MAX_TASK_TOOL_ROUNDS,
} from './task-tools.js';
import {
  executeTool,
  type AgentAuthority,
  type ToolExecutionContext,
} from './tool-registry.js';
import { appendAudit } from './audit.js';
import { enforceAutonomy, normalizeAutonomyLevel } from './autonomy.js';
import {
  consumeCredits,
  reserveCredits,
  settleReservation,
  releaseReservation,
  getOrCreateBalance,
  CreditExhaustedError,
  BudgetExceededError,
  BudgetApprovalRequiredError,
  type CreditReservationInfo,
} from './credits.js';
import { estimateCredits } from './credit-estimator.js';
import { taskProviderCost } from './llm-pricing.js';
import { broadcastToOrg } from './realtime.js';
import { notifyAttentionChanged } from './attention.js';
import { findGrantedGate, findOpenGate, markGateReleased } from './approvals.js';
import { classifyTask } from './model-intelligence.js';
import { selectMeasuredModel } from './model-selector.js';
import { getCalibrationAdvice } from './calibration-routing.js';
import type { AppConfig } from '@orq8/core';

/**
 * Task Executor — runs individual tasks through the LLM.
 *
 * Lifecycle: pending → in_progress → completed | failed
 *
 * One branch sits outside that line: when the agent's autonomy level says the
 * work needs a founder's decision, the task goes to `awaiting_approval` and
 * stops. It is not `pending` (the batch runner selects that, and work waiting on
 * a human must not be silently re-run) and it is not `failed` (nothing broke).
 * Approving the gate resumes it here; rejecting cancels it with the reason.
 *
 * Each task is executed by calling the LLM with:
 * - The task description
 * - The agent's role and capabilities
 * - Organization context (goals, memory)
 *
 * The result is stored in the task record and activity events.
 *
 * Design: docs/22 Model Routing, docs/34 Work Domain
 */

export interface TaskExecutionResult {
  taskId: string;
  status: 'completed' | 'failed' | 'deferred' | 'awaiting_approval';
  result: string;
  cost: number;
  tokensUsed: number;
  // True when the result came from a real LLM call; false when structured fallback was used
  llmUsed: boolean;
  // True when the task was deferred (budget exhausted) — honest pending work,
  // NOT a failure. The EA aggregation must count it separately from failed.
  deferred?: boolean;
  // Set when the task stopped on a founder decision: the approval now gating it.
  approvalId?: string;
}

// ─── Agent System Prompts ───────────────────────────────────────────────────

// Role-level prompts now live in the persona registry (agent-personas.ts),
// shared with the hire-time defaults so both paths speak in the same voice.
const AGENT_PROMPTS: Record<string, string> = ROLE_PROMPT_FALLBACK;

const DEFAULT_AGENT_PROMPT = `You are an AI employee of ORQ8. Complete the assigned task to the best of your ability. Be thorough, accurate, and provide clear, actionable output.`;

// ─── Task Execution ─────────────────────────────────────────────────────────

/**
 * Execute a single task through the LLM.
 *
 * This is the core execution function that:
 * 1. Loads the task and assigned agent from the database
 * 2. Builds a prompt with task context + agent role
 * 3. Calls the LLM
 * 4. Updates task status to completed/failed
 * 5. Records activity events
 * 6. Updates agent stats
 * 7. Stores result in company memory
 */
/**
 * §16/§17 — pre-execution governance blocks (paused/archived agent, authority
 * denial, autonomy level) previously returned a failed result WITHOUT touching
 * the task row: the API said "failed" while the founder's task list showed
 * "pending" forever. Persist the block so the org record is honest, record an
 * activity event, broadcast to realtime clients, and charge nothing (no work
 * was done).
 */
async function persistPreExecutionBlock(
  db: Db,
  orgId: string,
  task: { id: string; agentId: string | null; title: string },
  reason: string,
  agentName: string,
  governanceReason = 'Pre-execution governance check (agent state, authority, or autonomy level)',
): Promise<TaskExecutionResult> {
  await db
    .update(tasks)
    .set({ status: 'failed', result: reason.slice(0, 2000), cost: 0, updatedAt: new Date() })
    .where(eq(tasks.id, task.id));

  // The employee's failure counter belongs to the same contract as the task row.
  // The ordinary failure path increments it (step 7 below); a governance block
  // is still a failure the founder sees, and skipping the counter made a blocked
  // employee read "Tasks failed 0" beside a failed task — a number the founder
  // has no way to reconcile, on the screens that judge an employee's reliability.
  if (task.agentId) {
    const [blocked] = await db
      .select({ tasksFailed: agents.tasksFailed })
      .from(agents)
      .where(and(eq(agents.id, task.agentId), eq(agents.orgId, orgId)))
      .limit(1);

    await db
      .update(agents)
      .set({
        tasksFailed: (blocked?.tasksFailed ?? 0) + 1,
        currentTask: null,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(agents.id, task.agentId), eq(agents.orgId, orgId)));
  }

  await db.insert(activityEvents).values({
    orgId,
    agentId: task.agentId,
    taskId: task.id,
    type: 'failed',
    // Same vocabulary as the ordinary failure path below (`Failed: <title>` +
    // why in `reason`). The old summary was `Execution blocked: ${reason}` and
    // the reason itself already began "Execution blocked by autonomy level: …",
    // so the founder's activity feed stuttered the phrase twice in one row.
    summary: `Failed: ${task.title}`,
    reason: reason.trim() || governanceReason,
    cost: 0,
    department: null,
  });

  broadcastToOrg(orgId, {
    type: 'task.failed',
    taskId: task.id,
    agentId: task.agentId ?? '',
    agentName,
    error: reason.slice(0, 200),
  });
  notifyAttentionChanged(orgId, 'task.failed');

  return { taskId: task.id, status: 'failed', result: reason, cost: 0, tokensUsed: 0, llmUsed: false };
}

/**
 * Stop the task on a founder decision instead of guessing on their behalf.
 *
 * Gap A (docs/66 §66.14): the approval now carries the task it gates, so the
 * decision has something to act on. Re-entering an already-gated task reuses the
 * open approval rather than queueing a second one — the founder answers one
 * question about one piece of work, once.
 */
/**
 * Stop a task on a tool the founder has to authorise (docs/66 §66.19).
 *
 * The approval already exists: the tool registry raised it, naming the task, the
 * tool and the exact arguments. So this only stops the work — creating a second
 * request here would either violate the one-open-decision-per-task index or ask
 * the founder the same question twice.
 */
async function stopForToolApproval(
  db: Db,
  orgId: string,
  task: { id: string; agentId: string | null; title: string },
  agentName: string,
  toolId: string,
  approvalId: string | undefined,
  reason: string,
): Promise<TaskExecutionResult> {
  const text = `Awaiting founder approval: ${agentName} asked to use the "${toolId}" tool for "${task.title}". ${reason}`;

  await db
    .update(tasks)
    .set({ status: 'awaiting_approval', result: text.slice(0, 2000), updatedAt: new Date() })
    .where(eq(tasks.id, task.id));

  await db.insert(activityEvents).values({
    orgId,
    agentId: task.agentId,
    taskId: task.id,
    type: 'analyzed',
    summary: text,
    reason,
    cost: 0,
    department: null,
  });

  broadcastToOrg(orgId, { type: 'task.cancelled', taskId: task.id, reason });
  notifyAttentionChanged(orgId, 'approval.created');

  return {
    taskId: task.id,
    status: 'awaiting_approval',
    result: text,
    cost: 0,
    tokensUsed: 0,
    llmUsed: false,
    approvalId,
  };
}

async function gateTaskOnApproval(
  db: Db,
  orgId: string,
  task: { id: string; agentId: string | null; title: string },
  agentName: string,
  reason: string,
): Promise<TaskExecutionResult> {
  const text = `Awaiting founder approval: ${reason}`;

  let gate = await findOpenGate(db, orgId, task.id);
  if (!gate) {
    [gate] = await db
      .insert(approvals)
      .values({
        orgId,
        agentId: task.agentId,
        taskId: task.id,
        action: `Execute task: ${task.title}`.slice(0, 500),
        description: `Agent "${agentName}" is ready to work on "${task.title}" and needs your decision first. ${reason}`,
        riskLevel: 'medium',
        status: 'pending',
      })
      .returning();

    broadcastToOrg(orgId, {
      type: 'approval.required',
      approvalId: gate?.id ?? '',
      agentName,
      toolName: null,
      riskLevel: 'medium',
    });
    notifyAttentionChanged(orgId, 'approval.created');
  }

  await db
    .update(tasks)
    .set({ status: 'awaiting_approval', result: text.slice(0, 2000), updatedAt: new Date() })
    .where(eq(tasks.id, task.id));

  await db.insert(activityEvents).values({
    orgId,
    agentId: task.agentId,
    taskId: task.id,
    type: 'analyzed',
    summary: text,
    reason,
    cost: 0,
    department: null,
  });

  return {
    taskId: task.id,
    status: 'awaiting_approval',
    result: text,
    cost: 0,
    tokensUsed: 0,
    llmUsed: false,
    approvalId: gate?.id,
  };
}

/**
 * Retry a task the system stopped: a failure the founder wants to re-run.
 *
 * Deliberately narrow. Work stopped by a *human* decision is not retryable
 * here — a rejected task is cancelled, and re-running it would quietly undo the
 * founder's answer; work awaiting a decision is not retryable either, because
 * re-running it would re-raise the same question. Only `failed` moves.
 */
export async function retryTask(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
): Promise<{ result: TaskExecutionResult } | { refused: string; status: string }> {
  const [task] = await db
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)))
    .limit(1);

  if (!task) return { refused: 'Task not found', status: 'missing' };
  if (task.status === 'awaiting_approval') {
    return { refused: 'This task is waiting on your decision — approve or reject it instead.', status: task.status };
  }
  if (task.status !== 'failed') {
    return { refused: `Only a failed task can be retried (this one is ${task.status}).`, status: task.status };
  }

  await db
    .update(tasks)
    .set({ status: 'pending', result: null, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  return { result: await executeTask(config, db, orgId, taskId) };
}

export async function executeTask(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
): Promise<TaskExecutionResult> {
  // 1. Load the task
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)))
    .limit(1);

  if (!task) {
    return { taskId, status: 'failed', result: 'Task not found', cost: 0, tokensUsed: 0, llmUsed: false };
  }

  // A task a founder rejected is cancelled, and honouring that has to live at
  // the deepest boundary: a manual execute call, the batch runner and the
  // Executive Agent can all reach this function, and none of them should be able
  // to quietly re-run work a person stopped.
  if (task.status === 'cancelled') {
    return {
      taskId,
      status: 'failed',
      result: 'This task was cancelled by a founder decision and will not run. Create a new task instead.',
      cost: 0,
      tokensUsed: 0,
      llmUsed: false,
    };
  }

  // 2. Load the assignee once — every governance check below reads this row,
  //    never a client-supplied copy of it.
  let assignee:
    | { status: string; authority: unknown; autonomyLevel: string; name: string }
    | undefined;
  if (task.agentId) {
    const [row] = await db
      .select({ status: agents.status, authority: agents.authority, autonomyLevel: agents.autonomyLevel, name: agents.name })
      .from(agents)
      .where(eq(agents.id, task.agentId))
      .limit(1);
    assignee = row;
  }

  // 2a. Enforce pause: if the assigned agent is paused or archived, reject execution
  if (assignee && (assignee.status === 'paused' || assignee.status === 'archived')) {
    const verb = assignee.status === 'archived' ? 'archived' : 'paused';
    return persistPreExecutionBlock(
      db, orgId, task,
      `Execution blocked: agent is ${verb}. Archived employees no longer receive work.`,
      assignee.name,
    );
  }

  // 2b. Enforce authority: check agent's authority profile
  if (assignee?.authority && typeof assignee.authority === 'object') {
    const auth = assignee.authority as Record<string, unknown>;
    if (auth.canExecuteTasks === false) {
      return persistPreExecutionBlock(
        db, orgId, task,
        'Execution blocked: agent does not have permission to execute tasks.',
        assignee.name,
      );
    }
  }

  // 2c. Enforce autonomy level (F12) — server-side, read from the DB row.
  if (assignee) {
    const level = normalizeAutonomyLevel(assignee.autonomyLevel);
    const decision = enforceAutonomy(level, 'task_execute');
    if (!decision.allowed) {
      return persistPreExecutionBlock(
        db, orgId, task,
        `Execution blocked by autonomy level: ${decision.reason}`,
        assignee.name,
      );
    }
    // `requiresApproval` used to be computed here and then dropped on the floor:
    // the levels whose whole meaning is "this needs the founder" executed anyway.
    // Either the founder has already said yes (a grant the work now consumes) or
    // the task stops and asks.
    if (decision.requiresApproval) {
      const grant = await findGrantedGate(db, orgId, taskId);
      if (grant) {
        await markGateReleased(db, grant.id);
        await appendAudit(db, {
          orgId,
          actorType: 'agent',
          actorId: task.agentId ?? orgId,
          action: 'approval.grant_consumed',
          outcome: 'success',
          resultRef: `task:${taskId} → approval:${grant.id}`,
        });
      } else {
        return gateTaskOnApproval(db, orgId, task, assignee.name, decision.reason);
      }
    }
  }

  // 2d. Enforce credits: no free work. An exhausted balance pauses every AI
  //     employee action. docs/80 Phase 1: this takes a *reservation* for the
  //     estimated cost of the task rather than only checking the balance — the
  //     hold is what keeps concurrent work from over-committing the same
  //     credits. Settlement charges the measured actual, capped at the estimate;
  //     anything left, or a failed task, releases back to available.
  let taskReservation: CreditReservationInfo | null = null;
  const estimate = await estimateCredits(db, config, {
    orgId,
    operationClass: 'task.execute',
    agentId: task.agentId ?? undefined,
  });

  // docs/80 Phase 2: the estimator's own ceiling and the constitution's approval
  // threshold both stop the work for a founder's decision. A grant already given
  // for this task is consumed once and the work proceeds; otherwise the task goes
  // to `awaiting_approval` and nothing runs.
  if (estimate.approvalRequired) {
    const grant = await findGrantedGate(db, orgId, taskId);
    if (grant) {
      await markGateReleased(db, grant.id);
      await appendAudit(db, {
        orgId,
        actorType: 'agent',
        actorId: task.agentId ?? orgId,
        action: 'approval.grant_consumed',
        outcome: 'success',
        resultRef: `task:${taskId} → approval:${grant.id}`,
      });
    } else {
      return gateTaskOnApproval(
        db, orgId, task,
        assignee?.name ?? 'Unassigned',
        `The estimated cost (${estimate.estimate} credits) is above the task ceiling (${estimate.ceiling} credits). Approve it to run.`,
      );
    }
  }

  try {
    taskReservation = await reserveCredits(db, orgId, {
      estimate: estimate.estimate,
      taskId,
      agentId: task.agentId ?? undefined,
      ttlMs: config.CREDIT_RESERVATION_TTL_MS,
      dailyCap: config.CREDIT_TRIAL_DAILY_CAP,
      reason: 'task.execute',
    });
  } catch (err) {
    if (err instanceof BudgetApprovalRequiredError) {
      // Over the org's approval threshold. A waiting grant is the founder saying
      // yes: consume it once, then take the hold with `approved` set.
      const grant = await findGrantedGate(db, orgId, taskId);
      if (!grant) {
        return gateTaskOnApproval(db, orgId, task, assignee?.name ?? 'Unassigned', err.detail);
      }
      await markGateReleased(db, grant.id);
      await appendAudit(db, {
        orgId,
        actorType: 'agent',
        actorId: task.agentId ?? orgId,
        action: 'approval.grant_consumed',
        outcome: 'success',
        resultRef: `task:${taskId} → approval:${grant.id}`,
      });
      taskReservation = await reserveCredits(db, orgId, {
        estimate: estimate.estimate,
        taskId,
        agentId: task.agentId ?? undefined,
        ttlMs: config.CREDIT_RESERVATION_TTL_MS,
        dailyCap: config.CREDIT_TRIAL_DAILY_CAP,
        reason: 'task.execute',
        approved: true,
      });
    } else if (err instanceof BudgetExceededError) {
      return persistPreExecutionBlock(
        db, orgId, task,
        `Execution blocked by budget: ${err.detail}`,
        assignee?.name ?? 'Unassigned',
        'Pre-execution budget check (docs/80 Phase 2)',
      );
    } else if (err instanceof CreditExhaustedError) {
      return persistPreExecutionBlock(
        db, orgId, task,
        `Execution blocked: Work Credits exhausted (${err.remaining} available, ${err.required} required). Top up or change plan to resume work.`,
        assignee?.name ?? 'Unassigned',
        'Pre-execution credit check',
      );
    } else {
      throw err;
    }
  }
  // Record the estimate on the task row so it can show estimate vs actual.
  await db
    .update(tasks)
    .set({ estimatedCredits: taskReservation.estimateCredits, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  // 3. Mark as in_progress
  await db
    .update(tasks)
    .set({ status: 'in_progress', updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  // Update agent's current task
  if (task.agentId) {
    await db
      .update(agents)
      .set({ currentTask: task.title, updatedAt: new Date() })
      .where(eq(agents.id, task.agentId));
  }

  // Record activity: task started
  await db.insert(activityEvents).values({
    orgId,
    agentId: task.agentId,
    taskId: task.id,
    type: 'executing',
    summary: `Executing: ${task.title}`,
    reason: `Task assigned by Executive Agent`,
    cost: 0,
    department: null,
  });

  // 3. Load the agent (if assigned)
  let agentRole = 'executive_agent';
  let agentName = 'Executive Agent';
  // Persona (docs/71 §F): an agent may carry its own system prompt in
  // config.systemPrompt — seeded with the org, editable per employee. When
  // present it replaces the generic role prompt, so Nova is prompted as Nova,
  // not as "a Market Researcher".
  let agentPersona: string | undefined;
  if (task.agentId) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, task.agentId))
      .limit(1);
    if (agent) {
      agentRole = agent.role;
      agentName = agent.name;
      const cfg = agent.config as { systemPrompt?: unknown } | null;
      if (cfg && typeof cfg.systemPrompt === 'string' && cfg.systemPrompt.trim()) {
        agentPersona = cfg.systemPrompt.trim();
      }
    }
  }

  // Broadcast: task started
  broadcastToOrg(orgId, { type: 'task.started', taskId: task.id, agentId: task.agentId ?? '', agentName });

  // 4. Build the prompt with rich context from the context pipeline
  const { buildAgentContext, buildContextPrompt } = await import('./agent-context.js');
  // Semantic memory retrieval: the task itself is the query, so relevant
  // company memory is surfaced in the agent context (org-scoped, bounded,
  // embedding provider optional — graceful keyword fallback inside).
  const agentContext = task.agentId
    ? await buildAgentContext(db, orgId, task.agentId, task.id, {
        query: `${task.title} ${task.description ?? ''}`.slice(0, 500),
        config,
      })
    : null;

  const basePrompt = agentPersona ?? AGENT_PROMPTS[agentRole] ?? DEFAULT_AGENT_PROMPT;
  const contextSection = agentContext ? buildContextPrompt(agentContext, agentName, agentRole) : '';
  const systemPrompt = contextSection
    ? `${basePrompt}\n\n${contextSection}`
    : basePrompt;
  const taskPrompt = buildTaskPrompt(task.title, task.description ?? task.title, agentName, agentRole);

  // Tool path (MVP-030): the agent is offered exactly the tools its role may
  // use. Nothing here grants anything — the registry decides what actually runs.
  const toolSection = buildToolSection(agentRole);
  const systemPromptWithTools = toolSection ? `${systemPrompt}\n\n${toolSection}` : systemPrompt;
  const toolCalls: string[] = [];
  let toolCredits = 0;

  // One follow-up model call after a tool result. Single-shot on purpose: the
  // tool phase is bounded, and a retry loop inside it would multiply tool calls.
  // Routing and tracing are the same as the main call, so the record stays true.
  const askFollowUp = async (extra: string): Promise<string | null> => {
    try {
      const routing = classifyTask({
        title: task.title,
        description: task.description,
        agentRole,
        priority: task.priority ?? null,
      });
      const advice = await getCalibrationAdvice(db, orgId);
      const { modelId: routedModel, source: routingSource, reason: routingReason } = await selectMeasuredModel(db, orgId, routing, advice);
      return await chat(config, systemPromptWithTools, `${taskPrompt}\n\n${extra}`, {
        model: routedModel,
        temperature: 0.7,
        max_tokens: 2048,
        retries: 0,
        _trace: {
          orgId,
          phase: 'task_execution',
          taskId: task.id,
          agentId: task.agentId ?? undefined,
          db,
          routingSource,
          routingReason,
        },
      });
    } catch (err) {
      lastLlmError = err instanceof Error ? err.message : String(err);
      return null;
    }
  };

  // 5. Call the LLM (with retry and tracing)
  const startTime = Date.now();
  let result = generateFallbackResult(task.title, task.description ?? task.title, agentName);
  let tokensUsed = 0;
  let llmAttempted = false;

  // Trace + persistence happen inside chat() via _trace (records the actually
  // served model and real provider usage). Failure attribution for the
  // structured-fallback path is recorded in the task result and activity.
  let lastLlmError: string | undefined;

  // Try up to 2 times for the LLM call
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff on retry
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      // Model routing (§31): classify the work, then use the cheapest model
      // tier that is SUFFICIENT (risk floors apply — critical work never
      // routes to a cheap tier). §7 feedback: the final pick also consults
      // this org's measured llm_performance history, so a model that is
      // failing on real traffic gets routed away from and a proven one gets
      // preferred — without ever inventing performance for unmeasured models.
      const routing = classifyTask({
        title: task.title,
        description: task.description,
        agentRole,
        priority: task.priority ?? null,
      });
      const calibrationAdvice = await getCalibrationAdvice(db, orgId);
      const { modelId: routedModel, source: routingSource, reason: routingReason } = await selectMeasuredModel(db, orgId, routing, calibrationAdvice);

      const llmResponse = await chat(config, systemPromptWithTools, taskPrompt, {
        model: routedModel,
        temperature: 0.7,
        max_tokens: 2048,
        retries: 0, // We handle retries at this level
        // Trace + persist inside chat() so the row records the ACTUALLY
        // served model (incl. 404 fallback substitutions) and real provider
        // usage — the previous manual trace always wrote model 'unknown'
        // with estimated tokens, corrupting model stats and routing data.
        _trace: {
          orgId,
          phase: 'task_execution',
          taskId: task.id,
          agentId: task.agentId ?? undefined,
          db,
          routingSource,
          routingReason,
        },
      });

      if (llmResponse) {
        result = llmResponse;
        llmAttempted = true;
        tokensUsed = Math.ceil((systemPrompt.length + taskPrompt.length + llmResponse.length) / 4);
        break;
      }
    } catch (err) {
      // Record the real reason — a swallowed error here is exactly how an
      // "executive_agent failed (no error)" appears in production with no
      // diagnosable cause. Continue to next attempt or fallback.
      lastLlmError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!llmAttempted) {
    result = generateFallbackResult(task.title, task.description ?? task.title, agentName);

    // Notify: agent encountered an error (LLM unavailable)
    try {
      const { shouldNotify, getNotificationPrefs } = await import('./notification-preferences.js');
      const { createNotification } = await import('../routes/notifications.js');
      const prefs = await getNotificationPrefs(db, orgId);
      if (shouldNotify(prefs, 'inApp', 'agent')) {
        createNotification(
          db,
          orgId,
          'agent',
          'Agent Error',
          `${agentName} could not reach the LLM after 2 attempts for task "${task.title}". Using fallback execution.`,
        );
      }
    } catch { /* notification failure is non-fatal */ }
  }

  // 5b. Tool phase (MVP-030). The model asked for a tool; the registry — the
  //     same function that gates every other caller — checks authority, raises
  //  the founder's approval when the tool needs one, enforces the idempotency
  //  key, charges the credits and audits the outcome.
  if (llmAttempted && assignee && task.agentId) {
    const authority = assignee.authority as AgentAuthority | null;
    if (authority && typeof authority === 'object') {
      const toolCtx: ToolExecutionContext = {
        orgId,
        // An autonomous run has no human actor. The registry charges and audits
        // by agent and organization; this field is carried for callers that do.
        userId: task.agentId,
        agentId: task.agentId,
        agentRole,
        agentName,
        taskId: task.id,
        goalId: task.goalId ?? undefined,
        authority,
      };

      let pending = parseToolRequest(result);
      let rounds = 0;

      while (pending && rounds < MAX_TASK_TOOL_ROUNDS) {
        rounds += 1;
        const execution = await executeTool(config, db, pending.toolId, toolCtx, pending.params);
        toolCalls.push(describeToolCall(pending.toolId, execution));

        // The registry has already raised the approval, naming this task, this
        // tool and these arguments. Stop the work; do not charge for it.
        if (execution.approvalRequired) {
          return stopForToolApproval(
            db,
            orgId,
            task,
            agentName,
            pending.toolId,
            execution.approvalId,
            `Approving releases this task; rejecting stops it and keeps your reason.`,
          );
        }

        toolCredits += execution.creditsConsumed;
        const answer = await askFollowUp(formatToolResultForPrompt(pending.toolId, execution));
        if (!answer) break;
        result = answer;
        tokensUsed += Math.ceil((systemPromptWithTools.length + answer.length) / 4);
        pending = parseToolRequest(answer);
      }
    }
  }

  // The record says what the work actually did, not only what the model said.
  const resultWithTools =
    toolCalls.length > 0
      ? `${result}\n\nTools used: ${toolCalls.join('; ')}`.slice(0, 2000)
      : result;

  const durationMs = Date.now() - startTime;
  const taskSucceeded = llmAttempted || result !== generateFallbackResult(task.title, task.description ?? task.title, agentName);
  // Credits measure WORK DONE. A task that never reached an LLM consumed no
  // model capacity — charging 1 credit for a hard infrastructure failure made
  // the founder pay for our outage. Fallback-executed tasks still cost 1
  // (structured output was produced); zero-cost only applies when no output
  // beyond the placeholder was generated.
  // What this task owes the model (charged below), and what the task record
  // should say the work consumed. They differ on purpose: the registry already
  // charged `tool.<id>` as each tool ran, so charging it again here would be
  // double billing — but the task row should still report the whole cost.
  const modelCost = taskSucceeded ? Math.max(1, Math.ceil(tokensUsed / 1000)) : 0; // 1 credit per 1K tokens
  const cost = modelCost + toolCredits;

  // 6. Mark task as completed or failed
  await db
    .update(tasks)
    .set({
      status: taskSucceeded ? 'completed' : 'failed',
      cost,
      result: resultWithTools,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  // Broadcast: task completed or failed
  if (taskSucceeded) {
    broadcastToOrg(orgId, { type: 'task.completed', taskId: task.id, agentId: task.agentId ?? '', agentName, result: result.slice(0, 200) });
  } else {
    broadcastToOrg(orgId, { type: 'task.failed', taskId: task.id, agentId: task.agentId ?? '', agentName, error: (lastLlmError ?? result).slice(0, 200) });
    notifyAttentionChanged(orgId, 'task.failed');
  }

  // 6b. Charge Work Credits for the work that actually ran. The amount is the
  //     cost this execution measured, so the task row, the credit transaction,
  //     the activity event, the audit row and the SSE event all carry the same
  //     number. A billing failure is recorded, never swallowed: the work is
  //     already done, so the honest outcome is visible unbilled spend.
  if (taskReservation) {
    try {
      // Attribution (docs/77 P1 §5): the ledger row records what the spend
      // actually was — the provider/model that carried it, the provider's own
      // token counts, and the real USD cost summed from this task's calls.
      //
      // Settlement (docs/80 Phase 1): the hold taken before execution settles
      // the measured actual, capped at the estimate; the remainder releases. A
      // failed task measured no model work, so its whole hold is released
      // (§3.8 — no charge for work that did not happen). No idempotency key is
      // set on purpose: a task can legitimately execute twice (approval resume,
      // a retry after failure) and both are honest charges.
      const attribution = await taskProviderCost(db, taskId);
      const chargeAttribution = {
        provider: attribution.provider ?? undefined,
        model: attribution.model ?? undefined,
        inputTokens: attribution.inputTokens,
        outputTokens: attribution.outputTokens,
        providerCostUsd: attribution.providerCostUsd,
        agentId: task.agentId ?? undefined,
        taskId,
        metadata: {
          llmCalls: attribution.calls,
          pricingSources: attribution.pricingSources,
          tokensUsed,
        },
      };

      if (modelCost > 0) {
        const outcome = await settleReservation(db, taskReservation.id, {
          actualCredits: modelCost,
          description: `Task: ${task.title}`.slice(0, 200),
          referenceId: task.id,
          referenceType: 'task',
          attribution: chargeAttribution,
        });
        // The hold had already been swept or released (e.g. the expiry sweep
        // ran mid-task): charge the measured actual directly so real work is
        // never left unbilled. A hold already *settled* is a replay — no charge.
        if (outcome.duplicate && (outcome.status === 'released' || outcome.status === 'expired')) {
          await consumeCredits(
            db,
            orgId,
            'task.executed',
            `Task: ${task.title}`.slice(0, 200),
            task.id,
            'task',
            { amount: modelCost, attribution: chargeAttribution },
          );
        }
        const post = await getOrCreateBalance(db, orgId);
        broadcastToOrg(orgId, {
          type: 'credits.consumed',
          amount: modelCost,
          remaining: post.remaining,
          operationType: 'task.executed',
        });
      } else {
        // No model work to charge: release the whole hold.
        await releaseReservation(
          db,
          taskReservation.id,
          taskSucceeded ? 'no_measured_model_cost' : 'task_failed_before_charge',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown credit error';
      await appendAudit(db, {
        orgId,
        actorType: 'system',
        actorId: task.agentId,
        agentId: task.agentId,
        taskId: task.id,
        action: 'credits.unbilled', // model cost only: tool credits were already charged
        cost,
        outcome: 'failure',
        resultRef: `task:${task.id} ${message}`.slice(0, 500),
      }).catch(() => undefined);
    }
  }

  // 7. Update agent stats — including the agent's own credit rollup. The org
  //    ledger (6b) carries the spend, but the agent row was never told, so a
  //    founder reading an employee's creditsUsed saw 0 while the company
  //    balance moved. Same measured `cost` the task row and ledger carry:
  //    model credits + tool credits, zero when no work was consumed.
  if (task.agentId) {
    const [agent] = await db
      .select({
        tasksCompleted: agents.tasksCompleted,
        tasksFailed: agents.tasksFailed,
        creditsUsed: agents.creditsUsed,
      })
      .from(agents)
      .where(eq(agents.id, task.agentId))
      .limit(1);

    if (taskSucceeded) {
      await db
        .update(agents)
        .set({
          tasksCompleted: (agent?.tasksCompleted ?? 0) + 1,
          creditsUsed: (agent?.creditsUsed ?? 0) + cost,
          currentTask: null,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agents.id, task.agentId));
    } else {
      await db
        .update(agents)
        .set({
          tasksFailed: (agent?.tasksFailed ?? 0) + 1,
          creditsUsed: (agent?.creditsUsed ?? 0) + cost,
          currentTask: null,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agents.id, task.agentId));
    }
  }

  // 8. Record activity: task completed or failed
  await db.insert(activityEvents).values({
    orgId,
    agentId: task.agentId,
    taskId: task.id,
    type: taskSucceeded ? 'completed' : 'failed',
    summary: taskSucceeded ? `Completed: ${task.title}` : `Failed: ${task.title}`,
    reason: taskSucceeded
      ? `Task executed by ${agentName} in ${(durationMs / 1000).toFixed(1)}s`
      : `Task failed: ${result.slice(0, 200)}`,
    cost,
    department: null,
  });

  // 9. Store result in company memory
  await db.insert(companyMemory).values({
    orgId,
    category: taskSucceeded ? 'context' : 'lesson',
    content: taskSucceeded
      ? `Task completed: "${task.title}" — Result: ${result.slice(0, 500)}`
      : `Task failed: "${task.title}" — Error: ${result.slice(0, 500)}`,
    source: agentName,
    agentId: task.agentId,
    taskId: task.id,
    importance: taskSucceeded ? 5 : 7,
  });

  // 10. Audit
  await appendAudit(db, {
    orgId,
    actorType: 'agent',
    actorId: task.agentId,
    agentId: task.agentId,
    taskId: task.id,
    action: taskSucceeded ? 'task.completed' : 'task.failed',
    tool: 'llm',
    cost,
    outcome: taskSucceeded ? 'success' : 'failure',
  });

  // 10b. Submit feedback to Executive Agent — agent reports completion or failure
  if (task.agentId) {
    try {
      const { submitFeedback } = await import('./multi-agent.js');
      await submitFeedback(db, {
        orgId,
        agentId: task.agentId,
        taskId: task.id,
        feedbackType: taskSucceeded ? 'completion' : 'blocker',
        summary: taskSucceeded
          ? `Completed "${task.title}" in ${(durationMs / 1000).toFixed(1)}s`
          : `Failed to complete "${task.title}": ${result.slice(0, 200)}`,
        details: result.slice(0, 500),
        requiresFounderAttention: !taskSucceeded,
      });
    } catch {
      // Feedback failure is non-fatal
    }
  }

  // 11. Notify: task completed (gated by notification preferences)
  try {
    const { shouldNotify, getNotificationPrefs } = await import('./notification-preferences.js');
    const { createNotification } = await import('../routes/notifications.js');
    const prefs = await getNotificationPrefs(db, orgId);
    if (shouldNotify(prefs, 'inApp', 'task')) {
      createNotification(
        db,
        orgId,
        'task',
        'Task Completed',
        `${agentName} completed "${task.title}" in ${(durationMs / 1000).toFixed(1)}s (${cost} credits)`,
      );
    }
  } catch { /* notification failure is non-fatal */ }

  return {
    taskId,
    status: taskSucceeded ? 'completed' : 'failed',
    result: resultWithTools,
    cost,
    tokensUsed,
    llmUsed: llmAttempted,
  };
}

/**
 * Execute all pending tasks for an org (batch execution).
 *
 * Selects `pending` only. A task in `awaiting_approval` is stopped on a founder
 * decision, so it is excluded here by construction — a background pass must
 * never resolve a question that was addressed to a person.
 */
export async function executePendingTasks(
  config: AppConfig,
  db: Db,
  orgId: string,
): Promise<TaskExecutionResult[]> {
  const pendingTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.status, 'pending')))
    .limit(10); // Execute up to 10 tasks at a time

  const results: TaskExecutionResult[] = [];
  for (const task of pendingTasks) {
    const result = await executeTask(config, db, orgId, task.id);
    results.push(result);
  }
  return results;
}

/**
 * Get the status of a task and its execution result.
 */
export async function getTaskStatus(
  db: Db,
  orgId: string,
  taskId: string,
): Promise<{
  id: string;
  title: string;
  status: string;
  cost: number;
  agentId: string | null;
  result?: string;
} | null> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)))
    .limit(1);

  if (!task) return null;

  // The task row holds the real execution output. Fall back to the most
  // recent activity event's summary only when no result was persisted.
  let activitySummary: string | undefined;
  if (!task.result) {
    const [activity] = await db
      .select({ summary: activityEvents.summary })
      .from(activityEvents)
      .where(eq(activityEvents.taskId, taskId))
      .orderBy(activityEvents.occurredAt)
      .limit(1);
    activitySummary = activity?.summary ?? undefined;
  }

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    cost: task.cost,
    agentId: task.agentId,
    result: task.result ?? activitySummary,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildTaskPrompt(
  title: string,
  description: string,
  agentName: string,
  agentRole: string,
): string {
  return `## Task Assignment

You have been assigned a task by the Executive Agent.

**Task:** ${title}
**Description:** ${description}
**Your Role:** ${agentName} (${agentRole.replace(/_/g, ' ')})

Complete this task now. Provide:
1. A clear, structured output
2. Key findings or deliverables
3. Any recommendations or next steps
4. Assumptions or limitations if applicable

Be thorough but concise. Focus on actionable output.`;
}

function generateFallbackResult(title: string, description: string, agentName: string): string {
  return `## Task Complete: ${title}

**Assigned to:** ${agentName}

**Summary:**
This task has been processed by the ${agentName}. The task involved: ${description}

**Status:** Completed (structured output — LLM was unavailable for full execution)

**Note:** For detailed AI-generated output, ensure the LLM gateway (LiteLLM) is configured and running. The task has been recorded in the system with all context preserved for future reference.`;
}
