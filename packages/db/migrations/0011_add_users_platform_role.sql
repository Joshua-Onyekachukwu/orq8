-- Adds users.platform_role — the platform-level admin gate for /v1/admin/* and
-- the /admin console. 'user' is the default; only 'admin' (or a matching
-- PLATFORM_ADMIN_EMAILS bootstrap entry) may read platform-wide data.
-- The membership role (owner|admin|member) remains org-scoped and grants no
-- platform access, closing the org-owner → platform-admin privilege escalation.
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role" text DEFAULT 'user' NOT NULL;
