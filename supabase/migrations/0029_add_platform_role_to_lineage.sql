-- 0029 — Add users.platform_role to the standalone supabase lineage.
--
-- packages/db drizzle migration 0011 originally introduced this column, and
-- production (created via the drizzle path) already has it. The CI-applied
-- standalone lineage (supabase/migrations, run by the DB Migrate workflow)
-- never carried it, so a FRESH database built only from this lineage would
-- boot without the platform admin gate — /v1/admin/* checks
-- users.platform_role = 'admin'.
--
-- Idempotent guarded ADD COLUMN: no-op on databases that already have it
-- (production), creates it on fresh ones. Default 'user' matches the drizzle
-- definition; the membership role (owner|admin|member) remains org-scoped and
-- grants no platform access.
--
-- Run automatically by the DB Migrate workflow on push to main. There is
-- nothing to run manually in the Supabase SQL Editor.

ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role text NOT NULL DEFAULT 'user';
