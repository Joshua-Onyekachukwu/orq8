import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { organizations } from '@orq8/db';
import type { AppDeps } from '../types.js';

const updateSettingsBody = z.object({
  notifications: z.object({
    emailOnApproval: z.boolean().optional(),
    emailOnTaskComplete: z.boolean().optional(),
    emailOnAgentError: z.boolean().optional(),
    emailOnLowCredits: z.boolean().optional(),
    emailOnWeeklyReport: z.boolean().optional(),
    browserNotifications: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
  }).optional(),
  general: z.object({
    timezone: z.string().max(50).optional(),
    language: z.string().max(10).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  }).optional(),
});

export function registerSettingsRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Get settings. */
  app.get('/v1/settings', async (request, reply) => {
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

    const settings = (result[0]?.settings as Record<string, unknown>) ?? {};
    const notifications = (settings.notifications as Record<string, unknown>) ?? {
      emailOnApproval: true,
      emailOnTaskComplete: true,
      emailOnAgentError: true,
      emailOnLowCredits: true,
      emailOnWeeklyReport: true,
      browserNotifications: true,
      soundEnabled: true,
    };
    const general = (settings.general as Record<string, unknown>) ?? {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: 'en',
      theme: 'light',
    };

    return { data: { notifications, general } };
  });

  /** Update settings. */
  app.patch('/v1/settings', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = updateSettingsBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const result = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);

    const currentSettings = (result[0]?.settings as Record<string, unknown>) ?? {};
    const newSettings = { ...currentSettings };

    if (parsed.data.notifications) {
      newSettings.notifications = {
        ...((newSettings.notifications as Record<string, unknown>) ?? {}),
        ...parsed.data.notifications,
      };
    }
    if (parsed.data.general) {
      newSettings.general = {
        ...((newSettings.general as Record<string, unknown>) ?? {}),
        ...parsed.data.general,
      };
    }

    await db
      .update(organizations)
      .set({ settings: newSettings })
      .where(eq(organizations.id, ctx.orgId));

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'settings.updated',
      outcome: 'success',
    });

    return { data: { success: true } };
  });
}
