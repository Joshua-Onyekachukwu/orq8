import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as executiveAgent from '../services/executive-agent.js';
import { getTaskStatus, executeTask } from '../services/task-executor.js';
import { executeWithQuality } from '../services/quality-pipeline.js';
import { getRecentTraces, getTraceSummary } from '../services/llm-tracer.js';
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
    try {
      const qualityResult = await executeWithQuality(config, db, ctx.orgId, request.params.taskId);
      return { data: qualityResult.executionResult, qa: qualityResult.qaEvaluation, status: qualityResult.finalStatus };
    } catch (error) {
      reply.code(500);
      return { error: { code: 'execution.failed', message: 'Task execution failed' } };
    }
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
