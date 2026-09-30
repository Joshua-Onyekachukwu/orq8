# 59. Google Cloud Run deployment

Status: prepared, not deployed. The repo is ready for Cloud Run; the deploy
itself waits on the founder's Google Cloud account and a Postgres instance.

## 59.1 What runs where

| Piece | Cloud Run service | Image | Notes |
|---|---|---|---|
| API (Fastify) | `orq8-api` | `apps/api/Dockerfile.cloudrun` | runs migrations on boot, then serves on `$PORT` |
| Web (Next.js) | `orq8-web` | `apps/web/Dockerfile.cloudrun` | proxies all API calls through route handlers; only needs `API_URL` |

The web app never talks to the database directly (same contract as the current
Vercel + Railway split). OAuth callbacks are web-owned
(`/api/auth/oauth/callback/{github,google}`), so the provider redirect URIs
must point at the Cloud Run web origin (or the production web domain).

## 59.2 What is in the repo (prepared)

- `apps/api/Dockerfile.cloudrun` — API image; entrypoint runs
  `pnpm --filter @orq8/db migrate:supabase` (the real schema lineage) before
  the server, mirroring `start-railway.sh`.
- `apps/api/scripts/start-cloudrun.sh` — the start wrapper (migrations, then
  `exec` the server so SIGTERM drains cleanly).
- `apps/web/Dockerfile.cloudrun` — web image; `next start -p $PORT`.
- `infra/cloudrun/api.cloudbuild.yaml` — build + deploy the API from the repo
  root. Runtime config is injected from Secret Manager
  (`--set-secrets`) and env vars (`ALLOWED_ORIGINS`, `APP_URL`).
- `infra/cloudrun/web.cloudbuild.yaml` — build + deploy the web app. Set
  `_API_URL` to the API URL printed by the API deploy.
- `infra/cloudrun/setup-1time.sh` — enables the four APIs, creates the
  Artifact Registry repo, grants the Cloud Build service account, and creates
  the Secret Manager entries.

## 59.3 What the founder must provide

1. A billing-enabled Google Cloud project ID.
2. Preferred region (default `europe-west1`; pick the one closest to users).
3. A Postgres instance the API can reach, and its connection string:
   either Cloud SQL (`orq8` database, dedicated user) or any managed Postgres
   (Supabase works as-is). Format:
   `postgres://USER:PASSWORD@HOST:5432/orq8`.
   If Cloud SQL is chosen, also say whether the instance is public-IP (needs
   the Cloud SQL Auth Proxy sidecar or unix socket path) or private VPC
   (needs Serverless VPC Access connector on the API service).
4. Whether email sending should be live from day one: `RESEND_API_KEY`
   (preferred) or SMTP credentials. Without one, verification and reset
   emails are logged, not sent.

## 59.4 Runbook (after the details arrive)

```sh
gcloud auth login
gcloud config set project PROJECT_ID

sh infra/cloudrun/setup-1time.sh          # APIs, registry, grants, secrets

gcloud secrets versions add orq8-database-url --data-file=<(printf '%s' 'postgres://...')
gcloud secrets versions add orq8-session-secret --data-file=<(printf '%s' "$(openssl rand -base64 32)")
gcloud secrets versions add orq8-encryption-key --data-file=<(printf '%s' "$(openssl rand -base64 32)")
gcloud secrets versions add orq8-encryption-key-kid --data-file=<(printf '%s' 'v1')
gcloud secrets versions add orq8-internal-token --data-file=<(printf '%s' "$(openssl rand -base64 32)")
# optional, email:
gcloud secrets versions add orq8-resend-api-key --data-file=<(printf '%s' 're_...')

gcloud builds submit --config infra/cloudrun/api.cloudbuild.yaml
# → note the API URL, e.g. https://orq8-api-xxxx-ew.a.run.app

# point _API_URL in infra/cloudrun/web.cloudbuild.yaml at it, then:
gcloud builds submit --config infra/cloudrun/web.cloudbuild.yaml
# → note the web URL, e.g. https://orq8-web-xxxx-ew.a.run.app
```

Then update the API service's `ALLOWED_ORIGINS`/`APP_URL` to the web URL
(redeploy the API with `_WEB_ORIGIN` set to the web URL), and verify.

## 59.5 Verification (run after deploy)

1. `curl https://<api-url>/healthz` → `{"data":{"status":"ok"}}`.
2. `curl https://<web-url>/healthz` → 200.
3. Sign up through the web app with a real email; the confirmation email
   arrives (or is logged if no mail provider was set), confirming works, and
   the session gates behave (unconfirmed sessions are refused on data APIs).
4. Refresh keeps the session; logout destroys it server-side and returns to
   the landing page.
5. OAuth: add the Cloud Run web origin as a new redirect URI in the GitHub
   and Google OAuth apps (`https://<web-url>/api/auth/oauth/callback/github`,
   `.../callback/google`), then sign in with each provider.

## 59.6 Differences from the Railway setup (intentional)

- Migrations run in the same container start (identical to Railway's
  `start-railway.sh`) — but multiple API instances starting at once is safe:
  `migrate-supabase` reconciles idempotently.
- Secrets live in Secret Manager instead of Railway variables, mounted at
  deploy time, so a changed secret needs a redeploy (or
  `gcloud run services update`).
- The web app moves off Vercel onto Cloud Run; `_API_URL` replaces
  `API_URL`, and the web origin replaces `orq8.vercel.app` in
  `ALLOWED_ORIGINS`. Cookie domain stays implicit (host-only), so no extra
  configuration is needed for either origin.
