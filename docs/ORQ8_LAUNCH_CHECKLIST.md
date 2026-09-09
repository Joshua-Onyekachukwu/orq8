# ORQ8 — Launch Checklist

Every remaining **configuration** action to take the deployed product from "works on `orq8.vercel.app` with dev defaults" to launch-ready. Code work is done and verified (see `ORQ8_CURRENT_STATE.md`); what follows is dashboard config + verification commands.

**Verified facts this doc is built on** (read from source, not guessed):

- Email links (verification, password reset, briefings) are built from `ALLOWED_ORIGINS[0]` (API) and `APP_URL` (transactional email templates) — if either is wrong, links point at localhost.
- The register page is gated by `REGISTRATION_OPEN === "true"` on the **web** deployment — without it, signup shows a closed page.
- Production boot **refuses** the dev-only defaults for `SESSION_SECRET` / `ENCRYPTION_KEY` (`packages/core/src/config.ts`) — the API will crash-loop until real values are set.
- DB migrations auto-apply via the GitHub **DB Migrate** workflow using the `SUPABASE_DATABASE_URL` secret (Railway Postgres TCP proxy), triggered by pushes touching `supabase/migrations/**` or `packages/db/**`.
- Stripe webhook endpoint exists at `POST /v1/billing/webhook` with signature verification (raw-body aware).
- OAuth callback paths: `<APP_URL>/api/integrations/callback/github` and `/api/integrations/callback/google`.

---

## 0. Order of operations

Do sections in this order — later steps depend on earlier ones (domain → CORS/APP_URL → OAuth → email → smoke test):

1. §1 Secrets & env (Railway + Vercel)
2. §2 Email delivery (Resend)
3. §3 Platform admin
4. §4 Registration gate
5. §5 Custom domain (Vercel + Railway)
6. §6 OAuth apps (GitHub, Google) — optional at launch
7. §7 Stripe — when billing ships
8. §8 Final smoke test
9. §9 Post-launch monitoring

---

## 1. Secrets & environment variables

### 1.1 Railway (API service) — Settings → Variables

| Variable | How to generate / choose | Notes |
|---|---|---|
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | **Required.** Boot fails on dev default. |
| `ENCRYPTION_KEY` | Same command, different value (32 bytes) | **Required.** Encrypts stored provider keys. |
| `DATABASE_URL` | Already set (Railway injects from Postgres) | Verify it points at the Railway Postgres, not a dev DB. |
| `REDIS_URL` | Already provisioned? Verify in Railway. If absent: add a Redis instance, reference its `REDIS_URL` | Without it, rate limiting/idempotency fall back to in-memory (works single-instance, weaker). |
| `ALLOWED_ORIGINS` | `https://orq8.vercel.app` (later: `https://orq8.com,https://www.orq8.com,https://orq8.vercel.app`) | **First entry = the URL used in verification/reset email links.** Keep the canonical domain first. |
| `APP_URL` | `https://orq8.vercel.app` (later: `https://orq8.com`) | Used by transactional templates, OAuth redirect validation, billing return URLs. |
| `NVIDIA_API_KEY` / `OPENROUTER_API_KEY` | Already set? Verify | The EA is inert without an LLM provider. |
| `INTERNAL_TOKEN` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Without it, daily briefings / anomaly scans / memory consolidation silently skip in production. |

Verify after setting (replace `$RAILWAY_API_URL` with the API's public URL):

```bash
curl -s https://$RAILWAY_API_URL/healthz                                   # → {"status":"ok"} (or equivalent) — proves boot passed the secret check
curl -s -o /dev/null -w "%{http_code}\n" https://orq8.vercel.app/api/healthz # → 200 via web proxy
```

### 1.2 Vercel (web project) — Settings → Environment Variables

| Variable | Value | Notes |
|---|---|---|
| `API_URL` | Railway API's **internal or public** URL (e.g. `https://orq8-api-production.up.railway.app`) | Server-to-server proxy calls. Public URL works even same-region. |
| `NEXT_PUBLIC_API_URL` | Same as `API_URL` | Fallback used by client code paths. |
| `REGISTRATION_OPEN` | `true` | **Without this the register page renders closed** — nobody can sign up. Set it only when you're ready to accept signups. |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Your PostHog project values, or leave unset to disable analytics | Optional. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Only if a web path still uses Supabase directly | Grep shows references; verify they're used before setting. |

After changing env vars: **Redeploy** (Deployments → ⋯ → Redeploy) — env changes don't apply to the running build.

### 1.3 GitHub repo — Settings → Secrets and variables → Actions

| Secret | Value | Used by |
|---|---|---|
| `SUPABASE_DATABASE_URL` | Railway Postgres → Connect → **TCP proxy** URL with `?sslmode=require` | DB Migrate workflow. Already working (0023 applied). Re-verify if you rotate the DB password. |

---

## 2. Email delivery (Resend)

Without this, verification/password-reset emails only log to the API console. **This is the last launch-critical blocker.**

1. [resend.com](https://resend.com) → API Keys → create key.
2. Domains → Add `orq8.com` → add the DKIM/SPF DNS records Resend shows (do this in §5 together with domain setup).
3. Railway → add:
   - `RESEND_API_KEY=re_...`
   - `EMAIL_FROM=ORQ8 <noreply@orq8.com>` (must be on the verified domain — the default `founder@orq8.ai` will bounce until that domain is verified in Resend)

Verify (after §5 domain DNS propagates):

```bash
# 1. API picked up the key (logs show transport mode) — or just exercise it:
curl -s -X POST https://orq8.vercel.app/api/auth/verify-email/resend \
  -H "Content-Type: application/json" -b "orq8_session=<your-session-cookie>" -w "\n%{http_code}\n"
# → 200/429 (rate-limited is fine) and the email actually arrives in the inbox.
```

SMTP alternative (if you prefer not to use Resend): set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` on the API instead — the transport picks SMTP automatically.

---

## 3. Platform admin (fixes "Access Denied" on /admin)

1. Railway → API service → add:
   `PLATFORM_ADMIN_EMAILS=<the exact email you will sign up / sign in with>`
   (comma-separated if multiple; matching is case-insensitive.)
2. Redeploy the API (env change).
3. Log in with that email, open `https://orq8.vercel.app/admin`.

Verify:

```bash
# Signed-in as the admin, through the web proxy:
curl -s -o /dev/null -w "%{http_code}\n" https://orq8.vercel.app/admin -b "orq8_session=<admin-cookie>"   # → 200
# Signed-in as a normal user:
curl -s -o /dev/null -w "%{http_code}\n" https://orq8.vercel.app/admin -b "orq8_session=<user-cookie>"   # → 403 + an access_denied audit event
# Unauthenticated:
curl -s -o /dev/null -w "%{http_code}\n" https://orq8.vercel.app/admin                                    # → 307 redirect to login
```

For permanence (survives future env churn): promote in DB afterwards —

```sql
UPDATE users SET platform_role = 'admin' WHERE email = '<your-email>';
```

---

## 4. Registration gate

Already covered in §1.2 (`REGISTRATION_OPEN=true` on Vercel + redeploy). Decision point, not a chore:

- Keep it `false` until §8's smoke test passes and you're ready for real users, **or**
- Set it now — email verification (shipped) already protects against junk signups.

New signups receive a verification email automatically; the in-app banner with resend appears until they verify. No further config.

---

## 5. Custom domain (`orq8.com`)

### 5.1 Vercel (web)

1. Project → Settings → Domains → Add `orq8.com` and `www.orq8.com`.
2. At your registrar: apex `A` record → `76.76.21.21`; `www` `CNAME` → `cname.vercel-dns.com`.
3. Wait for the checkmark (minutes to hours depending on DNS propagation).

### 5.2 Railway (API)

1. API service → Settings → Networking → Generate Domain (or add custom domain `api.orq8.com`).
2. If custom: registrar `CNAME api → <railway-provided>`.
3. **Then update on the API service**: `ALLOWED_ORIGINS=https://orq8.com,https://www.orq8.com,https://orq8.vercel.app` and `APP_URL=https://orq8.com` → redeploy.
4. **And update on Vercel**: `API_URL`/`NEXT_PUBLIC_API_URL` to the new API domain → redeploy.

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://orq8.com                                  # → 200
curl -s -o /dev/null -w "%{http_code}\n" https://www.orq8.com                              # → 200/308
curl -s -o /dev/null -w "%{http_code}\n" https://orq8.com/api/healthz                      # → 200 (proxy → API)
curl -s https://orq8.com/api/auth/me -b "orq8_session=<cookie>" | head -c 200              # → JSON with your user
# and the .vercel.app URL still works (keep it as a permanent fallback)
```

Also update, after the domain resolves: Resend sender domain (§2), OAuth app callback URLs (§6), Stripe webhook endpoint (§7).

### 5.3 Known pre-existing issue to watch

Some `/images/*` assets on marketing pages 404 in production (Vercel static-serving investigation; the app shell is immune — sidebar/logo render inline SVG). If any landing image 404s on the new domain, it's this known issue, not your DNS.

---

## 6. OAuth apps (optional at launch — connectors)

### GitHub

1. github.com → Settings → Developer settings → OAuth Apps → New OAuth App.
   - Homepage: `https://orq8.com`
   - Authorization callback URL: `https://orq8.com/api/integrations/callback/github`
2. Railway → `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

### Google (Gmail)

1. console.cloud.google.com → OAuth consent screen (External, add scopes `gmail.modify`, `gmail.send`) → Credentials → OAuth Client ID (Web application).
   - Authorized redirect URI: `https://orq8.com/api/integrations/callback/google`
2. Railway → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Verify: in-app → Integrations → Connect GitHub/Gmail → completes → appears connected. (If skipped at launch, connectors remain unavailable — everything else works.)

---

## 7. Stripe (when billing ships — explicitly out of launch scope)

The integration boundary, webhook handler (`POST /v1/billing/webhook`, signature-verified), and checkout service exist. To activate:

1. Stripe Dashboard → API keys → Railway: `STRIPE_SECRET_KEY`.
2. Products/Prices → create the six prices → Railway: `STRIPE_PRICE_FOUNDER_MONTHLY`, `_ANNUAL`, `STRIPE_PRICE_TEAM_MONTHLY`, `_ANNUAL`, `STRIPE_PRICE_COMPANY_MONTHLY`, `_ANNUAL` (price IDs `price_...`).
3. Webhooks → Add endpoint `https://orq8.com/api/billing/webhook` → events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` → copy signing secret → Railway: `STRIPE_WEBHOOK_SECRET`.
4. Test-mode first: card `4242 4242 4242 4242`, complete checkout, verify subscription state in-app and the webhook delivery in Stripe logs. Only then flip to live keys.

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://orq8.com/api/billing/webhook -d '{}'  # → 400 invalid signature (proves endpoint live + signature check enforced)
```

Honest status until real keys are configured and a live payment completes: **integration implemented, production billing not enabled.**

---

## 8. Final smoke test (run after everything above, as a real user)

```bash
BASE="https://orq8.com"
for r in / /login /register /pricing /about; do curl -s -o /dev/null -w "$r %{http_code}\n" $BASE$r; done
# All → 200

curl -s -o /dev/null -w "/app %{http_code}\n" $BASE/app                 # → 307 (protected → login)
curl -s -o /dev/null -w "/verify-email %{http_code}\n" "$BASE/verify-email?token=x"  # → 200 (page renders, token rejected in UI)
curl -s -X POST $BASE/api/auth/verify-email -H "Content-Type: application/json" \
  -d '{"token":"x"}' -o /dev/null -w "verify-bad-token %{http_code}\n"  # → 400 structured error
```

Then by hand, in a browser:

1. **Signup** with a real email → verification email arrives → click link → banner clears.
2. **Create org** → EA opens → "Build me a marketing department" → department/team/agents appear.
3. **Hire an agent** → assign a task → task completes → audit trail shows it.
4. **Profile**: upload avatar → appears in top-bar + sidebar → edit job title → refresh → persists.
5. **Password reset**: logout → reset by email → email arrives → new password works.
6. **/admin** as founder (200) and as a second non-admin account (403 + audit event).
7. **Mobile**: repeat 1–4 on a phone or 390px viewport.
8. **Logout** → protected routes redirect.

---

## 9. Post-launch monitoring

- **Uptime**: add a free monitor (Better Stack / UptimeRobot) on `https://orq8.com/api/healthz` — 5-min interval, email alert.
- **Errors**: watch Railway logs (the API logs structured errors); consider attaching the existing OTEL endpoint (`OTEL_EXPORTER_OTLP_ENDPOINT`) to a hosted collector once volume justifies it.
- **DB**: Railway Postgres metrics — connection count and disk are the first things to hit limits.
- **Weekly**: skim the platform admin audit view for `access_denied` spikes and failed-agent executions.

---

## Current status (2026-09-09)

| Section | Status |
|---|---|
| §1 Secrets | Partially — DB/LLM keys set; **`SESSION_SECRET`/`ENCRYPTION_KEY`/`INTERNAL_TOKEN`/`APP_URL`/`ALLOWED_ORIGINS` production values unconfirmed** (check Railway) |
| §2 Email | **Not configured** — `RESEND_API_KEY` unset; verification emails log to console only |
| §3 Platform admin | **Not configured** — founder currently gets Access Denied on `/admin` |
| §4 Registration gate | Unconfirmed — check `REGISTRATION_OPEN` on Vercel |
| §5 Domain | Not started — `orq8.com` parked; product on `orq8.vercel.app` |
| §6 OAuth | Not started (optional at launch) |
| §7 Stripe | Deliberately deferred |
| §8 Smoke test | Blocked by §2 (verification email) — the rest is runnable today |

Minimum path to launch: **§1.1 → §1.2 → §2 → §3 → §4 → §5 → §8** (≈ 1–2 hours of dashboard work + DNS propagation).
