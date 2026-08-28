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

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(), // e.g. 'Researcher', 'Writer', 'Engineer'
    role: text('role').notNull(), // e.g. 'market_researcher', 'content_writer', 'software_engineer'
    department: text('department'), // e.g. 'Marketing', 'Engineering', 'Operations'
    status: text('status').notNull().default('active'), // active | paused | archived
    weeklyCost: integer('weekly_cost').notNull().default(0), // cost in cents
    tasksCompleted: integer('tasks_completed').notNull().default(0),
    currentTask: text('current_task'), // short description of what they're doing now
    capabilities: jsonb('capabilities').notNull().default([]), // array of capability strings
    config: jsonb('config').notNull().default({}), // agent-specific config
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agents_org_idx').on(t.orgId),
    index('agents_status_idx').on(t.orgId, t.status),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('goals_org_idx').on(t.orgId),
    index('goals_due_date_idx').on(t.dueDate),
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
    cost: integer('cost').notNull().default(0), // cost in cents
    result: text('result'), // execution result when completed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_org_idx').on(t.orgId),
    index('tasks_status_idx').on(t.orgId, t.status),
    index('tasks_agent_idx').on(t.agentId),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('company_memory_org_idx').on(t.orgId),
    index('company_memory_category_idx').on(t.orgId, t.category),
  ],
);

export type CompanyMemoryEntry = typeof companyMemory.$inferSelect;
export type NewCompanyMemoryEntry = typeof companyMemory.$inferInsert;

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
