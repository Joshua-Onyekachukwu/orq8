-- 0054 — deals and tickets: give sales and customer success their own records.
--
-- The department focus read-models shipped in docs/86 §6 with a stated
-- limitation: ORQ8 had no `deals` table and no `tickets` table, so the sales
-- page could not show a pipeline and the customer-success page could not show a
-- queue without printing numbers nobody wrote. Both departments read the
-- knowledge graph's `customer` entities through one shared `accountsFocus`
-- model, framed differently, and the panels said so out loud.
--
-- This is the follow-up that limitation named. Two tables, real rows:
--
--   deals    — a sales opportunity: its account, its stage, its value, who
--              owns it and when it is expected to close.
--   tickets  — a customer support request: its account, its subject, how
--              urgent it is, its state, who is on it and when it is due.
--
-- Both carry `account_id` pointing at the knowledge graph's customer entity
-- when one exists, and `account_name` as a denormalised copy so a deal or a
-- ticket can exist the moment an employee records it, before the entity is
-- created. Neither table invents a second customer record: they hang off the
-- one that already exists.
--
-- Money is stored in integer cents, matching the rest of this schema (credits
-- are the product's unit of account; a deal's value is a real currency amount
-- and is kept in its minor unit, never a float).
--
-- Org-scoped with the standard org-member RLS policy, the same shape 0010 uses
-- for squads. Idempotent: `if not exists` throughout, and the migration runner
-- drops the policies this file declares before re-applying it.

-- ── deals — the sales pipeline ─────────────────────────────────────────────

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.knowledge_entities(id) on delete set null,
  account_name text not null,
  title text not null,
  -- qualifying | discovery | proposal | negotiation | won | lost
  stage text not null default 'qualifying',
  value_cents integer not null default 0,
  currency text not null default 'USD',
  probability integer not null default 0,
  owner_agent_id uuid references public.agents(id) on delete set null,
  source text,
  next_step text,
  expected_close_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_org_idx on public.deals(org_id);
create index if not exists deals_org_stage_idx on public.deals(org_id, stage);
create index if not exists deals_org_owner_idx on public.deals(org_id, owner_agent_id);
create index if not exists deals_org_close_idx on public.deals(org_id, expected_close_at);

alter table public.deals enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'deals_org_member') then
    create policy deals_org_member on public.deals
      for all to authenticated
      using (
        exists (select 1 from public.memberships m where m.org_id = deals.org_id and m.user_id = auth.uid())
      )
      with check (
        exists (select 1 from public.memberships m where m.org_id = deals.org_id and m.user_id = auth.uid())
      );
  end if;
end $$;

-- ── tickets — the customer-success queue ───────────────────────────────────

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.knowledge_entities(id) on delete set null,
  account_name text not null,
  subject text not null,
  body text,
  -- open | pending | waiting_customer | escalated | resolved | closed
  status text not null default 'open',
  -- low | normal | high | urgent
  priority text not null default 'normal',
  -- email | chat | phone | portal
  channel text not null default 'portal',
  assignee_agent_id uuid references public.agents(id) on delete set null,
  sla_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tickets_org_idx on public.tickets(org_id);
create index if not exists tickets_org_status_idx on public.tickets(org_id, status);
create index if not exists tickets_org_assignee_idx on public.tickets(org_id, assignee_agent_id);
create index if not exists tickets_org_sla_idx on public.tickets(org_id, sla_due_at);

alter table public.tickets enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'tickets_org_member') then
    create policy tickets_org_member on public.tickets
      for all to authenticated
      using (
        exists (select 1 from public.memberships m where m.org_id = tickets.org_id and m.user_id = auth.uid())
      )
      with check (
        exists (select 1 from public.memberships m where m.org_id = tickets.org_id and m.user_id = auth.uid())
      );
  end if;
end $$;
