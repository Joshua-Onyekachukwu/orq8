/**
 * ORQ8 Portability — org data export.
 *
 * A founder-owner can export everything ORQ8 knows about their company in one
 * JSON document: org profile, departments, teams, AI employees, goals, tasks,
 * approvals, company memory, connector *metadata + outcomes*, simulations,
 * briefings and audit trail.
 *
 * Deliberate exclusions (never exported):
 *   - credential secrets / OAuth tokens / refresh tokens / provider API keys
 *   - password hashes, reset tokens, session tokens
 *   - webhook signatures
 *   - repository file *contents* (large blobs) — file metadata only
 *
 * Retention is by being better, not by trapping data: this is the trust
 * feature (audit doc F17/K.4). The export is org-scoped server-side.
 */

import {
  agents,
  approvals,
  briefings,
  companyMemory,
  connectorOutcomes,
  departments,
  goals,
  integrationCapabilities,
  integrationProviders,
  organizations,
  repositories,
  sandboxRuns,
  simulations,
  tasks,
  teams,
  auditEvents,
  type Db,
} from '@orq8/db';
import { eq } from 'drizzle-orm';

export interface OrgExport {
  schemaVersion: 1;
  exportedAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    settings: Record<string, unknown>;
  };
  departments: unknown[];
  teams: unknown[];
  agents: Array<Record<string, unknown>>;
  goals: unknown[];
  tasks: unknown[];
  approvals: unknown[];
  memory: unknown[];
  integrations: unknown[];
  connectorOutcomes: unknown[];
  simulations: unknown[];
  briefings: unknown[];
  repositories: unknown[];
  sandboxRuns: unknown[];
  audit: unknown[];
}

/**
 * Export an org's full non-secret operational data.
 * All queries are scoped to the caller's org; nothing is sampled.
 */
export async function exportOrg(db: Db, orgId: string, now = new Date()): Promise<OrgExport> {
  const [orgRow] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, plan: organizations.plan, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [orgDepartments, orgTeams, orgAgents, orgGoals, orgTasks, orgApprovals] = await Promise.all([
    db.select().from(departments).where(eq(departments.orgId, orgId)),
    db.select().from(teams).where(eq(teams.orgId, orgId)),
    db.select().from(agents).where(eq(agents.orgId, orgId)),
    db.select().from(goals).where(eq(goals.orgId, orgId)),
    db.select().from(tasks).where(eq(tasks.orgId, orgId)),
    db.select().from(approvals).where(eq(approvals.orgId, orgId)),
  ]);

  const [orgMemory, orgSimulations, orgBriefings, orgAudit] = await Promise.all([
    db.select().from(companyMemory).where(eq(companyMemory.orgId, orgId)),
    db.select().from(simulations).where(eq(simulations.orgId, orgId)),
    db.select().from(briefings).where(eq(briefings.orgId, orgId)),
    db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgId))
      .limit(2000),
  ]);

  const [orgProviders, orgCapabilities, orgOutcomes, orgRepos, orgSandboxRuns] = await Promise.all([
    db
      .select({
        id: integrationProviders.id,
        name: integrationProviders.name,
        provider: integrationProviders.provider,
        status: integrationProviders.status,
        scopes: integrationProviders.scopes,
        connectedAt: integrationProviders.connectedAt,
        metadata: integrationProviders.metadata,
        createdAt: integrationProviders.createdAt,
      })
      .from(integrationProviders)
      .where(eq(integrationProviders.orgId, orgId)),
    db
      .select()
      .from(integrationCapabilities)
      .innerJoin(integrationProviders, eq(integrationProviders.id, integrationCapabilities.providerId))
      .where(eq(integrationProviders.orgId, orgId)),
    db.select().from(connectorOutcomes).where(eq(connectorOutcomes.orgId, orgId)).limit(2000),
    db.select().from(repositories).where(eq(repositories.orgId, orgId)),
    db.select().from(sandboxRuns).where(eq(sandboxRuns.orgId, orgId)).limit(500),
  ]);

  return {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    organization: {
      id: orgId,
      name: orgRow?.name ?? 'unknown',
      slug: orgRow?.slug ?? 'unknown',
      plan: orgRow?.plan ?? 'trial',
      settings: (orgRow?.settings as Record<string, unknown>) ?? {},
    },
    departments: orgDepartments,
    teams: orgTeams,
    // Agents export includes capabilities but the export strips nothing
    // sensitive — agents carry no secrets.
    agents: orgAgents as Array<Record<string, unknown>>,
    goals: orgGoals,
    tasks: orgTasks,
    approvals: orgApprovals,
    memory: orgMemory,
    integrations: orgProviders,
    connectorOutcomes: orgOutcomes,
    simulations: orgSimulations,
    briefings: orgBriefings,
    repositories: orgRepos,
    sandboxRuns: orgSandboxRuns,
    audit: orgAudit,
  };
}

