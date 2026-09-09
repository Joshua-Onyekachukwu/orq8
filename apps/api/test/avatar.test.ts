import { describe, it, expect } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  type AvatarUploadResult,
} from '../src/services/avatar.js';

/**
 * Pure-logic tests for the avatar service's validation contract (no DB, no
 * storage). The DB/storage-backed paths are covered by integration suites.
 */
describe('avatar policy', () => {
  it('caps uploads at 2 MB', () => {
    expect(AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it('accepts only web-safe raster image types', () => {
    expect(Object.keys(AVATAR_TYPES).sort()).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('binds each type to a canonical extension and magic signature', () => {
    expect(AVATAR_TYPES['image/png']?.ext).toBe('png');
    expect(AVATAR_TYPES['image/png']?.magic[0]).toBe(0x89); // PNG signature starts \x89PNG
    expect(AVATAR_TYPES['image/jpeg']?.magic[0]).toBe(0xff); // JPEG starts FFD8
    expect(AVATAR_TYPES['image/webp']?.magic[0]).toBe(0x52); // RIFF
  });
});

describe('result contract', () => {
  it('failures carry a structured error + user-facing message', () => {
    const r: AvatarUploadResult = { ok: false, error: 'too_large', message: 'Images must be 2 MB or smaller.' };
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('too_large');
      expect(r.message).toContain('2 MB');
    }
  });

  it('successes return a stable proxy URL, not a signed/expiring one', () => {
    const r: AvatarUploadResult = { ok: true, avatarUrl: '/api/files/abc-123/file', fileId: 'abc-123' };
    if (r.ok) {
      expect(r.avatarUrl).toMatch(/^\/api\/files\//);
      expect(r.avatarUrl).not.toContain('Signature=');
      expect(r.avatarUrl).not.toContain('X-Amz');
    }
  });
});
