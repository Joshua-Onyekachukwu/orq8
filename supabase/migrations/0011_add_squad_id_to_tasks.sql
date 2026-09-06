-- 0011 — Link tasks to cross-agent squads (F13)
-- Idempotent. Requires 0010 (squads table) to exist first.

alter table public.tasks
  add column if not exists squad_id uuid references public.squads(id);

create index if not exists tasks_squad_idx on public.tasks(org_id, squad_id);