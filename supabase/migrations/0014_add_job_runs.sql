-- ORQ8 — 0014: Scheduled-job run log (automation health)
-- One row per execution of an INTERNAL_TOKEN-gated scheduled job: webhook
-- event processing, memory consolidation, anomaly scan, and daily/weekly/
-- monthly executive briefings. Written by the cron hooks themselves so a
-- founder can see — from inside the product — when each job last ran, whether
-- it succeeded, how many orgs it processed, and what it produced.
--
-- Rows are platform-wide (jobs run across every org) and store only aggregate
-- detail (counts/durations), never tokens or per-org payloads. Reads happen
-- through GET /v1/jobs/status behind normal session auth.

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  -- events_process_pending | memory_consolidate | anomaly_scan |
  -- briefing_daily | briefing_weekly | briefing_monthly
  job text not null,
  status text not null default 'success', -- success | error | partial
  trigger text not null default 'schedule', -- schedule | manual | api
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  duration_ms integer,
  orgs_processed integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists job_runs_job_started_idx on public.job_runs (job, started_at desc);
