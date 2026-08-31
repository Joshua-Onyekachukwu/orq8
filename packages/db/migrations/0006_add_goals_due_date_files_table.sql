-- Add due_date column to goals (schema has it but migration 0005 didn't include it)
ALTER TABLE "goals" ADD COLUMN "due_date" timestamp with time zone;

-- Create the files table (defined in schema but never migrated)
CREATE TABLE "files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "name" text NOT NULL,
  "key" text NOT NULL,
  "mime_type" text NOT NULL,
  "size" integer NOT NULL,
  "bucket" text DEFAULT 'orq8-files' NOT NULL,
  "uploaded_by" uuid,
  "agent_id" uuid,
  "task_id" uuid,
  "metadata" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign keys for files
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"("organizations")("id");
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk"
  FOREIGN KEY ("uploaded_by") REFERENCES "public"("users")("id");
ALTER TABLE "files" ADD CONSTRAINT "files_agent_id_agents_id_fk"
  FOREIGN KEY ("agent_id") REFERENCES "public"("agents")("id");
ALTER TABLE "files" ADD CONSTRAINT "files_task_id_tasks_id_fk"
  FOREIGN KEY ("task_id") REFERENCES "public"("tasks")("id");

-- Performance indexes for files
CREATE INDEX "files_org_idx" ON "files" ("org_id");
CREATE INDEX "files_agent_idx" ON "files" ("agent_id");
CREATE INDEX "files_task_idx" ON "files" ("task_id");

-- Performance indexes for frequently queried columns across all tables
-- Dashboard queries
CREATE INDEX IF NOT EXISTS "agents_org_status_idx" ON "agents" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "tasks_org_status_idx" ON "tasks" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "tasks_org_priority_idx" ON "tasks" ("org_id", "priority");
CREATE INDEX IF NOT EXISTS "tasks_agent_idx" ON "tasks" ("agent_id");
CREATE INDEX IF NOT EXISTS "tasks_goal_idx" ON "tasks" ("goal_id");
CREATE INDEX IF NOT EXISTS "approvals_org_status_idx" ON "approvals" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "activity_events_org_created_idx" ON "activity_events" ("org_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "credit_transactions_org_created_idx" ON "credit_transactions" ("org_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "credit_balances_org_idx" ON "credit_balances" ("org_id");
CREATE INDEX IF NOT EXISTS "company_memory_org_idx" ON "company_memory" ("org_id");
CREATE INDEX IF NOT EXISTS "goals_org_status_idx" ON "goals" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "goals_due_date_idx" ON "goals" ("due_date");
