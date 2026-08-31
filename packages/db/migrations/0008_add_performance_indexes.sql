-- Performance indexes for frequently queried columns
-- All use IF NOT EXISTS to be idempotent
CREATE INDEX IF NOT EXISTS "agents_org_status_idx" ON "agents" ("org_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_org_status_idx" ON "tasks" ("org_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_priority_idx" ON "tasks" ("org_id", "priority");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_date_idx" ON "tasks" ("due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_org_status_idx" ON "approvals" ("org_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_events_org_created_idx" ON "activity_events" ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_transactions_org_created_idx" ON "credit_transactions" ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_balances_org_idx" ON "credit_balances" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_memory_org_idx" ON "company_memory" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_org_status_idx" ON "goals" ("org_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_due_date_idx" ON "goals" ("due_date");
