/**
 * Webhook receivers + event pipeline routes (Phases 6–8, 10–12).
 *
 * Receivers (POST /v1/webhooks/*) are deliberately NOT session-authenticated —
 * providers authenticate via HMAC signature. Every other route here is
 * org-scoped behind requireAuth, and the /v1/internal/* cron hooks are gated by
 * INTERNAL_TOKEN exactly like the waitlist drip.
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { forbidden, validation } from '@orq8/core';
import { agents } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import {
  getProvider,
  listOutcomes,
  recordOutcome,
} from '../services/integrations.js';
import {
  deleteRule,
  getWebhookSecret,
  ingestWebhookEvent,
  listRules,
  normalizeProviderEvent,
  processPendingEvents,
  rotateWebhookSecret,
  resolveOrgByRepoFullName,
  upsertRule,
  verifySignature,
  verifyTimestamp,
} from '../services/webhooks.js';
import { consolidateAllOrgs, orgIdsWithMemory } from '../services/consolidate-memory.js';
import { generateDailyBriefing, runDailyBriefings } from '../services/briefing.js';
import type { AppDeps } from '../types.js';

const ruleBody = z.object({
  provider: z.enum(['github', 'linear', 'gmail']),
  eventType: z.string().trim().min(1).max(100),
  action: z.enum(['notify', 'create_task', 'ignore']),
  agentId: z.string().uuid().nullable().optional(),
  taskTitleTemplate: z.string().trim().max(300).nullable().optional(),
  requiresApproval: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const outcomeBody = z.object({
  provider: z.enum(['github', 'gmail', 'linear', 'jira']),
  capability: z.string().trim().min(1).max(120),
  action: z.string().trim().min(1).max(120),
  status: z.enum(['success', 'failed', 'pending_approval', 'denied']),
  agentId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  providerResourceId: z.string().max(200).optional(),
  providerUrl: z.string().url().max(500).optional(),
  summary: z.string().trim().max(500).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().max(1000).optional(),
  requiresApproval: z.boolean().optional(),
  approvalId: z.string().uuid().optional(),
  correlationId: z.string().max(200).optional(),
});

function internalTokenGuard(deps: AppDeps, token: unknown): boolean {
  if (!deps.config.INTERNAL_TOKEN) return false;
  return typeof token === 'string' && token === deps.config.INTERNAL_TOKEN;
}

export function registerEventRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  // ─── Webhook receivers (HMAC-authenticated, no session) ─────────────────────

  /**
   * GitHub webhook. Org is resolved from repository.full_name via the
   * repositories table (an event for a repo ORQ8 doesn't track is rejected —
   * that mapping is itself authorization). Signature: x-hub-signature-256.
   */
  app.post('/v1/webhooks/github', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const fullName = (body.repository as Record<string, unknown> | undefined)?.full_name;
    if (typeof fullName !== 'string') {
      reply.code(400);
      return { error: { code: 'bad_request', message: 'Missing repository.full_name' } };
    }
    const resolved = await resolveOrgByRepoFullName(db, fullName);
    if (!resolved) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Repository not tracked by ORQ8' } };
    }

    const secret = await getWebhookSecret(db, resolved.orgId, 'github');
    const signature = request.headers['x-hub-signature-256'];
    const raw =
      typeof (request as unknown as { rawBody?: string }).rawBody === 'string'
        ? (request as unknown as { rawBody: string }).rawBody
        : JSON.stringify(body);
    if (!verifySignature(secret ?? '', raw, typeof signature === 'string' ? signature : undefined)) {
      await appendAudit(db, {
        orgId: resolved.orgId,
        actorType: 'system',
        action: 'webhook.rejected',
        outcome: 'denied',
        inputRef: 'github signature mismatch',
      });
      reply.code(401);
      return { error: { code: 'unauthorized', message: 'Invalid webhook signature' } };
    }

    const normalized = normalizeProviderEvent('github', body);
    if (!normalized) {
      reply.code(200);
      return { data: { accepted: false, reason: 'unsupported_event' } };
    }

    const delivery = request.headers['x-github-delivery'];
    const { inserted } = await ingestWebhookEvent(db, {
      orgId: resolved.orgId,
      provider: 'github',
      eventType: normalized.eventType,
      title: normalized.title,
      externalEventId:
        normalized.externalEventId ?? (typeof delivery === 'string' ? `delivery_${delivery}` : null),
      payload: normalized.payload,
      headers: {
        'x-github-delivery': typeof delivery === 'string' ? delivery : null,
        'x-github-event': request.headers['x-github-event'] ?? null,
      },
      correlationId: request.id,
    });

    reply.code(202);
    return { data: { accepted: true, duplicate: !inserted, eventType: normalized.eventType } };
  });

  /**
   * Linear webhook. Org is URL-embedded (/v1/webhooks/linear/:orgId — Linear
   * URLs are per-workspace, so the ref is provisioned at setup). Signature:
   * linear-signature (HMAC-SHA256 hex of the raw body).
   */
  app.post<{ Params: { orgId: string } }>('/v1/webhooks/linear/:orgId', async (request, reply) => {
    const orgId = request.params.orgId;
    const secret = await getWebhookSecret(db, orgId, 'linear');
    if (!secret) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'No webhook configured' } };
    }
    const signature = request.headers['linear-signature'];
    const raw =
      typeof (request as unknown as { rawBody?: string }).rawBody === 'string'
        ? (request as unknown as { rawBody: string }).rawBody
        : JSON.stringify(request.body ?? {});
    if (!verifySignature(secret, raw, typeof signature === 'string' ? signature : undefined)) {
      await appendAudit(db, {
        orgId,
        actorType: 'system',
        action: 'webhook.rejected',
        outcome: 'denied',
        inputRef: 'linear signature mismatch',
      });
      reply.code(401);
      return { error: { code: 'unauthorized', message: 'Invalid webhook signature' } };
    }

    const normalized = normalizeProviderEvent('linear', request.body);
    if (!normalized) {
      reply.code(200);
      return { data: { accepted: false, reason: 'unsupported_event' } };
    }

    const { inserted } = await ingestWebhookEvent(db, {
      orgId,
      provider: 'linear',
      eventType: normalized.eventType,
      title: normalized.title,
      externalEventId: normalized.externalEventId,
      payload: normalized.payload,
      headers: {},
      correlationId: request.id,
    });

    reply.code(202);
    return { data: { accepted: true, duplicate: !inserted, eventType: normalized.eventType } };
  });

  // ─── Webhook secret provisioning (auth, owner/admin) ────────────────────────

  /** Generate (or rotate) the webhook secret for a provider connection. */
  app.post<{ Params: { id: string } }>('/v1/integrations/:id/webhook-secret', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    if (ctx.role !== 'owner' && ctx.role !== 'admin') throw forbidden();
    const provider = await getProvider(db, ctx.orgId, request.params.id);
    if (!provider) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }
    const slug = provider.provider;
    if (slug !== 'github' && slug !== 'linear') {
      reply.code(400);
      return { error: { code: 'bad_request', message: 'Webhook secrets only supported for github/linear' } };
    }

    const secret = await rotateWebhookSecret(db, ctx.orgId, slug);
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'integration.webhook_secret_generated',
      outcome: 'success',
      inputRef: provider.id,
    });
    reply.code(201);
    // The plaintext is returned exactly once — the provider setup flow shows it
    // to the founder and never stores it.
    return { data: { secret, url: `/v1/webhooks/${slug === 'linear' ? `linear/${ctx.orgId}` : 'github'}` } };
  });

  /** Whether a webhook secret exists + its delivery URL (never the secret). */
  app.get<{ Params: { id: string } }>('/v1/integrations/:id/webhook', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const provider = await getProvider(db, ctx.orgId, request.params.id);
    if (!provider) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }
    const slug = provider.provider;
    const secret = await getWebhookSecret(db, ctx.orgId, slug);
    return {
      data: {
        configured: Boolean(secret),
        url: `/v1/webhooks/${slug === 'linear' ? `linear/${ctx.orgId}` : 'github'}`,
        provider: slug,
      },
    };
  });

  // ─── Event rules (auth, org-scoped) ─────────────────────────────────────────

  app.get('/v1/event-rules', async (request) => {
    const ctx = await requireAuth(request, deps);
    const rules = await listRules(db, ctx.orgId);
    return { data: rules };
  });

  app.put('/v1/event-rules', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = ruleBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // agentId must belong to this org — IDOR guard.
    let agentId: string | null = parsed.data.agentId ?? null;
    if (agentId) {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.orgId, ctx.orgId), eq(agents.id, agentId)))
        .limit(1);
      if (!agent) throw validation({ agentId: ['Agent not found in this organization'] });
    }

    const rule = await upsertRule(db, ctx.orgId, {
      provider: parsed.data.provider,
      eventType: parsed.data.eventType,
      action: parsed.data.action,
      agentId,
      taskTitleTemplate: parsed.data.taskTitleTemplate ?? null,
      requiresApproval: parsed.data.requiresApproval ?? false,
      enabled: parsed.data.enabled ?? true,
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'event_rule.upserted',
      outcome: 'success',
      inputRef: `${parsed.data.provider}:${parsed.data.eventType}`,
    });
    return { data: rule };
  });

  app.delete<{ Params: { id: string } }>('/v1/event-rules/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const deleted = await deleteRule(db, ctx.orgId, request.params.id);
    if (!deleted) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Rule not found' } };
    }
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'event_rule.deleted',
      outcome: 'success',
      inputRef: request.params.id,
    });
    reply.code(204);
    return reply.send();
  });

  // ─── Connector outcomes (auth, org-scoped) ──────────────────────────────────

  app.get('/v1/connector-outcomes', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const provider = url.searchParams.get('provider') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const data = await listOutcomes(db, ctx.orgId, { limit, provider, status });
    return { data };
  });

  /** Record a connector outcome (used by tool execution paths). */
  app.post('/v1/connector-outcomes', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = outcomeBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    const outcome = await recordOutcome(db, {
      orgId: ctx.orgId,
      agentId: parsed.data.agentId ?? null,
      taskId: parsed.data.taskId ?? null,
      provider: parsed.data.provider,
      capability: parsed.data.capability,
      action: parsed.data.action,
      status: parsed.data.status,
      providerResourceId: parsed.data.providerResourceId ?? null,
      providerUrl: parsed.data.providerUrl ?? null,
      summary: parsed.data.summary ?? null,
      result: (parsed.data.result ?? {}) as never,
      error: parsed.data.error ?? null,
      requiresApproval: parsed.data.requiresApproval ?? false,
      approvalId: parsed.data.approvalId ?? null,
      correlationId: parsed.data.correlationId ?? null,
    });
    reply.code(201);
    return { data: outcome };
  });

  // ─── Internal cron hooks (INTERNAL_TOKEN) ───────────────────────────────────

  /** Process pending webhook events (cron: every 5 minutes). */
  app.post('/v1/internal/events/process-pending', async (request, reply) => {
    if (!internalTokenGuard(deps, request.headers['x-internal-token'])) {
      reply.code(deps.config.INTERNAL_TOKEN ? 401 : 404);
      return { error: { code: 'unauthorized', message: 'Invalid internal token' } };
    }
    const result = await processPendingEvents(db, { limit: 100 });
    return { data: result };
  });

  /** Consolidate company memory across orgs (cron: daily). */
  app.post('/v1/internal/memory/consolidate', async (request, reply) => {
    if (!internalTokenGuard(deps, request.headers['x-internal-token'])) {
      reply.code(deps.config.INTERNAL_TOKEN ? 401 : 404);
      return { error: { code: 'unauthorized', message: 'Invalid internal token' } };
    }
    const orgIds = await orgIdsWithMemory(db);
    const results = await consolidateAllOrgs(db, orgIds);
    return { data: { orgs: results.length, results } };
  });

  /** Generate + deliver daily briefings for orgs with activity (cron: daily). */
  app.post('/v1/internal/briefings/daily', async (request, reply) => {
    if (!internalTokenGuard(deps, request.headers['x-internal-token'])) {
      reply.code(deps.config.INTERNAL_TOKEN ? 401 : 404);
      return { error: { code: 'unauthorized', message: 'Invalid internal token' } };
    }
    const now = new Date();
    const results = await runDailyBriefings(db, deps.config, deps.logger, now);
    return { data: { generated: results.filter((r) => !r.skipped).length, results } };
  });
}