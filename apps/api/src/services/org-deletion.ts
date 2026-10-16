/**
 * ORQ8 account close — organization deletion (AUD-004, docs/38.4).
 *
 * Deletion workflow per doc 38.4: staging (pause) → export → purge → confirm.
 * The route layer owns staging (typed slug confirmation) and the export lives
 * in `services/portability.ts` (`GET /v1/settings/export`). This service owns
 * purge + confirm:
 *
 *   1. Snapshot the export first (caller's proof of what left the building).
 *   2. Append the `org.deleted` audit entry through the normal append-only
 *      pipeline and read it back — the receipt below is the durable proof,
 *      because step 3 erases the entry itself along with every other org row
 *      (erasure must include audit rows that carry actor ids).
 *   3. Delete every org-scoped row in dependency-safe order (children before
 *      parents — the schema mixes `onDelete: cascade` and plain FKs, so the
 *      order here, not the database, is the authority), revoke all sessions
 *      (DB + Redis cache), remove file blobs, delete the organization row.
 *   4. Remove user accounts left with zero memberships (login row, password
 *      hashes, tokens) after nulling their nullable references in OTHER orgs'
 *      rows — erasure for the founder closing their only company, without
 *      corrupting companies they once touched.
 *
 * Deliberately NOT deleted (platform scope, not company data):
 *   - `providers` catalog, system templates (`org_id IS NULL`), `job_runs`,
 *     `waitlist_*` funnel rows. Waitlist rows are pre-org marketing records;
 *     erasing them is a separate platform-admin operation.
 *
 * The deletes are idempotent: re-running a half-finished purge removes what is
 * left and reports smaller counts. That is the crash story — there is no
 * distributed transaction across Postgres, Redis and blob storage.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  agentIntegrationAccess,
  agentJobs,
  agentTemplates,
  agents,
  analyticsEvents,
  approvals,
  auditEvents,
  briefings,
  businessImports,
  capabilityRegistry,
  companyDecisions,
  companyMemory,
  connectorOutcomes,
  creditAlerts,
  creditBalances,
  creditReservations,
  creditTransactions,
  deals,
  decisions,
  departments,
  departmentTemplates,
  emailVerificationTokens,
  engineeringTasks,
  eventRules,
  files,
  goals,
  initiatives,
  integrationCapabilities,
  integrationCredentials,
  integrationProviders,
  invitations,
  keyResults,
  knowledgeEntities,
  knowledgeRelations,
  llmPerformance,
  loginLockouts,
  mcpServers,
  mcpTools,
  memberships,
  notifications,
  objectives,
  onboardingStates,
  organizations,
  passwordResetTokens,
  planRevisions,
  repositories,
  repositoryBranches,
  repositoryFileContents,
  repositoryFiles,
  repositoryPrs,
  repoEvents,
  sandboxRuns,
  secretRecords,
  sessions,
  simulations,
  squads,
  squadAgents,
  strategies,
  subscriptions,
  tasks,
  teams,
  teamTemplates,
  tickets,
  userProviderKeys,
  users,
  webhookEvents,
  activityEvents,
  type Db,
} from '@orq8/db';
import type { AppConfig } from '@orq8/core';
import type { Logger } from 'pino';
import { appendAudit } from './audit.js';
import { exportOrg } from './portability.js';
import { deleteFile } from './files.js';
import { SESSION_CACHE_PREFIX } from './sessions.js';
import type { RedisClient } from './redis.js';

/** One org-scoped table purged by `org_id`, in dependency-safe order. */
interface PurgeTable {
  name: string;
  table: PgTable & { orgId: unknown };
}

/**
 * Ordered purge list — children before parents. Exported so the integration
 * test can cross-check `information_schema` and fail when a new `org_id`
 * table appears that is not covered here.
 */
export const ORG_PURGE_TABLES: PurgeTable[] = [
  { name: 'key_results', table: keyResults as PurgeTable['table'] },
  { name: 'knowledge_relations', table: knowledgeRelations as PurgeTable['table'] },
  { name: 'squad_agents', table: squadAgents as PurgeTable['table'] },
  { name: 'mcp_tools', table: mcpTools as PurgeTable['table'] },
  { name: 'agent_integration_access', table: agentIntegrationAccess as PurgeTable['table'] },
  { name: 'objectives', table: objectives as PurgeTable['table'] },
  { name: 'initiatives', table: initiatives as PurgeTable['table'] },
  { name: 'decisions', table: decisions as PurgeTable['table'] },
  { name: 'connector_outcomes', table: connectorOutcomes as PurgeTable['table'] },
  { name: 'notifications', table: notifications as PurgeTable['table'] },
  { name: 'briefings', table: briefings as PurgeTable['table'] },
  { name: 'activity_events', table: activityEvents as PurgeTable['table'] },
  { name: 'agent_jobs', table: agentJobs as PurgeTable['table'] },
  { name: 'approvals', table: approvals as PurgeTable['table'] },
  { name: 'tasks', table: tasks as PurgeTable['table'] },
  { name: 'goals', table: goals as PurgeTable['table'] },
  { name: 'engineering_tasks', table: engineeringTasks as PurgeTable['table'] },
  { name: 'sandbox_runs', table: sandboxRuns as PurgeTable['table'] },
  { name: 'repo_events', table: repoEvents as PurgeTable['table'] },
  { name: 'agents', table: agents as PurgeTable['table'] },
  { name: 'mcp_servers', table: mcpServers as PurgeTable['table'] },
  { name: 'integration_providers', table: integrationProviders as PurgeTable['table'] },
  { name: 'secret_records', table: secretRecords as PurgeTable['table'] },
  { name: 'user_provider_keys', table: userProviderKeys as PurgeTable['table'] },
  { name: 'repositories', table: repositories as PurgeTable['table'] },
  { name: 'teams', table: teams as PurgeTable['table'] },
  { name: 'departments', table: departments as PurgeTable['table'] },
  { name: 'strategies', table: strategies as PurgeTable['table'] },
  { name: 'squads', table: squads as PurgeTable['table'] },
  { name: 'simulations', table: simulations as PurgeTable['table'] },
  { name: 'company_memory', table: companyMemory as PurgeTable['table'] },
  { name: 'company_decisions', table: companyDecisions as PurgeTable['table'] },
  { name: 'knowledge_entities', table: knowledgeEntities as PurgeTable['table'] },
  { name: 'business_imports', table: businessImports as PurgeTable['table'] },
  { name: 'capability_registry', table: capabilityRegistry as PurgeTable['table'] },
  { name: 'deals', table: deals as PurgeTable['table'] },
  { name: 'tickets', table: tickets as PurgeTable['table'] },
  { name: 'credit_balances', table: creditBalances as PurgeTable['table'] },
  { name: 'credit_transactions', table: creditTransactions as PurgeTable['table'] },
  { name: 'credit_reservations', table: creditReservations as PurgeTable['table'] },
  { name: 'subscriptions', table: subscriptions as PurgeTable['table'] },
  { name: 'credit_alerts', table: creditAlerts as PurgeTable['table'] },
  { name: 'plan_revisions', table: planRevisions as PurgeTable['table'] },
  { name: 'webhook_events', table: webhookEvents as PurgeTable['table'] },
  { name: 'event_rules', table: eventRules as PurgeTable['table'] },
  { name: 'llm_performance', table: llmPerformance as PurgeTable['table'] },
  { name: 'analytics_events', table: analyticsEvents as PurgeTable['table'] },
  { name: 'department_templates', table: departmentTemplates as PurgeTable['table'] },
  { name: 'team_templates', table: teamTemplates as PurgeTable['table'] },
  { name: 'agent_templates', table: agentTemplates as PurgeTable['table'] },
  { name: 'onboarding_states', table: onboardingStates as PurgeTable['table'] },
  // audit_events last among org tables: the org.deleted entry must exist
  // while every other table is verified gone is not required, but keeping the
  // ledger readable until the end aids debugging a failed purge.
  { name: 'audit_events', table: auditEvents as PurgeTable['table'] },
  { name: 'memberships', table: memberships as PurgeTable['table'] },
  { name: 'invitations', table: invitations as PurgeTable['table'] },
];

export interface OrgDeletionReceipt {
  orgId: string;
  slug: string;
  name: string;
  exportedAt: string;
  exportCounts: Record<string, number>;
  purgedTables: Record<string, number>;
  sessionsRevoked: number;
  filesRemoved: number;
  usersRemoved: number;
  audit: { id: string; hash: string | null; action: string; occurredAt: string };
}

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return 0;
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('refusing to interpolate non-UUID into raw SQL');
  }
}

async function countLegacy(db: Db, table: string, orgId: string): Promise<number> {
  assertUuid(orgId);
  const result = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM public.${table} WHERE org_id = '${orgId}'`));
  const rows = (Array.isArray(result) ? result : (result as unknown as { rows: Array<{ n: number }> }).rows) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

async function countRows(db: Db, table: PgTable & { orgId: unknown }, orgId: string): Promise<number> {
  const rows = await db
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select({ id: (table as any).id })
    .from(table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where(eq((table as any).orgId, orgId));
  return rows.length;
}

/**
 * Delete an organization completely: export snapshot, audit, purge, confirm.
 * Throws `ORG_NOT_FOUND` when the org does not exist. Idempotent — safe to
 * retry after a partial failure.
 */
export async function deleteOrgCompletely(
  db: Db,
  redis: RedisClient | null,
  config: AppConfig,
  logger: Logger,
  input: { orgId: string; actorUserId: string },
): Promise<OrgDeletionReceipt> {
  const { orgId, actorUserId } = input;

  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    const err = new Error(`Organization ${orgId} not found`) as Error & { code: string };
    err.code = 'ORG_NOT_FOUND';
    throw err;
  }

  // 1. Export first — the caller's proof of what left the building.
  const exported = await exportOrg(db, orgId);
  const exportCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(exported)) {
    if (key === 'schemaVersion' || key === 'exportedAt' || key === 'organization') continue;
    exportCounts[key] = countOf(value);
  }

  // 2. Audit through the normal pipeline, then read the entry back. The entry
  // itself is purged in step 3 (erasure includes actor-linked audit rows), so
  // this receipt is the durable proof.
  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: actorUserId,
    action: 'org.deleted',
    outcome: 'success',
    resultRef: `org:${org.slug} export:${exported.exportedAt}`,
  });
  const [auditRow] = await db
    .select({ id: auditEvents.id, hash: auditEvents.hash, occurredAt: auditEvents.occurredAt })
    .from(auditEvents)
    .where(and(eq(auditEvents.orgId, orgId), eq(auditEvents.action, 'org.deleted')))
    .orderBy(sql`${auditEvents.occurredAt} desc`)
    .limit(1);

  // 3a. File blobs: storage backend first (best-effort per file), rows via the
  // file service so backend + row stay paired.
  const fileRows = await db
    .select({ id: files.id })
    .from(files)
    .where(eq(files.orgId, orgId));
  let filesRemoved = 0;
  for (const f of fileRows) {
    try {
      if (await deleteFile(config, db, orgId, f.id)) filesRemoved += 1;
    } catch (err) {
      logger.warn({ err, orgId, fileId: f.id }, 'org-deletion: blob removal failed, row kept for retry');
    }
  }

  // 3b. Provider-keyed children (no org_id of their own): remove before their
  // providers so the explicit counts stay honest even where cascades exist.
  const providerRows = await db
    .select({ id: integrationProviders.id })
    .from(integrationProviders)
    .where(eq(integrationProviders.orgId, orgId));
  const providerIds = providerRows.map((r) => r.id);
  const purgedTables: Record<string, number> = {};
  if (providerIds.length > 0) {
    const caps = await db
      .delete(integrationCapabilities)
      .where(inArray(integrationCapabilities.providerId, providerIds))
      .returning({ id: integrationCapabilities.id });
    purgedTables['integration_capabilities'] = caps.length;
    const creds = await db
      .delete(integrationCredentials)
      .where(inArray(integrationCredentials.providerId, providerIds))
      .returning({ id: integrationCredentials.id });
    purgedTables['integration_credentials'] = creds.length;
  } else {
    purgedTables['integration_capabilities'] = 0;
    purgedTables['integration_credentials'] = 0;
  }

  // 3c. Repository children carry no org_id of their own — remove them by
  // repository before the repositories row goes (cascades exist, but the
  // receipt counts what was actually deleted).
  const repoRows = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(eq(repositories.orgId, orgId));
  const repoIds = repoRows.map((r) => r.id);
  if (repoIds.length > 0) {
    const prs = await db
      .delete(repositoryPrs)
      .where(inArray(repositoryPrs.repositoryId, repoIds))
      .returning({ id: repositoryPrs.id });
    purgedTables['repository_prs'] = prs.length;
    const branches = await db
      .delete(repositoryBranches)
      .where(inArray(repositoryBranches.repositoryId, repoIds))
      .returning({ id: repositoryBranches.id });
    purgedTables['repository_branches'] = branches.length;
    const rfiles = await db
      .select({ id: repositoryFiles.id })
      .from(repositoryFiles)
      .where(inArray(repositoryFiles.repositoryId, repoIds));
    const rfileIds = rfiles.map((r) => r.id);
    if (rfileIds.length > 0) {
      const contents = await db
        .delete(repositoryFileContents)
        .where(inArray(repositoryFileContents.fileId, rfileIds))
        .returning({ id: repositoryFileContents.fileId });
      purgedTables['repository_file_contents'] = contents.length;
    } else {
      purgedTables['repository_file_contents'] = 0;
    }
    const filesDeleted = await db
      .delete(repositoryFiles)
      .where(inArray(repositoryFiles.repositoryId, repoIds))
      .returning({ id: repositoryFiles.id });
    purgedTables['repository_files'] = filesDeleted.length;
  } else {
    purgedTables['repository_prs'] = 0;
    purgedTables['repository_branches'] = 0;
    purgedTables['repository_file_contents'] = 0;
    purgedTables['repository_files'] = 0;
  }

  // 3d. Legacy + Supabase-lineage raw-SQL tables first (agent_memory
  // references agents/tasks). Supabase tables may not exist everywhere.
  for (const legacy of LEGACY_PURGE_TABLES) {
    const n = await countLegacy(db, legacy, orgId);
    if (n > 0) {
      await db.execute(sql.raw(`DELETE FROM public.${legacy} WHERE org_id = '${orgId}'`));
    }
    purgedTables[legacy] = n;
  }
  for (const supa of SUPABASE_PURGE_TABLES) {
    try {
      const n = await countLegacy(db, supa, orgId);
      if (n > 0) {
        await db.execute(sql.raw(`DELETE FROM public.${supa} WHERE org_id = '${orgId}'`));
      }
      purgedTables[supa] = n;
    } catch (err) {
      logger.warn({ err, orgId, table: supa }, 'org-deletion: supabase-lineage table missing, skipped');
      purgedTables[supa] = 0;
    }
  }

  // 3e. Every org-scoped table, children before parents.
  for (const entry of ORG_PURGE_TABLES) {
    if (entry.name === 'memberships' || entry.name === 'invitations') continue; // phase 4
    if (entry.name === 'audit_events') {
      const n = await countRows(db, entry.table, orgId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.delete(entry.table).where(eq((entry.table as any).orgId, orgId));
      purgedTables[entry.name] = n;
      continue;
    }
    const n = await countRows(db, entry.table, orgId);
    if (n > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.delete(entry.table).where(eq((entry.table as any).orgId, orgId));
    }
    purgedTables[entry.name] = n;
  }

  // 4. Sessions: evict every Redis cache entry first (a cached session would
  // otherwise keep authenticating the dead token), then delete the rows.
  const orgSessions = await db
    .select({ tokenHash: sessions.tokenHash })
    .from(sessions)
    .where(eq(sessions.orgId, orgId));
  if (redis?.isConnected() && orgSessions.length > 0) {
    try {
      await redis.del(...orgSessions.map((s) => `${SESSION_CACHE_PREFIX}${s.tokenHash}`));
    } catch (err) {
      logger.warn({ err, orgId }, 'org-deletion: session cache eviction failed');
    }
  }
  const sessionsRevoked = orgSessions.length;
  await db.delete(sessions).where(eq(sessions.orgId, orgId));

  // Memberships + invitations of this org.
  const memberRows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.orgId, orgId));
  const memberUserIds = [...new Set(memberRows.map((r) => r.userId))];
  const membershipCount = await countRows(db, memberships as PurgeTable['table'], orgId);
  await db.delete(memberships).where(eq(memberships.orgId, orgId));
  purgedTables['memberships'] = membershipCount;
  const invitationCount = await countRows(db, invitations as PurgeTable['table'], orgId);
  await db.delete(invitations).where(eq(invitations.orgId, orgId));
  purgedTables['invitations'] = invitationCount;

  // 5. The organization row itself.
  await db.delete(organizations).where(eq(organizations.id, orgId));

  // 6. Users left with zero memberships: erase the account. Nullable
  // references they left in OTHER orgs are nulled first so those companies
  // keep working; everything of theirs inside this org is already gone.
  let usersRemoved = 0;
  for (const userId of memberUserIds) {
    const remaining = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);
    if (remaining.length > 0) continue;

    const [doomed] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!doomed) continue;

    await db.update(files).set({ uploadedBy: null }).where(eq(files.uploadedBy, userId));
    await db.update(invitations).set({ invitedBy: null }).where(eq(invitations.invitedBy, userId));
    await db.update(invitations).set({ acceptedBy: null }).where(eq(invitations.acceptedBy, userId));
    await db.update(squads).set({ createdBy: null }).where(eq(squads.createdBy, userId));

    const userSessions = await db
      .select({ tokenHash: sessions.tokenHash })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    if (redis?.isConnected() && userSessions.length > 0) {
      try {
        await redis.del(...userSessions.map((s) => `${SESSION_CACHE_PREFIX}${s.tokenHash}`));
      } catch {
        /* TTL + revoked rows cover the gap */
      }
    }
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
    await db.delete(onboardingStates).where(eq(onboardingStates.userId, userId));
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, userId));
    await db.delete(loginLockouts).where(eq(loginLockouts.email, doomed.email.trim().toLowerCase()));
    await db.delete(users).where(eq(users.id, userId));
    usersRemoved += 1;
  }

  const receipt: OrgDeletionReceipt = {
    orgId,
    slug: org.slug,
    name: org.name,
    exportedAt: exported.exportedAt,
    exportCounts,
    purgedTables,
    sessionsRevoked,
    filesRemoved,
    usersRemoved,
    audit: {
      id: auditRow?.id != null ? String(auditRow.id) : 'unknown',
      hash: (auditRow?.hash as string | null) ?? null,
      action: 'org.deleted',
      occurredAt: (auditRow?.occurredAt as Date | undefined)?.toISOString() ?? new Date().toISOString(),
    },
  };

  logger.info(
    {
      orgId,
      slug: org.slug,
      usersRemoved,
      sessionsRevoked,
      auditId: receipt.audit.id,
    },
    'org-deletion: organization purged',
  );

  return receipt;
}

/**
 * Legacy tables with `org_id` that live outside the Drizzle schema (created by
 * inline SQL in routes/migration.ts). Purged by raw SQL — `agent_memory` has
 * plain FKs to agents/tasks so it goes before them.
 */
export const LEGACY_PURGE_TABLES = ['agent_memory', 'notification_preferences'] as const;

/**
 * Supabase-lineage tables with `org_id` that the app never writes through
 * Drizzle (`supabase/migrations/0051_lineage_drift_tables.sql`). Purged
 * best-effort (`IF EXISTS`-style tolerance): some environments never apply
 * that lineage, and a missing table must not fail a deletion.
 */
export const SUPABASE_PURGE_TABLES = ['user_org_mapping'] as const;

/** Every `org_id` table this service purges, drizzle-managed or legacy. */
export const COVERED_ORG_TABLES: ReadonlySet<string> = new Set([
  ...ORG_PURGE_TABLES.map((t) => t.name),
  ...LEGACY_PURGE_TABLES,
  ...SUPABASE_PURGE_TABLES,
  'files', // blob + row via the file service
  'sessions', // DB rows + Redis cache eviction
]);

/** Tables that carry an `org_id` column but are intentionally never purged. */
export const ORG_DELETION_EXCLUSIONS = new Set<string>([
  'providers', // platform model catalog, no org_id in practice — listed for clarity
  'job_runs', // platform job history, no org_id
  'waitlist_signups', // pre-org marketing funnel, no org_id
  'waitlist_emails', // pre-org marketing funnel, no org_id
  'users', // handled by the orphaned-account path above, keyed by membership
  'login_lockouts', // email-keyed lockout state, cleared per erased user only
]);
