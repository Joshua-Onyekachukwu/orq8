# ORQ8 worker — the standalone agent-job drain (docs/75 phase 2)
# Build context is the repo root (context: ..), same as apps/api/Dockerfile.
#
# It ships the API's services because the worker reuses them deliberately:
# `startJobWorker` is the SAME loop the API runs in single-process mode, and the
# dispatch calls the same `executeWithQuality` pipeline. Duplicating that code
# here would be the drift this split exists to avoid.
#
# No EXPOSE and no HTTP listener: this process only drains `agent_jobs`, and it
# scales on its own (`docker compose up --scale worker=5`).

FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

# ── Dependencies ──
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/auth/package.json packages/auth/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Application code ──
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY packages/auth packages/auth
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/domain packages/domain

ENV NODE_ENV=production
# Fail loudly at boot rather than idling: the worker refuses to run in any mode
# that does not drain the queue (see apps/worker/src/main.ts).
ENV JOB_QUEUE_MODE=workers

# `tsx` runs the TypeScript entry directly (same as the API image's start path).
# PID 1 is the node process, so SIGTERM reaches the worker's handler and the
# in-flight job gets JOB_SHUTDOWN_GRACE_MS to finish.
CMD ["pnpm", "--filter", "@orq8/worker", "start"]
