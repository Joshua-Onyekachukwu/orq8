import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { forbidden, validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { exportOrg } from '../services/portability.js';
import { describeMailProvider, runMailDiagnosis } from '../services/email-diagnostics.js';
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

const mailTestBody = z.object({
  /** Where the test message goes. Defaults to the signed-in founder's address. */
  to: z.string().trim().email().max(320).optional(),
});

export function registerSettingsRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config } = deps;

  /**
   * GET /v1/settings/export — full org data export (owner/admin only).
   * Never includes credentials, tokens, hashes, or webhook signatures.
   */
  app.get('/v1/settings/export', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    if (ctx.role !== 'owner' && ctx.role !== 'admin') throw forbidden();

    const data = await exportOrg(db, ctx.orgId);
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'org.exported',
      outcome: 'success',
    });

    const payload = JSON.stringify({ data }, null, 2);
    reply.header('content-type', 'application/json');
    reply.header('content-disposition', `attachment; filename="orq8-export-${ctx.orgId}.json"`);
    reply.header('x-content-type-options', 'nosniff');
    return reply.send(payload);
  });

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

  /**
   * GET /v1/settings/mail — how this deployment sends mail, and whether that
   * adds up to delivery. Static: it reads configuration and never sends, so the
   * settings page can show the truth without triggering anything.
   *
   * Key names only, never values (docs/37).
   */
  app.get('/v1/settings/mail', async (request) => {
    const ctx = await requireAuth(request, deps);
    const description = describeMailProvider(config);

    return {
      data: {
        ...description,
        environment: config.NODE_ENV,
        // Sending is a founder action, not something every member can trigger.
        canSendTest: ctx.role === 'owner' || ctx.role === 'admin',
      },
    };
  });

  /**
   * POST /v1/settings/mail/test — prove it, by sending one real message.
   *
   * The check is split into three verdicts (configured, credentials accepted,
   * message accepted) because "mail does not work" is not a diagnosis. A failure
   * comes back as a cause plus the change that fixes it, with the provider's own
   * words kept alongside.
   */
  app.post('/v1/settings/mail/test', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    if (ctx.role !== 'owner' && ctx.role !== 'admin') throw forbidden();

    const parsed = mailTestBody.safeParse(request.body ?? {});
    if (!parsed.success) throw validation(parsed.error.flatten());

    const to = parsed.data.to ?? ctx.email;
    const diagnosis = await runMailDiagnosis(config, deps.logger, to);

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'mail.delivery_checked',
      outcome: diagnosis.ok ? 'success' : 'failure',
      resultRef: `mail:${diagnosis.provider} → ${to}`,
    });

    // The check itself succeeded, so this is a 200 whose body carries the
    // verdict: a failed diagnosis is the answer, not an API error. The settings
    // page renders the failing step and the fix.
    void reply;
    return { data: diagnosis };
  });
}
