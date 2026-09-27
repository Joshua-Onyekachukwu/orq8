-- ============================================================
-- 0034 — FK index coverage
--
-- Context (task STEP 4.3): a child-table FK column with no index where it
-- leads forces a seq scan of the child table on every parent row update or
-- delete (FK trigger lookup), and makes the common "rows for this X"
-- queries full scans too. The schema audit found 33 FK columns with no
-- leading index:
--
--   activity_events.task_id, agent_integration_access.agent_id,
--   agent_integration_access.provider_id, approvals.agent_id,
--   business_imports.decided_by, capability_registry.owner_agent_id,
--   company_memory.agent_id, company_memory.task_id,
--   connector_outcomes.approval_id, connector_outcomes.provider_id,
--   credit_balances.subscription_id, decisions.task_id,
--   departments.template_id, engineering_tasks.pr_id,
--   engineering_tasks.repository_id, event_rules.agent_id, files.agent_id,
--   files.task_id, files.uploaded_by, initiatives.owner_agent_id,
--   initiatives.strategy_id, knowledge_relations.from_entity_id,
--   knowledge_relations.to_entity_id, objectives.owner_agent_id,
--   repo_events.repository_id, repositories.provider_id,
--   repository_file_contents.file_id, squad_agents.agent_id,
--   squads.created_by, squads.parent_task_id, tasks.goal_id,
--   tasks.squad_id, teams.template_id
--
-- The index creation is catalog-driven instead of 33 literal statements so
-- the same file is correct on both lineage shapes (drizzle-first local/CI,
-- supabase-only fresh deploys): it computes the current gap set at apply
-- time and only creates what is missing. Re-running is a no-op.
--
-- Implementation notes: the gap query matches the harness check exactly
-- and is scoped to the public schema. The scope matters: a Supabase database
-- carries auth.* and storage.* tables whose FKs the postgres role does not
-- own, and an unscoped query tried to index auth.mfa_challenges and failed
-- the whole migration with "must be owner of table" — which is why the
-- production apply stopped here while local runs passed. Index names are
-- built from pg_class.relname (not the regnamespace cast, which stringifies
-- to a numeric oid on PG 18 and made an earlier draft create nothing).
--
-- scripts/rls-security-e2e.ts asserts the same public-only gap set is zero
-- after this file, so any future migration that adds a FK without an index
-- fails the security matrix run.
--
-- All statements are CREATE INDEX IF NOT EXISTS on public.* tables:
-- non-destructive, no data rewritten, safe on a populated environment.
-- Builds take brief SHARE locks; at current table sizes each is
-- milliseconds. No partial (WHERE) predicates: nullable FK columns get a
-- plain index so every lookup shape can use it.
-- ============================================================

DO $$
DECLARE
  r record;
  idx_name text;
BEGIN
  FOR r IN
    SELECT ns.nspname AS schema_name, rel.relname AS table_name, a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey) AS k(col)
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = k.col
    WHERE c.contype = 'f'
      AND ns.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid AND i.indkey[0] = k.col
      )
    ORDER BY ns.nspname, rel.relname, a.attname
  LOOP
    idx_name := r.table_name || '_' || r.column_name || '_idx';
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%I)',
      idx_name,
      r.schema_name,
      r.table_name,
      r.column_name
    );
    RAISE NOTICE '0034: created index % on %.% (%)',
      idx_name, r.schema_name, r.table_name, r.column_name;
  END LOOP;
END $$;
