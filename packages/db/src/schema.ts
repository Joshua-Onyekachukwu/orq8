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
    plan: text('plan').notNull().default('free'), // Free / Pro / Business / Enterprise (docs/00 §6)
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
export type SecretRecord = typeof secretRecords.$inferSelect;
export type NewSecretRecord = typeof secretRecords.$inferInsert;
export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type NewWaitlistSignup = typeof waitlistSignups.$inferInsert;
