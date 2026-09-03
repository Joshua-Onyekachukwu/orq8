-- Adds login_lockouts table (brute-force protection state, docs/37).
-- The table existed in the schema but was never migrated — without it the
-- brute-force plugin's DB writes fail silently and account lockout never
-- persists across restarts.
CREATE TABLE IF NOT EXISTS "login_lockouts" (
	"email" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_lockouts_locked_idx" ON "login_lockouts" ("locked_until");