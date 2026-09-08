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
  },
});
