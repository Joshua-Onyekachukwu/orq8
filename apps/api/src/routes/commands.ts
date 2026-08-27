import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as executiveAgent from '../services/executive-agent.js';
import type { AppDeps } from '../types.js';

const commandBody = z.object({
  command: z.string().trim().min(3).max(2000),
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

    try {
      const result = await executiveAgent.executeCommand(
        config,
        db,
        ctx.orgId,
        ctx.userId,
        parsed.data.command,
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
        },
      };
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
}
