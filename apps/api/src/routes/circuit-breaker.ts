import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as circuitBreaker from '../services/circuit-breaker.js';
import * as userService from '../services/users.js';
import { forbidden, platformAdminEmails } from '@orq8/core';
import type { AppDeps } from '../types.js';

async function requirePlatformAdmin(request: any, deps: AppDeps) {
  const ctx = await requireAuth(request, deps);
  const user = await userService.findById(deps.db, ctx.userId);
  const dbAdmin = user?.platformRole === 'admin';
  const envAdmin = platformAdminEmails(deps.config).has(ctx.email.toLowerCase());
  if (!dbAdmin && !envAdmin) {
    throw forbidden('Platform admin access required');
  }
  return ctx;
}

export function registerCircuitBreakerRoutes(app: FastifyInstance, deps: AppDeps): void {
  /**
   * GET /v1/admin/circuit-breakers — Get all circuit breaker states (admin only).
   */
  app.get('/v1/admin/circuit-breakers', async (request) => {
    await requirePlatformAdmin(request, deps);

    const states = circuitBreaker.getAllCircuitStates();
    return {
      data: {
        circuits: states,
        summary: {
          total: states.length,
          open: states.filter((s) => s.state === 'open').length,
          halfOpen: states.filter((s) => s.state === 'half_open').length,
          closed: states.filter((s) => s.state === 'closed').length,
        },
      },
    };
  });

  /**
   * POST /v1/admin/circuit-breakers/:key/reset — Force-reset a circuit (admin only).
   */
  app.post<{ Params: { key: string } }>('/v1/admin/circuit-breakers/:key/reset', async (request, reply) => {
    await requirePlatformAdmin(request, deps);

    const key = request.params.key;
    const parts = key.split(':');
    const providerId = parts[0] ?? key;
    const model = parts[1];
    circuitBreaker.resetCircuit(providerId, model);

    reply.code(200);
    return { data: { reset: true, key } };
  });

  /**
   * POST /v1/admin/circuit-breakers/reset-all — Force-reset all circuits (admin only).
   */
  app.post('/v1/admin/circuit-breakers/reset-all', async (request) => {
    await requirePlatformAdmin(request, deps);

    circuitBreaker.resetAllCircuits();
    return { data: { reset: true, message: 'All circuit breakers reset' } };
  });
}
