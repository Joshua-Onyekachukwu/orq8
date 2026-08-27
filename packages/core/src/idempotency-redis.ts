import type { IdempotencyEntry, IdempotencyStore } from './idempotency.js';

/**
 * Redis-backed idempotency store.
 *
 * Replaces the in-memory IdempotencyStore for production deployments.
 * Uses Redis with TTL for automatic expiry of old entries.
 */

const PREFIX = 'idemp:';

export class RedisIdempotencyStore implements IdempotencyStore {
  private redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    del(...keys: string[]): Promise<void>;
    isConnected(): boolean;
  };
  private ttlMs: number;

  constructor(
    redis: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string, ttlSeconds?: number): Promise<void>;
      del(...keys: string[]): Promise<void>;
      isConnected(): boolean;
    },
    ttlMs: number = 24 * 60 * 60 * 1000, // 24 hours
  ) {
    this.redis = redis;
    this.ttlMs = ttlMs;
  }

  get(_key: string): IdempotencyEntry | undefined {
    // Synchronous interface — returns undefined.
    // The async version handles Redis lookups.
    return undefined;
  }

  async getAsync(key: string): Promise<IdempotencyEntry | undefined> {
    if (!this.redis.isConnected()) return undefined;

    try {
      const data = await this.redis.get(`${PREFIX}${key}`);
      if (!data) return undefined;
      return JSON.parse(data) as IdempotencyEntry;
    } catch {
      return undefined;
    }
  }

  put(key: string, entry: IdempotencyEntry): void {
    this.putAsync(key, entry).catch(() => {});
  }

  async putAsync(key: string, entry: IdempotencyEntry): Promise<void> {
    if (!this.redis.isConnected()) return;

    try {
      const ttlSeconds = Math.ceil(this.ttlMs / 1000);
      await this.redis.set(`${PREFIX}${key}`, JSON.stringify(entry), ttlSeconds);
    } catch {
      // Write failed — not critical
    }
  }

  async deleteAsync(key: string): Promise<void> {
    if (!this.redis.isConnected()) return;
    try {
      await this.redis.del(`${PREFIX}${key}`);
    } catch {
      // Ignore
    }
  }

  get size(): number {
    return 0;
  }
}
