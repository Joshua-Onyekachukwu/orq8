/**
 * ORQ8 Emergency Stop System
 *
 * The founder must be able to immediately halt all AI workforce activity.
 *
 * Two scopes:
 *   1. Global stop — pauses ALL agents in the organization
 *   2. Agent stop — pauses a specific agent
 *
 * Emergency stop:
 *   - Immediately marks agents as paused
 *   - Broadcasts stop event via SSE
 *   - Records audit trail
 *   - Prevents new task execution
 *   - Existing running tasks complete naturally (no kill switch for LLM calls)
 */

import { eq, and } from 'drizzle-orm';
import { agents, activityEvents, type Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import { broadcastToOrg } from './realtime.js';

export interface EmergencyStopResult {
  scope: 'global' | 'agent';
  agentsAffected: number;
  agentIds: string[];
  timestamp: Date;
}

/**
 * Emergency stop — pause all agents in an organization.
 * Returns the number of agents that were paused.
 */
export async function emergencyStopAll(
  db: Db,
  orgId: string,
  userId: string,
): Promise<EmergencyStopResult> {
  // Find all active agents
  const activeAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.status, 'active')));

  if (activeAgents.length === 0) {
    return {
      scope: 'global',
      agentsAffected: 0,
      agentIds: [],
      timestamp: new Date(),
    };
  }

  // Pause all active agents
  const agentIds = activeAgents.map(a => a.id);
  await db
    .update(agents)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(and(eq(agents.orgId, orgId), eq(agents.status, 'active')));

  // Record activity for each agent
  for (const agentId of agentIds) {
    await db.insert(activityEvents).values({
      orgId,
      agentId,
      type: 'paused',
      summary: 'Emergency stop: agent paused by founder',
      reason: 'Founder activated emergency stop',
      cost: 0,
      department: null,
    }).catch(() => {});
  }

  // Audit trail
  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'emergency_stop.all',
    outcome: 'success',
    cost: 0,
  }).catch(() => {});

  // Broadcast stop event
  broadcastToOrg(orgId, {
    type: 'emergency_stop',
    scope: 'global',
  });

  return {
    scope: 'global',
    agentsAffected: agentIds.length,
    agentIds,
    timestamp: new Date(),
  };
}

/**
 * Emergency stop — pause a specific agent.
 */
export async function emergencyStopAgent(
  db: Db,
  orgId: string,
  agentId: string,
  userId: string,
): Promise<EmergencyStopResult> {
  // Find the agent
  const [agent] = await db
    .select({ id: agents.id, status: agents.status, name: agents.name })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)))
    .limit(1);

  if (!agent) {
    return {
      scope: 'agent',
      agentsAffected: 0,
      agentIds: [],
      timestamp: new Date(),
    };
  }

  // Pause the agent
  await db
    .update(agents)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  // Record activity
  await db.insert(activityEvents).values({
    orgId,
    agentId,
    type: 'paused',
    summary: `Emergency stop: ${agent.name} paused by founder`,
    reason: 'Founder activated emergency stop',
    cost: 0,
    department: null,
  }).catch(() => {});

  // Audit trail
  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'emergency_stop.agent',
    outcome: 'success',
    cost: 0,
  }).catch(() => {});

  // Broadcast stop event
  broadcastToOrg(orgId, {
    type: 'emergency_stop',
    scope: 'agent',
    agentId,
  });

  return {
    scope: 'agent',
    agentsAffected: 1,
    agentIds: [agentId],
    timestamp: new Date(),
  };
}

/**
 * Resume all paused agents in an organization.
 */
export async function resumeAllAgents(
  db: Db,
  orgId: string,
  userId: string,
): Promise<{ resumed: number }> {
  const pausedAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.status, 'paused')));

  if (pausedAgents.length === 0) {
    return { resumed: 0 };
  }

  await db
    .update(agents)
    .set({ status: 'active', updatedAt: new Date() })
    .where(and(eq(agents.orgId, orgId), eq(agents.status, 'paused')));

  // Audit
  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'resume.all',
    outcome: 'success',
    cost: 0,
  }).catch(() => {});

  return { resumed: pausedAgents.length };
}

/**
 * Resume a specific paused agent.
 */
export async function resumeAgent(
  db: Db,
  orgId: string,
  agentId: string,
  userId: string,
): Promise<boolean> {
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId), eq(agents.status, 'paused')))
    .limit(1);

  if (!agent) return false;

  await db
    .update(agents)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  // Audit
  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'resume.agent',
    outcome: 'success',
    cost: 0,
  }).catch(() => {});

  return true;
}
