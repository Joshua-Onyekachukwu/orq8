-- Adds agent_jobs (docs/75 — backend phase, first slice): a durable Postgres
-- queue for agent work. Request handlers enqueue; a background worker claims
-- with FOR UPDATE SKIP LOCKED (multi-worker safe), retries with exponential
-- backoff, and reaps locks left by crashed workers. All additive.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"type" text NOT NULL, -- task.execute | command.run (extensible)
	"payload" jsonb DEFAULT '{}' NOT NULL, -- { taskId, ... } read by the worker's dispatcher
	"status" text DEFAULT 'pending' NOT NULL, -- pending | running | done | failed | dead
	"priority" integer DEFAULT 0 NOT NULL, -- higher runs first
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL, -- next eligible time (backoff moves it forward)
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"task_id" uuid, -- denormalized when the job is about one task, for indexes and ops queries
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_jobs_claim_idx" ON "agent_jobs" ("status", "run_at", "priority" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_jobs_org_created_idx" ON "agent_jobs" ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_jobs_task_idx" ON "agent_jobs" ("task_id");
