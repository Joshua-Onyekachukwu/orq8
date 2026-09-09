/**
 * Profile avatar upload (Phase 7).
 *
 * Users upload a small PNG/JPEG/WebP image which is stored through the
 * existing files storage backend (S3 when configured, local filesystem
 * otherwise) and recorded in the org-scoped `files` table. The avatar is
 * served through the authenticated download proxy (`/api/files/:id/file`)
 * so:
 *   • `users.avatar_url` stays a *stable* URL — no expiring signatures.
 *   • Storage authorization is enforced server-side per request.
 *   • Removing an avatar deletes both the storage object and the record.
 *
 * Security: the uploading session user is always the avatar owner — there
 * is no client-supplied user id anywhere in the flow (IDOR-proof). MIME and
 * magic-byte sniffing is validated server-side; extension casing and
 * declared MIME are untrusted.
 */

import { and, eq, sql } from 'drizzle-orm';
import { files, users, type Db } from '@orq8/db';
import type { AppConfig } from '@orq8/core';
import * as filesService from './files.js';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Accepted image types with their canonical extension + magic bytes. */
export const AVATAR_TYPES: Record<string, { ext: string; magic: number[] }> = {
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF….WEBP
};

export type AvatarError =
  | 'missing_file'
  | 'too_large'
  | 'unsupported_type'
  | 'not_an_image'
  | 'storage_failed';

export interface AvatarUploadResult {
  ok: boolean;
  error?: AvatarError;
  message?: string;
  avatarUrl?: string | null;
  fileId?: string;
}

/**
 * Validate, store, record and attach an avatar for the given user.
 * `previousFileId` (the avatar being replaced) is deleted afterwards —
 * best-effort, since orphan cleanup must not fail the new upload.
 */
export async function uploadAvatar(
  config: AppConfig,
  db: Db,
  userId: string,
  orgId: string,
  input: { mimeType?: unknown; body?: unknown },
  previousFileId?: string | null,
): Promise<AvatarUploadResult> {
  // 1. Shape validation — base64 body is required.
  if (typeof input.body !== 'string' || input.body.length === 0) {
    return { ok: false, error: 'missing_file', message: 'No image was provided.' };
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.body, 'base64');
  } catch {
    return { ok: false, error: 'not_an_image', message: 'The image could not be read.' };
  }
  // Trivially-rejected sizes (the route caps the JSON body at 4 MB).
  if (buffer.length === 0) {
    return { ok: false, error: 'missing_file', message: 'No image was provided.' };
  }
  if (buffer.length > AVATAR_MAX_BYTES) {
    return { ok: false, error: 'too_large', message: 'Images must be 2 MB or smaller.' };
  }

  // 2. Type validation — declared MIME must be an accepted image type.
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.toLowerCase().split(';')[0]?.trim() ?? '' : '';
  const spec = AVATAR_TYPES[mimeType];
  if (!spec) {
    return { ok: false, error: 'unsupported_type', message: 'Use a PNG, JPEG or WebP image.' };
  }

  // 3. Magic-byte sniffing — never trust the declared type.
  const head = buffer.subarray(0, 12);
  const byteAt = (i: number): number => head[i] ?? -1;
  const magicOk =
    spec.magic.every((byte, i) => byteAt(i) === byte) ||
    // WebP: RIFF container with WEBP marker at offset 8
    (mimeType === 'image/webp' &&
      byteAt(0) === 0x52 && byteAt(1) === 0x49 && byteAt(2) === 0x46 && byteAt(3) === 0x46 &&
      byteAt(8) === 0x57 && byteAt(9) === 0x45 && byteAt(10) === 0x42 && byteAt(11) === 0x50);
  if (!magicOk) {
    return { ok: false, error: 'not_an_image', message: 'That file is not a valid PNG, JPEG or WebP image.' };
  }

  // 4. Store through the existing backend + org-scoped DB record.
  let stored: filesService.UploadResult;
  try {
    stored = await filesService.uploadFile(config, db, orgId, {
      name: `avatar-${userId}.${spec.ext}`,
      mimeType,
      body: buffer,
      uploadedBy: userId,
      metadata: { purpose: 'avatar' },
    });
  } catch {
    return { ok: false, error: 'storage_failed', message: 'Could not store the image right now. Try again.' };
  }

  const avatarUrl = `/api/files/${stored.id}/file`;

  // 5. Attach to the user and clean up the replaced avatar.
  const [updated] = await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ avatarUrl: users.avatarUrl });
  if (!updated) {
    // User row vanished (deleted concurrently) — remove the orphan upload.
    await filesService.deleteFile(config, db, orgId, stored.id).catch(() => {});
    return { ok: false, error: 'storage_failed', message: 'Profile could not be updated. Try again.' };
  }

  if (previousFileId) {
    await removeAvatarFile(config, db, orgId, previousFileId);
  }

  return { ok: true, avatarUrl: updated.avatarUrl ?? avatarUrl, fileId: stored.id };
}

/** Remove one avatar file (storage object + record). Best-effort. */
export async function removeAvatarFile(
  config: AppConfig,
  db: Db,
  orgId: string,
  fileId: string,
): Promise<void> {
  await filesService.deleteFile(config, db, orgId, fileId).catch(() => {});
}

/**
 * Clear a user's avatar and delete the underlying file. Returns the
 * cleared URL (null) so callers can confirm the state change.
 */
export async function removeAvatar(
  config: AppConfig,
  db: Db,
  userId: string,
  orgId: string,
): Promise<AvatarUploadResult> {
  const [user] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const url = user?.avatarUrl ?? null;

  // Accept only our own proxy URLs — never follow arbitrary client strings.
  const match = url ? /^\/api\/files\/([0-9a-f-]{36})\/file$/.exec(url) : null;
  if (match?.[1]) {
    const fileId = match[1];
    // Ownership check: the file must belong to this org before deletion.
    const record = await filesService.getFileById(db, orgId, fileId);
    if (record) {
      await removeAvatarFile(config, db, orgId, fileId);
    }
  }

  await db
    .update(users)
    .set({ avatarUrl: sql`null`, updatedAt: new Date() })
    .where(and(eq(users.id, userId)));

  return { ok: true, avatarUrl: null };
}
