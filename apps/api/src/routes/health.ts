import { AppError } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../types.js';

// docs/43 — /healthz (liveness) and /readyz (dependency readiness)
export function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/healthz', async () => ({ data: { status: 'ok', service: 'orq8-api' } }));

  app.get('/readyz', async () => {
    try {
      await deps.pool.query('SELECT 1');
      return { data: { status: 'ready' } };
    } catch (err) {
      deps.logger.error({ err }, 'readyz: dependency unreachable');
      throw new AppError(503, 'service.unavailable', 'Dependencies not ready');
    }
  });
}
