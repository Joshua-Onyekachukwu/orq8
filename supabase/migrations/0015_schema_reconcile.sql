-- ORQ8 — 0015: Schema reconciliation with packages/db/src/schema.ts
--
-- Production and CI build the database as a layered lineage: the historical
-- drizzle base tables first, then the supabase set (0001-0014) additively on
-- top. Some drizzle-era tables predate columns that schema.ts — the app's
-- source of truth — defines today, which made real operations 500 with
-- `column "... " of relation "..." does not exist` (e.g. hiring an AI
-- employee hit agents.tasks_failed).
--
-- This file closes that drift with additive, non-destructive guards so the
-- layered schema matches schema.ts exactly. It is safe to re-run.

-- agents: counters + last-active stamp added to schema.ts after the drizzle
-- base lineage was written (supabase 0001/0002 kept the existing table via
-- IF NOT EXISTS, so the columns were never back-filled).
alter table public.agents add column if not exists tasks_failed integer not null default 0;
alter table public.agents add column if not exists credits_used integer not null default 0;
alter table public.agents add column if not exists last_active_at timestamptz;
