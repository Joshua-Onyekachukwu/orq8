import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { enforceResourceLimit } from '../services/entitlements.js';
import {
  listMcpServers,
  getMcpServer,
  registerMcpServer,
  updateMcpServer,
  deleteMcpServer,
  listMcpTools,
  discoverMcpTools,
  checkMcpToolPermission,
  executeMcpTool,
  MCP_PROVIDERS,
} from '../services/mcp.js';
import { appendAudit } from '../services/audit.js';
import { findByOrg as listOrgAgents } from '../services/agents.js';
import type { AppDeps } from '../types.js';

const serverBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  provider: z.string().trim().min(1).max(50),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  allowedAgents: z.array(z.string().uuid()).max(100).optional(),
});

const updateBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(['unconfigured', 'connected', 'degraded', 'error']).optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  allowedAgents: z.array(z.string().uuid()).max(100).optional(),
  enabled: z.boolean().optional(),
});

const executeBody = z.object({
  toolId: z.string().uuid(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export function registerMcpRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List MCP servers for the org. */
  app.get('/v1/mcp/servers', async (request) => {
    const ctx = await requireAuth(request, deps);
    const servers = await listMcpServers(db, ctx.orgId);
    const out = [];
    for (const server of servers) {
      const tools = await listMcpTools(db, server.id);
      out.push({ ...server, tools });
    }
    return { data: out };
  });

  /** Register a connector-backed (or custom) MCP server. */
  app.post('/v1/mcp/servers', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = serverBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const isConnector = (MCP_PROVIDERS as readonly string[]).includes(parsed.data.provider);
    if (!isConnector && !parsed.data.description) {
      reply.code(400);
      return { error: { code: 'custom_server_requires_description', message: 'Custom MCP servers must include a description; only connector-backed providers (github | gmail | linear) are executable.' } };
    }

    // Custom MCP servers consume the plan's MCP entitlement (connector-backed
    // catalogs are bounded by the connectors cap instead).
    if (!isConnector) await enforceResourceLimit(db, ctx.orgId, 'mcp');

    const server = await registerMcpServer(db, {
      orgId: ctx.orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      provider: parsed.data.provider,
      riskLevel: parsed.data.riskLevel,
      allowedAgents: parsed.data.allowedAgents,
    });
    const tools = await listMcpTools(db, server.id);
    reply.code(201);
    return { data: { ...server, tools } };
  });

  /** Update a server (status, risk, allowlist, enabled). */
  app.patch<{ Params: { id: string } }>('/v1/mcp/servers/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const server = await updateMcpServer(db, ctx.orgId, request.params.id, parsed.data);
    if (!server) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'MCP server not found' } };
    }
    return { data: server };
  });

  /** Delete a server (and its tools via cascade). */
  app.delete<{ Params: { id: string } }>('/v1/mcp/servers/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const removed = await deleteMcpServer(db, ctx.orgId, request.params.id);
    if (!removed) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'MCP server not found' } };
    }
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'mcp.server_removed',
      outcome: 'success',
    });
    reply.code(204);
    return {};
  });

  /** Discover tools an agent may invoke (server-side filtered). */
  app.get('/v1/mcp/discover', async (request) => {
    const ctx = await requireAuth(request, deps);
    const q = request.query as { agentId?: string };
    const agentId = q.agentId ?? ctx.userId; // founder view: user-scoped discovery returns tools for org agents
    const agents = await listOrgAgents(db, ctx.orgId);
    const agent = agentId === ctx.userId ? agents[0] : agents.find((a) => a.id === agentId);

    if (agents.length === 0) return { data: { agentId: null, tools: [] } };
    const target = agent ?? agents[0]!;
    const capabilities = Array.isArray(target.capabilities) ? (target.capabilities as string[]) : [];
    const tools = await discoverMcpTools(db, ctx.orgId, target.id, capabilities);
    return { data: { agentId: target.id, agentName: target.name, tools } };
  });

  /** Permission check for a specific tool (used by agent context + UI). */
  app.get<{ Params: { toolId: string } }>('/v1/mcp/permissions/:toolId', async (request) => {
    const ctx = await requireAuth(request, deps);
    const q = request.query as { agentId?: string };
    const agents = await listOrgAgents(db, ctx.orgId);
    const agent = agents.find((a) => a.id === q.agentId) ?? agents[0];
    if (!agent) {
      return { data: { allowed: false, requiresApproval: false, reason: 'no_agents' } };
    }
    const capabilities = Array.isArray(agent.capabilities) ? (agent.capabilities as string[]) : [];
    const permission = await checkMcpToolPermission(db, ctx.orgId, agent.id, request.params.toolId, capabilities);
    return { data: { ...permission, agentId: agent.id } };
  });

  /** Execute a tool through the connector-action chain. */
  app.post<{ Body: z.infer<typeof executeBody> }>('/v1/mcp/execute', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = executeBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const agents = await listOrgAgents(db, ctx.orgId);
    const agent = agents.find((a) => a.id === ctx.userId) ?? agents[0];
    if (!agent) {
      reply.code(400);
      return { error: { code: 'no_agents', message: 'No AI employees exist in this organization yet' } };
    }
    const capabilities = Array.isArray(agent.capabilities) ? (agent.capabilities as string[]) : [];

    const result = await executeMcpTool(
      db,
      { orgId: ctx.orgId, agentId: agent.id, userId: ctx.userId },
      parsed.data.toolId,
      parsed.data.params ?? {},
      capabilities,
    );

    if (result.status === 'error') {
      reply.code(result.code === 'approval_required' || result.code === 'capability_denied' ? 403 : 400);
      return { error: { code: result.code, message: result.message } };
    }
    return { data: result };
  });

  /** Server detail with tools. */
  app.get<{ Params: { id: string } }>('/v1/mcp/servers/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const server = await getMcpServer(db, ctx.orgId, request.params.id);
    if (!server) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'MCP server not found' } };
    }
    const tools = await listMcpTools(db, server.id);
    return { data: { ...server, tools } };
  });
}