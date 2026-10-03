import { z } from 'zod';
import { validation } from '@orq8/core';
import { and, eq } from 'drizzle-orm';
import { tasks } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as executiveAgent from '../services/executive-agent.js';
import { getTaskStatus, executeTask, executePendingTasks, retryTask } from '../services/task-executor.js';
import { executeWithQuality } from '../services/quality-pipeline.js';
import { getRecentTraces, getTraceSummary } from '../services/llm-tracer.js';
import { enqueueJob } from '../services/jobs.js';
import { enforceAgentJobQuota, enforceOrgLimit, sendRateLimited } from '../plugins/rate-limits.js';
import type { AppDeps } from '../types.js';

const commandBody = z.object({
  command: z.string().trim().min(3).max(2000),
  // Optional founder context so the Executive Agent understands what the
  // founder is looking at (e.g. viewing a goal → "break this down").
  context: z
    .object({
      page: z.string().max(100).optional(),
      goalId: z.string().uuid().optional(),
      goalTitle: z.string().max(200).optional(),
      agentId: z.string().uuid().optional(),
      agentName: z.string().max(200).optional(),
      departmentId: z.string().uuid().optional(),
      departmentName: z.string().max(200).optional(),
      taskId: z.string().uuid().optional(),
      taskTitle: z.string().max(200).optional(),
    })
    .optional(),
});

export function registerCommandRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config, logger } = deps;

  /**
   * POST /v1/commands — Process a CEO command through the Executive Agent.
   *
   * Flow:
   *   1. Authenticate
   *   2. Build organizational context (agents, goals, tasks, memory)
   *   3. Send to LLM for intent analysis
   *   4. Decompose into tasks
   *   5. Select appropriate agents
   *   6. Create approval gate if needed
   *   7. Create tasks in the database
   *   8. Record audit trail
   *   9. Return structured result
   */
  app.post('/v1/commands', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const parsed = commandBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Per-org layer (docs/80 §3.3): the company-wide ceiling on AI execution,
    // applied before any context building or model call.
    const orgVerdict = await enforceOrgLimit(deps, ctx.orgId, 'ai.execute');
    if (!orgVerdict.allowed) return sendRateLimited(reply, orgVerdict, 'task execution');

    logger.info({ orgId: ctx.orgId, userId: ctx.userId, command: parsed.data.command }, 'Executive Agent: processing command');

    // Build a human-readable context note from the founder's current view
    const c = parsed.data.context;
    const contextParts: string[] = [];
    if (c?.goalTitle || c?.goalId) {
      contextParts.push(`viewing goal "${c.goalTitle ?? c.goalId}"`);
    }
    if (c?.agentName || c?.agentId) {
      contextParts.push(`viewing AI employee "${c.agentName ?? c.agentId}"`);
    }
    if (c?.departmentName || c?.departmentId) {
      contextParts.push(`viewing department "${c.departmentName ?? c.departmentId}"`);
    }
    if (c?.taskTitle || c?.taskId) {
      contextParts.push(`viewing task "${c.taskTitle ?? c.taskId}"`);
    }
    if (c?.page) contextParts.push(`on page ${c.page}`);
    const contextNote = contextParts.length > 0 ? contextParts.join(', ') : undefined;

    try {
      const result = await executiveAgent.executeCommand(
        config,
        db,
        ctx.orgId,
        ctx.userId,
        parsed.data.command,
        contextNote,
      );

      logger.info({ commandId: result.commandId, status: result.status, taskCount: result.taskIds.length }, 'Executive Agent: command processed');

      reply.code(200);
      return {
        data: {
          commandId: result.commandId,
          command: parsed.data.command,
          plan: {
            action: result.intent.category,
            description: result.intent.intent,
            agents: result.agentResults?.map(r => r.agentName) ?? [],
            estimatedCost: result.intent.estimatedCost,
            requiresApproval: result.intent.requiresApproval,
            riskLevel: result.intent.riskLevel,
            taskDecomposition: result.intent.taskDecomposition,
          },
          approvalRequest: result.approvalId
            ? {
                id: result.approvalId,
                action: result.intent.intent,
                reason: result.intent.approvalReason,
                riskLevel: result.intent.riskLevel,
              }
            : null,
          status: result.status,
          message: result.message,
          taskIds: result.taskIds,
          agentResults: result.agentResults,
          credits: {
            consumed: result.creditsConsumed ?? 0,
            remaining: result.creditsRemaining ?? 0,
          },
          // Which LLM provider actually ran this command (docs/22): nvidia | litellm | ollama | none
          llmProvider: result.llmProvider ?? 'none',
          // Actionable warnings from the LLM provider chain (e.g. NVIDIA scope issues)
          warnings: result.warnings ?? [],
          // Delegation summary — which agents were assigned
          delegation: result.delegationSummary,
          // Tool execution results
          toolResults: result.toolResults ?? [],
          // Workflow trace for debugging and monitoring
          workflowTrace: result.workflowTrace
            ? {
                totalDurationMs: result.workflowTrace.totalDurationMs,
                status: result.workflowTrace.status,
                errorRecoveryAttempts: result.workflowTrace.errorRecoveryAttempts,
                steps: result.workflowTrace.steps.map(s => ({
                  name: s.name,
                  status: s.status,
                  durationMs: s.durationMs,
                  error: s.error,
                })),
              }
            : null,
        },
      };
    } catch (error) {
      logger.error({ err: error, orgId: ctx.orgId }, 'Executive Agent: command failed');

      reply.code(500);
      return {
        data: {
          commandId: crypto.randomUUID(),
          command: parsed.data.command,
          plan: {
            action: 'error',
            description: 'The Executive Agent encountered an error processing your command.',
            agents: [],
            estimatedCost: 0,
            requiresApproval: false,
            riskLevel: 'low',
            taskDecomposition: [],
          },
          approvalRequest: null,
          status: 'error',
          message: 'The Executive Agent encountered an error. Please try again or rephrase your command.',
          taskIds: [],
          agentResults: [],
          llmProvider: 'none',
        },
      };
    }
  });

  /**
   * GET /v1/commands/tasks/:taskId — Get task execution status.
   */
  app.get<{ Params: { taskId: string } }>('/v1/commands/tasks/:taskId', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const task = await getTaskStatus(db, ctx.orgId, request.params.taskId);
    if (!task) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Task not found' } };
    }
    return { data: task };
  });

  /**
   * POST /v1/commands/tasks/:taskId/execute — Manually trigger task execution.
   */
  app.post<{ Params: { taskId: string } }>('/v1/commands/tasks/:taskId/execute', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    // Layered limits (docs/80 §3.3): org ceiling first, then the per-agent job
    // quota, both before any work is queued or run.
    const orgVerdict = await enforceOrgLimit(deps, ctx.orgId, 'ai.execute');
    if (!orgVerdict.allowed) return sendRateLimited(reply, orgVerdict, 'task execution');

    // The task must exist in the caller's org before any spend path opens — a
    // missing or foreign id is a 404, not something the worker discovers later.
    const [target] = await db
      .select({ id: tasks.id, agentId: tasks.agentId })
      .from(tasks)
      .where(and(eq(tasks.id, request.params.taskId), eq(tasks.orgId, ctx.orgId)))
      .limit(1);
    if (!target) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Task not found' } };
    }
    const agentVerdict = await enforceAgentJobQuota(deps, ctx.orgId, target.agentId);
    if (!agentVerdict.allowed) return sendRateLimited(reply, agentVerdict, 'agent work');

    // docs/75 — in 'enqueue'/'workers' mode the handler only enqueues: a
    // worker (own process in 'enqueue', in-process in 'workers') runs the same
    // quality pipeline, and the founder polls task status instead of holding an
    // HTTP connection through a model call.
    if (config.JOB_QUEUE_MODE !== 'inline') {
      const job = await enqueueJob(db, {
        orgId: ctx.orgId,
        type: 'task.execute',
        payload: { taskId: target.id },
        taskId: target.id,
      });
      reply.code(202);
      return {
        data: {
          queued: true,
          jobId: job.id,
          reused: job.reused,
          taskId: target.id,
          status: 'queued',
        },
      };
    }
    try {
      const qualityResult = await executeWithQuality(config, db, ctx.orgId, request.params.taskId);
      return { data: qualityResult.executionResult, qa: qualityResult.qaEvaluation, status: qualityResult.finalStatus };
    } catch (error) {
      // Failures must be visible and actionable — log the real cause, put it on
      // the task, and tell the founder what it was. This used to log and return
      // a bare 500, which left the task `pending` with nothing recorded: the run
      // had thrown, the work was not running, and the only copy of the reason
      // was a log line the founder could not read. A failed task with a reason
      // is retryable from the product ("Retry this task"); a pending task that
      // threw is not.
      request.log.error({ err: error }, 'task execution failed');
      const reason = (error instanceof Error ? error.message : 'Unknown execution error').slice(0, 200);
      await db
        .update(tasks)
        .set({ status: 'failed', result: `Execution failed: ${reason}`, updatedAt: new Date() })
        .where(and(eq(tasks.id, request.params.taskId), eq(tasks.orgId, ctx.orgId)))
        .catch(() => undefined);
      reply.code(500);
      return { error: { code: 'execution.failed', message: `Task execution failed: ${reason}` } };
    }
  });

  /**
   * POST /v1/commands/tasks/:taskId/retry — Re-run a task the system stopped.
   *
   * Gap C (docs/66 §66.14): `retryTask` is the explicit founder path back into
   * work that failed. It refuses anything a person already settled — a rejected
   * task is cancelled, and re-running it would undo the founder's own answer.
   */
  app.post<{ Params: { taskId: string } }>('/v1/commands/tasks/:taskId/retry', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const outcome = await retryTask(config, db, ctx.orgId, request.params.taskId);

    if ('refused' in outcome) {
      reply.code(outcome.status === 'missing' ? 404 : 409);
      return { error: { code: 'retry.refused', message: outcome.refused }, data: { status: outcome.status } };
    }
    return { data: outcome.result };
  });

  /**
   * POST /v1/commands/tasks/execute-pending — Run the org's queued work.
   *
   * The batch runner existed but nothing could reach it, so queued work only
   * ever moved when someone asked for one task by name. Gated work is excluded
   * by construction — `awaiting_approval` is not `pending`, and a background
   * pass must never answer a question that was put to a person.
   */
  app.post('/v1/commands/tasks/execute-pending', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const orgVerdict = await enforceOrgLimit(deps, ctx.orgId, 'ai.execute');
    if (!orgVerdict.allowed) return sendRateLimited(reply, orgVerdict, 'task execution');

    // docs/75 — 'enqueue'/'workers' mode: enqueue one job per pending task and
    // let the worker drain them; the response reports what was queued.
    if (config.JOB_QUEUE_MODE !== 'inline') {
      const pending = await db
        .select({ id: tasks.id, agentId: tasks.agentId })
        .from(tasks)
        .where(and(eq(tasks.orgId, ctx.orgId), eq(tasks.status, 'pending')))
        .limit(25);
      const jobs = [] as Array<{ taskId: string; jobId: string; reused: boolean }>;
      // Per-agent quota: one employee's backlog cannot be drained past its
      // hourly cap, but the rest of the batch still goes out (docs/80 §3.3).
      const throttled: Array<{ taskId: string; reason: string }> = [];
      for (const t of pending) {
        const quota = await enforceAgentJobQuota(deps, ctx.orgId, t.agentId);
        if (!quota.allowed) {
          throttled.push({
            taskId: t.id,
            reason: 'agent job quota reached — this employee resumes next hour',
          });
          continue;
        }
        const job = await enqueueJob(db, {
          orgId: ctx.orgId,
          type: 'task.execute',
          payload: { taskId: t.id },
          taskId: t.id,
        });
        jobs.push({ taskId: t.id, jobId: job.id, reused: job.reused });
      }
      return { data: { queued: jobs.length, jobs, throttled } };
    }
    const results = await executePendingTasks(config, db, ctx.orgId);
    return {
      data: {
        executed: results.length,
        completed: results.filter((r) => r.status === 'completed').length,
        failed: results.filter((r) => r.status === 'failed').length,
        deferred: results.filter((r) => r.status === 'deferred').length,
        results,
      },
    };
  });

  /**
   * GET /v1/commands/history — Get recent command/activity history.
   */
  app.get('/v1/commands/history', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);

    const history = await executiveAgent.getRecentActivity(db, ctx.orgId, limit);
    return { data: history };
  });

  /**
   * GET /v1/commands/traces — Get recent LLM call traces for monitoring.
   */
  app.get('/v1/commands/traces', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

    const traces = getRecentTraces(ctx.orgId, limit);
    return { data: traces };
  });

  /**
   * GET /v1/commands/llm-stats — Get LLM usage statistics.
   */
  app.get('/v1/commands/llm-stats', async (request) => {
    const ctx = await requireAuth(request, deps);
    const summary = getTraceSummary(ctx.orgId);
    return { data: summary };
  });
}
