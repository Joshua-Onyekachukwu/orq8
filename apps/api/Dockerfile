# ORQ8 API — Fastify service image (compose profile "app"; infra/docker-compose.yml)
# Build context is the repo root (context: ..); see .dockerignore.
# Node 22-slim has no curl — the compose healthcheck uses node fetch instead.

FROM node:22-slim

WORKDIR /app

# pnpm pinned via corepack (package.json "packageManager")
RUN corepack enable

# Install deps against a frozen lockfile (workspace packages via pnpm-workspace.yaml)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile

# App + workspace sources (devDeps incl. tsx are installed above and needed at runtime)
COPY apps/api apps/api
COPY packages/auth packages/auth
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/domain packages/domain

ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "--filter", "@orq8/api", "start"]
