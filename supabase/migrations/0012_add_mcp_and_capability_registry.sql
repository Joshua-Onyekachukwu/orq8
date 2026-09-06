-- ORQ8 — 0012: MCP server registry + capability registry (build-vs-buy)
-- Both are org-scoped registries feeding the agent execution layer.
-- Execution never happens here: MCP tools dispatch through the existing
-- connector-action chain (capability check -> approval -> outcome -> audit).

-- ─── MCP Servers ────────────────────────────────────────────────────────────
create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  provider text not null,
  transport text not null default 'connector',
  endpoint text,
  auth_type text not null default 'connector_oauth',
  credential_ref text,
  status text not null default 'unconfigured',
  risk_level text not null default 'medium',
  allowed_agents jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mcp_servers_org_idx on public.mcp_servers(org_id);

alter table public.mcp_servers enable row level security;

create policy "mcp_servers_select_org" on public.mcp_servers
  for select using (
    exists (select 1 from public.memberships m
            where m.org_id = mcp_servers.org_id and m.user_id = auth.uid())
  );

create policy "mcp_servers_insert_org" on public.mcp_servers
  for insert with check (
    exists (select 1 from public.memberships m
            where m.org_id = mcp_servers.org_id and m.user_id = auth.uid())
  );

create policy "mcp_servers_update_org" on public.mcp_servers
  for update using (
    exists (select 1 from public.memberships m
            where m.org_id = mcp_servers.org_id and m.user_id = auth.uid())
  );

create policy "mcp_servers_delete_org" on public.mcp_servers
  for delete using (
    exists (select 1 from public.memberships m
            where m.org_id = mcp_servers.org_id and m.user_id = auth.uid())
  );

-- ─── MCP Tools ──────────────────────────────────────────────────────────────
create table if not exists public.mcp_tools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  name text not null,
  description text,
  input_schema jsonb not null default '{}'::jsonb,
  risk_level text not null default 'medium',
  required_capability text,
  requires_approval boolean not null default false,
  supports_dry_run boolean not null default false,
  idempotent boolean not null default false,
  audit_required boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (server_id, name)
);

create index if not exists mcp_tools_org_idx on public.mcp_tools(org_id);
create index if not exists mcp_tools_server_idx on public.mcp_tools(server_id);

alter table public.mcp_tools enable row level security;

create policy "mcp_tools_select_org" on public.mcp_tools
  for select using (
    exists (select 1 from public.memberships m
            where m.org_id = mcp_tools.org_id and m.user_id = auth.uid())
  );

create policy "mcp_tools_insert_org" on public.mcp_tools
  for insert with check (
    exists (select 1 from public.memberships m
            where m.org_id = mcp_tools.org_id and m.user_id = auth.uid())
  );

create policy "mcp_tools_update_org" on public.mcp_tools
  for update using (
    exists (select 1 from public.memberships m
            where m.org_id = mcp_tools.org_id and m.user_id = auth.uid())
  );

create policy "mcp_tools_delete_org" on public.mcp_tools
  for delete using (
    exists (select 1 from public.memberships m
            where m.org_id = mcp_tools.org_id and m.user_id = auth.uid())
  );

-- ─── Capability Registry ────────────────────────────────────────────────────
create table if not exists public.capability_registry (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  category text not null,
  provider text,
  capability text,
  location text,
  owner_agent_id uuid references public.agents(id) on delete set null,
  reusable boolean not null default true,
  status text not null default 'available',
  source text not null default 'builtin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists capability_registry_org_idx on public.capability_registry(org_id);

alter table public.capability_registry enable row level security;

create policy "capability_registry_select_org" on public.capability_registry
  for select using (
    exists (select 1 from public.memberships m
            where m.org_id = capability_registry.org_id and m.user_id = auth.uid())
  );

create policy "capability_registry_insert_org" on public.capability_registry
  for insert with check (
    exists (select 1 from public.memberships m
            where m.org_id = capability_registry.org_id and m.user_id = auth.uid())
  );

create policy "capability_registry_update_org" on public.capability_registry
  for update using (
    exists (select 1 from public.memberships m
            where m.org_id = capability_registry.org_id and m.user_id = auth.uid())
  );

create policy "capability_registry_delete_org" on public.capability_registry
  for delete using (
    exists (select 1 from public.memberships m
            where m.org_id = capability_registry.org_id and m.user_id = auth.uid())
  );