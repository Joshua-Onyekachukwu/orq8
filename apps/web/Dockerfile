# ORQ8 Web — Next.js image (compose profile "app"; infra/docker-compose.yml)
# Build context is the repo root (context: ..); see .dockerignore.
# Node 22-slim has no curl — the compose healthcheck uses node fetch instead.

FROM node:22-slim AS builder

WORKDIR /app

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

# Web sources (+ tsconfig.base.json already copied) then production build
COPY apps/web apps/web
RUN pnpm --filter @orq8/web build

# Runtime — node_modules stays (local stack; simplicity over image size)
FROM node:22-slim

WORKDIR /app

RUN corepack enable

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "--filter", "@orq8/web", "start"]
