import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

// docs/34.1 conventions: uuid PKs, created_at/updated_at everywhere,
// enums as constrained text, org_id on every business table, immutable audit rows.
// This chunk covers the Identity + Security domains (auth foundation);
// Organization/Governance/Strategy/Work tables land with their phases.

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('active'),
    // Platform-level role ('user' | 'admin') — gates /v1/admin/* and /admin.
    // Distinct from membership.role (owner|admin|member), which is org-scoped.
    platformRole: text('platform_role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: text('plan').notNull().default('trial'), // trial | founder | team | company | enterprise
    status: text('status').notNull().default('active'),
    constitutionVersionRef: uuid('constitution_version_ref'),
    settings: jsonb('settings').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('organizations_slug_idx').on(t.slug)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull().default('member'), // owner|admin|member|viewer (docs/34.3)
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('memberships_org_user_idx').on(t.orgId, t.userId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [uniqueIndex('sessions_token_hash_idx').on(t.tokenHash)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    actorType: text('actor_type').notNull(), // user|agent|system (docs/34.3)
    actorId: uuid('actor_id'),
    departmentId: uuid('department_id'),
    agentId: uuid('agent_id'),
    taskId: uuid('task_id'),
    action: text('action').notNull(),
    tool: text('tool'),
    inputRef: text('input_ref'),
    resultRef: text('result_ref'),
    authorization: text('authorization'),
    approvalId: uuid('approval_id'),
    policyRef: text('policy_ref'),
    cost: integer('cost'),
    outcome: text('outcome').notNull(), // success|denied|failure
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
  },
  (t) => [index('audit_events_org_occurred_idx').on(t.orgId, t.occurredAt)],
);

// ---- Provider configuration & encrypted secrets (docs/23, 37) ----
// Key material lives ONLY in user_provider_keys.key_encrypted (AES-256-GCM, docs/23.5),
// wrapped with the master key versioned by key_kid. Full keys never leave the API layer.

export const providers = pgTable(
  'providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(), // openai | anthropic | gemini | deepseek | groq | openrouter | ollama
    name: text('name').notNull(),
    kind: text('kind').notNull().default('byok'), // byok | endpoint | local (docs/23.1)
    baseUrl: text('base_url'), // default API base for OpenAI-compatible/endpoint kinds
    docUrl: text('doc_url'), // "how to get a key" link — config, not hard-coded assumptions (docs/23.3)
    defaultModels: jsonb('default_models').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('providers_slug_idx').on(t.slug)],
);

export const userProviderKeys = pgTable(
  'user_provider_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id),
    name: text('name'), // optional display name for this connection
    authType: text('auth_type').notNull().default('api_key'), // api_key | endpoint (BYO-endpoint, docs/23.1)
    keyEncrypted: text('key_encrypted').notNull(), // serialized EncryptedSecret (AES-256-GCM)
    keyKid: text('key_kid').notNull(), // wrapping-key version (docs/23.5)
    mask: text('mask').notNull(), // display-only mask (e.g. sk-…abcd); full key never stored unmasked
    baseUrl: text('base_url'), // plaintext endpoint URL when auth_type = endpoint
    allowedModels: jsonb('allowed_models').notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    monthlySpendCeiling: integer('monthly_spend_ceiling'), // optional per-key cap (docs/23.4.6)
    status: text('status').notNull().default('active'), // active | rotating | revoked (docs/23.4)
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('user_provider_keys_org_idx').on(t.orgId)],
);

// Public waitlist funnel — landing page signups (pre-org, pre-auth).
export const waitlistSignups = pgTable(
  'waitlist_signups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name'), // design-partner application (marketing/design_partner_application.md §2.1)
    role: text('role'), // just_me | me_1_2 | small_team
    source: text('source').notNull().default('landing'), // landing | design_partner | referral
    status: text('status').notNull().default('pending'), // pending | invited | signed_up
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('waitlist_signups_email_idx').on(t.email)],
);

// Immutable access ledger for secrets — every decrypt is recorded (docs/23.6, 37).
export const secretRecords = pgTable(
  'secret_records',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    keyId: uuid('key_id')
      .notNull()
      .references(() => userProviderKeys.id),
    action: text('action').notNull(), // created | read | rotated | revoked | tested
    actorType: text('actor_type').notNull(), // user | agent | system
    actorId: uuid('actor_id'),
    accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('secret_records_key_idx').on(t.keyId, t.accessedAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
export type UserProviderKey = typeof userProviderKeys.$inferSelect;
export type NewUserProviderKey = typeof userProviderKeys.$inferInsert;
// ---- ORQ8 Billing & Credits ----
// Work Credits: every plan includes monthly credits; additional can be purchased.
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    plan: text('plan').notNull(), // founder | team | company | enterprise
    billingCycle: text('billing_cycle').notNull().default('monthly'), // monthly | annual
    status: text('status').notNull().default('active'), // active | trial | past_due | cancelled | paused
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    includedCredits: integer('included_credits').notNull().default(0), // monthly included credits
    maxAgents: integer('max_agents').notNull().default(3), // max AI employees for this plan
    stripeSubscriptionId: text('stripe_subscription_id'),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscriptions_org_idx').on(t.orgId),
    index('subscriptions_status_idx').on(t.status),
  ],
);

export const creditBalances = pgTable(
  'credit_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    includedCredits: integer('included_credits').notNull().default(0), // monthly allocation
    purchasedCredits: integer('purchased_credits').notNull().default(0), // additional bought credits
    usedCredits: integer('used_credits').notNull().default(0), // consumed this period
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('credit_balances_org_period_idx').on(t.orgId, t.periodStart)],
);

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    type: text('type').notNull(), // usage | purchase | adjustment | rollover
    amount: integer('amount').notNull(), // positive = add, negative = consume
    description: text('description'), // e.g. 'Task execution', 'Credit top-up'
    referenceId: uuid('reference_id'), // taskId, subscriptionId, etc.
    referenceType: text('reference_type'), // task | subscription | purchase
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('credit_transactions_org_idx').on(t.orgId, t.createdAt),
    index('credit_transactions_type_idx').on(t.orgId, t.type),
  ],
);

// ---- ORQ8 Work Domain (Phase 2+) ----
// Agents, approvals, goals, tasks, activity events.
// All tables follow docs/34.1 conventions: uuid PKs, org_id on every table,
// created_at/updated_at, status as constrained text.

// ---- Departments ----
// Proper first-class entities. Each agent has a primary department via departmentId FK.
// The text `department` field on agents is kept for backward compat but departmentId is source of truth.
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    description: text('description'),
    head: text('head'), // name of department head agent
    budget: integer('budget'), // credit budget for this department
    status: text('status').notNull().default('active'), // active | archived
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('departments_org_idx').on(t.orgId),
    uniqueIndex('departments_org_name_idx').on(t.orgId, t.name),
  ],
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    departmentId: uuid('department_id').references(() => departments.id), // optional parent department
    name: text('name').notNull(),
    description: text('description'),
    lead: text('lead'), // name of team lead agent
    status: text('status').notNull().default('active'), // active | archived
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('teams_org_idx').on(t.orgId),
    index('teams_dept_idx').on(t.departmentId),
    uniqueIndex('teams_org_name_idx').on(t.orgId, t.name),
  ],
);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(), // e.g. 'Researcher', 'Writer', 'Engineer'
    role: text('role').notNull(), // e.g. 'market_researcher', 'content_writer', 'software_engineer'
    department: text('department'), // DEPRECATED — kept for backward compat. Use departmentId.
    departmentId: uuid('department_id').references(() => departments.id), // primary department FK
    teamId: uuid('team_id').references(() => teams.id), // primary team FK
    status: text('status').notNull().default('active'), // active | paused | archived
    weeklyCost: integer('weekly_cost').notNull().default(0), // cost in cents
    tasksCompleted: integer('tasks_completed').notNull().default(0),
    tasksFailed: integer('tasks_failed').notNull().default(0),
    creditsUsed: integer('credits_used').notNull().default(0), // total credits consumed
    currentTask: text('current_task'), // short description of what they're doing now
    capabilities: jsonb('capabilities').notNull().default([]), // array of capability strings
    config: jsonb('config').notNull().default({}), // agent-specific config
    // Explicit authority profile — defines what the agent CAN do, CAN spend, and what REQUIRES approval
    authority: jsonb('authority').notNull().default({
      canCreateTasks: true,
      canExecuteTasks: true,
      canAccessCompanyInfo: true,
      canCommunicateExternally: false,
      canModifyResources: false,
      spendingLimitCents: 0, // 0 = no spending allowed without approval
      requiresApprovalFor: ['financial_commitments', 'external_communications', 'irreversible_actions', 'high_impact_decisions'],
      forbiddenActions: [],
    }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agents_org_idx').on(t.orgId),
    index('agents_status_idx').on(t.orgId, t.status),
    index('agents_dept_idx').on(t.departmentId),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'), // active | completed | paused | cancelled
    progress: integer('progress').notNull().default(0), // 0-100
    priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
    dueDate: timestamp('due_date', { withTimezone: true }), // optional deadline
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }), // optional team owner
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('goals_org_idx').on(t.orgId),
    index('goals_due_date_idx').on(t.dueDate),
    index('goals_team_idx').on(t.teamId),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    goalId: uuid('goal_id').references(() => goals.id),
    agentId: uuid('agent_id').references(() => agents.id),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('pending'), // pending | in_progress | completed | failed | cancelled
    priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
    dueDate: timestamp('due_date', { withTimezone: true }), // optional deadline
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }), // optional team owner
    cost: integer('cost').notNull().default(0), // cost in cents
    result: text('result'), // execution result when completed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_org_idx').on(t.orgId),
    index('tasks_status_idx').on(t.orgId, t.status),
    index('tasks_agent_idx').on(t.agentId),
    index('tasks_team_idx').on(t.teamId),
    index('tasks_priority_idx').on(t.orgId, t.priority),
    index('tasks_due_date_idx').on(t.dueDate),
  ],
);

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    agentId: uuid('agent_id').references(() => agents.id),
    action: text('action').notNull(), // what the agent wants to do
    description: text('description'), // detailed description / context
    cost: integer('cost').notNull().default(0), // cost in cents
    riskLevel: text('risk_level').notNull().default('low'), // low | medium | high
    status: text('status').notNull().default('pending'), // pending | approved | rejected | modified | expired
    decisionNote: text('decision_note'), // CEO's note when approving/modifying/rejecting
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('approvals_org_idx').on(t.orgId),
    index('approvals_status_idx').on(t.orgId, t.status),
  ],
);

export const activityEvents = pgTable(
  'activity_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    agentId: uuid('agent_id').references(() => agents.id),
    taskId: uuid('task_id').references(() => tasks.id),
    type: text('type').notNull(), // analyzed | drafted | reviewed | deployed | approved | rejected | filed
    summary: text('summary').notNull(), // plain-language description
    reason: text('reason'), // the 'because' — why this action was taken
    cost: integer('cost').notNull().default(0), // cost in cents
    department: text('department'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_events_org_idx').on(t.orgId, t.occurredAt),
    index('activity_events_agent_idx').on(t.agentId),
  ],
);

// Drip outbox for waitlist emails (docs/00 GTM, marketing/design_partner_application.md §4).
// DB-as-queue: rows carry scheduled_at + status; a process-due pass (API endpoint or
// local timer) sends due rows. No external queue dependency — works on serverless too.
export const waitlistEmails = pgTable(
  'waitlist_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signupId: uuid('signup_id')
      .notNull()
      .references(() => waitlistSignups.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // welcome | drip_2d | drip_7d
    subject: text('subject').notNull(),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html').notNull(),
    toEmail: text('to_email').notNull(),
    toName: text('to_name'),
    status: text('status').notNull().default('queued'), // queued | sent | failed
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('waitlist_emails_due_idx').on(t.status, t.scheduledAt)],
);

export type SecretRecord = typeof secretRecords.$inferSelect;
export type NewSecretRecord = typeof secretRecords.$inferInsert;
export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type NewWaitlistSignup = typeof waitlistSignups.$inferInsert;
export type WaitlistEmail = typeof waitlistEmails.$inferSelect;
export type NewWaitlistEmail = typeof waitlistEmails.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type CreditBalance = typeof creditBalances.$inferSelect;
export type NewCreditBalance = typeof creditBalances.$inferInsert;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;

// ---- ORQ8 Credit Alerts ----
// Tracks usage threshold alerts sent to organizations.
// Prevents duplicate alerts within a cooldown window.
export const creditAlerts = pgTable(
  'credit_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    type: text('type').notNull(), // low_balance | critical_balance | exhausted | renewal_reminder
    threshold: integer('threshold').notNull(), // percentage threshold that triggered this (e.g. 80, 95, 100)
    message: text('message').notNull(), // human-readable alert message
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }), // when the user acknowledged it
    emailSent: boolean('email_sent').notNull().default(false), // whether an email was sent
    metadata: jsonb('metadata').notNull().default({}), // { remaining, total, utilizationPercent, plan }
  },
  (t) => [
    index('credit_alerts_org_idx').on(t.orgId, t.sentAt),
    index('credit_alerts_type_idx').on(t.orgId, t.type),
  ],
);

export type CreditAlert = typeof creditAlerts.$inferSelect;
export type NewCreditAlert = typeof creditAlerts.$inferInsert;

// ---- ORQ8 Onboarding ----
// Persisted onboarding state per user — survives refresh, browser close, login/logout.
export const onboardingStates = pgTable(
  'onboarding_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    step: text('step').notNull().default('organization'), // organization | constitution | agents | complete
    organization: jsonb('organization'), // { name, description, objective, industry, stage, teamSize }
    constitution: jsonb('constitution'), // { type, name, principles[] }
    agentSelections: jsonb('agent_selections'), // [{ role, name, description, selected }]
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('onboarding_states_user_idx').on(t.userId),
    index('onboarding_states_org_idx').on(t.orgId),
  ],
);

export type OnboardingState = typeof onboardingStates.$inferSelect;
export type NewOnboardingState = typeof onboardingStates.$inferInsert;

// ---- ORQ8 Password Reset ----
// Secure token-based password reset. Tokens are SHA-256 hashed before storage;
// the plaintext is only ever sent via email and never persisted.
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(), // SHA-256 of the plaintext token
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('password_reset_tokens_user_idx').on(t.userId),
    index('password_reset_tokens_hash_idx').on(t.tokenHash),
  ],
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// ---- ORQ8 Company Memory ----
// Persistent organizational memory — facts, decisions, lessons, preferences.
export const companyMemory = pgTable(
  'company_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    category: text('category').notNull(), // fact | decision | lesson | preference | workflow | context
    content: text('content').notNull(),
    source: text('source'), // which agent or user created this
    agentId: uuid('agent_id').references(() => agents.id),
    taskId: uuid('task_id').references(() => tasks.id),
    importance: integer('importance').notNull().default(5), // 1-10
    // Semantic embedding — pgvector, dimension matches EMBED_DIM default (768 for
    // nomic-embed-text, ADR-012). Nullable: entries created before embedding was
    // available, or when no embedding provider is configured, fall back to keyword
    // search. Changing EMBED_DIM is a config + re-embed migration (ADR-012).
    embedding: vector('embedding', { dimensions: 768 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('company_memory_org_idx').on(t.orgId),
    index('company_memory_category_idx').on(t.orgId, t.category),
    index('company_memory_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export type CompanyMemoryEntry = typeof companyMemory.$inferSelect;
export type NewCompanyMemoryEntry = typeof companyMemory.$inferInsert;

// ---- Webhook events (event ingestion, outbox pattern) ----
// Providers (GitHub, Linear, ...) POST events to /v1/webhooks/:provider. The
// receiver verifies the HMAC signature, normalizes, persists a row here, and
// returns. A process-pending pass (cron hook) evaluates org-scoped event rules
// and creates notifications/approval-gated tasks. external_event_id enforces
// idempotency — the same provider event never creates duplicate work.
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // github | linear | gmail | ...
    eventType: text('event_type').notNull(), // normalized type, e.g. pr_opened | issue_created
    title: text('title'), // human-readable event title (from normalization)
    externalEventId: text('external_event_id'), // provider's event id (idempotency key)
    payload: jsonb('payload').notNull().default({}), // normalized payload (never the raw blob)
    headers: jsonb('headers').notNull().default({}), // selected headers only (no secrets)
    correlationId: text('correlation_id'),
    status: text('status').notNull().default('pending'), // pending | processed | failed | dead
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    index('webhook_events_org_status_idx').on(t.orgId, t.status),
    index('webhook_events_provider_idx').on(t.provider, t.receivedAt),
    uniqueIndex('webhook_events_org_provider_ext_idx').on(
      t.orgId,
      t.provider,
      t.externalEventId,
    ),
  ],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

// ---- Event rules (Phase 8: event → rule → approval → task) ----
// Company-scoped declarative rules. When a normalized event matches, the rule
// decides what happens: notify, create a task (optionally agent-scoped), or
// ignore. requires_approval keeps high-impact actions behind the approval gate.
export const eventRules = pgTable(
  'event_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(),
    action: text('action').notNull(), // notify | create_task | ignore
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }), // optional assignee
    taskTitleTemplate: text('task_title_template'), // e.g. 'Review PR #{number}'
    requiresApproval: boolean('requires_approval').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('event_rules_org_idx').on(t.orgId),
    uniqueIndex('event_rules_org_provider_type_idx').on(t.orgId, t.provider, t.eventType),
  ],
);

export type EventRule = typeof eventRules.$inferSelect;
export type NewEventRule = typeof eventRules.$inferInsert;

// ---- Connector outcomes (Phase 5: structured outcome capture) ----
// Every connector action an agent performs produces a normalized outcome row:
// what was attempted, what happened, the external resource that changed, and
// whether approval was involved. These feed company memory and the briefing.
export const connectorOutcomes = pgTable(
  'connector_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    providerId: uuid('provider_id').references(() => integrationProviders.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(), // github | gmail | linear | ...
    capability: text('capability').notNull(), // e.g. github.create_pr | gmail.send
    action: text('action').notNull(), // e.g. create_pr | send_email | add_comment
    providerResourceId: text('provider_resource_id'), // e.g. PR number as string
    providerUrl: text('provider_url'),
    status: text('status').notNull(), // success | failed | pending_approval | denied
    summary: text('summary'),
    result: jsonb('result'), // structured result — never the raw provider payload
    error: text('error'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    approvalId: uuid('approval_id').references(() => approvals.id, { onDelete: 'set null' }),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('connector_outcomes_org_idx').on(t.orgId, t.createdAt),
    index('connector_outcomes_agent_idx').on(t.agentId),
    index('connector_outcomes_task_idx').on(t.taskId),
  ],
);

export type ConnectorOutcome = typeof connectorOutcomes.$inferSelect;
export type NewConnectorOutcome = typeof connectorOutcomes.$inferInsert;

// ---- Executive briefings (Phase 11/12: daily briefing) ----
// Deterministic summaries of real system activity, generated on a schedule and
// delivered in-app (notification) + email. Idempotent: one row per
// (org, kind, period_start) — a scheduler retry never duplicates a briefing.
export const briefings = pgTable(
  'briefings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // daily | weekly
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    content: jsonb('content').notNull().default({}), // structured sections
    status: text('status').notNull().default('generated'), // generated | delivered | failed
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('briefings_org_created_idx').on(t.orgId, t.createdAt),
    uniqueIndex('briefings_org_kind_period_idx').on(t.orgId, t.kind, t.periodStart),
  ],
);

export type Briefing = typeof briefings.$inferSelect;
export type NewBriefing = typeof briefings.$inferInsert;

// ─── File Storage ──────────────────────────────────────────────────────────

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(), // original filename
    key: text('key').notNull(), // storage key (S3 path or local path)
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(), // bytes
    bucket: text('bucket').notNull().default('orq8-files'),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    agentId: uuid('agent_id').references(() => agents.id),
    taskId: uuid('task_id').references(() => tasks.id),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('files_org_idx').on(t.orgId),
    index('files_key_idx').on(t.key),
  ],
);

export type FileRecord = typeof files.$inferSelect;
export type NewFileRecord = typeof files.$inferInsert;

// ─── Eng paraphrasing notifications table (restored) ──
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    type: text('type').notNull(), // approval | task | credit | agent | system
    title: text('title').notNull(),
    message: text('message').notNull(),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_org_created_idx').on(t.orgId, t.createdAt),
    index('notifications_org_read_idx').on(t.orgId, t.read),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// ─── Login Lockouts ────────────────────────────────────────────────────────
// Persists brute-force lockout state to the database so it survives restarts.
// One row per email address. Rows are cleaned up after lockout expires.
export const loginLockouts = pgTable(
  'login_lockouts',
  {
    email: text('email').primaryKey(), // normalized lowercase email
    failedCount: integer('failed_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastFailedAt: timestamp('last_failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_lockouts_locked_idx').on(t.lockedUntil),
  ],
);

export type LoginLockout = typeof loginLockouts.$inferSelect;
export type NewLoginLockout = typeof loginLockouts.$inferInsert;

// ─── Engineering Workspace ──────────────────────────────────────────────────
// Repositories imported via GitHub OAuth. Org-scoped; provider-bound.
export const repositories = pgTable(
  'repositories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    owner: text('owner').notNull(),
    defaultBranch: text('default_branch').notNull(),
    description: text('description'),
    private: boolean('private').notNull().default(false),
    providerId: uuid('provider_id').notNull().references(() => integrationProviders.id, { onDelete: 'cascade' }),
    providerRefId: text('provider_ref_id'),
    languages: jsonb('languages').notNull().default([]),
    frameworkSummary: text('framework_summary'),
    filesCount: integer('files_count').notNull().default(0),
    sizeBytes: integer('size_bytes'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('repositories_org_idx').on(t.orgId),
    uniqueIndex('repositories_org_provider_ref_idx').on(t.orgId, t.providerId, t.providerRefId),
  ],
);

export const repositoryBranches = pgTable(
  'repository_branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    ahead: integer('ahead').notNull().default(0),
    behind: integer('behind').notNull().default(0),
    lastCommitAt: timestamp('last_commit_at', { withTimezone: true }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('branches_repository_idx').on(t.repositoryId)],
);

export const repositoryFiles = pgTable(
  'repository_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    branch: text('branch').notNull(),
    sha: text('sha'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    language: text('language'),
    isBinary: boolean('is_binary').notNull().default(false),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('repository_files_repository_idx').on(t.repositoryId),
    uniqueIndex('repository_files_repo_branch_path_idx').on(t.repositoryId, t.branch, t.path),
  ],
);

export const repositoryFileContents = pgTable(
  'repository_file_contents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileId: uuid('file_id').notNull().references(() => repositoryFiles.id, { onDelete: 'cascade' }),
    body: text('body').notNull(), // stored as base64 for JSON transport; real bytea in migration
    storedAt: timestamp('stored_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const repoEvents = pgTable(
  'repo_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    summary: text('summary').notNull(),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('repo_events_org_idx').on(t.orgId)],
);

// Sandbox runs: hermetic execution records.
export const sandboxRuns = pgTable(
  'sandbox_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
    branch: text('branch').notNull(),
    command: text('command').notNull(),
    workingDir: text('working_dir').notNull(),
    runnerEnv: jsonb('runner_env'),
    state: text('state').notNull().default('queued'), // queued | running | completed | failed | timeout | cancelled
    allocatedCredits: integer('allocated_credits').notNull().default(0),
    usedCredits: integer('used_credits').notNull().default(0),
    timeoutMs: integer('timeout_ms').notNull().default(120000),
    maxMemoryMb: integer('max_memory_mb').notNull().default(512),
    stdout: text('stdout'),
    stderr: text('stderr'),
    exitCode: integer('exit_code'),
    resultSummary: text('result_summary'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sandbox_runs_org_idx').on(t.orgId),
    index('sandbox_runs_repository_idx').on(t.repositoryId),
  ],
);

// Engineering PRs proposed by agents.
export const repositoryPrs = pgTable(
  'repository_prs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
    providerPrNumber: integer('provider_pr_number'),
    providerPrUrl: text('provider_pr_url'),
    title: text('title').notNull(),
    body: text('body'),
    headBranch: text('head_branch').notNull(),
    baseBranch: text('base_branch').notNull(),
    state: text('state').notNull().default('open'), // open | merged | closed | draft
    authorId: uuid('author_id').notNull(),
    authorType: text('author_type').notNull(),
    riskAssessment: jsonb('risk_assessment'),
    status: text('status').notNull().default('pending_review'), // pending_review | approved | rejected | changes_requested | merged
    approvalId: uuid('approval_id'),
    approvedBy: uuid('approved_by'),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('repository_prs_repository_idx').on(t.repositoryId)],
);

// Engineering task — extends task shape with repository context.
export const engineeringTasks = pgTable(
  'engineering_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
    branch: text('branch').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    acceptanceCriteria: text('acceptance_criteria'),
    status: text('status').notNull().default('planning'), // planning | implemented | tested | review | completed | failed
    assigneeId: uuid('assignee_id').notNull(),
    testsSummary: jsonb('tests_summary'),
    lintSummary: jsonb('lint_summary'),
    buildSummary: jsonb('build_summary'),
    diffSummary: jsonb('diff_summary'),
    prId: uuid('pr_id').references(() => repositoryPrs.id, { onDelete: 'set null' }),
    qaResult: jsonb('qa_result'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('engineering_tasks_org_idx').on(t.orgId),
  ],
);

// ─── Integrations ───────────────────────────────────────────────────────────

export const integrationProviders = pgTable(
  'integration_providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    provider: text('provider').notNull(), // github | gmail | linear | jira | ...
    status: text('status').notNull().default('disconnected'), // disconnected | connecting | connected | error
    scopes: jsonb('scopes'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }),
    error: text('error'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('integration_providers_org_name_idx').on(t.orgId, t.name),
  ],
);

export const integrationCredentials = pgTable(
  'integration_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id').notNull().references(() => integrationProviders.id, { onDelete: 'cascade' }),
    credentialType: text('credential_type').notNull(),
    encryptedSecret: text('encrypted_secret').notNull(),
    publicRef: text('public_ref'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    scopes: jsonb('scopes'),
    refreshTokenHash: text('refresh_token_hash'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('integration_credentials_provider_idx').on(t.providerId)],
);

export const integrationCapabilities = pgTable(
  'integration_capabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id').notNull().references(() => integrationProviders.id, { onDelete: 'cascade' }),
    capability: text('capability').notNull(),
    allowed: boolean('allowed').notNull().default(true),
    approvalRequiredFor: jsonb('approval_required_for'), // e.g. ['send_email', 'merge_pr']
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('integration_capabilities_provider_capability_idx').on(t.providerId, t.capability),
  ],
);

export const agentIntegrationAccess = pgTable(
  'agent_integration_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id').notNull().references(() => integrationProviders.id, { onDelete: 'cascade' }),
    capabilities: jsonb('capabilities').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_integration_access_org_agent_idx').on(t.orgId, t.agentId),
  ],
);

// ─── Simulation ─────────────────────────────────────────────────────────────

export const simulations = pgTable(
  'simulations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    objective: text('objective'),
    changeDescription: text('change_description').notNull(),
    proposedDepartments: jsonb('proposed_departments'),
    proposedAgents: jsonb('proposed_agents'),
    projectedWorkload: jsonb('projected_workload'),
    projectedCost: jsonb('projected_cost'),
    projectedRisk: text('projected_risk'), // low | medium | high | critical
    bottlenecks: jsonb('bottlenecks'),
    assumptions: text('assumptions').array(),
    metrics: jsonb('metrics'),
    recommendation: text('recommendation'),
    // Structured organizational proposal (departments/teams/agents/goals) that
    // must be founder-approved before apply materializes it (Task 5).
    proposal: jsonb('proposal'),
    state: text('state').notNull().default('draft'), // draft | proposed | reviewed | applied
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    appliedBy: uuid('applied_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('simulations_org_idx').on(t.orgId)],
);

// PostHog companion event log — used to assert analytics fired.
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => organizations.id),
    userId: uuid('user_id').references(() => users.id),
    eventName: text('event_name').notNull(),
    properties: jsonb('properties'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('analytics_events_org_idx').on(t.orgId),
    index('analytics_events_user_idx').on(t.userId),
    index('analytics_events_name_idx').on(t.eventName),
  ],
);

// ─── Type exports ───────────────────────────────────────────────────────────
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type RepositoryBranch = typeof repositoryBranches.$inferSelect;
export type RepositoryFile = typeof repositoryFiles.$inferSelect;
export type RepositoryFileContent = typeof repositoryFileContents.$inferSelect;
export type RepoEvent = typeof repoEvents.$inferSelect;
export type NewRepoEvent = typeof repoEvents.$inferInsert;
export type SandboxRun = typeof sandboxRuns.$inferSelect;
export type NewSandboxRun = typeof sandboxRuns.$inferInsert;
export type RepositoryPr = typeof repositoryPrs.$inferSelect;
export type NewRepositoryPr = typeof repositoryPrs.$inferInsert;
export type EngineeringTask = typeof engineeringTasks.$inferSelect;
export type NewEngineeringTask = typeof engineeringTasks.$inferInsert;
export type IntegrationProvider = typeof integrationProviders.$inferSelect;
export type NewIntegrationProvider = typeof integrationProviders.$inferInsert;
export type IntegrationCredential = typeof integrationCredentials.$inferSelect;
export type IntegrationCapability = typeof integrationCapabilities.$inferSelect;
export type NewIntegrationCapability = typeof integrationCapabilities.$inferInsert;
export type AgentIntegrationAccess = typeof agentIntegrationAccess.$inferSelect;
export type Simulation = typeof simulations.$inferSelect;
export type NewSimulation = typeof simulations.$inferInsert;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
