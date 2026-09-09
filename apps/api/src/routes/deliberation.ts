/**
 * Decision Council API (§10–§17, §47).
 *
 * POST /v1/deliberations — run a structured multi-agent deliberation for a
 *   significant question. Synchronous (the EA command path has the same
 *   profile); budget caps bound total cost and wall time. Never executes
 *   anything: the result is a recommendation with preserved disagreements.
 *
 * GET  /v1/deliberations — recent council decisions from Decision Memory
 *   (decision-maker type `ai_council`), newest first.
 */

import { eq, desc } from 'drizzle-orm';
import { decisions } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { runDeliberation } from '../services/deliberation.js';
import type { AppDeps } from '../types.js';

export function registerDeliberationRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Run a deliberation session. */
  app.post('/v1/deliberations', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z
      .object({
        question: z.string().min(8).max(1000),
        context: z.string().max(2000).optional(),
      })
      .safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: 'validation_failed', details: parsed.error.flatten() } };
    }

    const result = await runDeliberation(deps.config, db, ctx.orgId, ctx.userId, {
      question: parsed.data.question,
      context: parsed.data.context ?? null,
    });

    // llm_unavailable is a 503 — the deliberation did not run; never pretend
    // it produced a recommendation.
    if (result.stoppedReason === 'llm_unavailable') {
      reply.code(503);
      return {
        error: {
          code: 'llm_unavailable',
          message: 'No LLM provider was available — deliberation could not run.',
          partial: result,
        },
      };
    }

    return { data: result };
  });

  /** List council decisions recorded in Decision Memory. */
  app.get('/v1/deliberations', async (request) => {
    const ctx = await requireAuth(request, deps);
    const rows = await db
      .select()
      .from(decisions)
      .where(eq(decisions.orgId, ctx.orgId))
      .orderBy(desc(decisions.createdAt))
      .limit(50);
    const council = rows.filter((d) => d.decisionMakerType === 'ai_council');
    return {
      data: council.map((d) => ({
        id: d.id,
        title: d.title,
        decisionType: d.decisionType,
        status: d.status,
        confidence: d.confidence,
        whatWasDecided: d.whatWasDecided,
        rationale: d.rationale,
        expectedOutcome: d.expectedOutcome,
        actualOutcome: d.actualOutcome,
        decidedAt: d.decidedAt,
        createdAt: d.createdAt,
      })),
    };
  });
}
