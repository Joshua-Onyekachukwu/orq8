CREATE TABLE "activity_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid,
	"task_id" uuid,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"reason" text,
	"cost" integer DEFAULT 0 NOT NULL,
	"department" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"department" text,
	"status" text DEFAULT 'active' NOT NULL,
	"weekly_cost" integer DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"current_task" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" uuid,
	"action" text NOT NULL,
	"description" text,
	"cost" integer DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"source" text,
	"agent_id" uuid,
	"task_id" uuid,
	"importance" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"included_credits" integer DEFAULT 0 NOT NULL,
	"purchased_credits" integer DEFAULT 0 NOT NULL,
	"used_credits" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text,
	"reference_id" uuid,
	"reference_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"step" text DEFAULT 'organization' NOT NULL,
	"organization" jsonb,
	"constitution" jsonb,
	"agent_selections" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"included_credits" integer DEFAULT 0 NOT NULL,
	"max_agents" integer DEFAULT 3 NOT NULL,
	"stripe_subscription_id" text,
	"cancel_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"goal_id" uuid,
	"agent_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "plan" SET DEFAULT 'trial';--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_memory" ADD CONSTRAINT "company_memory_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_memory" ADD CONSTRAINT "company_memory_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_memory" ADD CONSTRAINT "company_memory_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_states" ADD CONSTRAINT "onboarding_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_states" ADD CONSTRAINT "onboarding_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_org_idx" ON "activity_events" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_agent_idx" ON "activity_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agents_org_idx" ON "agents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "approvals_org_idx" ON "approvals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "company_memory_org_idx" ON "company_memory" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "company_memory_category_idx" ON "company_memory" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX "credit_balances_org_period_idx" ON "credit_balances" USING btree ("org_id","period_start");--> statement-breakpoint
CREATE INDEX "credit_transactions_org_idx" ON "credit_transactions" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_transactions_type_idx" ON "credit_transactions" USING btree ("org_id","type");--> statement-breakpoint
CREATE INDEX "goals_org_idx" ON "goals" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_states_user_idx" ON "onboarding_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "onboarding_states_org_idx" ON "onboarding_states" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_hash_idx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_org_idx" ON "tasks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "tasks_agent_idx" ON "tasks" USING btree ("agent_id");