-- docs/80 Phase 4 — record WHY the selector picked a model.
--
-- `routing_source` already says which path chose (static / measured / …); this
-- adds the human-readable reason beside it, so a veto is always explainable —
-- an agent preference ignored, a plan tier cap applied, a measured model
-- promoted. `llm_performance` is created by the Supabase lineage, so on a fresh
-- database (this lineage runs first) the change is a guarded no-op.
-- supabase/migrations/0045 carries the same change for the lineage that owns it.
do $$ begin
  if to_regclass('public.llm_performance') is not null then
    alter table llm_performance add column if not exists routing_reason text;
  end if;
end $$;
