-- 0046 — docs/83 §jobs-race: enqueue-level dedup raced. enqueueJob checked
-- "is there an open job for this task?" and then inserted — two concurrent
-- executes could both see no open job and both insert (proven live: two
-- jobIds for one task). The claim guard still prevented double EXECUTION, but
-- the queue accumulated a stray job per race. The database now owns the
-- invariant the application meant, same statement shape as the drizzle
-- lineage's schema change (packages/db/src/schema.ts agent_jobs).
create unique index if not exists agent_jobs_open_task_uniq
  on agent_jobs (org_id, type, task_id)
  where status in ('pending', 'running') and task_id is not null;
