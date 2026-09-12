/**
 * Decision Council API (§10–§17, §47).
 *
 * POST /v1/deliberations — START a structured multi-agent deliberation and
 *   return immediately with the session id. The deliberation itself runs in
 *   the background (2–5 min for full councils) and the session row is promoted
 *   to its Decision Memory record on completion. This keeps long councils
 *   from being killed by proxy timeouts (Railway 502) — the 2026-09-12
 *   rehearsals showed sync POSTs completing server-side but 502ing the client.
 *   Budget caps still bound total cost and wall time. Never executes anything:
 *   the result is a recommendation with preserved disagreements.
 *
 * GET  /v1/deliberations — recent council decisions from Decision Memory
 *   (decision-maker type `ai_council`), newest first.
 *
 * GET  /v1/deliberations/progress?ids=a,b — completion probe for pending
 *   sessions (id-or-ids; org-scoped).
 */

import { and, eq, desc, inArray } from 'drizzle-orm';
import { decisions } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { runDeliberation } from '../services/deliberation.js';
import {
  createPendingCouncilSession,
  completePendingCouncilSession,
  deletePendingCouncilSession,
} from '../services/decision-memory.js';
import type { AppDeps } from '../types.js';

export function registerDeliberationRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Start a deliberation; returns the session id immediately. */
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

    // Placeholder row the client can poll; promoted in place on completion.
    const pending = await createPendingCouncilSession(db, ctx.orgId, ctx.userId, {
      title: parsed.data.question.slice(0, 200),
      councilDetail: {
        question: parsed.data.question,
        context: parsed.data.context ?? null,
        startedAt: new Date().toISOString(),
      },
    });

    // §33 observability: log the handoff; completion is logged in the worker.
    request.log.info(
      { orgId: ctx.orgId, sessionId: pending.id, escalationPreview: 'background' },
      'deliberation started (background)',
    );

    // Run in the request's detached context. On completion the pending row is
    // promoted in place; on failure it is removed (best-effort) so the council
    // page never shows a permanently pending session.
    void runDeliberation(deps.config, db, ctx.orgId, ctx.userId, {
      question: parsed.data.question,
      context: parsed.data.context ?? null,
      persistDecision: false,
    })
      .then((result) => {
        app.log.info(
          { orgId: ctx.orgId, sessionId: pending.id, decisionId: pending.id, stoppedReason: result.stoppedReason, rounds: result.rounds.length },
          'deliberation completed (background)',
        );
        if (result.stoppedReason === 'llm_unavailable') {
          // Honest: no session shown for a run that never produced anything.
          return deletePendingCouncilSession(db, ctx.orgId, pending.id);
        }
        return completePendingCouncilSession(db, ctx.orgId, pending.id, {
          confidence: (result.synthesis.confidence === 'none' ? 'low' : result.synthesis.confidence) as 'high' | 'medium' | 'low',
          whatWasDecided: result.synthesis.recommendation || '(no recommendation recorded — see session detail)',
          rationale: result.synthesis.verdictText,
          alternatives: result.synthesis.alternatives,
          evidence: result.rounds
            .flatMap((r) => r.analyses)
            .flatMap((a) => a.claims.filter((c) => c.kind === 'evidence').map((c) => ({ source: a.participant, type: 'council_analysis', summary: c.text })))
            .slice(0, 12),
          assumptions: result.rounds
            .flatMap((r) => r.analyses)
            .flatMap((a) => a.claims.filter((c) => c.kind === 'assumption').map((c) => c.text))
            .slice(0, 10),
          expectedOutcome: (result.synthesis.recommendation || '').slice(0, 500),
          councilDetail: {
            question: parsed.data.question,
            context: parsed.data.context ?? null,
            objective: parsed.data.context ?? null,
            participants: result.participants,
            rounds: result.rounds,
            disagreements: result.synthesis.disagreements,
            risks: result.synthesis.risks,
            unknowns: result.synthesis.unknowns,
            alternatives: result.synthesis.alternatives,
            consensusReached: result.synthesis.consensusReached,
            confidence: result.synthesis.confidence,
            requiresFounderApproval: result.requiresFounderApproval,
            budgetUsd: result.budgetUsd,
            totalTokensUsed: result.totalTokensUsed,
            stoppedReason: result.stoppedReason,
            recordedAt: new Date().toISOString(),
          },
        });
      })
      .catch(async (err) => {
        app.log.error({ orgId: ctx.orgId, sessionId: pending.id, err }, 'deliberation failed (background)');
        await deletePendingCouncilSession(db, ctx.orgId, pending.id).catch(() => {});
      });

    reply.code(202);
    return {
      data: {
        sessionId: pending.id,
        status: 'started',
        poll: `/v1/deliberations/progress?ids=${pending.id}`,
      },
    };
  });

  /** Completion probe for pending sessions. */
  app.get('/v1/deliberations/progress', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const raw = url.searchParams.get('ids') ?? '';
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
    if (ids.length === 0) return { data: { sessions: [] } };
    const rows = await db
      .select({ id: decisions.id, status: decisions.status, title: decisions.title })
      .from(decisions)
      .where(and(eq(decisions.orgId, ctx.orgId), inArray(decisions.id, ids)));
    return {
      data: {
        sessions: rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          completed: r.status !== 'pending',
        })),
      },
    };
  });

  /** List council decisions recorded in Decision Memory (incl. pending). */
  app.get('/v1/deliberations', async (request) => {
    const ctx = await requireAuth(request, deps);
    const rows = await db
      .select()
      .from(decisions)
      .where(eq(decisions.orgId, ctx.orgId))
      .orderBy(desc(decisions.createdAt))
      .limit(50);
    const council = rows.filter((d) => d.decisionMakerType === 'ai_council' && d.status !== 'pending');
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
        predictionAccuracy: d.predictionAccuracy,
        founderVerdict: d.founderVerdict,
        founderVerdictNote: d.founderVerdictNote,
        founderVerdictAt: d.founderVerdictAt,
        decidedAt: d.decidedAt,
        createdAt: d.createdAt,
      })),
    };
  });

  /** Full council session detail (§47) — participants, rounds, disagreements,
   * confidence, budget. Org-scoped; council decisions only. */
  app.get('/v1/deliberations/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(decisions)
      .where(and(eq(decisions.id, id), eq(decisions.orgId, ctx.orgId)))
      .limit(1);
    if (!row || row.decisionMakerType !== 'ai_council') {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Council session not found' } };
    }
    return {
      data: {
        id: row.id,
        title: row.title,
        status: row.status,
        confidence: row.confidence,
        whatWasDecided: row.whatWasDecided,
        rationale: row.rationale,
        evidence: row.evidence,
        assumptions: row.assumptions,
        expectedOutcome: row.expectedOutcome,
        actualOutcome: row.actualOutcome,
        lessonsLearned: row.lessonsLearned,
        founderVerdict: row.founderVerdict,
        founderVerdictNote: row.founderVerdictNote,
        founderVerdictAt: row.founderVerdictAt,
        decidedAt: row.decidedAt,
        createdAt: row.createdAt,
        councilDetail: row.councilDetail ?? null,
      },
    };
  });
}
