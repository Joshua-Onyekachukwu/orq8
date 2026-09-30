import { AppError, capabilityReadiness } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../types.js';

// docs/58 — /healthz (liveness) and /readyz (dependency readiness).
// /readyz stays public and secret-free; the named capability report lives at
// /v1/readiness (docs/69), so a release gate can read the counts without a
// session and a founder can read the detail with one.
export function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/healthz', async () => ({ data: { status: 'ok', service: 'orq8-api' } }));

  app.get('/readyz', async () => {
    try {
      await deps.pool.query('SELECT 1');
      // `status` answers "can this instance serve?" (dependencies reachable).
      // `activation` answers "is the product switched on?" (docs/69). They are
      // separate on purpose: an instance can be healthy and still unable to
      // send a confirmation email, and a release gate needs to see that.
      const activation = capabilityReadiness(deps.config);
      return {
        data: {
          status: 'ready',
          activation: {
            ready: activation.ready,
            configurationRequired: activation.configurationRequired,
            devOnly: activation.devOnly,
            blocking: activation.blocking.length,
          },
        },
      };
    } catch (err) {
      deps.logger.error({ err }, 'readyz: dependency unreachable');
      throw new AppError(503, 'service.unavailable', 'Dependencies not ready');
    }
  });
}
