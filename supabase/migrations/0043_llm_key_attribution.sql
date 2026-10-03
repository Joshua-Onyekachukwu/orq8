-- 0043 — docs/80 Phase 4 (BYOK): attribute each model call to the key that paid
-- for it. Same statements as packages/db/migrations/0019, kept in parity for
-- hosted deployments.
--
-- `key_source` = 'org' | 'platform'; `provider_key_id` names the org key row when
-- the call used one. These make a per-key `monthly_spend_ceiling` enforceable and
-- let the economics report separate BYOK spend from platform spend.

do $$ begin
  if to_regclass('public.llm_performance') is not null then
    alter table public.llm_performance add column if not exists key_source text not null default 'platform';
    alter table public.llm_performance add column if not exists provider_key_id uuid;

    create index if not exists llm_performance_provider_key_idx
      on public.llm_performance (provider_key_id, created_at);
    create index if not exists llm_performance_org_agent_created_idx
      on public.llm_performance (org_id, agent_id, created_at);
  end if;
end $$;
