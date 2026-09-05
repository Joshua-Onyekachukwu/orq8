-- 0007 — Simulation apply proposal (Task 5)
-- Adds the structured organizational proposal column used by the founder-approved
-- simulation apply flow. Pure additive; idempotent.

alter table public.simulations
  add column if not exists proposal jsonb;