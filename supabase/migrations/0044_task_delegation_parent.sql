-- 0044 — docs/80 Phase 2: delegation recursion guard. Same statements as
-- packages/db/migrations/0020, kept in parity for hosted deployments.
--
-- `tasks.parent_task_id` records the delegation parent so the guard can bound
-- the depth/sibling count of sub-tasks. Plain uuid, no FK (matches `squads`).

alter table public.tasks
  add column if not exists parent_task_id uuid;

create index if not exists tasks_parent_idx on public.tasks (parent_task_id);
