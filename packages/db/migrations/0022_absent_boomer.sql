CREATE TABLE "agent_integration_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text,
	"role" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_autonomy" text DEFAULT 'execute_with_approval' NOT NULL,
	"suggested_department_slug" text,
	"suggested_team_slug" text,
	"typical_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" uuid,
	"event_name" text NOT NULL,
	"properties" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'generated' NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_fingerprint" text NOT NULL,
	"description" text,
	"website_url" text,
	"website_title" text,
	"website_summary" text,
	"website_error" text,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposal" jsonb,
	"status" text DEFAULT 'analysis' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"provider" text,
	"capability" text,
	"location" text,
	"owner_agent_id" uuid,
	"reusable" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"source" text DEFAULT 'builtin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"context" text,
	"rationale" text,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" text,
	"source" text,
	"actor_type" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "connector_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid,
	"task_id" uuid,
	"provider_id" uuid,
	"provider" text NOT NULL,
	"capability" text NOT NULL,
	"action" text NOT NULL,
	"provider_resource_id" text,
	"provider_url" text,
	"status" text NOT NULL,
	"summary" text,
	"result" jsonb,
	"error" text,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approval_id" uuid,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"threshold" integer NOT NULL,
	"message" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"email_sent" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"task_id" uuid,
	"job_id" uuid,
	"agent_id" uuid,
	"estimate_credits" integer NOT NULL,
	"settled_credits" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"decision_type" text DEFAULT 'operational' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"decision_maker_type" text DEFAULT 'user' NOT NULL,
	"decision_maker_id" uuid,
	"decision_maker_name" text,
	"what_was_decided" text NOT NULL,
	"rationale" text,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_outcome" text,
	"actual_outcome" text,
	"outcome_filed_at" timestamp with time zone,
	"prediction_accuracy" text,
	"founder_verdict" text,
	"founder_verdict_note" text,
	"founder_verdict_at" timestamp with time zone,
	"reversal_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lessons_learned" text,
	"council_detail" jsonb,
	"strategy_id" uuid,
	"objective_id" uuid,
	"task_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"mission" text,
	"functions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"teams" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"typical_goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"industry" text,
	"org_size" text,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"org_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"head" text,
	"budget" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engineering_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"task_id" uuid,
	"repository_id" uuid NOT NULL,
	"branch" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"acceptance_criteria" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"assignee_id" uuid NOT NULL,
	"tests_summary" jsonb,
	"lint_summary" jsonb,
	"build_summary" jsonb,
	"diff_summary" jsonb,
	"pr_id" uuid,
	"qa_result" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"action" text NOT NULL,
	"agent_id" uuid,
	"task_title_template" text,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"strategy_id" uuid,
	"objective_id" uuid,
	"key_result_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" text DEFAULT 'high' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"owner_agent_id" uuid,
	"estimated_hours" numeric,
	"actual_hours" numeric,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL,
	"approval_required_for" jsonb,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"credential_type" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"public_ref" text,
	"token_expires_at" timestamp with time zone,
	"scopes" jsonb,
	"refresh_token_hash" text,
	"refresh_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"scopes" jsonb,
	"connected_at" timestamp with time zone,
	"last_interaction_at" timestamp with time zone,
	"error" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"orgs_processed" integer DEFAULT 0 NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "key_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'on_track' NOT NULL,
	"metric_type" text DEFAULT 'numeric' NOT NULL,
	"metric_start" numeric,
	"metric_target" numeric,
	"metric_current" numeric,
	"unit" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"confidence" integer DEFAULT 80 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"relation_type" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"agent_id" uuid,
	"task_id" uuid,
	"success" boolean NOT NULL,
	"error" text,
	"duration_ms" integer,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"retry_attempt" integer DEFAULT 0 NOT NULL,
	"routing_source" text DEFAULT 'default' NOT NULL,
	"routing_reason" text,
	"provider_cost_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"credits_attributed" integer DEFAULT 0 NOT NULL,
	"pricing_source" text DEFAULT 'unknown' NOT NULL,
	"key_source" text DEFAULT 'platform' NOT NULL,
	"provider_key_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_lockouts" (
	"email" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"provider" text NOT NULL,
	"transport" text DEFAULT 'connector' NOT NULL,
	"endpoint" text,
	"auth_type" text DEFAULT 'connector_oauth' NOT NULL,
	"credential_ref" text,
	"status" text DEFAULT 'unconfigured' NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"allowed_agents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"input_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"required_capability" text,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"supports_dry_run" boolean DEFAULT false NOT NULL,
	"idempotent" boolean DEFAULT false NOT NULL,
	"audit_required" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"strategy_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" text DEFAULT 'high' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"owner_agent_id" uuid,
	"start_date" timestamp with time zone,
	"target_date" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"rev" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"author_type" text DEFAULT 'agent' NOT NULL,
	"author_id" uuid,
	"author_name" text NOT NULL,
	"ratified_at" timestamp with time zone,
	"ratified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"summary" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"owner" text NOT NULL,
	"default_branch" text NOT NULL,
	"description" text,
	"private" boolean DEFAULT false NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_ref_id" text,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"framework_summary" text,
	"files_count" integer DEFAULT 0 NOT NULL,
	"size_bytes" integer,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"ahead" integer DEFAULT 0 NOT NULL,
	"behind" integer DEFAULT 0 NOT NULL,
	"last_commit_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_file_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"body" text NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"path" text NOT NULL,
	"branch" text NOT NULL,
	"sha" text,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"language" text,
	"is_binary" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_prs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"provider_pr_number" integer,
	"provider_pr_url" text,
	"title" text NOT NULL,
	"body" text,
	"head_branch" text NOT NULL,
	"base_branch" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"author_id" uuid NOT NULL,
	"author_type" text NOT NULL,
	"risk_assessment" jsonb,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"approval_id" uuid,
	"approved_by" uuid,
	"merged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"branch" text NOT NULL,
	"command" text NOT NULL,
	"working_dir" text NOT NULL,
	"runner_env" jsonb,
	"state" text DEFAULT 'queued' NOT NULL,
	"allocated_credits" integer DEFAULT 0 NOT NULL,
	"used_credits" integer DEFAULT 0 NOT NULL,
	"timeout_ms" integer DEFAULT 120000 NOT NULL,
	"max_memory_mb" integer DEFAULT 512 NOT NULL,
	"stdout" text,
	"stderr" text,
	"exit_code" integer,
	"result_summary" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"change_description" text NOT NULL,
	"proposed_departments" jsonb,
	"proposed_agents" jsonb,
	"projected_workload" jsonb,
	"projected_cost" jsonb,
	"projected_risk" text,
	"bottlenecks" jsonb,
	"assumptions" text[],
	"metrics" jsonb,
	"recommendation" text,
	"proposal" jsonb,
	"state" text DEFAULT 'draft' NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"squad_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"objective" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"parent_task_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" text DEFAULT 'high' NOT NULL,
	"time_horizon" text,
	"start_date" timestamp with time zone,
	"target_date" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"mission" text,
	"responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"department_slug" text,
	"industry" text,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"org_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"department_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"lead" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"title" text,
	"external_event_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "autonomy_level" text DEFAULT 'execute_with_approval' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "tasks_failed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "credits_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "authority" jsonb DEFAULT '{"canCreateTasks":true,"canExecuteTasks":true,"canAccessCompanyInfo":true,"canCommunicateExternally":false,"canModifyResources":false,"spendingLimitCents":0,"requiresApprovalFor":["financial_commitments","external_communications","irreversible_actions","high_impact_decisions"],"forbiddenActions":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "tool_id" text;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "tool_params" jsonb;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_memory" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_memory" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_memory" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "credit_balances" ADD COLUMN "reserved_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "provider_cost_usd" numeric(14, 8);--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "squad_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "initiative_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "estimated_credits" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_task_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_integration_access" ADD CONSTRAINT "agent_integration_access_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_integration_access" ADD CONSTRAINT "agent_integration_access_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_integration_access" ADD CONSTRAINT "agent_integration_access_provider_id_integration_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integration_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_imports" ADD CONSTRAINT "business_imports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_imports" ADD CONSTRAINT "business_imports_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_registry" ADD CONSTRAINT "capability_registry_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_registry" ADD CONSTRAINT "capability_registry_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_decisions" ADD CONSTRAINT "company_decisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_outcomes" ADD CONSTRAINT "connector_outcomes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_outcomes" ADD CONSTRAINT "connector_outcomes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_outcomes" ADD CONSTRAINT "connector_outcomes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_outcomes" ADD CONSTRAINT "connector_outcomes_provider_id_integration_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integration_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_outcomes" ADD CONSTRAINT "connector_outcomes_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_alerts" ADD CONSTRAINT "credit_alerts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_templates" ADD CONSTRAINT "department_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_tasks" ADD CONSTRAINT "engineering_tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_tasks" ADD CONSTRAINT "engineering_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_tasks" ADD CONSTRAINT "engineering_tasks_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_tasks" ADD CONSTRAINT "engineering_tasks_pr_id_repository_prs_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."repository_prs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rules" ADD CONSTRAINT "event_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rules" ADD CONSTRAINT "event_rules_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_key_result_id_key_results_id_fk" FOREIGN KEY ("key_result_id") REFERENCES "public"."key_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_capabilities" ADD CONSTRAINT "integration_capabilities_provider_id_integration_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integration_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_provider_id_integration_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integration_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_providers" ADD CONSTRAINT "integration_providers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_from_entity_id_knowledge_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."knowledge_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relations" ADD CONSTRAINT "knowledge_relations_to_entity_id_knowledge_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."knowledge_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_performance" ADD CONSTRAINT "llm_performance_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tools" ADD CONSTRAINT "mcp_tools_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tools" ADD CONSTRAINT "mcp_tools_server_id_mcp_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_revisions" ADD CONSTRAINT "plan_revisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_events" ADD CONSTRAINT "repo_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_events" ADD CONSTRAINT "repo_events_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_provider_id_integration_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integration_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_branches" ADD CONSTRAINT "repository_branches_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_file_contents" ADD CONSTRAINT "repository_file_contents_file_id_repository_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."repository_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_files" ADD CONSTRAINT "repository_files_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_prs" ADD CONSTRAINT "repository_prs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_runs" ADD CONSTRAINT "sandbox_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_runs" ADD CONSTRAINT "sandbox_runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_agents" ADD CONSTRAINT "squad_agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_agents" ADD CONSTRAINT "squad_agents_squad_id_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_agents" ADD CONSTRAINT "squad_agents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_templates" ADD CONSTRAINT "team_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_integration_access_org_agent_idx" ON "agent_integration_access" USING btree ("org_id","agent_id");--> statement-breakpoint
CREATE INDEX "agent_jobs_claim_idx" ON "agent_jobs" USING btree ("status","run_at","priority");--> statement-breakpoint
CREATE INDEX "agent_jobs_org_created_idx" ON "agent_jobs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_jobs_task_idx" ON "agent_jobs" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_jobs_open_task_uniq" ON "agent_jobs" USING btree ("org_id","type","task_id") WHERE "agent_jobs"."status" in ('pending', 'running') and "agent_jobs"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "atemplates_org_idx" ON "agent_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "atemplates_category_idx" ON "agent_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "analytics_events_org_idx" ON "analytics_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "analytics_events_user_idx" ON "analytics_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_events_name_idx" ON "analytics_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "briefings_org_created_idx" ON "briefings" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "briefings_org_kind_period_idx" ON "briefings" USING btree ("org_id","kind","period_start");--> statement-breakpoint
CREATE INDEX "business_imports_org_idx" ON "business_imports" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "business_imports_org_status_idx" ON "business_imports" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "business_imports_org_fingerprint_idx" ON "business_imports" USING btree ("org_id","source_fingerprint");--> statement-breakpoint
CREATE INDEX "capability_registry_org_idx" ON "capability_registry" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capability_registry_org_name_unique" ON "capability_registry" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "company_decisions_org_idx" ON "company_decisions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "company_decisions_org_created_idx" ON "company_decisions" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "connector_outcomes_org_idx" ON "connector_outcomes" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "connector_outcomes_agent_idx" ON "connector_outcomes" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "connector_outcomes_task_idx" ON "connector_outcomes" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "credit_alerts_org_idx" ON "credit_alerts" USING btree ("org_id","sent_at");--> statement-breakpoint
CREATE INDEX "credit_alerts_type_idx" ON "credit_alerts" USING btree ("org_id","type");--> statement-breakpoint
CREATE INDEX "credit_reservations_org_status_idx" ON "credit_reservations" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "credit_reservations_task_idx" ON "credit_reservations" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "credit_reservations_expires_idx" ON "credit_reservations" USING btree ("expires_at") WHERE "credit_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "decisions_org_idx" ON "decisions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "decisions_org_type_idx" ON "decisions" USING btree ("org_id","decision_type");--> statement-breakpoint
CREATE INDEX "decisions_org_status_idx" ON "decisions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "dtemplates_org_idx" ON "department_templates" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dtemplates_slug_idx" ON "department_templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "departments_org_idx" ON "departments" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_org_name_idx" ON "departments" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_hash_idx" ON "email_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_created_idx" ON "email_verification_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "engineering_tasks_org_idx" ON "engineering_tasks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "event_rules_org_idx" ON "event_rules" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rules_org_provider_type_idx" ON "event_rules" USING btree ("org_id","provider","event_type");--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "files" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "files_key_idx" ON "files" USING btree ("key");--> statement-breakpoint
CREATE INDEX "initiatives_org_idx" ON "initiatives" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "initiatives_objective_idx" ON "initiatives" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "initiatives_kr_idx" ON "initiatives" USING btree ("key_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_capabilities_provider_capability_idx" ON "integration_capabilities" USING btree ("provider_id","capability");--> statement-breakpoint
CREATE INDEX "integration_credentials_provider_idx" ON "integration_credentials" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_providers_org_name_idx" ON "integration_providers" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_idx" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "job_runs_job_started_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "kresults_org_idx" ON "key_results" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "kresults_objective_idx" ON "key_results" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "knowledge_entities_org_type_idx" ON "knowledge_entities" USING btree ("org_id","type");--> statement-breakpoint
CREATE INDEX "knowledge_entities_org_name_idx" ON "knowledge_entities" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "knowledge_relations_org_from_idx" ON "knowledge_relations" USING btree ("org_id","from_entity_id");--> statement-breakpoint
CREATE INDEX "knowledge_relations_org_to_idx" ON "knowledge_relations" USING btree ("org_id","to_entity_id");--> statement-breakpoint
CREATE INDEX "llm_performance_org_model_idx" ON "llm_performance" USING btree ("org_id","model","created_at");--> statement-breakpoint
CREATE INDEX "llm_performance_org_created_idx" ON "llm_performance" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_performance_routing_idx" ON "llm_performance" USING btree ("org_id","routing_source","created_at");--> statement-breakpoint
CREATE INDEX "llm_performance_provider_key_idx" ON "llm_performance" USING btree ("provider_key_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_performance_org_agent_created_idx" ON "llm_performance" USING btree ("org_id","agent_id","created_at");--> statement-breakpoint
CREATE INDEX "login_lockouts_locked_idx" ON "login_lockouts" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "mcp_servers_org_idx" ON "mcp_servers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "mcp_tools_org_idx" ON "mcp_tools" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "mcp_tools_server_idx" ON "mcp_tools" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_tools_server_name_unique" ON "mcp_tools" USING btree ("server_id","name");--> statement-breakpoint
CREATE INDEX "notifications_org_created_idx" ON "notifications" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_org_read_idx" ON "notifications" USING btree ("org_id","read");--> statement-breakpoint
CREATE INDEX "objectives_org_idx" ON "objectives" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "objectives_strategy_idx" ON "objectives" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "plan_revisions_org_created_idx" ON "plan_revisions" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_revisions_org_rev_idx" ON "plan_revisions" USING btree ("org_id","rev");--> statement-breakpoint
CREATE INDEX "repo_events_org_idx" ON "repo_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "repositories_org_idx" ON "repositories" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_org_provider_ref_idx" ON "repositories" USING btree ("org_id","provider_id","provider_ref_id");--> statement-breakpoint
CREATE INDEX "branches_repository_idx" ON "repository_branches" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_files_repository_idx" ON "repository_files" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_files_repo_branch_path_idx" ON "repository_files" USING btree ("repository_id","branch","path");--> statement-breakpoint
CREATE INDEX "repository_prs_repository_idx" ON "repository_prs" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "sandbox_runs_org_idx" ON "sandbox_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sandbox_runs_repository_idx" ON "sandbox_runs" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "simulations_org_idx" ON "simulations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "squad_agents_org_squad_idx" ON "squad_agents" USING btree ("org_id","squad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "squad_agents_squad_agent_unique" ON "squad_agents" USING btree ("squad_id","agent_id");--> statement-breakpoint
CREATE INDEX "squads_org_idx" ON "squads" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "squads_status_idx" ON "squads" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "strategies_org_idx" ON "strategies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ttemplates_org_idx" ON "team_templates" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ttemplates_slug_idx" ON "team_templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "teams_org_idx" ON "teams" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "teams_dept_idx" ON "teams" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_name_idx" ON "teams" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "webhook_events_org_status_idx" ON "webhook_events" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "webhook_events_provider_idx" ON "webhook_events" USING btree ("provider","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_org_provider_ext_idx" ON "webhook_events" USING btree ("org_id","provider","external_event_id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_squad_id_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_dept_idx" ON "agents" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "approvals_task_idx" ON "approvals" USING btree ("task_id","status");--> statement-breakpoint
CREATE INDEX "company_memory_embedding_idx" ON "company_memory" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "credit_balances_org_period_unique" ON "credit_balances" USING btree ("org_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_org_idem_idx" ON "credit_transactions" USING btree ("org_id","idempotency_key") WHERE "credit_transactions"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "credit_transactions_task_idx" ON "credit_transactions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "goals_due_date_idx" ON "goals" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "goals_team_idx" ON "goals" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tasks_team_idx" ON "tasks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tasks_priority_idx" ON "tasks" USING btree ("org_id","priority");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");