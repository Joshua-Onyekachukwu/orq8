-- 0035 — member invitations and role management.
--
-- docs/62 §62.4 recorded member management as "read endpoints only: no invite,
-- no role change, no removal", which makes a real company impossible to run:
-- ORQ8's model is a founder plus a team operating an AI organization, and a
-- company of one cannot delegate anything to a human.
--
-- The `memberships` table already carries the role model (owner|admin|member|
-- viewer, docs/34.3) and membership writes are deliberately API-only (0033
-- dropped memberships_insert_self to close the self-insert escalation hole).
-- What is missing is the step before a membership exists: a pending invitation
-- that a teammate can accept.
--
-- Tokens are stored hashed (sha256), single-use and time-boxed, mirroring the
-- email-verification pattern. RLS mirrors approvals: members of an org may read
-- that org's invitations; all writes belong to the API.

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  token_hash text not null,
  invited_by uuid references public.users(id) on delete set null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invitations_status_check check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint invitations_role_check check (role in ('owner', 'admin', 'member', 'viewer'))
);

-- The token is looked up by hash on accept, so it must be unique.
create unique index if not exists invitations_token_hash_idx on public.invitations(token_hash);

-- Org listing, and the FK index invariant 0034 asserts.
create index if not exists invitations_org_idx on public.invitations(org_id, status);
create index if not exists invitations_invited_by_idx on public.invitations(invited_by);
create index if not exists invitations_accepted_by_idx on public.invitations(accepted_by);

-- One live invitation per address per org. A revoked, expired or accepted
-- invitation does not block a new one: only pending rows collide.
create unique index if not exists invitations_pending_uniq
  on public.invitations(org_id, lower(email))
  where status = 'pending';

alter table public.invitations enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'invitations_org_select') THEN
    CREATE POLICY invitations_org_select ON public.invitations
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = invitations.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;
