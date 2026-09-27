#!/bin/sh
# Cloud Run start wrapper for the ORQ8 API.
# Same contract as start-railway.sh: apply the real schema lineage
# (supabase/migrations) then boot the server. Cloud Run injects PORT (default
# 8080); the API binds 0.0.0.0:PORT via index.ts. exec hands PID 1 signals
# (SIGTERM) straight to the server for clean shutdowns during deploys.
echo "=== ORQ8 API START (Cloud Run) ==="
echo "NODE_ENV=$NODE_ENV PORT=$PORT"
if [ -n "${DATABASE_URL:-}" ]; then echo "DATABASE_URL set: YES"; else echo "DATABASE_URL set: NO"; fi
if [ -n "${SESSION_SECRET:-}" ]; then echo "SESSION_SECRET set: YES"; else echo "SESSION_SECRET set: NO"; fi
if [ -n "${ENCRYPTION_KEY:-}" ]; then echo "ENCRYPTION_KEY set: YES"; else echo "ENCRYPTION_KEY set: NO"; fi
echo "=== Running migrations ==="
pnpm --filter @orq8/db migrate:supabase 2>&1
echo "=== Migrations done (exit=$?) ==="
echo "=== Starting API server ==="
exec pnpm --filter @orq8/api start 2>&1
