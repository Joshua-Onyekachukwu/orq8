-- ============================================================
-- 0033 — RLS hardening: multi-tenant isolation + privilege fixes
--
-- Context (STEP 1 audit): ORQ8's main flow does not use the Supabase
-- PostgREST surface — the API connects as the superuser role (BYPASSRLS).
-- These policies are defense in depth for the anon/authenticated surface
-- (a leaked anon key, a future PostgREST deployment, or direct SQL by a
-- restricted role). They must hold on their own.
--
-- What this migration does:
--   1. Enables RLS on five tables created after the 0001 convention
--      (email_verification_tokens, login_lockouts, job_runs,
--      department_templates, team_templates) with policies.
--   2. Closes the privilege-escalation hole in memberships: any
--      authenticated user could previously INSERT a membership row for
--      themselves into any organization (role = 'member') and gain full
--      membership-scoped access to that company. Membership creation now
--      belongs to the API (service role) only; clients keep read of their
--      own memberships and the existing admin-managed update path.
--   3. Downgrades approvals from FOR ALL to member read-only. The decision
--      status is written by the app's approval flow (service role), so a
--      member can no longer approve their own request by writing the row
--      directly (STEP 3.4).
--   4. Downgrades credit_balances and credit_transactions to member
--      read-only. Credit state changes only through the API; a client can
--      no longer mint credits or rewrite history.
--   5. Restricts password_reset_tokens from FOR ALL to SELECT (the API
--      creates/consumes tokens server-side; clients never need writes).
--   6. Adds missing FK indexes on the newly protected tables.
--   7. Scopes template catalogs: org-created templates (org_id set) are
--      visible only to that company's members; the system catalog
--      (org_id IS NULL) stays readable by every authenticated user.
--   8. Restricts client approval inserts to status = 'pending': the app flow
--      owns decisions, so a member can no longer write a pre-approved row.
--   9. Downgrades subscriptions to member read-only: plan/status changes
--      belong to the billing flow in the API (service role), not clients.
--
-- All statements are idempotent. No data is dropped or rewritten.
-- Non-destructive: safe to apply to a populated environment.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enable + force RLS on previously unprotected tables
-- ------------------------------------------------------------

-- email_verification_tokens (0023): per-user token hashes. Owner-only read;
-- writes belong to the API (token mint/consume). No insert policy for clients.
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verification_tokens FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'email_verification_tokens_own') THEN
    CREATE POLICY email_verification_tokens_own ON public.email_verification_tokens
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- login_lockouts (0023 companion state, docs/37): brute-force protection.
-- Service-role only; no client policies at all.
ALTER TABLE public.login_lockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_lockouts FORCE ROW LEVEL SECURITY;

-- job_runs (0014): platform operations ledger. Service-role only.
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_runs FORCE ROW LEVEL SECURITY;

-- Global catalog tables (0017): readable by any authenticated user (the UI
-- lists templates company-wide), writable only by the API.
ALTER TABLE public.department_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.team_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS department_templates_select ON public.department_templates;
DROP POLICY IF EXISTS team_templates_select ON public.team_templates;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'department_templates_select') THEN
    CREATE POLICY department_templates_select ON public.department_templates
      FOR SELECT TO authenticated
      USING (
        org_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = department_templates.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'team_templates_select') THEN
    CREATE POLICY team_templates_select ON public.team_templates
      FOR SELECT TO authenticated
      USING (
        org_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = team_templates.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. memberships: close the self-insert escalation hole
--    (drop memberships_insert_self; API service role owns inserts)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS memberships_insert_self ON public.memberships;

-- ------------------------------------------------------------
-- 3. approvals: members read; the app flow writes decisions
-- ------------------------------------------------------------
DROP POLICY IF EXISTS approvals_org_member ON public.approvals;
DROP POLICY IF EXISTS approvals_org_insert ON public.approvals;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'approvals_org_select') THEN
    CREATE POLICY approvals_org_select ON public.approvals
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = approvals.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'approvals_org_insert') THEN
    CREATE POLICY approvals_org_insert ON public.approvals
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = approvals.org_id AND m.user_id = auth.uid()
        )
        AND status = 'pending'
      );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. credits: read-only for members (balances, transactions, alerts)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS credit_balances_org_member ON public.credit_balances;
DROP POLICY IF EXISTS credit_transactions_org_member ON public.credit_transactions;
DROP POLICY IF EXISTS credit_alerts_org_member ON public.credit_alerts;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'credit_balances_org_select') THEN
    CREATE POLICY credit_balances_org_select ON public.credit_balances
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = credit_balances.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'credit_transactions_org_select') THEN
    CREATE POLICY credit_transactions_org_select ON public.credit_transactions
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = credit_transactions.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'credit_alerts_org_select') THEN
    CREATE POLICY credit_alerts_org_select ON public.credit_alerts
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = credit_alerts.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4b. subscriptions: billing state is read-only for clients
-- ------------------------------------------------------------
DROP POLICY IF EXISTS subscriptions_org_member ON public.subscriptions;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subscriptions_org_select') THEN
    CREATE POLICY subscriptions_org_select ON public.subscriptions
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = subscriptions.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. password_reset_tokens: read-own only (API owns writes)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS password_reset_tokens_own ON public.password_reset_tokens;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'password_reset_tokens_select_own') THEN
    CREATE POLICY password_reset_tokens_select_own ON public.password_reset_tokens
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. Missing FK / lookup indexes on the newly protected tables
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx
  ON public.email_verification_tokens (user_id);
CREATE INDEX IF NOT EXISTS login_lockouts_locked_until_idx
  ON public.login_lockouts (locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_runs_started_at_idx
  ON public.job_runs (started_at);
