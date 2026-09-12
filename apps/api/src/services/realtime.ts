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
  | { type: 'task.deferred'; taskId: string; message: string }
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
  /** Flips false the first time a write fails — dead connection, pending cleanup. */
  alive: boolean;
}

// In-memory connection store (per-org)
// In multi-instance deployments, this would use Redis pub/sub
const connections = new Map<string, Set<ClientConnection>>();

/** Max concurrent SSE streams per user. Live tabs need only a few; anything
 * beyond the cap is almost certainly a leaked/zombie connection from a
 * navigated-away page (proxy chains can swallow the close event), so the
 * eviction policy below treats overflow as staleness, not abuse. */
const MAX_CONNECTIONS_PER_USER = 8;

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

    // Collect this user's existing connections across all orgs (oldest first).
    const mine: ClientConnection[] = [];
    for (const clients of connections.values()) {
      for (const c of clients) {
        if (c.userId === ctx.userId) mine.push(c);
      }
    }
    mine.sort((a, b) => a.connectedAt.getTime() - b.connectedAt.getTime());

    // Self-healing eviction: when at cap, drop the user's OLDEST connections —
    // a live tab always opens its connection after the zombies it left behind
    // on navigated-away pages (proxies often never fire the close event, and
    // failed heartbeats used to leave those rows registered forever — the cap
    // then 429'd every subsequent page load). Evicting oldest guarantees a
    // fresh page always gets its stream.
    if (mine.length >= MAX_CONNECTIONS_PER_USER) {
      const evictCount = mine.length - MAX_CONNECTIONS_PER_USER + 1;
      for (const dead of mine.slice(0, evictCount)) {
        dead.alive = false;
        for (const clients of connections.values()) clients.delete(dead);
      }
      for (const [orgId, clients] of connections) {
        if (clients.size === 0) connections.delete(orgId);
      }
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Track connection
    const client: ClientConnection = {
      reply,
      orgId: ctx.orgId,
      userId: ctx.userId,
      connectedAt: new Date(),
      alive: true,
    };

    const orgClients = connections.get(ctx.orgId) ?? new Set<ClientConnection>();
    orgClients.add(client);
    connections.set(ctx.orgId, orgClients);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeatInterval);
      orgClients.delete(client);
      if (orgClients.size === 0) {
        connections.delete(ctx.orgId);
      }
    };

    // Send initial connection event
    const sendEvent = (event: RealtimeEvent) => {
      if (!client.alive) return;
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Write failure = dead connection (navigated-away tab whose close
        // event never propagated through the proxy chain). Mark and clean up
        // — swallowing this used to leak the connection permanently.
        client.alive = false;
        cleanup();
      }
    };

    sendEvent({ type: 'heartbeat', timestamp: Date.now() });

    // Heartbeat every 30s to keep connection alive; doubles as liveness probe —
    // a connection whose writes fail is removed instead of leaking.
    const heartbeatInterval = setInterval(() => {
      sendEvent({ type: 'heartbeat', timestamp: Date.now() });
    }, 30_000);

    // Cleanup on disconnect (idempotent — also fires via sendEvent failure).
    request.raw.on('close', cleanup);
    reply.raw.on('error', cleanup);
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

  for (const client of [...orgClients]) {
    if (!client.alive) continue;
    try {
      client.reply.raw.write(payload);
    } catch {
      // Dead connection (close event may never fire through proxy chains) —
      // mark it; the next connection handshake or heartbeat reaps it.
      client.alive = false;
      orgClients.delete(client);
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
