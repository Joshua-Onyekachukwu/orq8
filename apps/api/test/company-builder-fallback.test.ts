import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, companyMemory } from '@orq8/db';
import { analyzeCompany } from '../src/services/company-builder.js';

/**
 * C-07 regression: when the LLM is unavailable, analyzeCompany falls back to
 * invented generic priorities/risks. Those guesses must NEVER be recorded in
 * Company Brain as founder decisions — they are unconfirmed suggestions.
 */

// DB-gated like the other service tests (skipped without Postgres).
const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: process.env.DATABASE_URL } as NodeJS.ProcessEnv);
let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

run('company-builder fallback — invented priorities are not founder decisions', () => {
  it('stores fallback priorities as unconfirmed context, never as decisions', async () => {
    // No LLM keys in test config → chatJson returns null → fallbackAnalysis.
    expect(config.OPENROUTER_API_KEY ?? '').toBe('');
    const { db, pool } = createDb(config.DATABASE_URL);
    try {
      const orgId = randomUUID();
      const userId = randomUUID();
      await db.insert(organizations).values({ id: orgId, name: 'Fallback Co', slug: `fb-${orgId.slice(0, 8)}` }).onConflictDoNothing();
      await db.insert(users).values({ id: userId, email: `fb-${userId.slice(0, 8)}@test.orq8`, name: 'Founder', passwordHash: 'not-a-real-hash', status: 'active' }).onConflictDoNothing();

      const analysis = await analyzeCompany(config, db, orgId, {
        description: 'A short test idea with no market detail whatsoever.',
        sourceType: 'idea',
      });
      expect(analysis.priorities.length).toBeGreaterThan(0);

      const rows = await db.select().from(companyMemory).where(eq(companyMemory.orgId, orgId));
      const decisions = rows.filter((r) => r.category === 'decision');
      // Nothing the founder never said may be filed as their decision.
      expect(decisions).toEqual([]);
      // The invented priorities are still kept — labeled as unconfirmed.
      const suggestions = rows.filter(
        (r) => r.category === 'context' && (r.content ?? '').includes('unconfirmed'),
      );
      expect(suggestions.length).toBeGreaterThanOrEqual(analysis.priorities.length);
    } finally {
      await pool.end();
    }
  });
});
