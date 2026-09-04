import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as multiAgent from '../services/multi-agent.js';
import type { AppDeps } from '../types.js';

const delegateBody = z.object({
  targetAgentId: z.string().uuid(),
  parentTaskId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  context: z.string().max(2000).optional(),
  dueDate: z.string().datetime().optional(),
});

const handoffBody = z.object({
  taskId: z.string().uuid(),
  fromAgentId: z.string().uuid(),
  toAgentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  transferNotes: z.string().max(2000).optional(),
});

const feedbackBody = z.object({
  agentId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  feedbackType: z.enum(['completion', 'blocker', 'question', 'recommendation', 'escalation']),
  summary: z.string().trim().min(1).max(500),
  details: z.string().max(2000).optional(),
  suggestedAction: z.string().max(500).optional(),
  requiresFounderAttention: z.boolean().default(false),
});

export function registerMultiAgentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /**
   * POST /v1/multi-agent/delegate — Delegate a sub-task to another agent.
   */
  app.post('/v1/multi-agent/delegate', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = delegateBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const result = await multiAgent.delegateTask(db, {
      orgId: ctx.orgId,
      delegatingAgentId: ctx.userId, // The user/founder acts as the delegating agent
      targetAgentId: parsed.data.targetAgentId,
      parentTaskId: parsed.data.parentTaskId,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      context: parsed.data.context,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    });

    reply.code(result.status === 'created' ? 201 : 400);
    return { data: result };
  });

  /**
   * POST /v1/multi-agent/handoff — Hand off a task from one agent to another.
   */
  app.post('/v1/multi-agent/handoff', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = handoffBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const result = await multiAgent.handoffTask(db, {
      orgId: ctx.orgId,
      ...parsed.data,
    });

    reply.code(result.success ? 200 : 400);
    return { data: result };
  });

  /**
   * POST /v1/multi-agent/feedback — Submit agent feedback to the Executive Agent.
   */
  app.post('/v1/multi-agent/feedback', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = feedbackBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const result = await multiAgent.submitFeedback(db, {
      orgId: ctx.orgId,
      ...parsed.data,
    });

    return { data: result };
  });

  /**
   * GET /v1/multi-agent/subtasks/:taskId — Get aggregated sub-task results.
   */
  app.get<{ Params: { taskId: string } }>('/v1/multi-agent/subtasks/:taskId', async (request) => {
    const ctx = await requireAuth(request, deps);
    const result = await multiAgent.aggregateSubTaskResults(db, ctx.orgId, request.params.taskId);
    return { data: result };
  });
}
