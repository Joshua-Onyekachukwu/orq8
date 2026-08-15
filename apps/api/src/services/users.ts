import { eq } from 'drizzle-orm';
import { users, type Db, type NewUser } from '@orq8/db';

export async function findByEmail(db: Db, email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function findById(db: Db, id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function createUser(db: Db, input: Omit<NewUser, 'email'> & { email: string }) {
  const [row] = await db
    .insert(users)
    .values({ ...input, email: input.email.trim().toLowerCase() })
    .returning();
  if (!row) throw new Error('createUser returned no row');
  return row;
}
