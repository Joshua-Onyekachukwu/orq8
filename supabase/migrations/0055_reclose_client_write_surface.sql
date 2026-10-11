-- 0055 — Close the client write surface 0052 re-opened, and index 0054's keys.
--
-- WHY THIS EXISTS
-- 0052 was written to resolve policy drift, and it resolved it in the wrong
-- direction. Production carried seven org-member policies the lineage did not
-- have, so the lineage was changed to match production
-- ("Backport the seven org-member policies that exist only on production").
-- Reading 0033 shows those seven are precisely the policies 0033 had *dropped*:
--
--   0033 §2  DROP POLICY memberships_insert_self        (self-insert escalation)
--   0033 §3  DROP POLICY approvals_org_member           (FOR ALL → read-only)
--   0033 §4  DROP POLICY credit_{balances,transactions,alerts}_org_member
--   0033 §4b DROP POLICY subscriptions_org_member       (billing is read-only)
--   0033 §5  DROP POLICY password_reset_tokens_own      (FOR ALL → SELECT own)
--
-- 0033's header states the intent in its own words: "Downgrades approvals from
-- FOR ALL to member read-only", "Restricts password_reset_tokens from FOR ALL to
-- SELECT (the API owns writes)", "close the self-insert escalation hole". 0052
-- reproduced production's definitions exactly — the case for that is argued in
-- 0052 itself, in the interest of parity — but parity with the unhardened side
-- is not a fix, and the direction of the repair was the one thing 0052 did not
-- check.
--
-- WHY IT MATTERS, IN RLS TERMS
-- Postgres RLS is permissive and OR'd: adding a `for all` policy to a table
-- cannot narrow anything, it can only *grant*. So on any database built from
-- this lineage, the moment 0052 ran, a plain member of an organization could,
-- through PostgREST with their own JWT:
--
--   * UPDATE their own `approvals` row to `status = 'approved'` — self-approving
--     the high-risk action the approval gate exists to stop, which is MVP-013's
--     whole subject;
--   * INSERT an `approvals` row already `approved`, bypassing the flow entirely;
--   * UPDATE `credit_balances.used_credits` and INSERT `credit_transactions` —
--     forging the credit ledger that docs/77 and MVP-015 measure against;
--   * UPDATE `subscriptions.plan` to `enterprise` and DELETE their subscription —
--     self-upgrading billing, on a product whose economics are credits;
--   * UPDATE `password_reset_tokens`, and INSERT their own `memberships` row.
--
-- The repository's own RLS proof says all of that must be refused, and it failed
-- on the branch the moment 0052 landed (`scripts/rls-security-e2e.ts` — the `rls`
-- proof in `scripts/proofs.mjs`, a blocking CI job): "A cannot approve own
-- request by writing the approval row", "A cannot rewrite own credit usage",
-- "A cannot upgrade own subscription plan by writing the row", "A cannot INSERT
-- a pre-approved approval row", "A can still read own subscription — rows 1 plan
-- enterprise". The proof was right and the backport was wrong; this migration
-- makes the database agree with the proof again instead of quieting the proof.
--
-- Nothing in the product relied on the writes that are being removed: the API
-- reaches every one of these tables through its own pool (billing.ts,
-- credits.ts, entitlements.ts, approvals), which is BYPASSRLS, and no client
-- code anywhere in apps/ writes them through PostgREST or supabase-js. Reads are
-- untouched — the member read policies 0033 created are re-asserted below.
--
-- APPLYING THIS TO PRODUCTION IS THE POINT
-- Production is the side that carries the broad policies, so a fresh database
-- and production only agree again once this migration has run in both. Until it
-- runs in production, the deployment accepts the writes listed above from any
-- signed-in member, and `lineage-parity.ts --supabase` will report the policy
-- difference — which is the honest reading, not drift to be backported away.
--
-- Second, unrelated repair in this file: 0054's `deals.owner_agent_id`,
-- `deals.account_id`, `tickets.assignee_agent_id` and `tickets.account_id` are
-- foreign keys with no *leading* index — the composite `(org_id, X)` indexes it
-- created cannot serve an FK lookup or a cascade — which breaks the 0034
-- invariant the same RLS proof checks ("every FK column has a leading index").
--
-- Idempotent: drops are guarded by name, creates by existence, indexes by name.

-- ── 1. Drop the write-granting policies 0052 restored ─────────────────────

drop policy if exists approvals_org_member on public.approvals;
drop policy if exists credit_alerts_org_member on public.credit_alerts;
drop policy if exists credit_balances_org_member on public.credit_balances;
drop policy if exists credit_transactions_org_member on public.credit_transactions;
drop policy if exists subscriptions_org_member on public.subscriptions;
drop policy if exists password_reset_tokens_own on public.password_reset_tokens;
-- 0033 dropped this one outright — "the API service role owns inserts" — and
-- never replaced it. Members join by invitation, which the API writes.
drop policy if exists memberships_insert_self on public.memberships;

-- ── 2. Re-assert the narrow client surface 0033 defined ───────────────────
-- Guarded rather than assumed: on a lineage built from scratch these already
-- exist (0033) and the block is a no-op; on a database whose narrow policies
-- were replaced by the hand-made broad ones, this restores the reads that the
-- drop above would otherwise leave unprotected.

do $$
declare
  pair record;
begin
  for pair in
    select * from (values
      ('credit_balances'),
      ('credit_transactions'),
      ('credit_alerts'),
      ('subscriptions')
    ) as t(tbl)
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public'
         and tablename = pair.tbl
         and policyname = pair.tbl || '_org_select'
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (
           exists (
             select 1 from public.memberships m
              where m.org_id = %I.org_id and m.user_id = auth.uid()
           )
         )',
        pair.tbl || '_org_select', pair.tbl, pair.tbl
      );
    end if;
  end loop;
end $$;

-- Approvals are the one org-scoped table where a client may write, and only to
-- file a pending request; the decision itself is the API's (MVP-013).
do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'approvals'
       and policyname = 'approvals_org_select'
  ) then
    create policy approvals_org_select on public.approvals
      for select to authenticated
      using (
        exists (
          select 1 from public.memberships m
           where m.org_id = approvals.org_id and m.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'approvals'
       and policyname = 'approvals_org_insert'
  ) then
    create policy approvals_org_insert on public.approvals
      for insert to authenticated
      with check (
        exists (
          select 1 from public.memberships m
           where m.org_id = approvals.org_id and m.user_id = auth.uid()
        )
        and status = 'pending'
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'password_reset_tokens'
       and policyname = 'password_reset_tokens_select_own'
  ) then
    create policy password_reset_tokens_select_own on public.password_reset_tokens
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- ── 3. Leading indexes for 0054's foreign keys (the 0034 invariant) ───────

create index if not exists deals_account_id_idx on public.deals(account_id);
create index if not exists deals_owner_agent_id_idx on public.deals(owner_agent_id);
create index if not exists tickets_account_id_idx on public.tickets(account_id);
create index if not exists tickets_assignee_agent_id_idx on public.tickets(assignee_agent_id);
