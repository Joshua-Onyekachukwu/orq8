import {
  bigserial,
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
