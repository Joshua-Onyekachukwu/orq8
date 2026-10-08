-- 0051 — Backport the four lineage-drift tables.
--
-- These four tables have existed in production since before this lineage was
-- tracked, but no migration created them. That drift was invisible until
-- scripts/lineage-parity.ts fingerprinted a production database against a
-- database built from the lineage from scratch and diffed the two (docs/62,
-- docs/85 §0.3): a fresh database was missing them entirely, so CI and any new
-- environment ran without tables the API reads.
--
-- Every definition below was read off production, not invented:
--   pg_constraint / pg_indexes / pg_policies / information_schema.columns in
--   the parity fingerprint (.lineage-parity/prod.json) plus a constraint dump.
--
-- Deliberate parity notes:
--   * RLS is ENABLED but NOT FORCED, matching production. (0041/0048 chose
--     ENABLE + FORCE for the queue tables; these four did not, and the parity
--     tool diffs force-on/off, so "improving" it here would create new drift.)
--   * agent_memory and notification_preferences carry RLS with NO policies:
--     service-role-only access, exactly as production behaves. platform_admins
--     and user_org_mapping carry the two client-facing SELECT policies.
--   * platform_admins.created_at is NULLABLE on production. Keep it nullable.
--
-- Idempotent: `if not exists` throughout, and the migration runner drops the
-- policies this file declares before re-applying it.

-- ── agent_memory — what an employee retained, per agent/task ───────────────

create table if not exists public.agent_memory (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  agent_id uuid not null,
  task_id uuid,
  category text not null default 'context',
  content text not null,
  importance integer not null default 5,
  tags text[] default '{}'::text[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint agent_memory_pkey primary key (id),
  constraint agent_memory_org_id_fkey foreign key (org_id) references public.organizations (id),
  constraint agent_memory_agent_id_fkey foreign key (agent_id) references public.agents (id),
  constraint agent_memory_task_id_fkey foreign key (task_id) references public.tasks (id)
);

create index if not exists agent_memory_agent_id_idx on public.agent_memory using btree (agent_id);
create index if not exists agent_memory_category_idx on public.agent_memory using btree (org_id, agent_id, category);
create index if not exists agent_memory_importance_idx on public.agent_memory using btree (org_id, importance desc);
create index if not exists agent_memory_org_agent_idx on public.agent_memory using btree (org_id, agent_id);
create index if not exists agent_memory_task_id_idx on public.agent_memory using btree (task_id);

alter table public.agent_memory enable row level security;

-- ── notification_preferences — one row per org ────────────────────────────

create table if not exists public.notification_preferences (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  email_tasks boolean not null default false,
  email_approvals boolean not null default false,
  email_agent boolean not null default false,
  email_credits boolean not null default true,
  email_system boolean not null default false,
  in_app_tasks boolean not null default true,
  in_app_approvals boolean not null default true,
  in_app_agent boolean not null default true,
  in_app_credits boolean not null default true,
  in_app_system boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint notification_preferences_pkey primary key (id),
  constraint notification_preferences_org_id_fkey foreign key (org_id) references public.organizations (id)
);

create unique index if not exists notification_preferences_org_idx on public.notification_preferences using btree (org_id);

alter table public.notification_preferences enable row level security;

-- ── platform_admins — who may read the admin surfaces ─────────────────────

create table if not exists public.platform_admins (
  user_id uuid not null,
  created_at timestamp with time zone default now(),
  constraint platform_admins_pkey primary key (user_id),
  constraint platform_admins_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

alter table public.platform_admins enable row level security;

create policy admins_only on public.platform_admins
  for select
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── user_org_mapping — a user's org membership + role ─────────────────────

create table if not exists public.user_org_mapping (
  user_id uuid not null,
  org_id text not null,
  role text not null default 'member',
  constraint user_org_mapping_pkey primary key (user_id, org_id),
  constraint user_org_mapping_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

alter table public.user_org_mapping enable row level security;

create policy users_own_mapping on public.user_org_mapping
  for select
  using (auth.uid() = user_id);
