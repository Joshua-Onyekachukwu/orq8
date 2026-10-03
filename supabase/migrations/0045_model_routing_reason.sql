-- 0045 — docs/80 Phase 4: record why the selector picked a model. Same
-- statement as packages/db/migrations/0021, kept in parity for hosted
-- deployments. `routing_source` says which path chose; `routing_reason` says
-- why, so a veto (plan cap, ignored preference) is always explainable.
do $$ begin
  if to_regclass('public.llm_performance') is not null then
    alter table public.llm_performance add column if not exists routing_reason text;
  end if;
end $$;
