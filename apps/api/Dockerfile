# ORQ8 API — Fastify service image (Railway + Docker Compose)
# Build context is the repo root (context: ..).

FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

# ── Dependencies ──
# Copy only package files first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/auth/package.json packages/auth/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile

# ── Application code ──
COPY apps/api apps/api
COPY packages/auth packages/auth
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/domain packages/domain

# ── Production (skip devDependencies for smaller image) ──
ENV NODE_ENV=production
EXPOSE 3001

# Railway overrides startCommand via railway.json to run migrations first.
# The default CMD starts the API directly.
CMD ["pnpm", "--filter", "@orq8/api", "start"]
