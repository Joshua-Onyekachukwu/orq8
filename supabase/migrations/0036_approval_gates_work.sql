-- 0036 — an approval names the work it gates, and can release it.
--
-- docs/66 §66.14 (Gap A) recorded the defect precisely: an `approvals` row
-- carried an `action` string and a cost, but no reference to the task or tool
-- it was gating. The founder was shown a sentence and asked to decide it, and
-- the product had no way to connect that decision back to the work — so an
-- approved decision released nothing, and a rejected one stopped nothing. A
-- founder could approve a request in the Command Center and watch the task sit
-- in `pending` forever.
--
-- Three columns close that:
--
--   task_id      which task this decision gates. Its presence is what makes a
--                decision consequential: approve resumes that task, reject
--                cancels it with the founder's reason attached.
--   tool_id      which tool the agent asked to use, when the gate came from a
--                tool call rather than the task itself.
--   tool_params  the exact call the agent wanted to make. Stored because an
--                approval of "do the thing" without the arguments is not an
--                approval of anything specific — the founder has to see what
--                they are authorising.
--   released_at  when the gate was opened AND the work resumed. This is what
--                makes a grant single-use: the executor consumes the approval
--                as it proceeds, so a second run cannot ride the same decision.
--
-- `tasks.status` gains `awaiting_approval` (no constraint change — the column
-- is free text). A task waiting on a human must not read as `pending`: the
-- batch runner selects `pending`, and a task that is really waiting for the
-- founder must not be silently re-executed by a background pass.

alter table public.approvals
  add column if not exists task_id uuid references public.tasks(id) on delete cascade,
  add column if not exists tool_id text,
  add column if not exists tool_params jsonb,
  add column if not exists released_at timestamptz;

-- Grant lookup on resume: (org, task, status) is the exact shape the executor
-- and the decision handler both ask for.
create index if not exists approvals_task_idx
  on public.approvals(task_id, status);

-- One open decision per task. A task cannot be waiting on two answers at once:
-- it pauses at the first thing the founder has to rule on, and the next gate is
-- raised only after that one is resolved. The database enforces it rather than
-- trusting every call site to check first.
create unique index if not exists approvals_one_pending_per_task
  on public.approvals(task_id)
  where status = 'pending' and task_id is not null;

comment on column public.approvals.task_id is
  'The task this decision gates. Approving resumes it; rejecting cancels it with decision_note as the reason.';
comment on column public.approvals.released_at is
  'Set when the gate was opened and the gated work resumed — makes the grant single-use.';
