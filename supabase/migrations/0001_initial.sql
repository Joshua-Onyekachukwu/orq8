-- ORQ8 — initial Supabase schema (mirrors packages/db/src/schema.ts, adapted for Supabase Auth).
-- Conventions from supabase-postgres-best-practices:
--   * lowercase snake_case identifiers, text (not varchar), timestamptz everywhere
--   * bigint identity PKs (not serial), uuid PKs where the app already commits to them
--   * every FK column indexed (Postgres does not index FKs)
--   * RLS enabled + forced on all tenant tables, policies scoped by auth.uid() and memberships
--   * text columns for enums with CHECK constraints (app zod schemas are the source of truth;
--     the DB constraints are the safety net)
--
-- Auth decision (docs/35, per the Supabase move): Supabase Auth owns credentials. `users`
-- is a profile table whose PK is auth.users(id); the API verifies Supabase-issued JWTs via
-- the JWKS URL. The old app-issued password_hash/session flow is retired with this migration
-- (see supabase/MIGRATION.md for the API-side swap).

-- ---------------------------------------------------------------------------
-- updated_at trigger (shared)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users (profile, keyed on Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_status_check check (status in ('active', 'disabled', 'suspended'))
);

create unique index if not exists users_email_idx on public.users (email);
create index if not exists users_status_idx on public.users (status);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.users force row level security;

create policy users_select_own on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_update_own on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  plan text not null default 'free',
  status text not null default 'active',
  constitution_version_ref uuid,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organizations_plan_check check (plan in ('free', 'pro', 'business', 'enterprise')),
  constraint organizations_status_check check (status in ('active', 'suspended', 'archived'))
);

create unique index if not exists organizations_slug_idx on public.organizations (slug);

-- ---------------------------------------------------------------------------
-- memberships (created before org policies so they can reference it)
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint memberships_role_check check (role in ('owner', 'admin', 'member', 'viewer')),
  constraint memberships_status_check check (status in ('active', 'invited', 'removed'))
);

create unique index if not exists memberships_org_user_idx on public.memberships (org_id, user_id);
create index if not exists memberships_user_id_idx on public.memberships (user_id); -- FK index
create index if not exists memberships_org_role_idx on public.memberships (org_id, role); -- owner/admin lookups

alter table public.memberships enable row level security;
alter table public.memberships force row level security;

-- A user sees and manages their own memberships; org admins manage the org's roster.
create policy memberships_select_own on public.memberships
  for select to authenticated
  using (user_id = auth.uid());

create policy memberships_insert_self on public.memberships
  for insert to authenticated
  with check (user_id = auth.uid() and role = 'member');

create policy memberships_update_org_admin on public.memberships
  for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = memberships.org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- organizations RLS policies (memberships table now exists)
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organizations force row level security;

create policy organizations_select_member on public.organizations
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = organizations.id and m.user_id = auth.uid()
    )
  );

create policy organizations_update_owner on public.organizations
  for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = organizations.id and m.user_id = auth.uid() and m.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.org_id = organizations.id and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

-- ---------------------------------------------------------------------------
-- sessions (API-issued tokens during the transition; Supabase manages its own
-- auth sessions, so this table will be retired once the auth swap lands)
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  ip text,
  user_agent text
);

create unique index if not exists sessions_token_hash_idx on public.sessions (token_hash);
create index if not exists sessions_user_id_idx on public.sessions (user_id); -- FK index
create index if not exists sessions_org_id_idx on public.sessions (org_id); -- FK index

alter table public.sessions enable row level security;
alter table public.sessions force row level security;

create policy sessions_select_own on public.sessions
  for select to authenticated
  using (user_id = auth.uid());

create policy sessions_delete_own on public.sessions
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_events (immutable ledger; writes only via service_role / API)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_type text not null,
  actor_id uuid,
  department_id uuid,
  agent_id uuid,
  task_id uuid,
  action text not null,
  tool text,
  input_ref text,
  result_ref text,
  "authorization" text,
  approval_id uuid,
  policy_ref text,
  cost integer,
  outcome text not null,
  occurred_at timestamptz not null default now(),
  prev_hash text not null,
  hash text not null,
  constraint audit_events_actor_type_check check (actor_type in ('user', 'agent', 'system')),
  constraint audit_events_outcome_check check (outcome in ('success', 'denied', 'failure'))
);

create index if not exists audit_events_org_occurred_idx on public.audit_events (org_id, occurred_at);
create index if not exists audit_events_actor_idx on public.audit_events (actor_type, actor_id) where actor_id is not null;

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

-- Members read their org's ledger; only the API (service_role) appends.
create policy audit_events_select_member on public.audit_events
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = audit_events.org_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- providers (public catalog — config, not secrets)
-- ---------------------------------------------------------------------------
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  kind text not null default 'byok',
  base_url text,
  doc_url text,
  default_models jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_kind_check check (kind in ('byok', 'endpoint', 'local'))
);

create unique index if not exists providers_slug_idx on public.providers (slug);

create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();

alter table public.providers enable row level security;

-- Readable by everyone (the UI lists providers to configure); API writes via service_role.
create policy providers_select_all on public.providers
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- user_provider_keys (encrypted key material — the crown jewels)
-- ---------------------------------------------------------------------------
create table if not exists public.user_provider_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  name text,
  auth_type text not null default 'api_key',
  key_encrypted text not null,
  key_kid text not null,
  mask text not null,
  base_url text,
  allowed_models jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  monthly_spend_ceiling integer,
  status text not null default 'active',
  last_tested_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_provider_keys_auth_type_check check (auth_type in ('api_key', 'endpoint')),
  constraint user_provider_keys_status_check check (status in ('active', 'rotating', 'revoked'))
);

create index if not exists user_provider_keys_org_idx on public.user_provider_keys (org_id);
create index if not exists user_provider_keys_provider_idx on public.user_provider_keys (provider_id); -- FK index

create trigger user_provider_keys_set_updated_at
  before update on public.user_provider_keys
  for each row execute function public.set_updated_at();

alter table public.user_provider_keys enable row level security;
alter table public.user_provider_keys force row level security;

-- Org members can manage their org's keys (values are encrypted at rest; the API
-- is the only layer that ever decrypts).
create policy user_provider_keys_org_member on public.user_provider_keys
  for all to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = user_provider_keys.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.org_id = user_provider_keys.org_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- waitlist_signups (public funnel — anon INSERT only, nothing readable)
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  role text,
  source text not null default 'landing',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint waitlist_signups_role_check check (role in ('just_me', 'me_1_2', 'small_team')),
  constraint waitlist_signups_source_check check (source in ('landing', 'design_partner', 'referral')),
  constraint waitlist_signups_status_check check (status in ('pending', 'invited', 'signed_up'))
);

create unique index if not exists waitlist_signups_email_idx on public.waitlist_signups (email);
create index if not exists waitlist_signups_status_created_idx on public.waitlist_signups (status, created_at);

alter table public.waitlist_signups enable row level security;
alter table public.waitlist_signups force row level security;

-- Anon visitors may only insert (idempotency handled by the API's email uniqueness check).
create policy waitlist_signups_insert_anon on public.waitlist_signups
  for insert to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- secret_records (immutable access ledger for key reads)
-- ---------------------------------------------------------------------------
create table if not exists public.secret_records (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  key_id uuid not null references public.user_provider_keys (id) on delete cascade,
  action text not null,
  actor_type text not null,
  actor_id uuid,
  accessed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  constraint secret_records_action_check check (action in ('created', 'read', 'rotated', 'revoked', 'tested')),
  constraint secret_records_actor_type_check check (actor_type in ('user', 'agent', 'system'))
);

create index if not exists secret_records_key_idx on public.secret_records (key_id, accessed_at);
create index if not exists secret_records_org_idx on public.secret_records (org_id); -- FK index

alter table public.secret_records enable row level security;
alter table public.secret_records force row level security;

create policy secret_records_select_member on public.secret_records
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = secret_records.org_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- waitlist_emails (drip outbox — internal only)
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist_emails (
  id uuid primary key default gen_random_uuid(),
  signup_id uuid not null references public.waitlist_signups (id) on delete cascade,
  kind text not null,
  subject text not null,
  body_text text not null,
  body_html text not null,
  to_email text not null,
  to_name text,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint waitlist_emails_kind_check check (kind in ('welcome', 'drip_2d', 'drip_7d')),
  constraint waitlist_emails_status_check check (status in ('queued', 'sent', 'failed'))
);

create index if not exists waitlist_emails_due_idx on public.waitlist_emails (status, scheduled_at);
create index if not exists waitlist_emails_signup_idx on public.waitlist_emails (signup_id); -- FK index

alter table public.waitlist_emails enable row level security;
alter table public.waitlist_emails force row level security;

-- No direct access — the API (service_role) owns this table end-to-end.

-- ---------------------------------------------------------------------------
-- Seed: provider catalog (docs/23) — idempotent on slug
-- ---------------------------------------------------------------------------
insert into public.providers (slug, name, kind, base_url, doc_url, default_models)
values
  ('openai', 'OpenAI', 'byok', null, 'https://platform.openai.com/api-keys', '["gpt-4o", "gpt-4o-mini"]'::jsonb),
  ('anthropic', 'Anthropic', 'byok', null, 'https://console.anthropic.com/settings/keys', '["claude-sonnet-4-5", "claude-haiku-4-5"]'::jsonb),
  ('gemini', 'Google Gemini', 'byok', null, 'https://aistudio.google.com/app/apikey', '["gemini-2.5-flash", "gemini-2.5-pro"]'::jsonb),
  ('deepseek', 'DeepSeek', 'byok', null, 'https://platform.deepseek.com/api_keys', '["deepseek-chat", "deepseek-reasoner"]'::jsonb),
  ('groq', 'Groq', 'byok', null, 'https://console.groq.com/keys', '["llama-3.3-70b-versatile"]'::jsonb),
  ('openrouter', 'OpenRouter', 'byok', null, 'https://openrouter.ai/settings/keys', '[]'::jsonb),
  ('ollama', 'Ollama (local)', 'local', 'http://localhost:11434', 'https://ollama.com', '[]'::jsonb)
on conflict (slug) do nothing;
