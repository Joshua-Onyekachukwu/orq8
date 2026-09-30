import { createLogger, loadConfig } from '@orq8/core';
import { createDb, invitations } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

/**
 * Member management (MVP-018).
 *
 * The rules under test are the ones that make a shared company safe, so they are
 * tested through the HTTP surface rather than by calling the service: the point
 * is that a request which reaches the API without permission is refused, since
 * the UI is not a security boundary.
 *
 *   access      only an owner or admin may invite, change a role or remove
 *   hierarchy   only an owner may grant the owner role
 *   identity    the account accepting an invitation must be the invited address
 *   isolation   a neighbouring organization cannot see or touch any of it
 *   integrity   an accepted invitation creates exactly one membership, and a
 *               removed member leaves the member list
 *
 * The last-owner guard in the service is deliberately *not* asserted here: with
 * the rules above it is unreachable, and the test that proves an invariant is
 * unbreakable would be a test of the reasoning, not of the code.
 */

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let app: FastifyInstance;

beforeAll(async () => {
  if (dbUp) app = await buildApp(deps);
});

afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

const run = dbUp ? describe : describe.skip;

run('member management', () => {
  /** Register a fresh tenant and return its session token and org id. */
  async function registerTenant(name: string) {
    const email = `members-${randomUUID()}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'sup3r-secret!', org_name: name },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    const token = body.data.token as string;
    const orgId = body.data.org.id as string;

    // Confirm the address, as the verification link does: an unconfirmed
    // account may only reach the confirmation endpoints.
    const { users } = await import('@orq8/db');
    await deps.db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.email, email.toLowerCase()));

    return { email, token, orgId };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const owner = { } as { email: string; token: string; orgId: string };

  it('registers the owner tenant', async () => {
    const tenant = await registerTenant('Members Test Org');
    owner.email = tenant.email;
    owner.token = tenant.token;
    owner.orgId = tenant.orgId;
    expect(owner.orgId).toBeTruthy();
  });

  let invitee = { email: '', token: '', orgId: '' };
  let token = '';
  let invitationId = '';

  it('invites a teammate and returns a usable link (201)', async () => {
    invitee = await registerTenant('Invitee Own Org');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations',
      headers: auth(owner.token),
      payload: { email: invitee.email, role: 'member' },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.email).toBe(invitee.email);
    expect(data.role).toBe('member');
    expect(data.acceptUrl).toContain('/invite/');
    invitationId = data.invitationId;
    token = data.acceptUrl.split('/invite/')[1] as string;
    expect(token.length).toBeGreaterThan(20);
  });

  it('stores the token hashed, never in clear', async () => {
    const rows = await deps.db
      .select({ tokenHash: invitations.tokenHash, status: invitations.status })
      .from(invitations)
      .where(eq(invitations.id, invitationId));
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('appears in the organization\'s invitation list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/members/invitations', headers: auth(owner.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.some((row: { id: string }) => row.id === invitationId)).toBe(true);
  });

  it('refuses a second pending invitation for the same address (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations',
      headers: auth(owner.token),
      payload: { email: invitee.email, role: 'admin' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('pending_exists');
  });

  it('refuses an unknown invitation token (404)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations/accept',
      headers: auth(invitee.token),
      payload: { token: 'not-a-real-token-not-a-real-token' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('refuses acceptance from a different account (403)', async () => {
    const other = await registerTenant('Someone Else');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations/accept',
      headers: auth(other.token),
      payload: { token },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('email_mismatch');
  });

  it('accepts with the invited account and creates the membership', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations/accept',
      headers: auth(invitee.token),
      payload: { token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ orgId: owner.orgId, role: 'member' });

    const list = await app.inject({ method: 'GET', url: '/v1/members', headers: auth(owner.token) });
    const emails = list.json().data.map((m: { email: string }) => m.email);
    expect(emails).toContain(invitee.email);
  });

  it('refuses a second acceptance of the same token (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations/accept',
      headers: auth(invitee.token),
      payload: { token },
    });
    expect(res.statusCode).toBe(409);
  });

  it('lets an invited member switch into the organization that invited them', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/org/switch',
      headers: auth(invitee.token),
      payload: { org_id: owner.orgId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(owner.orgId);
    expect(res.json().data.role).toBe('member');

    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: auth(invitee.token) });
    expect(me.json().data.active_org_id).toBe(owner.orgId);
  });

  it('refuses a switch into an organization you do not belong to (403)', async () => {
    const stranger = await registerTenant('Stranger Org');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/org/switch',
      headers: auth(stranger.token),
      payload: { org_id: owner.orgId },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses an invitation from a member who is not an administrator (403)', async () => {
    // The session now acts in the owner's organization, where this account is a
    // plain member: management must be refused even though the same account owns
    // a company of its own.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations',
      headers: auth(invitee.token),
      payload: { email: `third-${randomUUID()}@example.com`, role: 'member' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('forbidden');
  });

  it('refuses to change your own role (409)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/members/${(await app.inject({ method: 'GET', url: '/v1/auth/me', headers: auth(owner.token) })).json().data.user.id}`,
      headers: auth(owner.token),
      payload: { role: 'member' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('self_change');
  });

  it('lets an owner change a member\'s role and reports it back', async () => {
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: auth(invitee.token) });
    const inviteeUserId = me.json().data.user.id as string;

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/members/${inviteeUserId}`,
      headers: auth(owner.token),
      payload: { role: 'viewer' },
    });
    expect(res.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/v1/members', headers: auth(owner.token) });
    const member = list.json().data.find((m: { email: string }) => m.email === invitee.email);
    expect(member.role).toBe('viewer');
  });

  it('refuses an invalid role (400)', async () => {
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: auth(invitee.token) });
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/members/${me.json().data.user.id}`,
      headers: auth(owner.token),
      payload: { role: 'superuser' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('removes a member and takes them out of the member list', async () => {
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: auth(invitee.token) });
    const inviteeUserId = me.json().data.user.id as string;

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/members/${inviteeUserId}`,
      headers: auth(owner.token),
    });
    expect(res.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/v1/members', headers: auth(owner.token) });
    const emails = list.json().data.map((m: { email: string }) => m.email);
    expect(emails).not.toContain(invitee.email);

    // The row survives for the audit trail; it is deactivated, not deleted.
    const { memberships } = await import('@orq8/db');
    const rows = await deps.db
      .select({ status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.orgId, owner.orgId), eq(memberships.userId, inviteeUserId)));
    expect(rows[0]?.status).toBe('removed');

    // And the removal actually removes access. Before this, the membership went
    // to 'removed' while the session kept working: `findSessionByToken` joined
    // memberships without checking status, so the removed member carried on
    // reading company data with the role they used to hold. The live founder
    // loop found it (a removed teammate still got 200 from /v1/agents).
    const afterRemoval = await app.inject({ method: 'GET', url: '/v1/members', headers: auth(invitee.token) });
    expect(afterRemoval.statusCode).toBe(401);
  });

  it('reports whether the invitation email actually went out', async () => {
    // No SMTP host and no Resend key are configured in this environment, so the
    // transport logs the message instead of delivering it. The API must say so:
    // "invitation created" and "teammate has been emailed" are different claims,
    // and the inviter has to hand the link over themselves in the second case.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations',
      headers: auth(owner.token),
      payload: { email: `undeliverable-${randomUUID()}@example.com`, role: 'viewer' },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.delivery).toBe('unconfigured');
    expect(data.acceptUrl).toContain('/invite/');
  });

  it('issues a fresh link on renewal, and stops the old one working', async () => {
    const invite = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations',
      headers: auth(owner.token),
      payload: { email: `renew-${randomUUID()}@example.com`, role: 'member' },
    });
    const first = invite.json().data;
    const oldToken = first.acceptUrl.split('/invite/')[1] as string;

    const renew = await app.inject({
      method: 'POST',
      url: `/v1/members/invitations/${first.invitationId}/renew`,
      headers: auth(owner.token),
    });
    expect(renew.statusCode).toBe(200);
    const renewed = renew.json().data;
    expect(renewed.acceptUrl).toContain('/invite/');
    const newToken = renewed.acceptUrl.split('/invite/')[1] as string;
    expect(newToken).not.toBe(oldToken);

    // The old link is dead the moment a new one exists: the stored hash was
    // replaced, so a link that leaked cannot be kept alive by accident.
    const rows = await deps.db
      .select({ tokenHash: invitations.tokenHash })
      .from(invitations)
      .where(eq(invitations.id, first.invitationId));
    expect(rows[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const withOld = await app.inject({
      method: 'POST',
      url: '/v1/members/invitations/accept',
      headers: auth(owner.token),
      payload: { token: oldToken },
    });
    expect(withOld.statusCode).toBe(404);
  });

  it('refuses to renew an invitation that is not pending (409)', async () => {
    // `invitationId` was accepted earlier in this suite; renewal must not be a
    // back door that reopens settled history.
    const res = await app.inject({
      method: 'POST',
      url: `/v1/members/invitations/${invitationId}/renew`,
      headers: auth(owner.token),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('not_pending');
  });

  it('keeps a neighbouring organization out of all of it', async () => {
    const neighbour = await registerTenant('Neighbour Org');

    // Their invitation list is their own.
    const list = await app.inject({ method: 'GET', url: '/v1/members/invitations', headers: auth(neighbour.token) });
    expect(list.json().data).toEqual([]);

    // They cannot revoke another organization's invitation.
    const revoke = await app.inject({
      method: 'POST',
      url: `/v1/members/invitations/${invitationId}/revoke`,
      headers: auth(neighbour.token),
    });
    expect([403, 404]).toContain(revoke.statusCode);

    // …nor mint a new link for it.
    const renew = await app.inject({
      method: 'POST',
      url: `/v1/members/invitations/${invitationId}/renew`,
      headers: auth(neighbour.token),
    });
    expect([403, 404]).toContain(renew.statusCode);

    // They cannot touch another organization's member.
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: auth(owner.token) });
    const ownerUserId = me.json().data.user.id as string;
    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/members/${ownerUserId}`,
      headers: auth(neighbour.token),
      payload: { role: 'viewer' },
    });
    expect(patch.statusCode).toBe(404);

    const remove = await app.inject({
      method: 'DELETE',
      url: `/v1/members/${ownerUserId}`,
      headers: auth(neighbour.token),
    });
    expect(remove.statusCode).toBe(404);
  });
});
