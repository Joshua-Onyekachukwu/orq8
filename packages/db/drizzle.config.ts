import { defineConfig } from 'drizzle-kit';

// docs/34.6 — Drizzle migrations live in packages/db
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
  },
});
