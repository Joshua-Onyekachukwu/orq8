import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  dispatchGithubAction,
  ConnectorActionError,
  type GithubActionName,
} from '../services/connector-actions.js';
import { dispatchGmailAction } from '../services/connector-gmail.js';
import { dispatchLinearAction } from '../services/connector-linear.js';
import { listOutcomes } from '../services/integrations.js';
import type { AppDeps } from '../types.js';

/**
 * Connector Actions — founder-triggered execution of a real action against a
 * connected external provider, on behalf of an in-org agent. Capability grants
 * and org ownership are enforced server-side (connector-actions.ts); this route
 * is the "run it now" door for the founder to test/grant/observe connector work.
 */

const actionBody = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('github'),
    action: z.enum(['list_repositories', 'list_issues', 'read_file', 'create_issue', 'comment_on_issue', 'create_pull_request']),
    agentId: z.string().uuid(),
    taskId: z.string().uuid().optional(),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    provider: z.literal('gmail'),
    action: z.enum(['create_draft', 'send_draft', 'search']),
    agentId: z.string().uuid(),
    taskId: z.string().uuid().optional(),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    provider: z.literal('linear'),
    action: z.enum(['create_issue', 'get_issue', 'update_issue', 'archive_issue', 'list_issues']),
    agentId: z.string().uuid(),
    taskId: z.string().uuid().optional(),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
]);

const listQuery = z.object({
  provider: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function registerConnectorActionRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.post('/v1/connector-actions', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = actionBody.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: 'validation_error', message: 'Invalid connector action request', details: parsed.error.flatten().fieldErrors } };
    }
    const { provider, action, agentId, taskId, params } = parsed.data;
    const actor = { orgId: ctx.orgId, agentId, userId: ctx.userId, taskId };

    try {
      const result =
        provider === 'github'
          ? await dispatchGithubAction(db, actor, action as GithubActionName, params)
          : provider === 'gmail'
            ? await dispatchGmailAction(db, actor, action, params)
            : await dispatchLinearAction(db, actor, action, params);
      return {
        data: {
          capability: result.capability,
          action: result.action,
          providerResourceId: result.providerResourceId,
          providerUrl: result.providerUrl,
          status: result.status,
          result: result.result,
        },
      };
    } catch (error) {
      if (error instanceof ConnectorActionError) {
        const status =
          error.code === 'capability_denied' || error.code === 'not_connected'
            ? 403
            : error.code === 'not_found'
              ? 404
              : error.code === 'invalid_params'
                ? 400
                : 502;
        reply.code(status);
        return { error: { code: error.code, message: error.message } };
      }
      throw error;
    }
  });

  app.get('/v1/connector-actions', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = listQuery.safeParse(request.query);
    const opts = parsed.success
      ? { provider: parsed.data.provider, status: parsed.data.status, limit: parsed.data.limit }
      : { limit: 50 };
    const outcomes = await listOutcomes(db, ctx.orgId, opts);
    return {
      data: outcomes.map((o) => ({
        id: o.id,
        provider: o.provider,
        capability: o.capability,
        action: o.action,
        status: o.status,
        summary: o.summary,
        providerResourceId: o.providerResourceId,
        providerUrl: o.providerUrl,
        agentId: o.agentId,
        taskId: o.taskId,
        requiresApproval: o.requiresApproval,
        correlationId: o.correlationId,
        createdAt: o.createdAt,
      })),
    };
  });
}
