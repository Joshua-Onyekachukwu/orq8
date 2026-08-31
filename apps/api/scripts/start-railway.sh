#!/bin/sh
# Railway start wrapper — captures all output and diagnostics
echo "=== ORQ8 API START WRAPPER ==="
echo "DATE: $(date)"
echo "NODE_ENV: $NODE_ENV"
echo "DATABASE_URL set: $([ -n \"$DATABASE_URL\" ] && echo 'YES' || echo 'NO')"
echo "SESSION_SECRET set: $([ -n \"$SESSION_SECRET\" ] && echo 'YES' || echo 'NO')"
echo "ENCRYPTION_KEY set: $([ -n \"$ENCRYPTION_KEY\" ] && echo 'YES' || echo 'NO')"
echo "ALLOWED_ORIGINS: $ALLOWED_ORIGINS"
echo "PORT: $PORT"
echo "PWD: $(pwd)"
echo "NODE version: $(node --version)"
echo "=== Running migrations ==="
pnpm --filter @orq8/db migrate 2>&1
echo "=== Migration exit code: $? ==="
echo "=== Starting API server ==="
pnpm --filter @orq8/api start 2>&1
EXIT_CODE=$?
echo "=== API server exited with code: $EXIT_CODE ==="
# Keep container alive for log inspection
if [ $EXIT_CODE -ne 0 ]; then
  echo "Server crashed. Keeping container alive for 300 seconds for log inspection..."
  sleep 300
fi
exit $EXIT_CODE
