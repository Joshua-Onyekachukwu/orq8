import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { organizations } from '@orq8/db';
import type { AppDeps } from '../types.js';

const updateConstitutionBody = z.object({
  companyPurpose: z.string().trim().max(2000).optional().nullable(),
  values: z.array(z.string().trim().max(200).max(20)).optional(),
  agentPolicies: z.object({
    canDecide: z.array(z.string().max(200)).optional(),
    needsApproval: z.array(z.string().max(200)).optional(),
    neverAllowed: z.array(z.string().max(200)).optional(),
  }).optional().nullable(),
  budgetPolicy: z.object({
    dailyLimit: z.number().int().min(0).optional(),
    monthlyLimit: z.number().int().min(0).optional(),
    requiresApprovalAbove: z.number().int().min(0).optional(),
  }).optional().nullable(),
  communicationPolicy: z.string().trim().max(2000).optional().nullable(),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  version: z.number().int().min(1).optional(),
});

function getConstitution(settings: Record<string, unknown> | null) {
  if (!settings || typeof settings !== 'object') return null;
  const constitution = (settings as Record<string, unknown>).constitution;
  if (!constitution || typeof constitution !== 'object') return null;
  return constitution as Record<string, unknown>;
}

export function registerConstitutionRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Get the current constitution for the organization. */
  app.get('/v1/constitution', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const result = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);

    if (result.length === 0) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Organization not found' } };
    }

    const settings = (result[0]?.settings ?? null) as Record<string, unknown> | null;
    const constitution = getConstitution(settings);

    return {
      data: constitution ?? {
        companyPurpose: '',
        values: [],
        agentPolicies: { canDecide: [], needsApproval: [], neverAllowed: [] },
        budgetPolicy: { dailyLimit: 5000, monthlyLimit: 100000, requiresApprovalAbove: 10000 },
        communicationPolicy: '',
        riskTolerance: 'moderate',
        version: 1,
        updatedAt: null,
      },
    };
  });

  /** Update the constitution. */
  app.patch('/v1/constitution', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = updateConstitutionBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Get current settings
    const result = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);

    if (result.length === 0) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Organization not found' } };
    }

    const currentSettings = (result[0]?.settings as Record<string, unknown>) ?? {};
    const currentConstitution = (currentSettings.constitution as Record<string, unknown>) ?? {};

    const updatedConstitution = {
      ...currentConstitution,
      ...Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined)
      ),
      updatedAt: new Date().toISOString(),
      version: (currentConstitution.version as number ?? 0) + 1,
    };

    const newSettings = { ...currentSettings, constitution: updatedConstitution };

    await db
      .update(organizations)
      .set({ settings: newSettings })
      .where(eq(organizations.id, ctx.orgId));

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'constitution.updated',
      outcome: 'success',
    });

    return { data: updatedConstitution };
  });
}
