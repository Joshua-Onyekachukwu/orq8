import type { Pool } from 'pg';

/**
 * Delete every row owned by an organization across all org-scoped tables, with
 * FK enforcement disabled for the cleanup session so teardown order never
 * matters (the supabase schema lineage adds FKs that the older drizzle-era
 * tests were written against without). Runs entirely on one dedicated
 * connection and resets the session after. Requires superuser — the CI test
 * service user and the local docker test user both are.
 */
const ORG_SCOPED_TABLES = [
  'activity_events',
  'analytics_events',
  'approvals',
  'audit_events',
  'agents',
  'briefings',
  'business_imports',
  'capability_registry',
  'company_decisions',
  'company_memory',
  'connector_outcomes',
  'credit_alerts',
  'credit_balances',
  'credit_transactions',
  'departments',
  'engineering_tasks',
  'event_rules',
  'files',
  'goals',
  'integration_providers', // cascades credentials/capabilities/agent access
  'knowledge_entities', // cascades relations
  'knowledge_relations',
  'mcp_servers', // cascades mcp_tools
  'mcp_tools',
  'notifications',
  'onboarding_states',
  'repositories',
  'repository_branches',
  'repository_file_contents',
  'repository_files',
  'repository_prs',
  'repo_events',
  'sandbox_runs',
  'simulations',
  'squads', // cascades squad_agents
  'squad_agents',
  'subscriptions',
  'tasks',
  'teams',
  'webhook_events',
  'sessions',
  'memberships',
] as const;

export async function deleteOrg(pool: Pool, orgId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SET session_replication_role = replica');
    for (const table of ORG_SCOPED_TABLES) {
      // A missing table (older schema) is ignored — deletion is best-effort.
      await client
        .query(`DELETE FROM public.${table} WHERE org_id = $1`, [orgId])
        .catch(() => undefined);
    }
    await client
      .query('DELETE FROM public.organizations WHERE id = $1', [orgId])
      .catch(() => undefined);
    await client.query('SET session_replication_role = origin');
  } finally {
    client.release();
  }
}