/**
 * Avatar routes (Phase 7).
 *
 * Upload/remove operate strictly on the *session* user — there is no
 * client-supplied user id anywhere, so cross-user avatar manipulation is
 * structurally impossible. Serving goes through the org-scoped files
 * backend so storage authorization is enforced per request.
 */

import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { users } from '@orq8/db';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { validation } from '@orq8/core';
import * as avatarService from '../services/avatar.js';
import * as filesService from '../services/files.js';
import type { AppDeps } from '../types.js';

const uploadBody = z.object({
  mimeType: z.string().min(3).max(100),
  body: z.string().min(1).max(4 * 1024 * 1024), // base64; decoded size re-checked in the service
});

/** Stable proxy URL format used for users.avatar_url. */
const AVATAR_URL_PATTERN = /^\/api\/files\/([0-9a-f-]{36})\/file$/;

export function registerAvatarRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config } = deps;

  /** POST /v1/users/me/avatar — upload and attach the session user's avatar. */
  app.post('/v1/users/me/avatar', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = uploadBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Locate the avatar being replaced, if any.
    const [current] = await db
      .select({ avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    const previousFileId = current?.avatarUrl
      ? AVATAR_URL_PATTERN.exec(current.avatarUrl)?.[1] ?? null
      : null;

    const result = await avatarService.uploadAvatar(
      config,
      db,
      ctx.userId,
      ctx.orgId,
      parsed.data,
      previousFileId,
    );
    if (!result.ok) {
      const isClientError =
        result.error === 'too_large' || result.error === 'unsupported_type' || result.error === 'not_an_image' || result.error === 'missing_file';
      reply.code(isClientError ? 400 : 500);
      return { error: { code: `avatar_${result.error}`, message: result.message } };
    }

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'user.avatar_updated',
      outcome: 'success',
    });

    reply.code(201);
    return { data: { avatarUrl: result.avatarUrl, fileId: result.fileId } };
  });

  /** DELETE /v1/users/me/avatar — clear the session user's avatar. */
  app.delete('/v1/users/me/avatar', async (request) => {
    const ctx = await requireAuth(request, deps);
    await avatarService.removeAvatar(config, db, ctx.userId, ctx.orgId);
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'user.avatar_removed',
      outcome: 'success',
    });
    return { data: { avatarUrl: null } };
  });

  /**
   * GET /v1/files/:id/file — serves avatar bytes. For object storage this
   * redirects to a short-lived signed URL (org-scoped record lookup),
   * giving avatars a stable, browser-cacheable URL without exposing
   * credentials. For the local-filesystem backend there is no servable
   * URL (`file://` must never reach a browser), so bytes are streamed
   * directly.
   */
  app.get<{ Params: { id: string } }>('/v1/files/:id/file', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const result = await filesService.getFileUrl(config, db, ctx.orgId, request.params.id);
    if (!result) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'File not found' } };
    }
    if (filesService.isLocalFileUrl(result.url)) {
      const content = await filesService.readFileBytes(config, db, ctx.orgId, request.params.id);
      if (!content) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'File not found' } };
      }
      reply
        .header('Content-Type', content.record.mimeType || 'application/octet-stream')
        .header('Cache-Control', 'private, max-age=300')
        .header('Content-Length', String(content.bytes.length))
        .header('Content-Disposition', `inline; filename="${content.record.name.replace(/["\\\r\n]/g, '')}"`);
      return reply.send(content.bytes);
    }
    reply.header('Cache-Control', 'private, max-age=300');
    reply.redirect(result.url, 302);
  });
}
