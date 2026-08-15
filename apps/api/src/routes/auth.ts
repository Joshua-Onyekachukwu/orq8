import { hashPassword, verifyPassword } from '@orq8/auth';
import { conflict, forbidden, unauthorized, validation } from '@orq8/core';
import { loginBody, registerBody } from '@orq8/domain';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as orgs from '../services/orgs.js';
import * as sessions from '../services/sessions.js';
import * as users from '../services/users.js';
import type { AppDeps } from '../types.js';

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

  app.post('/v1/auth/login', async (request) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    const { email, password } = parsed.data;

    const user = await users.findByEmail(db, email);
    if (!user) {
      logger.warn({ email }, 'login failed: unknown email');
      throw unauthorized('Invalid email or password');
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      // audit the failure against the user's org when determinable (pre-org events are skipped)
      const memberships = await orgs.findMembershipsByUser(db, user.id);
      const orgId = memberships[0]?.org.id;
      if (orgId) {
        await appendAudit(db, { orgId, actorType: 'user', actorId: user.id, action: 'auth.login_failed', outcome: 'denied' });
      }
      throw unauthorized('Invalid email or password');
    }

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
}
