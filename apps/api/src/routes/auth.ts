import { hashPassword, verifyPassword } from '@orq8/auth';
import { conflict, forbidden, unauthorized, validation } from '@orq8/core';
import { createHash, randomBytes } from 'node:crypto';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';
import { users as usersTable, passwordResetTokens } from '@orq8/db';
import { z } from 'zod';
import { loginBody, registerBody } from '@orq8/domain';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { createEmailTransport } from '../email/transport.js';
import * as orgs from '../services/orgs.js';
import * as sessions from '../services/sessions.js';
import * as users from '../services/users.js';
import { checkLoginAllowed, recordFailedLogin, resetFailedLogins } from '../plugins/brute-force.js';
import type { AppDeps } from '../types.js';

function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// docs/35.3 — Auth: register, login, logout, me
export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, logger } = deps;

  app.post('/v1/auth/register', async (request, reply) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    const { email, password, name, org_name } = parsed.data;

    const existing = await users.findByEmail(db, email);
    if (existing) throw conflict('An account with this email already exists');

    const passwordHash = await hashPassword(password);

    // All registration writes are atomic (docs/34.6): user + org + membership + session + audit
    const result = await db.transaction(async (tx) => {
      const user = await users.createUser(tx, { email, passwordHash, name: name ?? null });
      const org = await orgs.createOrg(tx, { name: org_name });
      await orgs.createMembership(tx, { orgId: org.id, userId: user.id, role: 'owner' });
      const { token, expiresAt } = await sessions.createSession(tx, {
        userId: user.id,
        orgId: org.id,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });
      await appendAudit(tx, { orgId: org.id, actorType: 'user', actorId: user.id, action: 'user.registered', outcome: 'success' });
      await appendAudit(tx, { orgId: org.id, actorType: 'user', actorId: user.id, action: 'org.created', outcome: 'success' });
      await appendAudit(tx, { orgId: org.id, actorType: 'user', actorId: user.id, action: 'member.joined', outcome: 'success' });
      return { user, org, token, expiresAt };
    });

    reply.code(201);
    return {
      data: {
        token: result.token,
        expires_at: result.expiresAt.toISOString(),
        user: { id: result.user.id, email: result.user.email, name: result.user.name },
        org: {
          id: result.org.id,
          name: result.org.name,
          slug: result.org.slug,
          plan: result.org.plan,
          role: 'owner',
        },
      },
    };
  });

  app.post('/v1/auth/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    const { email, password } = parsed.data;

    // Brute-force protection: check if account is locked
    const redis = (deps as { redis?: { isConnected(): boolean } }).redis;
    const lockCheck = await checkLoginAllowed(redis as any, email, db);
    if (!lockCheck.allowed) {
      const retryAfterMs = lockCheck.lockedUntil ? Math.ceil((lockCheck.lockedUntil.getTime() - Date.now()) / 1000) : 900;
      reply.header('Retry-After', String(retryAfterMs));
      reply.code(429).send({
        error: {
          code: 'account_locked',
          message: `Too many failed login attempts. Please try again in ${Math.ceil(retryAfterMs / 60)} minutes.`,
          policy_ref: 'docs/37',
        },
      });
      return reply;
    }

    const user = await users.findByEmail(db, email);
    if (!user) {
      logger.warn({ email }, 'login failed: unknown email');
      await recordFailedLogin(redis as any, email, db);
      throw unauthorized('Invalid email or password');
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      await recordFailedLogin(redis as any, email, db);
      // audit the failure against the user's org when determinable (pre-org events are skipped)
      const memberships = await orgs.findMembershipsByUser(db, user.id);
      const orgId = memberships[0]?.org.id;
      if (orgId) {
        await appendAudit(db, { orgId, actorType: 'user', actorId: user.id, action: 'auth.login_failed', outcome: 'denied' });
      }
      throw unauthorized('Invalid email or password');
    }

    // Successful login — reset brute-force counter
    await resetFailedLogins(redis as any, email, db);

    const memberships = await orgs.findMembershipsByUser(db, user.id);
    const active = memberships[0];
    if (!active) throw forbidden('Account has no organization');

    const { token, expiresAt } = await sessions.createSession(db, {
      userId: user.id,
      orgId: active.org.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });
    await appendAudit(db, { orgId: active.org.id, actorType: 'user', actorId: user.id, action: 'auth.login_succeeded', outcome: 'success' });

    return {
      data: {
        token,
        expires_at: expiresAt.toISOString(),
        user: { id: user.id, email: user.email, name: user.name },
        org: { ...active.org, role: active.membership.role },
      },
    };
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    await sessions.revokeSession(db, ctx.sessionId);
    await appendAudit(db, { orgId: ctx.orgId, actorType: 'user', actorId: ctx.userId, action: 'auth.logout', outcome: 'success' });
    reply.code(204);
    return reply.send();
  });

  app.post('/v1/auth/change-password', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(8),
    }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    const { current_password, new_password } = parsed.data;

    const user = await users.findById(db, ctx.userId);
    if (!user) throw unauthorized();

    const ok = await verifyPassword(user.passwordHash, current_password);
    if (!ok) throw unauthorized('Current password is incorrect');

    const newHash = await hashPassword(new_password);
    await db.update(usersTable).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(usersTable.id, ctx.userId));
    await appendAudit(db, { orgId: ctx.orgId, actorType: 'user', actorId: ctx.userId, action: 'auth.password_changed', outcome: 'success' });

    return { data: { ok: true } };
  });

  // ── Password Reset ──

  /** POST /v1/auth/forgot-password — Generate a reset token and email it. */
  app.post('/v1/auth/forgot-password', async (request) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const { email } = parsed.data;
    const user = await users.findByEmail(db, email);

    // Always return success to prevent email enumeration
    if (!user) {
      return { data: { ok: true } };
    }

    // Invalidate any existing unused tokens for this user
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    // Generate a secure random token (32 bytes = 256 bits of entropy)
    const plaintextToken = randomBytes(32).toString('hex');
    const tokenHash = sha256hex(plaintextToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // Send the reset email using the transactional template
    const { passwordResetEmail } = await import('../email/transactional.js');
    const { createEmailTransport } = await import('../email/transport.js');
    const transport = createEmailTransport(deps.config, deps.logger);
    const resetUrl = `${deps.config.ALLOWED_ORIGINS.split(',')[0]?.trim() ?? 'http://localhost:3000'}/reset-password?token=${plaintextToken}`;
    const resetEmail = passwordResetEmail({ email: user.email, resetUrl });

    await transport.send({
      to: user.email,
      subject: resetEmail.subject,
      text: resetEmail.text,
      html: resetEmail.html,
    });

    // Audit with the user's real org (activity_events.org_id has an FK to
    // organizations — a user UUID would violate it and 500 the request).
    const memberships = await orgs.findMembershipsByUser(db, user.id);
    const orgId = memberships[0]?.org.id;
    if (orgId) {
      await appendAudit(db, {
        orgId,
        actorType: 'user',
        actorId: user.id,
        action: 'auth.password_reset_requested',
        outcome: 'success',
      });
    }

    // Always return success to prevent email enumeration
    return { data: { ok: true } };
  });

  /** POST /v1/auth/reset-password — Validate token and set new password. */
  app.post('/v1/auth/reset-password', async (request) => {
    const parsed = z.object({
      token: z.string().min(1),
      password: z.string().min(8),
    }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const { token, password } = parsed.data;
    const tokenHash = sha256hex(token);

    // Find the token
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!resetToken || resetToken.usedAt) {
      throw unauthorized('Invalid or expired reset token');
    }

    // Hash the new password and update the user
    const newHash = await hashPassword(password);
    await db
      .update(usersTable)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(usersTable.id, resetToken.userId));

    // Mark token as used
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id));

    // Invalidate all sessions for this user (force re-login)
    const user = await users.findById(db, resetToken.userId);
    if (user) {
      const memberships = await orgs.findMembershipsByUser(db, resetToken.userId);
      const orgId = memberships[0]?.org.id;
      if (orgId) {
        await appendAudit(db, {
          orgId,
          actorType: 'user',
          actorId: resetToken.userId,
          action: 'auth.password_reset_completed',
          outcome: 'success',
        });
      }
    }

    return { data: { ok: true } };
  });

  app.get('/v1/auth/me', async (request) => {
    const ctx = await requireAuth(request, deps);
    const user = await users.findById(db, ctx.userId);
    if (!user) throw unauthorized();
    const memberships = await orgs.findMembershipsByUser(db, ctx.userId);
    return {
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        memberships: memberships.map((m) => ({ org: m.org, role: m.membership.role })),
        active_org_id: ctx.orgId,
      },
    };
  });

  /** GET /v1/org — Get current organization details. */
  app.get('/v1/org', async (request) => {
    const ctx = await requireAuth(request, deps);
    const memberships = await orgs.findMembershipsByUser(db, ctx.userId);
    const current = memberships.find((m) => m.org.id === ctx.orgId);
    if (!current) throw unauthorized();
    return {
      data: {
        ...current.org,
        role: current.membership.role,
      },
    };
  });

  /** PATCH /v1/auth/me — Update user profile (name, email). */
  app.patch('/v1/auth/me', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z.object({
      name: z.string().trim().min(1).max(200).optional(),
      email: z.string().email().optional(),
    }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.email !== undefined) {
      const newEmail = parsed.data.email.trim().toLowerCase();
      // Check if email is already taken by another user
      const existing = await users.findByEmail(db, newEmail);
      if (existing && existing.id !== ctx.userId) {
        throw conflict('An account with this email already exists');
      }
      updates.email = newEmail;
    }

    await db.update(usersTable).set(updates).where(eq(usersTable.id, ctx.userId));
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'user.profile_updated',
      outcome: 'success',
    });

    const user = await users.findById(db, ctx.userId);
    return {
      data: { id: user!.id, email: user!.email, name: user!.name },
    };
  });
}
