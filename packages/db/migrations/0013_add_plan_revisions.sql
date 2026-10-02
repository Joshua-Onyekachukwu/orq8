-- Adds plan_revisions (docs/71 §R item 4): the Plan page is a living document
-- and the team (Atlas + agents) drafts revisions; the founder ratifies one to
-- make it direction. Until ratified, the previous revision stays direction —
-- unratified drafts never silently take over. All additive.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"rev" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL, -- draft | ratified | rejected
	"title" text NOT NULL,
	"summary" text,
	"content" jsonb DEFAULT '{}' NOT NULL, -- plan sections: whatWereBuilding, whoItsFor, howItMakesMoney, currentFocus, kpis
	"author_type" text DEFAULT 'agent' NOT NULL, -- user | agent
	"author_id" uuid,
	"author_name" text NOT NULL,
	"ratified_at" timestamp with time zone,
	"ratified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_revisions_org_created_idx" ON "plan_revisions" ("org_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_revisions_org_rev_idx" ON "plan_revisions" ("org_id", "rev");
