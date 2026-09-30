import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Limit concurrent test files to prevent Postgres connection exhaustion.
    // Each worker opens its own connection pool; too many workers overwhelm
    // the test database and cause "Worker exited unexpectedly" crashes.
    pool: 'forks',
    maxForks: 2,
    minForks: 1,
    testTimeout: 30_000,
    hookTimeout: 15_000,
    /**
     * Boots the database the integration tests run against before any worker
     * forks, so those tests cannot silently skip on a machine without a system
     * Postgres — see scripts/lib/api-test-db.ts for the reasoning.
     */
    globalSetup: ['../../scripts/lib/api-test-db.ts'],
    // Booting an embedded Postgres and applying the full production migration
    // lineage is a cold, one-off cost; a 60s default would time it out.
    setupTimeout: 180_000,
    teardownTimeout: 60_000,
  },
});
