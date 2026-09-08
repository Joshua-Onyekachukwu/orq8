/**
 * ORQ8 Workforce ROI Routes
 *
 * GET /v1/roi — Full workforce ROI summary
 * GET /v1/roi/rate — Get configured hourly rate
 * PATCH /v1/roi/rate — Update hourly rate
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { calculateWorkforceROI, getHourlyRate, setHourlyRate } from '../services/workforce-roi.js';
import type { AppDeps } from '../types.js';

const rateBody = z.object({
  hourlyRate: z.number().min(1).max(1000),
});

export function registerWorkforceROIRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/roi — Full workforce ROI summary */
  app.get('/v1/roi', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const rateConfig = await getHourlyRate(db, ctx.orgId);
    const roi = await calculateWorkforceROI(db, ctx.orgId, rateConfig.hourlyRate);
    return roi;
  });

  /** GET /v1/roi/rate — Get configured hourly rate */
  app.get('/v1/roi/rate', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    return getHourlyRate(db, ctx.orgId);
  });

  /** PATCH /v1/roi/rate — Update hourly rate */
  app.patch('/v1/roi/rate', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = rateBody.parse(request.body);
    await setHourlyRate(db, ctx.orgId, body.hourlyRate);
    return { hourlyRate: body.hourlyRate, currency: 'USD' };
  });
}
