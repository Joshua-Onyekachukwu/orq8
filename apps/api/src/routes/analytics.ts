import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { logAnalyticsEvent, listAnalyticsEvents } from '../services/simulation.js';
import { scanOrgAnomalies } from '../services/anomaly-detector.js';
import type { AppDeps } from '../types.js';

const logBody = z.object({
  eventName: z.string().trim().min(1).max(100),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export function registerAnalyticsRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.post('/v1/analytics/events', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = logBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const event = await logAnalyticsEvent(db, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      eventName: parsed.data.eventName,
      properties: parsed.data.properties,
    });

    reply.code(201);
    return { data: event };
  });

  app.get('/v1/analytics/events', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const events = await listAnalyticsEvents(db, ctx.orgId, limit);
    return { data: events };
  });

  /**
   * GET /v1/analytics/anomalies — deterministic scan of the org's current
   * operational signals (stalled goals, at-risk goals, blocked tasks, failure
   * spikes, spend spikes). Powers the proactive "Needs Attention" surface.
   */
  app.get('/v1/analytics/anomalies', async (request) => {
    const ctx = await requireAuth(request, deps);
    const scan = await scanOrgAnomalies(db, ctx.orgId);
    return { data: scan };
  });
}
