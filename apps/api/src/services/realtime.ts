/**
 * Real-time Status Service (SSE-based)
 *
 * Uses Server-Sent Events for real-time agent status updates.
 * SSE is preferred over WebSocket here because:
 * - No additional package required
 * - Works through proxies/CDNs
 * - Built-in auto-reconnect in browser EventSource
 * - Perfect for one-directional server → client updates
 *
 * Architecture:
 *   - Clients connect via GET /v1/events (SSE stream)
 *   - Server pushes events when agent tasks change status
 *   - Events are org-scoped: clients only receive their org's events
 *   - Connections are tracked per-org for efficient broadcasting
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppDeps } from '../types.js';

export type RealtimeEvent =
  | { type: 'task.started'; taskId: string; agentId: string; agentName: string }
  | { type: 'task.completed'; taskId: string; agentId: string; agentName: string; result: string }
  | { type: 'task.failed'; taskId: string; agentId: string; agentName: string; error: string }
  | { type: 'approval.created'; approvalId: string; action: string }
  | { type: 'approval.decided'; approvalId: string; status: string }
  | { type: 'approval.required'; approvalId?: string; agentName: string; toolName: string; riskLevel: string }
  | { type: 'agent.status_changed'; agentId: string; status: string }
  | { type: 'agent.notification'; agentName: string; title: string; message: string; notificationType: string }
  | { type: 'command.processed'; commandId: string; summary: string }
  | { type: 'credits.consumed'; amount: number; remaining: number; operationType: string }
  | { type: 'tool.completed'; toolId: string; toolName: string; agentName: string; durationMs: number; creditsConsumed: number }
  | { type: 'tool.failed'; toolId: string; toolName: string; agentName: string; durationMs: number; creditsConsumed: number }
  | { type: 'emergency_stop'; scope: string; agentId?: string }
  | { type: 'heartbeat'; timestamp: number }
  | { type: 'task.qa_passed'; taskId: string; summary: string }
  | { type: 'task.qa_failed'; taskId: string; summary: string }
  | { type: 'task.escalated'; taskId: string; summary: string }
  | { type: 'task.blocked'; taskId: string; summary: string }
  | { type: 'task.revision_required'; taskId: string; summary: string };

interface ClientConnection {
  reply: FastifyReply;
  orgId: string;
  userId: string;
  connectedAt: Date;
}

// In-memory connection store (per-org)
// In multi-instance deployments, this would use Redis pub/sub
const connections = new Map<string, Set<ClientConnection>>();

/**
 * Register SSE endpoint on the Fastify app.
 */
export function registerRealtimeEndpoint(app: FastifyInstance, deps: AppDeps): void {
  /**
   * GET /v1/events — SSE stream for real-time updates.
   *
   * Clients connect here and receive push events for their organization.
   * Connection is org-scoped — clients only receive events for their org.
   */
  app.get('/v1/events', async (request: FastifyRequest, reply: FastifyReply) => {
    // Authenticate — import here to avoid circular deps
    const { requireAuth } = await import('../plugins/auth.js');
    const ctx = await requireAuth(request, deps);

    // Limit per-user concurrent SSE connections to prevent memory exhaustion.
    // The web app shares ONE stream per tab (lib/realtime-client) but a user
    // legitimately has several tabs + the dev server reconnects, so the cap
    // must allow more than one stream per tab.
    const MAX_CONNECTIONS_PER_USER = 8;
    let userCount = 0;
    for (const clients of connections.values()) {
      for (const c of clients) {
        if (c.userId === ctx.userId) userCount++;
      }
    }
    if (userCount >= MAX_CONNECTIONS_PER_USER) {
      reply.code(429).send({ error: { code: 'too_many_connections', message: 'Maximum concurrent connections reached' } });
      return reply;
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection event
    const sendEvent = (event: RealtimeEvent) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected
      }
    };

    sendEvent({ type: 'heartbeat', timestamp: Date.now() });

    // Track connection
    const client: ClientConnection = {
      reply,
      orgId: ctx.orgId,
      userId: ctx.userId,
      connectedAt: new Date(),
    };

    const orgClients = connections.get(ctx.orgId) ?? new Set<ClientConnection>();
    orgClients.add(client);
    connections.set(ctx.orgId, orgClients);

    // Heartbeat every 30s to keep connection alive
    const heartbeatInterval = setInterval(() => {
      sendEvent({ type: 'heartbeat', timestamp: Date.now() });
    }, 30_000);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeatInterval);
      orgClients.delete(client);
      if (orgClients.size === 0) {
        connections.delete(ctx.orgId);
      }
    });
  });
}

/**
 * Broadcast an event to all connected clients in an organization.
 * Called by services when status changes occur.
 */
export function broadcastToOrg(orgId: string, event: RealtimeEvent): void {
  const orgClients = connections.get(orgId);
  if (!orgClients || orgClients.size === 0) return;

  const payload = `data: ${JSON.stringify(event)}\n\n`;

  for (const client of orgClients) {
    try {
      client.reply.raw.write(payload);
    } catch {
      // Client disconnected — will be cleaned up on 'close' event
    }
  }
}

/**
 * Get connection stats for monitoring.
 */
export function getConnectionStats(): { totalConnections: number; orgs: number } {
  let total = 0;
  for (const clients of connections.values()) {
    total += clients.size;
  }
  return { totalConnections: total, orgs: connections.size };
}
