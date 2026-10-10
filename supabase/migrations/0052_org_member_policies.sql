-- 0052 — Backport the seven org-member policies that exist only on production.
--
-- Same class of drift 0051 fixed for four tables (docs/62, docs/85 §0.3): the
-- policies below are live in production and enforce tenant isolation there, but
-- no migration ever created them. A database built from the lineage from
-- scratch therefore runs WITHOUT them — which is not a cosmetic difference. It
-- means every integration test and every new environment has been exercising a
-- database where a member of one org could read another org's approvals,
-- balances, transactions, alerts, subscriptions and password-reset tokens.
--
-- Every definition below was read off production, not invented:
--   pg_policies in the parity fingerprint (.lineage-parity/prod.json), which
--   records cmd, roles, using and check for all 7 rows.
--
-- Deliberate parity notes:
--   * The expressions are reproduced EXACTLY as production deparses them,
--     including `auth.uid()` unwrapped. The RLS performance guidance recommends
--     `(select auth.uid())` so the call is hoisted out of the per-row loop, but
--     applying that here would change every fingerprint line and turn a
--     correctness fix into new drift. Do it deliberately, on both sides, in its
--     own migration — not as a side effect of a backport.
--   * FOR ALL policies carry an explicit WITH CHECK in production, not just
--     USING. Omitting it would leave pg_policies.with_check NULL and re-create
--     the divergence.
--   * `role = 'member'` is kept literal; production stores it as
--     `'member'::text`.
--
-- Idempotent: the migration runner drops the policies this file declares before
-- re-applying it (scopedDrops in packages/db/src/migrate-supabase.ts), so a
-- plain `create policy` is safe to re-run. Applying this to production, which
-- already has all seven, drops and recreates them identically.

-- ── Org-scoped tables: a member sees rows of the orgs they belong to ───────

create policy approvals_org_member on public.approvals
  for all
  to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.org_id = approvals.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from memberships m
      where m.org_id = approvals.org_id and m.user_id = auth.uid()
    )
  );

create policy credit_alerts_org_member on public.credit_alerts
  for all
  to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.org_id = credit_alerts.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from memberships m
      where m.org_id = credit_alerts.org_id and m.user_id = auth.uid()
    )
  );

create policy credit_balances_org_member on public.credit_balances
  for all
  to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.org_id = credit_balances.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from memberships m
      where m.org_id = credit_balances.org_id and m.user_id = auth.uid()
    )
  );

create policy credit_transactions_org_member on public.credit_transactions
  for all
  to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.org_id = credit_transactions.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from memberships m
      where m.org_id = credit_transactions.org_id and m.user_id = auth.uid()
    )
  );

create policy subscriptions_org_member on public.subscriptions
  for all
  to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.org_id = subscriptions.org_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from memberships m
      where m.org_id = subscriptions.org_id and m.user_id = auth.uid()
    )
  );

-- ── Row-owner tables: a user sees only their own rows ─────────────────────

create policy password_reset_tokens_own on public.password_reset_tokens
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The one policy that lets a client write: self-insert a membership, and only
-- as a plain member. Elevating a role is therefore not possible through this
-- path — the WITH CHECK pins it. Production has no USING clause on it (INSERT
-- policies have no USING), so none is written here.
create policy memberships_insert_self on public.memberships
  for insert
  to authenticated
  with check (user_id = auth.uid() and role = 'member');

-- ── The id mechanism 0001 declares but can never apply ────────────────────
--
-- 0001 creates audit_events and secret_records with
-- `id bigint generated always as identity primary key`, but it uses
-- CREATE TABLE IF NOT EXISTS — and packages/db/migrations (the base the
-- embedded harness applies first, and the base this project's original
-- database was built from) already creates both tables with `id bigserial`.
-- The identity definition therefore never takes effect anywhere the table
-- already exists: a database built from both lineages gets a nextval default,
-- while production has the identity column. The parity tool reports it as:
--
--   ~ audit_events.id    fresh: … nextval('audit_events_id_seq'::regclass)
--                        prod:  … no default
--
-- That is not cosmetic. With GENERATED ALWAYS AS IDENTITY an INSERT that
-- supplies an explicit id fails; with a serial default it succeeds. So a test
-- can pass against the harness and fail against production. Note this is the
-- one item in this file that is not a backport: production is already correct
-- here and the fix is to stop the fresh schema from diverging from it.
--
-- Guarded in both directions, so it is a no-op on production (already identity)
-- and on a database where 0001 did create the tables itself.

do $$
declare
  t text;
begin
  foreach t in array array['audit_events', 'secret_records'] loop
    if exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = t
         and column_name = 'id'
         and is_identity = 'NO'
    ) then
      -- Drop the serial default and its sequence before adding identity: PG
      -- creates <table>_<column>_seq for the identity, and the bigserial one
      -- already holds that name.
      execute format('alter table public.%I alter column id drop default', t);
      execute format('drop sequence if exists public.%I_id_seq', t);
      execute format('alter table public.%I alter column id add generated always as identity', t);
    end if;
  end loop;
end $$;
