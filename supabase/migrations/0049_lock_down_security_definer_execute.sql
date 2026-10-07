-- 0049 — Lock down SECURITY DEFINER functions exposed via PostgREST.
--
-- The Supabase security advisor flagged five SECURITY DEFINER functions in
-- public as executable by `anon`/`authenticated` (lints 0028 + 0029). The
-- application owns access control in its own API and writes through its
-- pooler role (postgres, the functions' owner), so PostgREST's anon and
-- authenticated roles have no legitimate call path into any of them — and
-- append_audit_event was actively dangerous: migration 0016 granted anon and
-- authenticated EXECUTE, meaning an unauthenticated RPC could forge
-- audit-chain rows (the tamper-evident record the whole governance model
-- rests on).
--
-- After this migration each function keeps EXECUTE only where a real caller
-- needs it:
--   append_audit_event      — the API writes audits as the owning role;
--                             service_role granted explicitly for completeness.
--   handle_new_user         — Supabase Auth fires the auth.users trigger as
--                             supabase_auth_admin; the PUBLIC default is
--                             revoked, so that role is granted explicitly.
--   set_updated_at          — trigger function on 21 tables; fired by the
--                             API's owning role and (in principle) Supabase
--                             Auth writes.
--   get_user_org_id /       — no callers outside the owning role today
--   is_platform_admin         (no RLS policy or view references them; the
--                             policies inline auth.uid() membership checks).
--
-- Consequence worth recording: PostgREST-direct writes by authenticated
-- clients to trigger-bearing tables would now fail on the trigger. That is
-- intentional — production writes go through the API as the owning role, and
-- any future PostgREST-direct write path is a policy decision, not a default.

-- The REVOKE from PUBLIC is unconditional. Each function, and the Supabase-only
-- roles (anon, authenticated, service_role, supabase_auth_admin), are guarded on
-- existence so the migration also applies cleanly to non-Supabase environments
-- (e.g. the embedded test database), where three of the five functions and all
-- of those roles do not exist.
DO $$
DECLARE
  sigs            text[] := ARRAY[
    'append_audit_event(uuid, text, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, text, integer, text, timestamptz)',
    'get_user_org_id()',
    'is_platform_admin()',
    'handle_new_user()',
    'set_updated_at()'
  ];
  auth_admin_fns  text[] := ARRAY['handle_new_user()', 'set_updated_at()'];
  sig             text;
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    IF to_regprocedure('public.' || sig) IS NULL THEN
      CONTINUE; -- function not present in this environment; nothing to lock down
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', sig);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', sig);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', sig);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', sig);
    END IF;
    IF sig = ANY (auth_admin_fns)
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO supabase_auth_admin', sig);
    END IF;
  END LOOP;
END
$$;
