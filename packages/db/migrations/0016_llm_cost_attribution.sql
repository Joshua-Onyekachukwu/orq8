-- docs/77 P1 §5 — cost recording.
--
-- `llm_performance` recorded tokens, latency and routing, but no money. The only
-- figure called "cost" in the system was the credit formula (1 credit per 1K
-- tokens) stored in `activity_events.cost`, and `GET /v1/admin/ai-usage` summed
-- it and returned it as `costCents` — so the console printed credits labelled as
-- dollars, and the company could not compute its own margin.
--
-- Three columns close that:
--   provider_cost_usd    real USD spend for the call (the provider's own reported
--                        cost when it sends one, else MODEL_REGISTRY rates)
--   credits_attributed   the credit formula applied to this call's tokens, kept
--                        for attribution only — the actual charge lands once per
--                        task at settlement
--   pricing_source       'provider_reported' | 'registry' | 'unknown', so a report
--                        can exclude unpriceable calls instead of counting them
--                        as free
--
-- On a stale database the columns default to 0/'unknown'; history is not
-- back-filled, because inventing prices for past calls is exactly the kind of
-- number this migration exists to stop.
--
-- Why the guard: `llm_performance` is created by the Supabase lineage
-- (supabase/migrations/0026_model_performance_memory.sql), and this lineage is
-- applied *before* that one on a fresh database. An unguarded ALTER TABLE would
-- abort the whole apply on a clean install, so the statement is wrapped and
-- becomes a no-op there; supabase/migrations/0040 carries the same change for the
-- lineage that owns the table.
do $$ begin
  if to_regclass('public.llm_performance') is not null then
    alter table llm_performance add column if not exists provider_cost_usd numeric(14, 8) not null default 0;
    alter table llm_performance add column if not exists credits_attributed integer not null default 0;
    alter table llm_performance add column if not exists pricing_source text not null default 'unknown';

    -- Margin and per-provider spend are read per provider over a time window.
    create index if not exists llm_performance_provider_created_idx
      on llm_performance (provider, created_at);

    -- Task settlement sums the calls a task made (services/llm-pricing.ts
    -- taskProviderCost) on the hot path.
    create index if not exists llm_performance_task_idx
      on llm_performance (task_id);
  end if;
end $$;
