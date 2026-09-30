import { and, desc, eq, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { invitations, memberships, users, type Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import { createEvent } from './activity.js';
import { revokeOrgSessions } from './sessions.js';
import type { RedisClient } from './redis.js';

/**
 * Member management: invite a teammate, accept, change a role, remove.
 *
 * docs/62 §62.4 recorded this surface as "read endpoints only", which makes a
 * real company impossible to run — ORQ8's model is a founder plus a team
 * operating an AI organization.
 *
 * Every rule below is enforced here, in the API, because the memberships table
 * is writable only by the service role (migration 0033 dropped the self-insert
 * policy). The UI is not a security boundary: a request that reaches the routes
 * without permission has to be refused by this module.
 *
 * The rules, stated once:
 *
 *   - Only an owner or an admin may invite, change a role or remove someone.
 *   - Only an owner may grant or revoke the owner role; an admin cannot touch
 *     an owner at all.
 *   - Nobody may change their own membership through this API (no accidental
 *     self-demotion, no self-removal); that is a deliberate product decision to
 *     revisit when a proper "leave organization" flow exists.
 *   - An organization can never lose its last owner: neither demoting nor
 *     removing the final owner is permitted.
 *   - An invitation belongs to an address. The account that accepts it must
 *     have that address, so a forwarded link cannot hand a seat to someone else.
 *   - Invitations expire, are single-use, and are stored as a sha256 hash.
 */

/** Roles, as docs/34.3 defines them. Highest authority first. */
export const MEMBER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** How long an invitation stays usable. */
export const INVITATION_TTL_DAYS = 14;

/** A refusal with an HTTP status, so routes never invent their own. */
export class MemberError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MemberError';
  }
}

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === 'string' && (MEMBER_ROLES as readonly string[]).includes(value);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The role a user holds in an organization, or null when they hold none. */
export async function membershipRole(db: Db, orgId: string, userId: string): Promise<string | null> {
  const rows = await db
    .select({ role: memberships.role, status: memberships.status })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== 'active') return null;
  return row.role;
}

function assertAdministrator(role: string | null): asserts role is MemberRole {
  if (role !== 'owner' && role !== 'admin') {
    throw new MemberError(403, 'forbidden', 'Only an owner or an admin can change the organization\'s members.');
  }
}

function assertMayGrant(actorRole: MemberRole, targetRole: MemberRole): void {
  // An admin cannot create or touch owners; only an owner may hand over ownership.
  if (targetRole === 'owner' && actorRole !== 'owner') {
    throw new MemberError(403, 'forbidden', 'Only an owner can grant the owner role.');
  }
}

/**
 * Refuses to remove the final owner: an organization must always have one owner.
 *
 * Defence in depth, and honest about it: with the rules above, this branch is
 * not reachable today — the sole owner cannot demote or remove themselves (no
 * self-change), and nobody else may touch an owner without being one, which
 * already means there are two. It stays because the invariant it protects is
 * absolute, and the next flow to touch memberships ("leave organization", an
 * offboarding admin role, an org-deletion path) will not necessarily come with
 * the same reasoning. Do not delete it to remove an unreachable branch, and do
 * not claim it as *tested* protection either.
 */
async function assertNotLastOwner(db: Db, orgId: string, userId: string): Promise<void> {
  const rows = await db
    .select({ owners: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'owner'), eq(memberships.status, 'active')));
  const owners = rows[0]?.owners ?? 0;

  const isOwner = await membershipRole(db, orgId, userId);
  if (isOwner === 'owner' && owners <= 1) {
    throw new MemberError(
      409,
      'last_owner',
      'This is the organization\'s last owner. Promote another member to owner first.',
    );
  }
}

/**
 * Create a pending invitation and return the accept link.
 *
 * The link is returned to the inviter rather than only emailed: mail delivery
 * is environment-dependent (with no SMTP or Resend key the app logs mail
 * instead of sending it), and an invitation that silently never arrives is
 * worse than one the founder can paste into a message.
 */
export async function inviteMember(
  db: Db,
  input: { orgId: string; actorId: string; actorRole: string | null; email: string; role: MemberRole; appUrl: string },
): Promise<{ invitationId: string; email: string; role: MemberRole; expiresAt: Date; acceptUrl: string }> {
  assertAdministrator(input.actorRole);
  assertMayGrant(input.actorRole, input.role);

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new MemberError(400, 'invalid_email', 'That does not look like an email address.');
  }

  // Already a member? Say so instead of creating a link that cannot be used.
  const existing = await db
    .select({ role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.orgId, input.orgId), sql`lower(${users.email}) = ${email}`))
    .limit(1);
  if (existing[0]) {
    throw new MemberError(409, 'already_member', `${email} is already a member of this organization.`);
  }

  // A second pending invitation for the same address would hit the partial
  // unique index as a raw database error. Refuse it in the service, so the
  // client gets a 409 it can act on instead of a 500.
  const pendingRows = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.orgId, input.orgId),
        eq(invitations.status, 'pending'),
        sql`lower(${invitations.email}) = ${email}`,
      ),
    )
    .limit(1);
  if (pendingRows[0]) {
    throw new MemberError(
      409,
      'pending_exists',
      `${email} already has a pending invitation. Revoke it to send a new one.`,
    );
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(invitations)
    .values({
      orgId: input.orgId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: input.actorId,
      status: 'pending',
      expiresAt,
    })
    .returning({ id: invitations.id });

  const invitationId = inserted[0]?.id;
  if (!invitationId) throw new Error('inviteMember returned no row');

  await appendAudit(db, {
    orgId: input.orgId,
    actorType: 'user',
    actorId: input.actorId,
    action: 'member.invited',
    outcome: 'success',
    inputRef: invitationId,
  });
  await createEvent(db, {
    orgId: input.orgId,
    type: 'member.invited',
    summary: `Invited ${email} as ${input.role}`,
  });

  return {
    invitationId,
    email,
    role: input.role,
    expiresAt,
    acceptUrl: `${input.appUrl.replace(/\/$/, '')}/invite/${token}`,
  };
}

/**
 * Mint a fresh accept link for a pending invitation.
 *
 * Only the sha256 of a token is stored, so a link that was lost cannot be shown
 * again — the honest option is a new one. The old token stops working at the
 * same moment (the hash is replaced), which is the point: there is no way to
 * keep a leaked link alive. The expiry restarts with the new link, so the
 * invitation is never extended beyond the founder's intent by more than one TTL.
 */
export async function renewInvitation(
  db: Db,
  input: { orgId: string; actorId: string; actorRole: string | null; invitationId: string; appUrl: string },
): Promise<{ invitationId: string; email: string; role: MemberRole; expiresAt: Date; acceptUrl: string }> {
  assertAdministrator(input.actorRole);

  const rows = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.orgId, input.orgId), eq(invitations.id, input.invitationId)))
    .limit(1);
  const invitation = rows[0];
  if (!invitation) throw new MemberError(404, 'not_found', 'No such invitation.');
  if (invitation.status !== 'pending') {
    throw new MemberError(409, 'not_pending', `That invitation is already ${invitation.status}. Invite them again instead.`);
  }
  if (!isMemberRole(invitation.role)) {
    throw new MemberError(409, 'bad_role', 'That invitation carries a role this version does not recognise.');
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db
    .update(invitations)
    .set({ tokenHash: hashToken(token), expiresAt })
    .where(eq(invitations.id, invitation.id));

  await appendAudit(db, {
    orgId: input.orgId,
    actorType: 'user',
    actorId: input.actorId,
    action: 'invitation.renewed',
    outcome: 'success',
    inputRef: invitation.id,
  });

  return {
    invitationId: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt,
    acceptUrl: `${input.appUrl.replace(/\/$/, '')}/invite/${token}`,
  };
}

/** Pending and past invitations for the organization, newest first. */
export async function listInvitations(db: Db, orgId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      createdAt: invitations.createdAt,
      invitedBy: invitations.invitedBy,
    })
    .from(invitations)
    .where(eq(invitations.orgId, orgId))
    .orderBy(desc(invitations.createdAt))
    .limit(100);
}

/** Withdraw a pending invitation. Accepted ones are history and stay. */
export async function revokeInvitation(
  db: Db,
  input: { orgId: string; actorId: string; actorRole: string | null; invitationId: string },
): Promise<void> {
  assertAdministrator(input.actorRole);
  const rows = await db
    .select({ id: invitations.id, status: invitations.status, email: invitations.email })
    .from(invitations)
    .where(and(eq(invitations.orgId, input.orgId), eq(invitations.id, input.invitationId)))
    .limit(1);
  const invitation = rows[0];
  if (!invitation) throw new MemberError(404, 'not_found', 'No such invitation.');
  if (invitation.status !== 'pending') {
    throw new MemberError(409, 'not_pending', `That invitation is already ${invitation.status}.`);
  }

  await db.update(invitations).set({ status: 'revoked' }).where(eq(invitations.id, invitation.id));
  await appendAudit(db, {
    orgId: input.orgId,
    actorType: 'user',
    actorId: input.actorId,
    action: 'invitation.revoked',
    outcome: 'success',
    inputRef: invitation.id,
  });
}

/**
 * Accept an invitation, creating the membership.
 *
 * The accepting account's address must match the invitation's: a forwarded link
 * must not be able to seat a different person.
 */
export async function acceptInvitation(
  db: Db,
  input: { token: string; userId: string; userEmail: string },
): Promise<{ orgId: string; role: MemberRole }> {
  const rows = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(input.token)))
    .limit(1);
  const invitation = rows[0];
  if (!invitation) throw new MemberError(404, 'not_found', 'That invitation link is not valid.');
  if (invitation.status !== 'pending') {
    throw new MemberError(409, 'not_pending', `That invitation is already ${invitation.status}.`);
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    await db.update(invitations).set({ status: 'expired' }).where(eq(invitations.id, invitation.id));
    throw new MemberError(410, 'expired', 'That invitation has expired. Ask for a new one.');
  }
  if (invitation.email.toLowerCase() !== input.userEmail.trim().toLowerCase()) {
    throw new MemberError(
      403,
      'email_mismatch',
      `That invitation was sent to ${invitation.email}. Sign in with that address to accept it.`,
    );
  }
  if (!isMemberRole(invitation.role)) {
    throw new MemberError(409, 'bad_role', 'That invitation carries a role this version does not recognise.');
  }

  // Membership first, then consume the invitation, so a crash between the two
  // leaves a usable state (accepting twice is refused by the status check).
  const existing = await membershipRole(db, invitation.orgId, input.userId);
  if (existing) {
    await db
      .update(invitations)
      .set({ status: 'accepted', acceptedAt: new Date(), acceptedBy: input.userId })
      .where(eq(invitations.id, invitation.id));
    return { orgId: invitation.orgId, role: existing as MemberRole };
  }

  await db.insert(memberships).values({
    orgId: invitation.orgId,
    userId: input.userId,
    role: invitation.role,
    status: 'active',
  });
  await db
    .update(invitations)
    .set({ status: 'accepted', acceptedAt: new Date(), acceptedBy: input.userId })
    .where(eq(invitations.id, invitation.id));

  await appendAudit(db, {
    orgId: invitation.orgId,
    actorType: 'user',
    actorId: input.userId,
    action: 'invitation.accepted',
    outcome: 'success',
    inputRef: invitation.id,
    authorization: `role=${invitation.role}`,
  });
  await createEvent(db, {
    orgId: invitation.orgId,
    type: 'member.joined',
    summary: `${invitation.email} joined as ${invitation.role}`,
  });

  return { orgId: invitation.orgId, role: invitation.role };
}

/** Change a member's role. */
export async function updateMemberRole(
  db: Db,
  input: { orgId: string; actorId: string; actorRole: string | null; userId: string; role: MemberRole },
): Promise<void> {
  assertAdministrator(input.actorRole);

  if (input.userId === input.actorId) {
    throw new MemberError(409, 'self_change', 'You cannot change your own role.');
  }

  const current = await membershipRole(db, input.orgId, input.userId);
  if (!current) throw new MemberError(404, 'not_found', 'That person is not a member of this organization.');
  if (current === 'owner' && input.actorRole !== 'owner') {
    throw new MemberError(403, 'forbidden', 'Only an owner can change another owner\'s role.');
  }
  assertMayGrant(input.actorRole, input.role);

  if (input.role !== 'owner') {
    await assertNotLastOwner(db, input.orgId, input.userId);
  }

  await db
    .update(memberships)
    .set({ role: input.role })
    .where(and(eq(memberships.orgId, input.orgId), eq(memberships.userId, input.userId)));

  await appendAudit(db, {
    orgId: input.orgId,
    actorType: 'user',
    actorId: input.actorId,
    action: 'member.role_changed',
    outcome: 'success',
    inputRef: input.userId,
    authorization: `${current} -> ${input.role}`,
  });
  await createEvent(db, {
    orgId: input.orgId,
    type: 'member.role_changed',
    summary: `Role changed: ${current} → ${input.role}`,
  });
}

/**
 * Remove a member. The membership is deactivated rather than deleted, so the
 * audit trail and any work attributed to them keep their referent — and their
 * sessions in this organization are revoked, because a removal that leaves the
 * access standing is not a removal. They can still sign in and act in any other
 * company they belong to.
 */
export async function removeMember(
  db: Db,
  input: {
    orgId: string;
    actorId: string;
    actorRole: string | null;
    userId: string;
    /** Present in the API; omitted by callers that only need the row updated. */
    redis?: RedisClient | null;
  },
): Promise<{ revokedSessions: number }> {
  assertAdministrator(input.actorRole);

  if (input.userId === input.actorId) {
    throw new MemberError(409, 'self_change', 'You cannot remove yourself from the organization.');
  }

  const current = await membershipRole(db, input.orgId, input.userId);
  if (!current) throw new MemberError(404, 'not_found', 'That person is not a member of this organization.');
  if (current === 'owner' && input.actorRole !== 'owner') {
    throw new MemberError(403, 'forbidden', 'Only an owner can remove another owner.');
  }
  await assertNotLastOwner(db, input.orgId, input.userId);

  await db
    .update(memberships)
    .set({ status: 'removed' })
    .where(and(eq(memberships.orgId, input.orgId), eq(memberships.userId, input.userId)));

  const revokedSessions = await revokeOrgSessions(db, input.userId, input.orgId, input.redis ?? null);

  await appendAudit(db, {
    orgId: input.orgId,
    actorType: 'user',
    actorId: input.actorId,
    action: 'member.removed',
    outcome: 'success',
    inputRef: input.userId,
    authorization: `was ${current}`,
  });
  await createEvent(db, {
    orgId: input.orgId,
    type: 'member.removed',
    summary: 'A member was removed from the organization',
  });

  return { revokedSessions };
}
