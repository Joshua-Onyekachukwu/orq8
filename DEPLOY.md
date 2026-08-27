# ORQ8 Production Deployment Guide

## Architecture

```
Vercel (Web App + Landing)          Railway (API + PostgreSQL)
┌──────────────────────────┐       ┌──────────────────────────────┐
│  apps/web (Next.js 15)   │──────▶│  apps/api (Fastify 5)        │
│  apps/landing (Next.js)  │  API  │  PostgreSQL 16 (managed)     │
│  Static + SSR            │       │  LiteLLM (optional)          │
└──────────────────────────┘       └──────────────────────────────┘
```

---

## Step 1: Deploy the API to Railway

### 1.1 Login to Railway

```bash
npx railway login
```

This opens your browser. Sign in with GitHub (recommended).

### 1.2 Create a new project

```bash
npx railway init
```

When prompted:
- **Project name:** `orq8-api` (or your preference)
- **Empty project:** Yes

### 1.3 Add PostgreSQL database

```bash
npx railway add --database postgresql
```

This creates a managed PostgreSQL instance and automatically sets the `DATABASE_URL` variable.

### 1.4 Set environment variables

Set these via the Railway dashboard (your project → Variables tab) or CLI:

```bash
npx railway variables set SESSION_SECRET="$(openssl rand -hex 32)"
npx railway variables set ENCRYPTION_KEY="$(openssl rand -hex 32)"
npx railway variables set ALLOWED_ORIGINS="https://your-vercel-app.vercel.app,http://localhost:3000"
npx railway variables set NODE_ENV="production"
npx railway variables set PORT="3001"
```

Optional (for AI features):
```bash
npx railway variables set LITELLM_BASE_URL="http://your-litellm-url:4000"
npx railway variables set LITELLM_MASTER_KEY="your-litellm-key"
```

Optional (for email):
```bash
npx railway variables set SMTP_HOST="smtp.resend.com"
npx railway variables set SMTP_PORT="465"
npx railway variables set SMTP_USER="resend"
npx railway variables set SMTP_PASS="your-resend-api-key"
npx railway variables set EMAIL_FROM="ORQ8 <noreply@your-domain.com>"
```

### 1.5 Deploy

```bash
npx railway up
```

Or connect your GitHub repo for automatic deployments:
```bash
npx railway service
# Then link to your GitHub repo in the dashboard
```

### 1.6 Get your API URL

After deployment, get your API's public URL:

```bash
npx railway domain
```

This gives you something like: `orq8-api-production.up.railway.app`

**Save this URL** — you'll need it for the Vercel web app.

### 1.7 Run database migrations

The API runs migrations automatically on deploy (via `railway.json` startCommand).

To run manually if needed:
```bash
npx railway run pnpm --filter @orq8/db migrate
```

---

## Step 2: Deploy the Web App to Vercel

### 2.1 Login to Vercel

```bash
npx vercel login
```

### 2.2 Link the project

```bash
npx vercel link
```

- **Set up project?** → Yes
- **Project name?** → `orq8`
- **Directory?** → `.` (root)

### 2.3 Set environment variables

Go to [vercel.com](https://vercel.com) → Your project → Settings → Environment Variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `API_URL` | `https://orq8-api-production.up.railway.app` | Production |
| `NEXT_PUBLIC_API_URL` | `https://orq8-api-production.up.railway.app` | Production |
| `REGISTRATION_OPEN` | `true` | Production |
| `AUTH_SECRET` | *(same as Railway SESSION_SECRET)* | Production |
| `NODE_ENV` | `production` | Production |

### 2.4 Deploy

```bash
npx vercel --prod
```

Or push to GitHub for automatic deployments.

---

## Step 3: Connect the two

Update Railway's `ALLOWED_ORIGINS` to include your Vercel URL:

```bash
npx railway variables set ALLOWED_ORIGINS="https://orq8.vercel.app"
```

---

## Step 4: Create admin user

Register the first admin user via the API:

```bash
curl -X POST https://orq8-api-production.up.railway.app/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@orq8.com",
    "password": "Admin123!",
    "name": "Admin User",
    "org_name": "ORQ8 HQ"
  }'
```

Then log in at your Vercel URL.

---

## Environment Variables Reference

### Required (API)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | *(auto-set by Railway)* |
| `SESSION_SECRET` | Secret for session signing (min 16 chars) | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256 key for provider key encryption | `openssl rand -hex 32` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `https://orq8.vercel.app` |
| `PORT` | Server port | `3001` |

### Optional (API)

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` |
| `LITELLM_BASE_URL` | LiteLLM gateway URL |
| `LITELLM_MASTER_KEY` | LiteLLM auth key |
| `SMTP_HOST` | SMTP server for emails |
| `SMTP_PORT` | SMTP port (default: 587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `EMAIL_FROM` | Sender email address |

### Required (Web App on Vercel)

| Variable | Description |
|----------|-------------|
| `API_URL` | API backend URL (server-side) |
| `NEXT_PUBLIC_API_URL` | API URL (client-side) |
| `REGISTRATION_OPEN` | `true` to allow signups |
| `AUTH_SECRET` | Session cookie secret |

---

## Verification

After deployment, test:

1. **API health check:** `https://your-api.up.railway.app/healthz`
2. **Web app:** `https://your-app.vercel.app`
3. **Register:** Create an account at `/register`
4. **Login:** Sign in at `/login`
5. **Dashboard:** Access `/app` after login
6. **Commands:** Test the Command Center with a real command
