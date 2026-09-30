import { eq, and, desc, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { users, memberships, agents, organizations } from '@orq8/db';
import type { AppDeps } from '../types.js';
import { createEmailTransport } from '../email/transport.js';
import { invitationEmail } from '../email/transactional.js';
import {
  INVITATION_TTL_DAYS,
  MemberError,
  acceptInvitation,
  inviteMember,
  isMemberRole,
  listInvitations,
  removeMember,
  renewInvitation,
  revokeInvitation,
  updateMemberRole,
} from '../services/members.js';

/**
 * Org Members API — lists human members and AI agents for the current organization.
 * Combined view for the Members & Roles page.
 */

export function registerMemberRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/members — List org members (humans) with roles, paginated. */
  app.get('/v1/members', async (request) => {
    const ctx = await requireAuth(request, deps);

    const params = request.query as { limit?: string; offset?: string; search?: string };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);
    const search = params.search?.trim().toLowerCase() ?? '';

    // Count total members for this org
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, 'active')));

    // Fetch members with user details
    const memberList = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        role: memberships.role,
        memberSince: memberships.createdAt,
        createdAt: users.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, 'active')))
      .orderBy(desc(memberships.createdAt))
      .limit(limit)
      .offset(offset);

    // Apply search filter in-memory (small dataset)
    const filtered = search
      ? memberList.filter(
          (m) =>
            m.name?.toLowerCase().includes(search) ||
            m.email.toLowerCase().includes(search)
        )
      : memberList;

    return {
      data: filtered.map((m) => ({
        id: m.id,
        name: m.name ?? 'Unknown',
        email: m.email,
        role: m.role,
        type: 'human' as const,
        status: m.status,
        memberSince: m.memberSince,
        createdAt: m.createdAt,
      })),
      meta: { limit, offset, total: totalRow?.count ?? 0 },
    };
  });

  /**
   * A refused member operation answers with its own status and code, so the UI
   * can say what happened ("only an owner can…") instead of a bare 500. Anything
   * else is a real bug and is rethrown.
   */
  const refused = (reply: FastifyReply, error: unknown) => {
    if (error instanceof MemberError) {
      return reply.status(error.status).send({ error: error.code, message: error.message });
    }
    throw error;
  };

  /**
   * Email an accept link, and report honestly whether it left the building.
   *
   * Three outcomes matter to the inviter and they are not the same thing:
   *   - a provider accepted the message → 'sent' (the teammate will see it);
   *   - no provider is configured → 'unconfigured' (nothing was delivered — the
   *     inviter must pass the link on themselves);
   *   - a provider refused or threw → 'failed' (retry, or use the link).
   * The invite itself never fails because mail did: the invitation row is the
   * product object, the email is a convenience.
   */
  const deliverInvitation = async (input: {
    orgId: string;
    email: string;
    role: string;
    acceptUrl: string;
    invitedByName?: string;
  }): Promise<{ delivery: 'sent' | 'unconfigured' | 'failed' }> => {
    try {
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, input.orgId))
        .limit(1);

      const content = invitationEmail({
        orgName: org?.name ?? 'your company',
        role: input.role,
        acceptUrl: input.acceptUrl,
        invitedBy: input.invitedByName,
        expiresInDays: INVITATION_TTL_DAYS,
      });

      const result = await createEmailTransport(deps.config, deps.logger).send({
        to: input.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });

      if (result.delivered) return { delivery: 'sent' };
      return { delivery: result.ok ? 'unconfigured' : 'failed' };
    } catch (err) {
      deps.logger.warn({ err }, 'invitation email failed — the accept link is still returned to the inviter');
      return { delivery: 'failed' };
    }
  };

  /** The inviter's display name, for the email's "X invited you". */
  const inviterName = async (userId: string): Promise<string | undefined> => {
    const [row] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.name?.trim() || row?.email;
  };

  /** POST /v1/members/invitations — invite a teammate (owner or admin). */
  app.post('/v1/members/invitations', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z
      .object({ email: z.string().min(3).max(200), role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member') })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', message: 'Provide an email and a valid role.' });
    }

    try {
      const invitation = await inviteMember(db, {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        actorRole: ctx.role,
        email: parsed.data.email,
        role: parsed.data.role,
        appUrl: deps.config.APP_URL ?? 'http://localhost:3000',
      });

      // Mail the link, and keep returning it: delivery depends on the
      // environment (with no SMTP or Resend key nothing is sent), and an
      // invitation that silently never arrives is worse than one the inviter can
      // pass along themselves. `delivery` tells the UI which of those happened.
      const { delivery } = await deliverInvitation({
        orgId: ctx.orgId,
        email: invitation.email,
        role: invitation.role,
        acceptUrl: invitation.acceptUrl,
        invitedByName: await inviterName(ctx.userId),
      });

      return reply.status(201).send({ data: { ...invitation, delivery } });
    } catch (error) {
      return refused(reply, error);
    }
  });

  /**
   * POST /v1/members/invitations/:id/renew — mint a fresh accept link.
   *
   * Needed because only a hash of each token is stored: a link the inviter lost
   * (or a teammate who cannot receive mail) is recoverable only by issuing a new
   * one, which also kills the old link.
   */
  app.post('/v1/members/invitations/:id/renew', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    try {
      const invitation = await renewInvitation(db, {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        actorRole: ctx.role,
        invitationId: id,
        appUrl: deps.config.APP_URL ?? 'http://localhost:3000',
      });
      const { delivery } = await deliverInvitation({
        orgId: ctx.orgId,
        email: invitation.email,
        role: invitation.role,
        acceptUrl: invitation.acceptUrl,
        invitedByName: await inviterName(ctx.userId),
      });
      return { data: { ...invitation, delivery } };
    } catch (error) {
      return refused(reply, error);
    }
  });

  /** GET /v1/members/invitations — pending and past invitations for this org. */
  app.get('/v1/members/invitations', async (request) => {
    const ctx = await requireAuth(request, deps);
    const data = await listInvitations(db, ctx.orgId);
    return { data };
  });

  /** POST /v1/members/invitations/:id/revoke — withdraw a pending invitation. */
  app.post('/v1/members/invitations/:id/revoke', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    try {
      await revokeInvitation(db, { orgId: ctx.orgId, actorId: ctx.userId, actorRole: ctx.role, invitationId: id });
      return { data: { id, status: 'revoked' } };
    } catch (error) {
      return refused(reply, error);
    }
  });

  /**
   * POST /v1/members/invitations/accept — accept with the signed-in account.
   *
   * Authenticated but not org-scoped: the caller has no membership yet, which is
   * the whole point. The service checks that the signed-in address is the one
   * that was invited.
   */
  app.post('/v1/members/invitations/accept', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z.object({ token: z.string().min(10).max(400) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', message: 'An invitation token is required.' });
    }

    try {
      const result = await acceptInvitation(db, {
        token: parsed.data.token,
        userId: ctx.userId,
        userEmail: ctx.email,
      });
      return { data: result };
    } catch (error) {
      return refused(reply, error);
    }
  });

  /** PATCH /v1/members/:userId — change a member's role. */
  app.patch('/v1/members/:userId', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { userId } = request.params as { userId: string };
    const parsed = z.object({ role: z.string() }).safeParse(request.body);
    if (!parsed.success || !isMemberRole(parsed.data.role)) {
      return reply.status(400).send({ error: 'invalid_request', message: 'Provide one of: owner, admin, member, viewer.' });
    }

    try {
      await updateMemberRole(db, {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        actorRole: ctx.role,
        userId,
        role: parsed.data.role,
      });
      return { data: { userId, role: parsed.data.role } };
    } catch (error) {
      return refused(reply, error);
    }
  });

  /**
   * DELETE /v1/members/:userId — deactivate a membership (kept for the audit
   * trail) and revoke that person's sessions in this organization, so removing
   * somebody actually removes their access.
   */
  app.delete('/v1/members/:userId', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const { userId } = request.params as { userId: string };
    try {
      const { revokedSessions } = await removeMember(db, {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        actorRole: ctx.role,
        userId,
        redis: deps.redis,
      });
      return { data: { userId, status: 'removed', revokedSessions } };
    } catch (error) {
      return refused(reply, error);
    }
  });

  /** GET /v1/members/all — Combined list of humans + agents for the org. */
  app.get('/v1/members/all', async (request) => {
    const ctx = await requireAuth(request, deps);

    const params = request.query as { limit?: string; offset?: string; search?: string };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);
    const search = params.search?.trim().toLowerCase() ?? '';

    // Fetch humans
    const humanMembers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        role: memberships.role,
        memberSince: memberships.createdAt,
        createdAt: users.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, 'active')))
      .orderBy(desc(memberships.createdAt));

    // Fetch agents
    const agentMembers = await db
      .select({
        id: agents.id,
        name: agents.name,
        role: agents.role,
        department: agents.department,
        status: agents.status,
        tasksCompleted: agents.tasksCompleted,
        weeklyCost: agents.weeklyCost,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(eq(agents.orgId, ctx.orgId))
      .orderBy(desc(agents.createdAt));

    // Combine into unified list
    const allMembers = [
      ...humanMembers.map((m) => ({
        id: m.id,
        name: m.name ?? 'Unknown',
        email: m.email,
        role: m.role,
        type: 'human' as const,
        status: m.status,
        department: null as string | null,
        tasksCompleted: 0,
        weeklyCost: 0,
        memberSince: m.memberSince,
        createdAt: m.createdAt,
      })),
      ...agentMembers.map((a) => ({
        id: a.id,
        name: a.name,
        email: `${a.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@orq8.internal`,
        role: 'agent',
        type: 'agent' as const,
        status: a.status,
        department: a.department,
        tasksCompleted: a.tasksCompleted,
        weeklyCost: a.weeklyCost,
        memberSince: a.createdAt,
        createdAt: a.createdAt,
      })),
    ];

    // Apply search filter
    const filtered = search
      ? allMembers.filter(
          (m) =>
            m.name.toLowerCase().includes(search) ||
            m.email.toLowerCase().includes(search)
        )
      : allMembers;

    // Paginate
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      data: paginated,
      meta: { limit, offset, total },
    };
  });
}
