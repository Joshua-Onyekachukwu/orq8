-- docs/80 Phase 4 (BYOK) — attribute each model call to the key that paid for it.
--
-- `key_source` records whether a call ran on the org's own provider key ('org')
-- or the platform's env keys ('platform'), and `provider_key_id` names the exact
-- org key row when it is one. Together they are what makes two things possible:
--
--   * enforcing an org key's `monthly_spend_ceiling` (spend is summed per key), and
--   * reporting BYOK margin honestly (an org key has a different cost base).
--
-- `llm_performance` is created by the Supabase lineage; this lineage runs first on
-- a fresh database, so the change is guarded and becomes a no-op there.
-- supabase/migrations/0043 carries the same change for the lineage that owns it.
do $$ begin
  if to_regclass('public.llm_performance') is not null then
    alter table llm_performance add column if not exists key_source text not null default 'platform';
    alter table llm_performance add column if not exists provider_key_id uuid;

    -- Per-key month-to-date spend (the ceiling check) and by-agent margin.
    create index if not exists llm_performance_provider_key_idx
      on llm_performance (provider_key_id, created_at);
    create index if not exists llm_performance_org_agent_created_idx
      on llm_performance (org_id, agent_id, created_at);
  end if;
end $$;
