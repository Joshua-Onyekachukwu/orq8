import { eq, and, desc } from 'drizzle-orm';
import { files, type FileRecord, type NewFileRecord, type Db } from '@orq8/db';
import type { AppConfig } from '@orq8/core';

/**
 * File Storage Service
 *
 * Abstracts file storage behind an S3-compatible interface.
 * Supports:
 * - Cloudflare R2 (S3-compatible, zero egress fees)
 * - AWS S3
 * - Local filesystem fallback for development
 *
 * Design: docs/42 Infrastructure
 */

export interface UploadResult {
  id: string;
  key: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface StorageBackend {
  upload(key: string, body: Buffer, mimeType: string): Promise<string>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

// ─── Local Filesystem Backend ───────────────────────────────────────────────

import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

class LocalStorageBackend implements StorageBackend {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async upload(key: string, body: Buffer, _mimeType: string): Promise<string> {
    const filePath = join(this.baseDir, key);
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    await this.ensureDir(dir);
    await writeFile(filePath, body);
    return `file://${filePath}`;
  }

  async getSignedUrl(key: string, _expiresIn?: number): Promise<string> {
    // For local storage, return a direct file path
    // In production, this would be an S3 presigned URL
    return `file://${join(this.baseDir, key)}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.baseDir, key);
    try {
      await unlink(filePath);
    } catch {
      // File may not exist — ignore
    }
  }
}

// ─── S3-Compatible Backend ──────────────────────────────────────────────────

class S3StorageBackend implements StorageBackend {
  private config: AppConfig;
  private bucket: string;

  constructor(config: AppConfig, bucket: string) {
    this.config = config;
    this.bucket = bucket;
  }

  private async getS3Client(): Promise<any> {
    try {
      // Dynamic import — AWS SDK is optional, only needed when S3 is configured
      const s3 = await (Function('return import("@aws-sdk/client-s3")')() as Promise<any>);
      const presigner = await (Function('return import("@aws-sdk/s3-request-presigner")')() as Promise<any>);

      const client = new s3.S3Client({
        region: this.config.S3_REGION ?? 'auto',
        endpoint: this.config.S3_ENDPOINT,
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.config.S3_ACCESS_KEY ?? '',
          secretAccessKey: this.config.S3_SECRET_KEY ?? '',
        },
      });

      return {
        client,
        PutObjectCommand: s3.PutObjectCommand,
        GetObjectCommand: s3.GetObjectCommand,
        DeleteObjectCommand: s3.DeleteObjectCommand,
        getSignedUrl: presigner.getSignedUrl,
      };
    } catch {
      throw new Error('AWS SDK not installed. Run: pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner');
    }
  }

  async upload(key: string, body: Buffer, mimeType: string): Promise<string> {
    const { client, PutObjectCommand } = await this.getS3Client();
    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
    }));
    return `s3://${this.bucket}/${key}`;
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const { client, GetObjectCommand, getSignedUrl } = await this.getS3Client();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(client, command, { expiresIn });
  }

  async delete(key: string): Promise<void> {
    const { client, DeleteObjectCommand } = await this.getS3Client();
    await client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }
}

// ─── Backend Factory ────────────────────────────────────────────────────────

let cachedBackend: StorageBackend | null = null;

function getStorageBackend(config: AppConfig): StorageBackend {
  if (cachedBackend) return cachedBackend;

  if (config.S3_ACCESS_KEY && config.S3_SECRET_KEY) {
    const bucket = config.S3_BUCKET ?? 'orq8-files';
    cachedBackend = new S3StorageBackend(config, bucket);
    return cachedBackend;
  }

  // Local filesystem fallback
  const baseDir = config.LOCAL_STORAGE_DIR ?? './.orq8-storage';
  cachedBackend = new LocalStorageBackend(baseDir);
  return cachedBackend;
}

// ─── Service Functions ──────────────────────────────────────────────────────

/**
 * Upload a file and create a database record.
 */
export async function uploadFile(
  config: AppConfig,
  db: Db,
  orgId: string,
  opts: {
    name: string;
    mimeType: string;
    body: Buffer;
    uploadedBy?: string;
    agentId?: string;
    taskId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<UploadResult> {
  const backend = getStorageBackend(config);
  const ext = opts.name.split('.').pop() ?? 'bin';
  const key = `${orgId}/${randomUUID()}.${ext}`;

  // Upload to storage backend
  await backend.upload(key, opts.body, opts.mimeType);

  // Create database record
  const [record] = await db.insert(files).values({
    orgId,
    name: opts.name,
    key,
    mimeType: opts.mimeType,
    size: opts.body.length,
    bucket: config.S3_BUCKET ?? 'orq8-files',
    uploadedBy: opts.uploadedBy ?? null,
    agentId: opts.agentId ?? null,
    taskId: opts.taskId ?? null,
    metadata: opts.metadata ?? {},
  }).returning();

  const row = record;
  if (!row) throw new Error('File upload failed — no record returned');

  return {
    id: row.id,
    key,
    url: String(await backend.getSignedUrl(key)),
    name: opts.name,
    mimeType: opts.mimeType,
    size: opts.body.length,
  };
}

/**
 * Get a download URL for a file.
 */
export async function getFileUrl(
  config: AppConfig,
  db: Db,
  orgId: string,
  fileId: string,
): Promise<{ url: string; record: FileRecord } | null> {
  const [record] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.orgId, orgId)))
    .limit(1);

  if (!record) return null;

  const backend = getStorageBackend(config);
  const url = await backend.getSignedUrl(record.key);

  return { url: String(url), record };
}

/**
 * Delete a file from storage and database.
 */
export async function deleteFile(
  config: AppConfig,
  db: Db,
  orgId: string,
  fileId: string,
): Promise<boolean> {
  const [record] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.orgId, orgId)))
    .limit(1);

  if (!record) return false;

  // Delete from storage backend
  const backend = getStorageBackend(config);
  await backend.delete(record.key);

  // Delete from database
  await db
    .delete(files)
    .where(and(eq(files.id, fileId), eq(files.orgId, orgId)));

  return true;
}

/**
 * List files for an org.
 */
export async function listFiles(
  db: Db,
  orgId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<FileRecord[]> {
  return db
    .select()
    .from(files)
    .where(eq(files.orgId, orgId))
    .orderBy(desc(files.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

/**
 * Get a file record by ID.
 */
export async function getFileById(
  db: Db,
  orgId: string,
  fileId: string,
): Promise<FileRecord | undefined> {
  const [record] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.orgId, orgId)))
    .limit(1);
  return record;
}
