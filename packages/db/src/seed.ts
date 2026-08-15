import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { count } from 'drizzle-orm';
import { users } from './schema.js';

// docs/51.2 — `pnpm --filter @orq8/db seed`
// Phase 1 has no static seeds: user + org data is created at registration.
// Phase 2+ adds: default org, constitution template (17a/17b), agent templates, model/provider catalog.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  const [row] = await db.select({ n: count() }).from(users);
  console.log(`[db] seed: database ready (${row?.n ?? 0} users). No static seeds in Phase 1 — org data is created at registration.`);
  await pool.end();
}

main().catch((err) => {
  console.error('[db] seed failed:', err);
  process.exit(1);
});
