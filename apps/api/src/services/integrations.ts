import { eq, and, desc } from 'drizzle-orm';
import { encryptSecret, decryptSecret } from './crypto.js';
import {
  connectorOutcomes,
  integrationProviders,
  integrationCredentials,
  integrationCapabilities,
  agentIntegrationAccess,
  type ConnectorOutcome,
  type Db,
  type IntegrationProvider,
  type NewIntegrationProvider,
  type IntegrationCredential,
  type IntegrationCapability,
  type NewIntegrationCapability,
  type NewConnectorOutcome,
  type AgentIntegrationAccess,
} from '@orq8/db';
import { appendAudit } from './audit.js';

// ─── Integration Providers ───────────────────────────────────────────────────

export async function listProviders(db: Db, orgId: string): Promise<IntegrationProvider[]> {
  return db
    .select()
    .from(integrationProviders)
    .where(eq(integrationProviders.orgId, orgId))
    .orderBy(desc(integrationProviders.updatedAt));
}

export async function getProvider(db: Db, orgId: string, id: string): Promise<IntegrationProvider | undefined> {
  const rows = await db
    .select()
    .from(integrationProviders)
    .where(and(eq(integrationProviders.id, id), eq(integrationProviders.orgId, orgId)))
    .limit(1);
  return rows[0];
}

export async function getProviderByName(db: Db, orgId: string, name: string): Promise<IntegrationProvider | undefined> {
  const rows = await db
    .select()
    .from(integrationProviders)
    .where(and(eq(integrationProviders.orgId, orgId), eq(integrationProviders.name, name)))
    .limit(1);
  return rows[0];
}

export async function createProvider(db: Db, data: NewIntegrationProvider): Promise<IntegrationProvider> {
  const rows = await db.insert(integrationProviders).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createProvider returned no row');
  await appendAudit(db, {
    orgId: data.orgId,
    actorType: 'user',
    action: 'integration.connected',
    outcome: 'success',
  });
  return row;
}

export async function updateProviderStatus(
  db: Db,
  id: string,
  status: string,
  error?: string,
): Promise<IntegrationProvider | undefined> {
  const updates: Partial<IntegrationProvider> = { status, updatedAt: new Date() };
  if (error) updates.error = error;
  const rows = await db.update(integrationProviders).set(updates).where(eq(integrationProviders.id, id)).returning();
  return rows[0];
}

export async function deleteProvider(db: Db, orgId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(integrationProviders)
    .where(and(eq(integrationProviders.id, id), eq(integrationProviders.orgId, orgId)))
    .returning({ id: integrationProviders.id });
  return rows.length > 0;
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export async function getCredentials(db: Db, providerId: string): Promise<IntegrationCredential | undefined> {
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.providerId, providerId))
    .limit(1);
  return rows[0];
}

type CredentialInput = Partial<Omit<IntegrationCredential, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>>;

export async function setCredentials(db: Db, providerId: string, data: CredentialInput): Promise<IntegrationCredential> {
  // Encrypt the secret at rest — never store tokens in plaintext.
  const encrypted = data.encryptedSecret ? encryptSecret(data.encryptedSecret) : '';
  const toStore = {
    credentialType: data.credentialType ?? 'oauth',
    encryptedSecret: encrypted,
    publicRef: data.publicRef ?? null,
    tokenExpiresAt: data.tokenExpiresAt ?? null,
    scopes: data.scopes ?? [],
    refreshTokenHash: data.refreshTokenHash ?? null,
    refreshTokenExpiresAt: data.refreshTokenExpiresAt ?? null,
  };

  // Upsert: one credential set per provider
  const [existing] = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.providerId, providerId))
    .limit(1);

  if (existing) {
    const rows = await db
      .update(integrationCredentials)
      .set({ ...toStore, providerId, updatedAt: new Date() })
      .where(eq(integrationCredentials.id, existing.id))
      .returning();
    return rows[0]!;
  }

  const rows = await db.insert(integrationCredentials).values({ ...toStore, providerId }).returning();
  return rows[0]!;
}

/**
 * Decrypt the stored secret for a credential row.
 * Returns null when the row has no secret or decryption fails.
 */
export function decryptCredentialSecret(credential: IntegrationCredential | undefined): string | null {
  if (!credential?.encryptedSecret) return null;
  return decryptSecret(credential.encryptedSecret);
}

/** Remove a provider's credentials (disconnect). Returns true if a row was removed. */
export async function deleteCredentials(db: Db, providerId: string): Promise<boolean> {
  const rows = await db
    .delete(integrationCredentials)
    .where(eq(integrationCredentials.providerId, providerId))
    .returning({ id: integrationCredentials.id });
  return rows.length > 0;
}

// ─── Capabilities ────────────────────────────────────────────────────────────

export async function listCapabilities(db: Db, providerId: string): Promise<IntegrationCapability[]> {
  return db
    .select()
    .from(integrationCapabilities)
    .where(eq(integrationCapabilities.providerId, providerId));
}

export async function getCapability(
  db: Db,
  providerId: string,
  capability: string,
): Promise<IntegrationCapability | undefined> {
  const rows = await db
    .select()
    .from(integrationCapabilities)
    .where(
      and(
        eq(integrationCapabilities.providerId, providerId),
        eq(integrationCapabilities.capability, capability),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function upsertCapability(db: Db, data: NewIntegrationCapability): Promise<IntegrationCapability> {
  const [existing] = await db
    .select()
    .from(integrationCapabilities)
    .where(
      and(
        eq(integrationCapabilities.providerId, data.providerId),
        eq(integrationCapabilities.capability, data.capability),
      ),
    )
    .limit(1);

  if (existing) {
    const rows = await db
      .update(integrationCapabilities)
      .set(data)
      .where(eq(integrationCapabilities.id, existing.id))
      .returning();
    return rows[0]!;
  }

  const rows = await db.insert(integrationCapabilities).values(data).returning();
  return rows[0]!;
}

// ─── Agent Integration Access ────────────────────────────────────────────────

export async function listAgentAccess(db: Db, orgId: string, agentId: string): Promise<AgentIntegrationAccess[]> {
  return db
    .select()
    .from(agentIntegrationAccess)
    .where(and(eq(agentIntegrationAccess.orgId, orgId), eq(agentIntegrationAccess.agentId, agentId)));
}

export async function getAgentAccess(
  db: Db,
  orgId: string,
  agentId: string,
  providerId: string,
): Promise<AgentIntegrationAccess | undefined> {
  const rows = await db
    .select()
    .from(agentIntegrationAccess)
    .where(
      and(
        eq(agentIntegrationAccess.orgId, orgId),
        eq(agentIntegrationAccess.agentId, agentId),
        eq(agentIntegrationAccess.providerId, providerId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function grantAgentAccess(
  db: Db,
  data: Omit<AgentIntegrationAccess, 'id' | 'createdAt'>,
): Promise<AgentIntegrationAccess> {
  // Upsert
  const [existing] = await db
    .select()
    .from(agentIntegrationAccess)
    .where(
      and(
        eq(agentIntegrationAccess.orgId, data.orgId),
        eq(agentIntegrationAccess.agentId, data.agentId),
        eq(agentIntegrationAccess.providerId, data.providerId),
      ),
    )
    .limit(1);

  if (existing) {
    const rows = await db
      .update(agentIntegrationAccess)
      .set({ ...data, capabilities: data.capabilities })
      .where(eq(agentIntegrationAccess.id, existing.id))
      .returning();
    return rows[0]!;
  }

  const rows = await db.insert(agentIntegrationAccess).values(data).returning();
  return rows[0]!;
}

export async function revokeAgentAccess(db: Db, orgId: string, agentId: string, providerId: string): Promise<boolean> {
  const rows = await db
    .delete(agentIntegrationAccess)
    .where(
      and(
        eq(agentIntegrationAccess.orgId, orgId),
        eq(agentIntegrationAccess.agentId, agentId),
        eq(agentIntegrationAccess.providerId, providerId),
      ),
    )
    .returning({ id: agentIntegrationAccess.id });
  return rows.length > 0;
}

// ─── Structured Outcome Capture (Phase 5) ────────────────────────────────────

/**
 * Record the normalized outcome of a connector action. This is the structured
 * record agents' tool calls feed into — it answers what was attempted, what
 * happened, and what external resource changed, and becomes part of company
 * memory and the executive briefing. Never store raw provider payloads here.
 */
export async function recordOutcome(db: Db, data: NewConnectorOutcome): Promise<ConnectorOutcome> {
  const rows = await db.insert(connectorOutcomes).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('recordOutcome returned no row');
  return row;
}

export async function listOutcomes(
  db: Db,
  orgId: string,
  opts: { limit?: number; provider?: string; status?: string } = {},
): Promise<ConnectorOutcome[]> {
  const conditions = [eq(connectorOutcomes.orgId, orgId)];
  if (opts.provider) conditions.push(eq(connectorOutcomes.provider, opts.provider));
  if (opts.status) conditions.push(eq(connectorOutcomes.status, opts.status));
  return db
    .select()
    .from(connectorOutcomes)
    .where(and(...conditions))
    .orderBy(desc(connectorOutcomes.createdAt))
    .limit(opts.limit ?? 50);
}

// ─── Capability Enforcement ──────────────────────────────────────────────────

export async function canAgentUseCapability(
  db: Db,
  orgId: string,
  agentId: string,
  providerName: string,
  capability: string,
): Promise<{ allowed: boolean; requiresApproval: boolean; provider?: IntegrationProvider }> {
  // Look up the provider
  const provider = await getProviderByName(db, orgId, providerName);
  if (!provider) return { allowed: false, requiresApproval: false };

  // Check agent has access to this provider
  const access = await getAgentAccess(db, orgId, agentId, provider.id);
  if (!access) return { allowed: false, requiresApproval: false, provider };

  // Check capability is in agent's allowed capabilities
  const allowedCapabilities = Array.isArray(access.capabilities)
    ? (access.capabilities as string[])
    : [];
  if (!allowedCapabilities.includes(capability)) {
    return { allowed: false, requiresApproval: false, provider };
  }

  // Check capability-level enforcement
  const cap = await getCapability(db, provider.id, capability);
  if (cap && !cap.allowed) {
    return { allowed: false, requiresApproval: false, provider };
  }

  const approvalRequiredFor = Array.isArray(cap?.approvalRequiredFor)
    ? (cap!.approvalRequiredFor as string[])
    : [];
  const requiresApproval = approvalRequiredFor.includes(capability);
  return { allowed: true, requiresApproval, provider };
}
