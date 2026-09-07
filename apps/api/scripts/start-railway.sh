#!/bin/sh
# Railway start wrapper — captures all output for debugging
echo "=== ORQ8 API START ==="
echo "NODE_ENV=$NODE_ENV PORT=$PORT"
echo "DATABASE_URL set: $([ -n \"$DATABASE_URL\" ] && echo YES || echo NO)"
echo "SESSION_SECRET set: $([ -n \"$SESSION_SECRET\" ] && echo YES || echo NO)"
echo "ENCRYPTION_KEY set: $([ -n \"$ENCRYPTION_KEY\" ] && echo YES || echo NO)"
echo "=== Running migrations ==="
# migrate:supabase applies the real ORQ8 schema lineage (supabase/migrations
# 0001-0013, which match packages/db/src/schema.ts) instead of the stale
# drizzle folder. It is idempotent and also reconciles a pre-existing
# drizzle-applied schema on top (the production case).
pnpm --filter @orq8/db migrate:supabase 2>&1
echo "=== Migrations done (exit=$?) ==="
echo "=== Starting API server ==="
exec pnpm --filter @orq8/api start 2>&1
