import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { agents, organizations } from '@orq8/db';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { getBudgetOverview, setKillSwitch } from '../services/ai-budget.js';
import type { AppDeps } from '../types.js';

/**
 * Budget policy + kill switch (docs/80 Phase 2).
 *
 * The stored constitution `budgetPolicy` is what `reserveCredits` enforces; this
 * surface is how a founder reads it back (with real spend), sets each employee's
 * own budget, and flips the org-wide AI-spend kill switch. Spending controls
 * require owner/admin, the same gate as buying credits.
 */

const agentBudgetBody = z
  .object({
    dailyCredits: z.number().int().min(0).optional(),
    monthlyCredits: z.number().int().min(0).optional(),
    perTaskCredits: z.number().int().min(0).optional(),
  })
  .strict();

const killSwitchBody = z
  .object({
    paused: z.boolean(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export function registerAiBudgetRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  const canSpendOrgMoney = (ctx: { role: string }): boolean =>
    ctx.role === 'owner' || ctx.role === 'admin';

  /** GET /v1/budgets — policy, kill-switch state, measured spend, agent budgets. */
  app.get('/v1/budgets', async (request) => {
    const ctx = await requireAuth(request, deps);
    const overview = await getBudgetOverview(db, ctx.orgId);
    return { data: overview };
  });

  /**
   * PUT /v1/budgets/agents/:agentId — set one employee's spending budget.
   * Merges into `agents.config.budget` so other config keys survive.
   */
  app.put<{ Params: { agentId: string } }>('/v1/budgets/agents/:agentId', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    if (!canSpendOrgMoney(ctx)) {
      reply.code(403);
      return { error: { code: 'forbidden', message: 'Only an owner or admin can change budgets.' } };
    }
    const parsed = agentBudgetBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const [agent] = await db
      .select({ id: agents.id, config: agents.config })
      .from(agents)
      .where(and(eq(agents.id, request.params.agentId), eq(agents.orgId, ctx.orgId)))
      .limit(1);
    if (!agent) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Agent not found' } };
    }

    const config = (agent.config as Record<string, unknown>) ?? {};
    const currentBudget = (config.budget as Record<string, unknown>) ?? {};
    const nextBudget = {
      ...currentBudget,
      ...Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)),
    };

    await db
      .update(agents)
      .set({ config: { ...config, budget: nextBudget }, updatedAt: new Date() })
      .where(and(eq(agents.id, agent.id), eq(agents.orgId, ctx.orgId)));

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'budget.agent_updated',
      outcome: 'success',
      cost: 0,
      resultRef: `agent:${agent.id}`,
    }).catch(() => undefined);

    return { data: { agentId: agent.id, budget: nextBudget } };
  });

  /** POST /v1/budgets/kill-switch — pause/resume all AI spend for the org. */
  app.post('/v1/budgets/kill-switch', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    if (!canSpendOrgMoney(ctx)) {
      reply.code(403);
      return { error: { code: 'forbidden', message: 'Only an owner or admin can pause AI spend.' } };
    }
    const parsed = killSwitchBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Ensure the org exists so the settings write has a row to land on.
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);
    if (!org) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Organization not found' } };
    }

    const state = await setKillSwitch(db, ctx.orgId, parsed.data.paused, {
      userId: ctx.userId,
      reason: parsed.data.reason,
    });
    return { data: state };
  });
}
