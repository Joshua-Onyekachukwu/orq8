-- 0031 — Organizational scale indexes (100+ departments / 10k+ employees).
--
-- The org scale audit (departments, teams, agents, tasks) found agents, tasks,
-- goals, decisions and llm_performance fully composite-indexed, but four hot
-- read paths were missing their org composite:
--
--   • departments(org_id, created_at)  — list is ordered created_at DESC per org
--   • teams(org_id, created_at)        — same list pattern
--   • decisions(org_id, outcome_filed_at) — signal anchor lookup
--     (max(outcome_filed_at) per org on every signals read)
--   • company_memory(org_id, category, importance) — learning-events feed
--     orders by importance within category filters per org
--
-- Both list queries leftJoin agents and aggregate; the org composite lets the
-- planner scan exactly one org's slice instead of filtering the whole table.
-- Idempotent guarded ADD COLUMN style (IF NOT EXISTS) — safe to re-run, and a
-- no-op on any lineage that already created these via drizzle metadata.

CREATE INDEX IF NOT EXISTS departments_org_created_idx ON departments (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS teams_org_created_idx ON teams (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS decisions_org_outcome_idx ON decisions (org_id, outcome_filed_at);
CREATE INDEX IF NOT EXISTS company_memory_org_cat_imp_idx ON company_memory (org_id, category, importance DESC);
