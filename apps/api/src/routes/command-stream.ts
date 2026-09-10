import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as executiveAgent from '../services/executive-agent.js';
import type { AppDeps } from '../types.js';

const commandBody = z.object({
  command: z.string().trim().min(3).max(2000),
  // JSON-encoded nested context (same shape as the POST body) — a URL param
  // can't carry an object natively.
  context: z.string().max(2000).optional(),
  // Free-form founder context note from the agent panel surface.
  contextNote: z.string().max(2000).optional(),
});

const STAGE_LABELS: Record<string, string> = {
  context_building: 'Reading the organization',
  intent_analysis: 'Analyzing your command',
  credit_check: 'Checking work credits',
  tool_execution: 'Running organizational tools',
  task_creation: 'Creating tasks',
  approval_gate: 'Evaluating approval policy',
  task_execution: 'Executing tasks',
  credit_consumption: 'Accounting credits',
  audit_trail: 'Recording audit trail',
};

const STEP_ORDER = [
  'context_building',
  'intent_analysis',
  'credit_check',
  'tool_execution',
  'task_creation',
  'approval_gate',
  'task_execution',
  'credit_consumption',
  'audit_trail',
];

/**
 * GET /v1/commands/stream?command=… — Executive Agent with live progress.
 *
 * The founder sees each pipeline stage as it happens instead of a frozen
 * spinner: the browser EventSource receives `stage` events during execution
 * and a final `done` event carrying the FULL command result (identical shape
 * to POST /v1/commands), or an `error` event.
 *
 * This is the SAME pipeline as the non-streaming route — no duplicated
 * orchestration logic, no divergent behavior.
 */
export function registerCommandStreamRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config, logger } = deps;

  app.get('/v1/commands/stream', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const parsed = commandBody.safeParse(request.query);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const { command, contextNote: noteParam } = parsed.data;

    // Build the same human-readable context note the POST route derives.
    let context: Record<string, string> | undefined;
    try {
      context = parsed.data.context ? (JSON.parse(parsed.data.context) as Record<string, string>) : undefined;
    } catch {
      throw validation([{ path: ['context'], message: 'context must be JSON-encoded' }]);
    }
    const contextParts: string[] = [];
    if (context?.goalTitle || context?.goalId)
      contextParts.push(`viewing goal "${context.goalTitle ?? context.goalId}"`);
    if (context?.agentName || context?.agentId)
      contextParts.push(`viewing AI employee "${context.agentName ?? context.agentId}"`);
    if (context?.departmentName || context?.departmentId)
      contextParts.push(`viewing department "${context.departmentName ?? context.departmentId}"`);
    if (context?.taskTitle || context?.taskId)
      contextParts.push(`viewing task "${context.taskTitle ?? context.taskId}"`);
    if (context?.page) contextParts.push(`on page ${context.page}`);
    // contextNote (agent panel) and structured context compose.
    const contextNote =
      [contextParts.join(', '), noteParam].filter((s) => s && s.length > 0).join(' | ') || undefined;

    logger.info({ orgId: ctx.orgId, userId: ctx.userId, command }, 'Executive Agent: streaming command');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let closed = false;
    request.raw.on('close', () => {
      closed = true;
    });

    const send = (event: Record<string, unknown>) => {
      if (closed) return;
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        closed = true;
      }
    };

    // SSE heartbeat every 15s: keeps intermediate proxies from silently
    // buffering/stalling a long stream during slow LLM stages, and lets the
    // client distinguish "working" from "gone".
    const heartbeat = setInterval(() => {
      if (!closed) {
        try {
          reply.raw.write(': hb\n\n');
        } catch {
          closed = true;
        }
      }
    }, 15_000);

    try {
      // The pipeline's own trace instrumentation emits the first `stage`
      // event (context_building started) synchronously at pipeline start.
      const result = await executiveAgent.executeCommand(config, db, ctx.orgId, ctx.userId, command, contextNote, {
        onProgress: (ev) => {
          if (closed) return;
          if (ev.type === 'step_started') {
            send({
              type: 'stage',
              stage: ev.step,
              label: STAGE_LABELS[ev.step] ?? ev.step,
              status: 'started',
            });
          } else if (ev.type === 'step_completed') {
            send({
              type: 'stage',
              stage: ev.step,
              label: STAGE_LABELS[ev.step] ?? ev.step,
              status: 'completed',
              ...(ev.detail ? { detail: ev.detail } : {}),
            });
          } else if (ev.type === 'step_failed') {
            send({ type: 'stage', stage: ev.step, label: STAGE_LABELS[ev.step] ?? ev.step, status: 'failed', error: ev.error });
          } else if (ev.type === 'step_skipped') {
            send({
              type: 'stage',
              stage: ev.step,
              label: STAGE_LABELS[ev.step] ?? ev.step,
              status: 'skipped',
              ...(ev.reason ? { reason: ev.reason } : {}),
            });
          } else if (ev.type === 'step_detail' && ev.detail && typeof ev.detail === 'object') {
            // Per-task progress inside task_execution — the console shows which
            // piece of work finished instead of an undifferentiated spinner.
            const d = ev.detail as { taskId?: string; taskStatus?: string };
            if (d.taskId) {
              send({ type: 'task', taskId: d.taskId, status: d.taskStatus ?? 'unknown' });
            }
          }
        },
      });

      const completedSteps = result.workflowTrace
        ? [...result.workflowTrace.steps]
            .filter((s) => s.status === 'completed')
            .map((s) => s.name)
            .sort((a, b) => STEP_ORDER.indexOf(a) - STEP_ORDER.indexOf(b))
        : [];

      send({ type: 'done', result, completedStages: completedSteps });
      logger.info({ commandId: result.commandId, status: result.status }, 'Executive Agent: streamed command finished');
    } catch (error) {
      logger.error({ err: error, orgId: ctx.orgId }, 'Executive Agent: streamed command failed');
      send({
        type: 'error',
        error: {
          code: 'executive_agent.failed',
          message: 'The Executive Agent encountered an error. Please try again or rephrase your command.',
        },
      });
    } finally {
      clearInterval(heartbeat);
      closed = true;
      reply.raw.end();
    }
    return reply;
  });
}
