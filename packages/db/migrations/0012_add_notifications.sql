-- Adds notifications table. The notification system previously lived in an
-- in-memory Map (per-API-instance), so unread badges and history were lost on
-- every restart/deploy and inconsistent across multiple instances. Persist
-- per-org notifications here; SSE fan-out (services/realtime) stays ephemeral.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_org_created_idx" ON "notifications" ("org_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_org_read_idx" ON "notifications" ("org_id", "read");
