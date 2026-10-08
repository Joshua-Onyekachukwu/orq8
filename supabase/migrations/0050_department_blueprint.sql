-- 0050 — Department blueprint (docs/85 §3.1)
--
-- departments.settings carries the department's own blueprint and page
-- configuration:
--   templateSlug — which department_template this department came from
--                  (lineage; re-activation upgrades, never duplicates)
--   kpis         — the template's KPI definitions
--   typicalGoals — starter goals the template suggests
--   roles        — the role blueprint the template recommends hiring
--   pageConfig   — per-department section order + metric emphasis
--                  (resolved server-side; unknown slugs get the canonical
--                  order — see docs/85 §7)
--
-- Everything else stays in typed columns. Additive and idempotent.

alter table departments
  add column if not exists settings jsonb not null default '{}'::jsonb;
