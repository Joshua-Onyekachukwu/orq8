import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as files from '../services/files.js';
import type { AppDeps } from '../types.js';

export function registerFileRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config, logger } = deps;

  /** List files for the current org. */
  app.get('/v1/files', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);

    const list = await files.listFiles(db, ctx.orgId, { limit, offset });
    return { data: list, meta: { limit, offset } };
  });

  /** Get a single file record. */
  app.get<{ Params: { id: string } }>('/v1/files/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const record = await files.getFileById(db, ctx.orgId, request.params.id);
    if (!record) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'File not found' } };
    }
    return { data: record };
  });

  /** Get a download URL for a file. */
  app.get<{ Params: { id: string } }>('/v1/files/:id/download', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const result = await files.getFileUrl(config, db, ctx.orgId, request.params.id);
    if (!result) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'File not found' } };
    }
    return { data: { url: result.url, file: result.record } };
  });

  /** Upload a file (base64 body in JSON — multipart requires @fastify/multipart). */
  app.post('/v1/files', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const uploadBody = z.object({
      name: z.string().min(1).max(255),
      mimeType: z.string().min(1),
      body: z.string(), // base64-encoded file content
      metadata: z.record(z.string(), z.unknown()).optional(),
      agentId: z.string().uuid().optional(),
      taskId: z.string().uuid().optional(),
    });

    const parsed = uploadBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    try {
      const buffer = Buffer.from(parsed.data.body, 'base64');

      const result = await files.uploadFile(config, db, ctx.orgId, {
        name: parsed.data.name,
        mimeType: parsed.data.mimeType,
        body: buffer,
        uploadedBy: ctx.userId,
        agentId: parsed.data.agentId,
        taskId: parsed.data.taskId,
        metadata: parsed.data.metadata,
      });

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'file.uploaded',
        outcome: 'success',
      });

      reply.code(201);
      return { data: result };
    } catch (err) {
      logger.error({ err, orgId: ctx.orgId }, 'File upload failed');
      throw new Error('File upload failed');
    }
  });

  /** Delete a file. */
  app.delete<{ Params: { id: string } }>('/v1/files/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const deleted = await files.deleteFile(config, db, ctx.orgId, request.params.id);
    if (!deleted) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'File not found' } };
    }

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'file.deleted',
      outcome: 'success',
    });

    reply.code(204);
    return reply.send();
  });
}
