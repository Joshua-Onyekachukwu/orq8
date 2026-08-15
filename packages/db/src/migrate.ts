import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// docs/34.6 — `pnpm --filter @orq8/db migrate` (dev) / migrate:prod
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8';

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './migrations' });
  await pool.end();
  console.log('[db] migrations applied');
}

main().catch((err) => {
  console.error('[db] migration failed:', err);
  process.exit(1);
});
