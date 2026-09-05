import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { validation } from '@orq8/core';
import {
  type Db,
  type NewIntegrationProvider,
  type IntegrationProvider,
  type NewIntegrationCapability,
  type IntegrationCapability,
  type AgentIntegrationAccess,
} from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import {
  listProviders,
  getProvider,
  getProviderByName,
  createProvider,
  updateProviderStatus,
  deleteProvider,
  getCredentials,
  decryptCredentialSecret,
  setCredentials,
  deleteCredentials,
  listCapabilities,
  getCapability,
  upsertCapability,
  listAgentAccess,
  getAgentAccess,
  grantAgentAccess,
  revokeAgentAccess,
  canAgentUseCapability,
} from '../services/integrations.js';
import {
  buildGitHubAuthorizeUrl,
  verifyOAuthState,
  isValidRedirectUri,
  exchangeGitHubCode,
  githubHealthCheck,
} from '../services/oauth.js';
import type { AppDeps } from '../types.js';

const providerBody = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.string().trim().min(1).max(50), // github | gmail | linear | jira | ...
  scopes: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const patchProviderBody = z.object({
  status: z.enum(['connected', 'connecting', 'disconnected', 'error']).optional(),
  error: z.string().max(500).optional(),
});

const oauthCallbackBody = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
  redirectUri: z.string().trim().min(1).optional(),
});

const connectBody = z.object({
  accessToken: z.string().trim().min(1),
  tokenExpiresAt: z.string().datetime().optional().nullable(),
  scopes: z.array(z.string()).optional(),
  publicRef: z.string().max(200).optional().nullable(),
});

const capabilityBody = z.object({
  providerId: z.string().uuid(),
  capability: z.string().trim().min(1).max(100),
  allowed: z.boolean().default(true),
  approvalRequiredFor: z.boolean().default(false),
  description: z.string().max(500).optional(),
});

const agentAccessBody = z.object({
  agentId: z.string().uuid(),
  providerId: z.string().uuid(),
  capabilities: z.array(z.string()).default([]),
});

export function registerIntegrationRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  // ─── Providers ─────────────────────────────────────────────────────────────

  app.get('/v1/integrations', async (request) => {
    const ctx = await requireAuth(request, deps);
    const providers = await listProviders(db, ctx.orgId);
    return { data: providers };
  });

  app.get<{ Params: { id: string } }>('/v1/integrations/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const provider = await getProvider(db, ctx.orgId, request.params.id);
    if (!provider) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }
    return { data: provider };
  });

  app.post('/v1/integrations', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = providerBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const existing = await getProviderByName(db, ctx.orgId, parsed.data.provider);
    if (existing) {
      return { data: existing, message: 'Integration already exists. Use the reconnect flow.' };
    }

    const provider = await createProvider(db, {
      orgId: ctx.orgId,
      ...parsed.data,
      status: 'disconnected',
    } as NewIntegrationProvider);

    reply.code(201);
    return { data: provider };
  });

  app.patch<{ Params: { id: string } }>('/v1/integrations/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const provider = await getProvider(db, ctx.orgId, request.params.id);
    if (!provider) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }

    const parsed = patchProviderBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    if (parsed.data.status) {
      const updated = await updateProviderStatus(db, request.params.id, parsed.data.status, parsed.data.error);
      return { data: updated };
    }

    return { data: provider };
  });

  app.delete<{ Params: { id: string } }>('/v1/integrations/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const deleted = await deleteProvider(db, ctx.orgId, request.params.id);
    if (!deleted) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'integration.disconnected',
      outcome: 'success',
    });
    return { data: { deleted: true } };
  });

  // ─── GitHub OAuth ─────────────────────────────────────────────────────────

  /** Authorize — returns the GitHub authorization URL with an HMAC-signed state. */
  app.get<{ Params: { id: string } }>('/v1/integrations/:id/oauth/authorize', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const provider = await getProvider(db, ctx.orgId, request.params.id);
    if (!provider) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }

    const url = new URL(request.url, 'http://localhost');
    const redirectUri = url.searchParams.get('redirect_uri');
    if (!redirectUri || !isValidRedirectUri(deps.config, redirectUri)) {
      reply.code(400);
      return { error: { code: 'bad_request', message: 'redirect_uri is required and must match the configured app origin' } };
    }

    try {
      const authorizeUrl = buildGitHubAuthorizeUrl(deps.config, provider.id, ctx.orgId, redirectUri);
      await updateProviderStatus(db, provider.id, 'connecting');
      return { data: { url: authorizeUrl, providerId: provider.id } };
    } catch (err) {
      reply.code(503);
      return {
        error: {
          code: 'not_configured',
          message: err instanceof Error ? err.message : 'GitHub OAuth is not configured',
        },
      };
    }
  });

  /** Callback — verify state, exchange the code server-side, store encrypted, mark connected. */
  app.post<{ Params: { id: string } }>('/v1/integrations/:id/oauth/callback', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const provider = await getProvider(db, ctx.orgId, request.params.id);
    if (!provider) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }

    const parsed = oauthCallbackBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // State validation: must be signed, unexpired, and bound to THIS org + provider.
    const state = typeof parsed.data.state === 'string' ? parsed.data.state : '';
    const payload = verifyOAuthState(deps.config, state);
    if (!payload || payload.orgId !== ctx.orgId || payload.providerId !== provider.id) {
      reply.code(400);
      return { error: { code: 'invalid_state', message: 'Invalid or expired OAuth state. Start a new connection.' } };
    }

    const redirectUri = parsed.data.redirectUri ?? '';
    if (!redirectUri || !isValidRedirectUri(deps.config, redirectUri)) {
      reply.code(400);
      return { error: { code: 'bad_request', message: 'redirect_uri is required and must match the configured app origin' } };
    }

    try {
      const token = await exchangeGitHubCode(deps.config, parsed.data.code, redirectUri);

      // Store encrypted at rest (services/integrations.setCredentials → crypto.ts)
      await setCredentials(db, provider.id, {
        credentialType: 'oauth',
        encryptedSecret: token.accessToken,
        publicRef: provider.name,
        tokenExpiresAt: token.expiresAt,
        scopes: token.scope ? token.scope.split(',').map((s) => s.trim()) : [],
      });

      const health = await githubHealthCheck(token.accessToken);
      await updateProviderStatus(db, provider.id, health.healthy ? 'connected' : 'error', health.error);

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'integration.connected',
        outcome: health.healthy ? 'success' : 'degraded',
      });

      return {
        data: {
          connected: health.healthy,
          providerId: provider.id,
          health: health.healthy ? 'healthy' : 'error',
          login: health.login,
        },
      };
    } catch (err) {
      reply.code(502);
      return {
        error: { code: 'exchange_failed', message: err instanceof Error ? err.message : 'OAuth exchange failed' },
      };
    }
  });

  /** Health — decrypt the stored token and probe the provider API. Returns no secrets. */
  app.get<{ Params: { id: string } }>('/v1/integrations/:id/health', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const provider = await getProvider(db, ctx.orgId, request.params.id);
    if (!provider) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }

    const credential = await getCredentials(db, provider.id);
    const accessToken = decryptCredentialSecret(credential);
    if (!accessToken) {
      await updateProviderStatus(db, provider.id, 'disconnected');
      return { data: { status: 'disconnected', providerId: provider.id } };
    }

    const health = await githubHealthCheck(accessToken);
    await updateProviderStatus(db, provider.id, health.healthy ? 'connected' : 'error', health.error);
    return {
      data: {
        status: health.healthy ? 'connected' : 'error',
        healthy: health.healthy,
        login: health.login,
        scopes: health.scopes,
        providerId: provider.id,
        lastCheckedAt: new Date().toISOString(),
      },
    };
  });

  /** Disconnect — remove stored credentials, mark disconnected, audit. */
  app.post<{ Params: { id: string } }>('/v1/integrations/:id/oauth/disconnect', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const provider = await getProvider(db, ctx.orgId, request.params.id);
    if (!provider) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }

    await deleteCredentials(db, provider.id);
    await updateProviderStatus(db, provider.id, 'disconnected');
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'integration.disconnected',
      outcome: 'success',
    });
    return { data: { disconnected: true, providerId: provider.id } };
  });

  app.post<{ Params: { id: string } }>('/v1/integrations/:id/connect', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const provider = await getProvider(db, ctx.orgId, request.params.id);
    if (!provider) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Integration not found' } };
    }

    const parsed = connectBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Store credentials — encrypted at rest via the crypto service.
    await setCredentials(db, provider.id, {
      credentialType: 'oauth',
      encryptedSecret: parsed.data.accessToken,
      publicRef: parsed.data.publicRef ?? null,
      tokenExpiresAt: parsed.data.tokenExpiresAt ? new Date(parsed.data.tokenExpiresAt) : null,
      scopes: parsed.data.scopes,
    });

    await updateProviderStatus(db, provider.id, 'connected');
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'integration.connected',
      outcome: 'success',
    });

    return { data: { connected: true, providerId: provider.id } };
  });

  // ─── Capabilities ──────────────────────────────────────────────────────────

  app.get<{ Params: { providerId: string } }>('/v1/integrations/:providerId/capabilities', async (request) => {
    const ctx = await requireAuth(request, deps);
    const provider = await getProvider(db, ctx.orgId, request.params.providerId);
    if (!provider) {
      throw new Error('Integration not found');
    }
    const capabilities = await listCapabilities(db, request.params.providerId);
    return { data: capabilities };
  });

  app.post('/v1/integration-capabilities', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = capabilityBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const capability = await upsertCapability(db, {
      providerId: parsed.data.providerId,
      capability: parsed.data.capability,
      allowed: parsed.data.allowed,
      approvalRequiredFor: parsed.data.approvalRequiredFor ? [parsed.data.capability] : undefined,
      description: parsed.data.description,
    } as NewIntegrationCapability);

    reply.code(201);
    return { data: capability };
  });

  // ─── Agent Integration Access ──────────────────────────────────────────────

  app.get<{ Params: { agentId: string } }>('/v1/agents/:agentId/integration-access', async (request) => {
    const ctx = await requireAuth(request, deps);
    const access = await listAgentAccess(db, ctx.orgId, request.params.agentId);
    return { data: access };
  });

  app.post('/v1/agent-integration-access', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = agentAccessBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const access = await grantAgentAccess(db, {
      orgId: ctx.orgId,
      ...parsed.data,
    });

    reply.code(201);
    return { data: access };
  });

  app.delete('/v1/agent-integration-access', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const body = request.body as { agentId: string; providerId: string };
    if (!body.agentId || !body.providerId) {
      reply.code(400);
      return { error: { code: 'bad_request', message: 'agentId and providerId required' } };
    }

    const revoked = await revokeAgentAccess(db, ctx.orgId, body.agentId, body.providerId);
    return { data: { revoked } };
  });

  // ─── Capability Check ──────────────────────────────────────────────────────

  app.get('/v1/integrations/can-use', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const providerName = url.searchParams.get('provider');
    const capability = url.searchParams.get('capability');
    const agentId = url.searchParams.get('agentId');

    if (!providerName || !capability || !agentId) {
      return { error: { code: 'bad_request', message: 'provider, capability, and agentId query params required' } };
    }

    const result = await canAgentUseCapability(db, ctx.orgId, agentId, providerName, capability);
    return { data: result };
  });
}
