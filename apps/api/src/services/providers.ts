import { and, desc, eq } from 'drizzle-orm';
import {
  providers,
  secretRecords,
  userProviderKeys,
  type Db,
  type NewProvider,
  type NewSecretRecord,
  type NewUserProviderKey,
} from '@orq8/db';

// docs/23 — provider config services. Every key row is org-scoped; key material
// is only ever read via the cipher in the route layer (never returned to callers).

export async function listProviders(db: Db) {
  return db.select().from(providers).orderBy(providers.name);
}

export async function findProviderBySlug(db: Db, slug: string) {
  const [row] = await db.select().from(providers).where(eq(providers.slug, slug)).limit(1);
  return row ?? null;
}

/** Upsert a catalog provider by slug (idempotent — used by seeds). */
export async function upsertProvider(db: Db, input: NewProvider) {
  const existing = await findProviderBySlug(db, input.slug);
  if (existing) return existing;
  const [row] = await db.insert(providers).values(input).returning();
  if (!row) throw new Error('upsertProvider returned no row');
  return row;
}

export async function listKeysByOrg(db: Db, orgId: string) {
  return db
    .select({
      key: userProviderKeys,
      provider: {
        slug: providers.slug,
        name: providers.name,
        kind: providers.kind,
        baseUrl: providers.baseUrl,
      },
    })
    .from(userProviderKeys)
    .innerJoin(providers, eq(userProviderKeys.providerId, providers.id))
    .where(and(eq(userProviderKeys.orgId, orgId)))
    .orderBy(desc(userProviderKeys.createdAt));
}

export async function findKeyById(db: Db, id: string, orgId: string) {
  const [row] = await db
    .select({
      key: userProviderKeys,
      provider: {
        slug: providers.slug,
        name: providers.name,
        kind: providers.kind,
        baseUrl: providers.baseUrl,
      },
    })
    .from(userProviderKeys)
    .innerJoin(providers, eq(userProviderKeys.providerId, providers.id))
    .where(and(eq(userProviderKeys.id, id), eq(userProviderKeys.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

/** Active (non-revoked) key ids per org — drives the catalog's connected flag. */
export async function listActiveKeyIdsByOrg(db: Db, orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ providerId: userProviderKeys.providerId })
    .from(userProviderKeys)
    .where(and(eq(userProviderKeys.orgId, orgId), eq(userProviderKeys.status, 'active')));
  return new Set(rows.map((r) => r.providerId));
}

export async function createKey(db: Db, input: NewUserProviderKey) {
  const [row] = await db.insert(userProviderKeys).values(input).returning();
  if (!row) throw new Error('createKey returned no row');
  return row;
}

export async function replaceKeyPayload(
  db: Db,
  id: string,
  orgId: string,
  payload: { keyEncrypted: string; keyKid: string; mask: string },
) {
  const [row] = await db
    .update(userProviderKeys)
    .set({ ...payload, updatedAt: new Date() })
    .where(and(eq(userProviderKeys.id, id), eq(userProviderKeys.orgId, orgId)))
    .returning();
  return row ?? null;
}

export async function markKeyTested(db: Db, id: string, orgId: string) {
  await db
    .update(userProviderKeys)
    .set({ lastTestedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(userProviderKeys.id, id), eq(userProviderKeys.orgId, orgId)));
}

export async function revokeKey(db: Db, id: string, orgId: string) {
  const [row] = await db
    .update(userProviderKeys)
    .set({ status: 'revoked', enabled: false, revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(userProviderKeys.id, id), eq(userProviderKeys.orgId, orgId)))
    .returning();
  return row ?? null;
}

/** Immutable access ledger — every key decrypt is recorded here (docs/23.6). */
export async function recordSecretAccess(db: Db, input: NewSecretRecord) {
  const [row] = await db.insert(secretRecords).values(input).returning();
  if (!row) throw new Error('recordSecretAccess returned no row');
  return row;
}
