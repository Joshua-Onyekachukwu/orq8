import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { validation } from '@orq8/core';
import {
  repositories,
  repositoryPrs,
  engineeringTasks,
  sandboxRuns,
  type Db,
  type NewRepository,
  type NewRepositoryPr,
  type NewEngineeringTask,
  type NewSandboxRun,
} from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import {
  listRepositories,
  getRepository,
  createRepository,
  deleteRepository,
  listBranches,
  upsertBranch,
  listFiles,
  getFile,
  upsertFile,
  upsertFileContent,
  getFileContent,
  logRepoEvent,
  createSandboxRun,
  getSandboxRun,
  updateSandboxRun,
  listPrs,
  getPr,
  createPr,
  updatePrStatus,
  listEngineeringTasks,
  getEngineeringTask,
  createEngineeringTask,
  updateEngineeringTask,
} from '../services/engineering.js';
import type { AppDeps } from '../types.js';

const createRepoBody = z.object({
  name: z.string().trim().min(1).max(100),
  fullName: z.string().trim().min(1).max(200),
  owner: z.string().trim().min(1).max(100),
  defaultBranch: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  private: z.boolean().default(false),
  providerId: z.string().uuid(),
  providerRefId: z.string().optional(),
  languages: z.array(z.string()).default([]),
  frameworkSummary: z.string().optional(),
  filesCount: z.number().int().min(0).default(0),
  sizeBytes: z.number().int().min(0).optional(),
});

const branchBody = z.object({
  name: z.string().trim().min(1).max(100),
  isDefault: z.boolean().default(false),
  ahead: z.number().int().min(0).default(0),
  behind: z.number().int().min(0).default(0),
  lastCommitAt: z.string().datetime().optional(),
  lastSyncAt: z.string().datetime().optional(),
});

const fileBody = z.object({
  path: z.string().trim().min(1).max(500),
  branch: z.string().trim().min(1).max(100),
  sha: z.string().optional().nullable(),
  sizeBytes: z.number().int().min(0).default(0),
  language: z.string().optional().nullable(),
  isBinary: z.boolean().default(false),
});

const sandboxBody = z.object({
  repositoryId: z.string().uuid(),
  branch: z.string().trim().min(1).max(100),
  command: z.string().trim().min(1).max(500),
  workingDir: z.string().trim().min(1).max(500),
  runnerEnv: z.record(z.string(), z.string()).optional(),
  allocatedCredits: z.number().int().min(0).default(0),
  timeoutMs: z.number().int().min(1000).max(600000).default(120000),
  maxMemoryMb: z.number().int().min(64).max(4096).default(512),
});

const prBody = z.object({
  repositoryId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(5000).optional(),
  headBranch: z.string().trim().min(1).max(100),
  baseBranch: z.string().trim().min(1).max(100),
  providerPrNumber: z.number().int().optional(),
  providerPrUrl: z.string().url().optional(),
  authorId: z.string().uuid(),
  authorType: z.string().trim().min(1).max(50),
});

const engTaskBody = z.object({
  repositoryId: z.string().uuid(),
  branch: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  acceptanceCriteria: z.string().max(2000).optional(),
  assigneeId: z.string().uuid(),
});

const decidePrBody = z.object({
  status: z.enum(['approved', 'rejected', 'changes_requested', 'merged']),
  note: z.string().max(1000).optional(),
});

export function registerEngineeringRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  // ─── Repositories ──────────────────────────────────────────────────────────

  app.get('/v1/repositories', async (request) => {
    const ctx = await requireAuth(request, deps);
    const repos = await listRepositories(db, ctx.orgId);
    return { data: repos };
  });

  app.get<{ Params: { id: string } }>('/v1/repositories/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const repo = await getRepository(db, ctx.orgId, request.params.id);
    if (!repo) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Repository not found' } };
    }
    return { data: repo };
  });

  app.post('/v1/repositories', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = createRepoBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const repo = await createRepository(db, {
      ...parsed.data,
      orgId: ctx.orgId,
    } as NewRepository);

    await logRepoEvent(db, {
      orgId: ctx.orgId,
      repositoryId: repo.id,
      eventType: 'imported',
      actorType: 'user',
      actorId: ctx.userId,
      summary: `Repository imported: ${repo.fullName}`,
      detail: { name: repo.name, owner: repo.owner },
    });

    reply.code(201);
    return { data: repo };
  });

  app.delete<{ Params: { id: string } }>('/v1/repositories/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const deleted = await deleteRepository(db, ctx.orgId, request.params.id);
    if (!deleted) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Repository not found' } };
    }
    return { data: { deleted: true } };
  });

  // ─── Branches ──────────────────────────────────────────────────────────────

  app.get<{ Params: { repoId: string } }>('/v1/repositories/:repoId/branches', async (request) => {
    const ctx = await requireAuth(request, deps);
    const repo = await getRepository(db, ctx.orgId, request.params.repoId);
    if (!repo) {
      throw new Error('Repository not found');
    }
    const branches = await listBranches(db, request.params.repoId);
    return { data: branches };
  });

  app.post<{ Params: { repoId: string } }>('/v1/repositories/:repoId/branches', async (request) => {
    const ctx = await requireAuth(request, deps);
    const repo = await getRepository(db, ctx.orgId, request.params.repoId);
    if (!repo) {
      throw new Error('Repository not found');
    }
    const parsed = branchBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const branch = await upsertBranch(db, {
      repositoryId: request.params.repoId,
      name: parsed.data.name,
      isDefault: parsed.data.isDefault,
      ahead: parsed.data.ahead,
      behind: parsed.data.behind,
      lastCommitAt: parsed.data.lastCommitAt ? new Date(parsed.data.lastCommitAt) : null,
      lastSyncAt: parsed.data.lastSyncAt ? new Date(parsed.data.lastSyncAt) : new Date(),
    });

    return { data: branch };
  });

  // ─── Files ────────────────────────────────────────────────────────────────

  app.get<{ Params: { repoId: string } }>(
    '/v1/repositories/:repoId/files',
    async (request, reply) => {
      const ctx = await requireAuth(request, deps);
      const url = new URL(request.url, 'http://localhost');
      const branch = url.searchParams.get('branch');
      const prefix = url.searchParams.get('prefix') ?? undefined;
      if (!branch) {
        reply.code(400);
        return { error: { code: 'bad_request', message: 'branch query param required' } };
      }
      const repo = await getRepository(db, ctx.orgId, request.params.repoId);
      if (!repo) {
        throw new Error('Repository not found');
      }
      const files = await listFiles(db, request.params.repoId, branch, prefix);
      return { data: files };
    },
  );

  app.get<{ Params: { repoId: string; path: string } }>(
    '/v1/repositories/:repoId/files/:path',
    async (request, reply) => {
      const ctx = await requireAuth(request, deps);
      const url = new URL(request.url, 'http://localhost');
      const branch = url.searchParams.get('branch');
      if (!branch) {
        reply.code(400);
        return { error: { code: 'bad_request', message: 'branch query param required' } };
      }
      const repo = await getRepository(db, ctx.orgId, request.params.repoId);
      if (!repo) {
        throw new Error('Repository not found');
      }
      const file = await getFile(db, request.params.repoId, branch, decodeURIComponent(request.params.path));
      if (!file) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'File not found' } };
      }
      const content = await getFileContent(db, file.id);
      return { data: { ...file, content } };
    },
  );

  app.put<{ Params: { repoId: string } }>('/v1/repositories/:repoId/files', async (request) => {
    const ctx = await requireAuth(request, deps);
    const repo = await getRepository(db, ctx.orgId, request.params.repoId);
    if (!repo) {
      throw new Error('Repository not found');
    }
    const parsed = fileBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const file = await upsertFile(db, {
      repositoryId: request.params.repoId,
      path: parsed.data.path,
      branch: parsed.data.branch,
      sha: parsed.data.sha ?? null,
      sizeBytes: parsed.data.sizeBytes,
      language: parsed.data.language ?? null,
      isBinary: parsed.data.isBinary,
    });

    const body = (request.body as { content?: string }).content;
    if (body) {
      await upsertFileContent(db, file.id, body);
    }

    await logRepoEvent(db, {
      orgId: ctx.orgId,
      repositoryId: request.params.repoId,
      eventType: 'file_updated',
      actorType: 'user',
      actorId: ctx.userId,
      summary: `File updated: ${parsed.data.path}`,
    });

    return { data: file };
  });

  // ─── Sandbox Runs ──────────────────────────────────────────────────────────

  app.post('/v1/sandbox-runs', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = sandboxBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Verify repository ownership
    const repo = await getRepository(db, ctx.orgId, parsed.data.repositoryId);
    if (!repo) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Repository not found' } };
    }

    const run = await createSandboxRun(db, {
      orgId: ctx.orgId,
      ...parsed.data,
      state: 'queued',
    } as NewSandboxRun);

    reply.code(202);
    return { data: run };
  });

  app.get<{ Params: { id: string } }>('/v1/sandbox-runs/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const run = await getSandboxRun(db, ctx.orgId, request.params.id);
    if (!run) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Sandbox run not found' } };
    }
    return { data: run };
  });

  // ─── PRs ──────────────────────────────────────────────────────────────────

  app.get<{ Params: { repoId: string } }>('/v1/repositories/:repoId/prs', async (request) => {
    const ctx = await requireAuth(request, deps);
    const repo = await getRepository(db, ctx.orgId, request.params.repoId);
    if (!repo) {
      throw new Error('Repository not found');
    }
    const prs = await listPrs(db, request.params.repoId);
    return { data: prs };
  });

  app.post('/v1/prs', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = prBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Verify repository ownership
    const repo = await getRepository(db, ctx.orgId, parsed.data.repositoryId);
    if (!repo) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Repository not found' } };
    }

    const pr = await createPr(db, {
      ...parsed.data,
    } as NewRepositoryPr);

    reply.code(201);
    return { data: pr };
  });

  app.patch<{ Params: { id: string }; Body: { status: string; note?: string } }>(
    '/v1/prs/:id',
    async (request, reply) => {
      const ctx = await requireAuth(request, deps);
      const parsed = decidePrBody.safeParse({ status: request.body.status, note: request.body.note });
      if (!parsed.success) throw validation(parsed.error.flatten());

      const pr = await getPr(db, ctx.orgId, request.params.id);
      if (!pr) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'PR not found' } };
      }

      const statusMap: Record<string, string> = {
        approved: 'approved',
        rejected: 'rejected',
        changes_requested: 'changes_requested',
        merged: 'merged',
      };

      const updated = await updatePrStatus(db, request.params.id, statusMap[parsed.data.status]!, undefined, ctx.userId);

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: `pr.${parsed.data.status}`,
        outcome: 'success',
      });

      return { data: updated };
    },
  );

  // ─── Engineering Tasks ─────────────────────────────────────────────────────

  app.get('/v1/engineering-tasks', async (request) => {
    const ctx = await requireAuth(request, deps);
    const tasks = await listEngineeringTasks(db, ctx.orgId);
    return { data: tasks };
  });

  app.get<{ Params: { id: string } }>('/v1/engineering-tasks/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const task = await getEngineeringTask(db, ctx.orgId, request.params.id);
    if (!task) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Engineering task not found' } };
    }
    return { data: task };
  });

  app.post('/v1/engineering-tasks', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = engTaskBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const repo = await getRepository(db, ctx.orgId, parsed.data.repositoryId);
    if (!repo) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Repository not found' } };
    }

    const task = await createEngineeringTask(db, {
      orgId: ctx.orgId,
      repositoryId: parsed.data.repositoryId,
      branch: parsed.data.branch,
      title: parsed.data.title,
      description: parsed.data.description,
      acceptanceCriteria: parsed.data.acceptanceCriteria,
      status: 'planning',
      assigneeId: parsed.data.assigneeId,
    } as NewEngineeringTask);

    reply.code(201);
    return { data: task };
  });

  app.patch<{ Params: { id: string } }>('/v1/engineering-tasks/:id', async (request) => {
    const ctx = await requireAuth(request, deps);
    const task = await getEngineeringTask(db, ctx.orgId, request.params.id);
    if (!task) {
      throw new Error('Engineering task not found');
    }

    const body = request.body as Record<string, unknown>;
    type UpdateFields = Partial<{
      status: string;
      testsSummary: unknown;
      lintSummary: unknown;
      buildSummary: unknown;
      diffSummary: unknown;
      prId: string;
      qaResult: unknown;
      completedAt: Date;
      acceptanceCriteria: string;
      description: string;
      branch: string;
    }>;

    const updates: UpdateFields = {};
    if (body.status) updates.status = body.status as string;
    if (body.testsSummary) updates.testsSummary = body.testsSummary;
    if (body.lintSummary) updates.lintSummary = body.lintSummary;
    if (body.buildSummary) updates.buildSummary = body.buildSummary;
    if (body.diffSummary) updates.diffSummary = body.diffSummary;
    if (body.prId) updates.prId = body.prId as string;
    if (body.qaResult) updates.qaResult = body.qaResult;
    if (body.completedAt) updates.completedAt = body.completedAt as Date;
    if (body.acceptanceCriteria) updates.acceptanceCriteria = body.acceptanceCriteria as string;
    if (body.description) updates.description = body.description as string;
    if (body.branch) updates.branch = body.branch as string;

    const updated = await updateEngineeringTask(db, request.params.id, updates);
    return { data: updated };
  });
}
