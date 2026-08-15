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

export async function findMembershipsByUser(db: Db, userId: string) {
  return db
    .select({
      membership: memberships,
      org: {
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
      },
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(memberships.userId, userId));
}
