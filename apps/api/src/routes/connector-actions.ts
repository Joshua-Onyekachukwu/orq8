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
import { enforceAutonomy, normalizeAutonomyLevel, type AutonomyLevel, type ActionClass } from '../services/autonomy.js';
import { eq } from 'drizzle-orm';
import { agents } from '@orq8/db';
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

    // F12 — autonomy gate: read the agent's DB row server-side and map the
    // action to an action class before anything dispatches. A frontend toggle
    // can never authorize a connector action.
    const [agentRow] = await db
      .select({ autonomyLevel: agents.autonomyLevel, orgId: agents.orgId, status: agents.status })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    if (!agentRow || agentRow.orgId !== ctx.orgId) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Agent not found in this organization' } };
    }
    if (agentRow.status === 'paused') {
      reply.code(403);
      return { error: { code: 'agent_paused', message: 'Agent is paused — resume it before executing connector actions.' } };
    }

    // Map (provider, action) → action class: reads are observation, drafts stay
    // drafts, writes/publishes need execute-with-approval or higher.
    const readActions = new Set(['list_repositories', 'list_issues', 'read_file', 'search', 'get_issue']);
    const draftActions = new Set(['create_draft']);
    const actionClass: ActionClass = readActions.has(action)
      ? 'connector_read'
      : draftActions.has(action)
        ? 'draft_external'
        : provider === 'gmail' && action === 'send_draft'
          ? 'external_communicate'
          : 'connector_action';

    const level: AutonomyLevel = normalizeAutonomyLevel(agentRow.autonomyLevel);
    const autonomy = enforceAutonomy(level, actionClass);
    if (!autonomy.allowed) {
      reply.code(403);
      return { error: { code: 'autonomy_denied', message: autonomy.reason } };
    }

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
