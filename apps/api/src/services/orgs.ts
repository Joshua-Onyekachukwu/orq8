import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { memberships, organizations, type Db } from '@orq8/db';

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'org';
}

export async function createOrg(db: Db, input: { name: string; plan?: string }) {
  const slug = `${slugify(input.name)}-${randomBytes(2).toString('hex')}`;
  const [row] = await db
    .insert(organizations)
    .values({ name: input.name.trim(), slug, plan: input.plan ?? 'free' })
    .returning();
  if (!row) throw new Error('createOrg returned no row');
  return row;
}

export async function createMembership(
  db: Db,
  input: { orgId: string; userId: string; role: 'owner' | 'admin' | 'member' | 'viewer' },
) {
  await db
    .insert(memberships)
    .values({ orgId: input.orgId, userId: input.userId, role: input.role, status: 'active' });
}

export async function updateOrg(
  db: Db,
  orgId: string,
  input: { name?: string; isDemo?: boolean; eaName?: string },
) {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  // Org-scoped JSONB settings. Both keys live here so one read/merge keeps
  // them from clobbering each other:
  //   isDemo  (§58 no-fake-success) — the org presents its staged content as demo data.
  //   eaName  — what the Executive Agent calls itself for this company. It is
  //             the agent's own identity (editable like any other agent), not
  //             a deployment-wide constant.
  if (input.isDemo !== undefined || input.eaName !== undefined) {
    const [current] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    const settings = { ...((current?.settings as Record<string, unknown>) ?? {}) };
    if (input.isDemo !== undefined) settings.isDemo = input.isDemo;
    if (input.eaName !== undefined) settings.eaName = input.eaName.trim();
    updates.settings = settings;
  }
  const [row] = await db
    .update(organizations)
    .set(updates)
    .where(eq(organizations.id, orgId))
    .returning();
  if (!row) throw new Error('updateOrg returned no row');
  return row;
}

/** The Executive Agent's name for an org, or null when it keeps the default. */
export function eaNameFromSettings(settings: unknown): string | null {
  const value = (settings as { eaName?: unknown } | null)?.eaName;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Resolve the name the Executive Agent goes by for an org: the org's own
 * `settings.eaName` when renamed, otherwise the deployment default. Every
 * surface that addresses the EA by name (attention prompts, report bylines,
 * email sign-offs) must go through here so a rename never leaves a stale
 * "Atlas" behind.
 */
export async function resolveOrgEaName(
  db: Db,
  orgId: string,
  fallback: string,
): Promise<string> {
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return eaNameFromSettings(row?.settings) ?? fallback;
}

export async function findMembershipsByUser(db: Db, userId: string) {
  return db
    .select({
      membership: memberships,
      org: {
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        settings: organizations.settings,
      },
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(memberships.userId, userId));
}
