#!/bin/sh
# railway-nvidia-apply.sh — one-shot: bring the Railway production API service
# to the exact NVIDIA provider config from apps/api/.env.
#
# Verified against (2026-09-03):
#   project  gleaming-solace            dcf399fb-b581-4b49-b7b5-26adb783818b
#   env      production                 955ac5ea-e43d-4172-9043-1c0229159a68
#   service  @orq8/api                  ccba66e8-54a8-46b4-8325-bb8bfde30a76
#
# Behaviour:
#   * If Railway already has the exact values → "already in sync", exit 0, no
#     deploy (Railway skips deploys when nothing changed).
#   * Otherwise ONE combined `railway variable set` call (all pairs in a single
#     invocation) → exactly ONE redeploy → waits for it → health check.
#
# Usage (repo root, railway CLI session authenticated):
#   sh tools/railway-nvidia-apply.sh

set -eu

SERVICE="@orq8/api"
ENV="production"
ENV_FILE="apps/api/.env"
HEALTH_URL="https://orq8api-production.up.railway.app/healthz"

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
set -a
. "$ENV_FILE"
set +a

# Values we want on Railway (defaults mirror packages/core config + docs/58.11b).
WANT_LLM_TIMEOUT="${LLM_TIMEOUT_MS:-90000}"
WANT_LLM_HEADERS="${LLM_HEADERS_TIMEOUT_MS:-30000}"
WANT_BASE_URL="${NVIDIA_BASE_URL:-https://integrate.api.nvidia.com}"
# NOTE: must NOT end in /v1 — the deployed (main-branch) client appends
# '/v1/chat/completions' itself; a '/v1' suffix produced /v1/v1 404s.

vars_json() {
  npx -y @railway/cli variable list --service "$SERVICE" --environment "$ENV" --json 2>/dev/null
}

# ── 1. Diff against the current Railway state ──────────────────────────────
CURRENT=$(vars_json)
IN_SYNC=$(printf '%s' "$CURRENT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const v=JSON.parse(s);
  // Same defaults as the set step below (local .env omits BASE_URL/LLM timeouts).
  const want={NVIDIA_API_KEY:process.env.NVIDIA_API_KEY,NVIDIA_API_KEYS:process.env.NVIDIA_API_KEYS,NVIDIA_MODEL:process.env.NVIDIA_MODEL,NVIDIA_MODEL_FALLBACKS:process.env.NVIDIA_MODEL_FALLBACKS,NVIDIA_BASE_URL:process.env.NVIDIA_BASE_URL||'https://integrate.api.nvidia.com',LLM_TIMEOUT_MS:process.env.LLM_TIMEOUT_MS||'90000',LLM_HEADERS_TIMEOUT_MS:process.env.LLM_HEADERS_TIMEOUT_MS||'30000'};
  const diff=Object.keys(want).filter(k=>v[k]!==want[k]);
  console.log(diff.length===0?'yes':'no:'+diff.join(','));
})")

if [ "$IN_SYNC" = "yes" ]; then
  echo "already in sync — no change, no deploy (Railway skips no-op redeploys)."
  exit 0
fi
echo "out of sync ($IN_SYNC) — applying…"

# ── 2. One combined set → one redeploy ─────────────────────────────────────
BEFORE=$(npx -y @railway/cli deployment list --service "$SERVICE" 2>/dev/null | sed -n '2p' | awk '{print $1}')
echo "current deployment: ${BEFORE:-unknown}"

# Single invocation with every KEY=VALUE pair: exactly ONE deploy is triggered.
npx -y @railway/cli variable set \
  "NVIDIA_API_KEY=$NVIDIA_API_KEY" \
  "NVIDIA_API_KEYS=$NVIDIA_API_KEYS" \
  "NVIDIA_MODEL=$NVIDIA_MODEL" \
  "NVIDIA_MODEL_FALLBACKS=$NVIDIA_MODEL_FALLBACKS" \
  "NVIDIA_BASE_URL=$WANT_BASE_URL" \
  "LLM_TIMEOUT_MS=$WANT_LLM_TIMEOUT" \
  "LLM_HEADERS_TIMEOUT_MS=$WANT_LLM_HEADERS" \
  --service "$SERVICE" --environment "$ENV" >/dev/null 2>&1
echo "✓ variables set — waiting for the redeploy…"

# ── 3. Wait for the new deployment (≤ ~3 min) ──────────────────────────────
i=0
while [ $i -lt 12 ]; do
  i=$((i + 1))
  sleep 15
  LINE=$(npx -y @railway/cli deployment list --service "$SERVICE" 2>/dev/null | sed -n '2p')
  ID=$(echo "$LINE" | awk '{print $1}')
  ST=$(echo "$LINE" | awk '{print $2}')
  if [ -n "$ID" ] && [ "$ID" != "$BEFORE" ] && [ -n "$ST" ]; then
    echo "→ new deployment: $ID ($ST)"
    [ "$ST" = "SUCCESS" ] && break
    [ "$ST" = "FAILED" ] && { echo "deploy FAILED — check Railway logs" >&2; exit 1; }
  fi
done

# ── 4. Health check ────────────────────────────────────────────────────────
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL")
echo "healthz → $code"
[ "$code" = "200" ] || { echo "health check failed" >&2; exit 1; }
echo "✓ done — NVIDIA provider config is live on Railway."
