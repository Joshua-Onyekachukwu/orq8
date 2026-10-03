-- docs/80 Phase 2 — delegation recursion guard.
--
-- A sub-task created by the delegation orchestrator now records its parent, so
-- `services/delegation-guard.ts` can walk the chain and refuse a task that would
-- exceed the configured depth. Plain uuid (no FK) for the same reason the
-- squads table uses one: tasks cascade on org delete, and a self-referencing FK
-- would make the insert order matter.
--
-- supabase/migrations/0044 carries the same change for the hosted lineage.

alter table public.tasks
  add column if not exists parent_task_id uuid;

create index if not exists tasks_parent_idx on public.tasks (parent_task_id);
