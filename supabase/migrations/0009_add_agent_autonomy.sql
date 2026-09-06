-- 0009 — Per-agent autonomy levels (F12)
-- Configurable, server-side enforced. The column is read in the execution
-- path; a UI toggle alone can never authorize an action. Idempotent.

alter table public.agents
  add column if not exists autonomy_level text not null default 'execute_with_approval';

-- Existing rows keep working: execute_with_approval is the safe default
-- (matches the historical authority profile: execute with approval gates).