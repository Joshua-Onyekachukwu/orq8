-- ORQ8 — 0013: Business Import (Phase 10)
-- Founder gives ORQ8 a company description + website URL; ORQ8 fetches the
-- website (SSRF-guarded, bounded), extracts structured facts with provenance,
-- proposes an organization, and applies it only after founder approval via the
-- existing company-builder/playbook path.
--
-- The facts/proposal live here as jsonb with provenance; Company Brain
-- persistence (company memory + knowledge graph) happens at apply time so a
-- rejected or un-reviewed import never pollutes the org's intelligence.

create table if not exists public.business_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- sha256(normalized_url + "|" + description) — idempotency key: re-analyzing
  -- the same input returns the existing import instead of duplicating work.
  source_fingerprint text not null,
  description text,
  website_url text,
  website_title text,
  website_summary text,
  website_error text,
  -- [{ field, value, source, source_type, source_url, confidence, snippet }]
  facts jsonb not null default '[]'::jsonb,
  -- { recommended_playbook, rationale, signals[], suggested_goals[] }
  proposal jsonb,
  status text not null default 'analysis',
  -- analysis | pending_approval | approved | applied | rejected | failed
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source_fingerprint)
);

create index if not exists business_imports_org_idx on public.business_imports(org_id);
create index if not exists business_imports_org_status_idx on public.business_imports(org_id, status);

alter table public.business_imports enable row level security;

create policy "business_imports_select_org" on public.business_imports
  for select using (
    exists (select 1 from public.memberships m
            where m.org_id = business_imports.org_id and m.user_id = auth.uid())
  );

create policy "business_imports_insert_org" on public.business_imports
  for insert with check (
    exists (select 1 from public.memberships m
            where m.org_id = business_imports.org_id and m.user_id = auth.uid())
  );

create policy "business_imports_update_org" on public.business_imports
  for update using (
    exists (select 1 from public.memberships m
            where m.org_id = business_imports.org_id and m.user_id = auth.uid())
  );

create policy "business_imports_delete_org" on public.business_imports
  for delete using (
    exists (select 1 from public.memberships m
            where m.org_id = business_imports.org_id and m.user_id = auth.uid())
  );
