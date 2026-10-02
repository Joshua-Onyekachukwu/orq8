-- 0038 — agent_jobs: the durable queue behind JOB_QUEUE_MODE=workers (docs/75,
-- backend phase, first slice). Identical shape to packages/db/migrations/0014 —
-- this file keeps the supabase lineage in parity for hosted deployments.

CREATE TABLE IF NOT EXISTS agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  type text NOT NULL,
  payload jsonb DEFAULT '{}' NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  max_attempts integer DEFAULT 3 NOT NULL,
  run_at timestamp with time zone DEFAULT now() NOT NULL,
  locked_at timestamp with time zone,
  locked_by text,
  last_error text,
  task_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_jobs_claim_idx ON agent_jobs (status, run_at, priority DESC);
CREATE INDEX IF NOT EXISTS agent_jobs_org_created_idx ON agent_jobs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_jobs_task_idx ON agent_jobs (task_id);
