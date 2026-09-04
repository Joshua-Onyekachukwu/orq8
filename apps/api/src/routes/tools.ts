import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { getAllTools, getToolsForRole, getTool } from '../services/tool-registry.js';
import type { AppDeps } from '../types.js';

export function registerToolRoutes(app: FastifyInstance, deps: AppDeps): void {
  /**
   * GET /v1/tools — List all available tools.
   */
  app.get('/v1/tools', async (request) => {
    await requireAuth(request, deps);
    const tools = getAllTools();
    return {
      data: tools.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        riskLevel: t.riskLevel,
        requiresApproval: t.requiresApproval,
        creditCost: t.creditCost,
        parameters: t.parameters,
        outputDescription: t.outputDescription,
      })),
    };
  });

  /**
   * GET /v1/tools/:id — Get details of a specific tool.
   */
  app.get<{ Params: { id: string } }>('/v1/tools/:id', async (request, reply) => {
    await requireAuth(request, deps);
    const tool = getTool(request.params.id);
    if (!tool) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Tool not found' } };
    }
    return {
      data: {
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        riskLevel: tool.riskLevel,
        requiresApproval: tool.requiresApproval,
        approvalReason: tool.approvalReason,
        creditCost: tool.creditCost,
        parameters: tool.parameters,
        outputDescription: tool.outputDescription,
        estimatedDurationMs: tool.estimatedDurationMs,
        timeoutMs: tool.timeoutMs,
        hasSideEffects: tool.hasSideEffects,
        retryable: tool.retryable,
        maxRetries: tool.maxRetries,
      },
    };
  });

  /**
   * GET /v1/tools/role/:role — Get tools available to a specific agent role.
   */
  app.get<{ Params: { role: string } }>('/v1/tools/role/:role', async (request) => {
    await requireAuth(request, deps);
    const tools = getToolsForRole(request.params.role);
    return {
      data: tools.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        riskLevel: t.riskLevel,
        creditCost: t.creditCost,
      })),
    };
  });
}
