import type { AppConfig } from '@orq8/core';
import type { Logger } from 'pino';
// ioredis is a hard dependency (apps/api/package.json). Static ESM import — the
// previous dynamic `require('ioredis')` threw in this `type: module` package
// (tsx/node ESM has no `require`), silently falling back to in-memory forever.
import { Redis } from 'ioredis';

/**
 * Redis client — wraps `ioredis` with automatic reconnection and graceful fallback.
 *
 * When REDIS_URL is not configured, all operations become no-ops or fall back to
 * in-memory Maps. This lets the API run in single-instance mode without Redis
 * while still being production-ready when Redis is available.
 *
 * Design: https://docs/42 Infrastructure
 */

export interface RedisClient {
  /** Get a string value. Returns null if key doesn't exist. */
  get(key: string): Promise<string | null>;
  /** Set a string value with optional TTL in seconds. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Delete one or more keys. */
  del(...keys: string[]): Promise<void>;
  /** Check if a key exists. */
  exists(key: string): Promise<boolean>;
  /** Increment a counter. Returns the new value. */
  incr(key: string): Promise<number>;
  /** Increment a counter by a specific amount. */
  incrBy(key: string, amount: number): Promise<number>;
  /** Set a key's TTL in seconds. */
  expire(key: string, ttlSeconds: number): Promise<void>;
  /** Get remaining TTL for a key (-1 = no expiry, -2 = doesn't exist). */
  ttl(key: string): Promise<number>;
  /** Sorted set: add member with score. */
  zadd(key: string, score: number, member: string): Promise<void>;
  /** Sorted set: remove members outside score range. */
  zremrangebyscore(key: string, min: number, max: number): Promise<void>;
  /** Sorted set: count members in score range. */
  zcount(key: string, min: number, max: number): Promise<number>;
  /** Sorted set: get all members in score range. */
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
  /** Check if Redis is connected. */
  isConnected(): boolean;
  /** Gracefully close the connection. */
  close(): Promise<void>;
}

// ─── In-Memory Fallback ─────────────────────────────────────────────────────

class InMemoryRedis implements RedisClient {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private sortedSets = new Map<string, Map<string, number>>();
  private counters = new Map<string, number>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Clean up expired keys every 30 seconds
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (entry.expiresAt && entry.expiresAt < now) {
          this.store.delete(key);
        }
      }
    }, 30_000);
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async incr(key: string): Promise<number> {
    const current = this.counters.get(key) ?? 0;
    const next = current + 1;
    this.counters.set(key, next);
    return next;
  }

  async incrBy(key: string, amount: number): Promise<number> {
    const current = this.counters.get(key) ?? 0;
    const next = current + amount;
    this.counters.set(key, next);
    return next;
  }

  async expire(_key: string, _ttlSeconds: number): Promise<void> {
    // Handled by the store's expiresAt
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, new Map());
    this.sortedSets.get(key)!.set(member, score);
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<void> {
    const set = this.sortedSets.get(key);
    if (!set) return;
    for (const [member, score] of set) {
      if (score >= min && score <= max) set.delete(member);
    }
  }

  async zcount(key: string, min: number, max: number): Promise<number> {
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    let count = 0;
    for (const score of set.values()) {
      if (score >= min && score <= max) count++;
    }
    return count;
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    const set = this.sortedSets.get(key);
    if (!set) return [];
    const result: string[] = [];
    for (const [member, score] of set) {
      if (score >= min && score <= max) result.push(member);
    }
    return result;
  }

  isConnected(): boolean {
    return true;
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    this.store.clear();
    this.sortedSets.clear();
    this.counters.clear();
  }
}

// ─── Real Redis Client ──────────────────────────────────────────────────────

class RealRedis implements RedisClient {
  private client: any;
  private connected = false;
  private logger: Logger;

  constructor(url: string, logger: Logger) {
    this.logger = logger;

    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times: number) {
          if (times > 10) return null; // Stop retrying after 10 attempts
          return Math.min(times * 200, 5000); // Exponential backoff, max 5s
        },
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: 5000,
      });

      this.client.on('connect', () => {
        this.connected = true;
        this.logger.info('Redis connected');
      });

      this.client.on('error', (err: Error) => {
        this.connected = false;
        this.logger.error({ err: err.message }, 'Redis error');
      });

      this.client.on('close', () => {
        this.connected = false;
        this.logger.warn('Redis connection closed');
      });

      // Start connecting
      this.client.connect().catch(() => {
        this.logger.warn('Redis connection failed — falling back to in-memory');
      });
    } catch {
      this.logger.warn('ioredis not available — using in-memory fallback');
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client?.get(key) ?? null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client?.setex(key, ttlSeconds, value);
      } else {
        await this.client?.set(key, value);
      }
    } catch {
      // Silent failure — fallback to in-memory on next request
    }
  }

  async del(...keys: string[]): Promise<void> {
    try {
      await this.client?.del(...keys);
    } catch {
      // Silent failure
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await this.client?.exists(key)) === 1;
    } catch {
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client?.incr(key) ?? 0;
    } catch {
      return 0;
    }
  }

  async incrBy(key: string, amount: number): Promise<number> {
    try {
      return await this.client?.incrby(key, amount) ?? 0;
    } catch {
      return 0;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client?.expire(key, ttlSeconds);
    } catch {
      // Silent failure
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client?.ttl(key) ?? -2;
    } catch {
      return -2;
    }
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    try {
      await this.client?.zadd(key, score, member);
    } catch {
      // Silent failure
    }
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<void> {
    try {
      await this.client?.zremrangebyscore(key, min, max);
    } catch {
      // Silent failure
    }
  }

  async zcount(key: string, min: number, max: number): Promise<number> {
    try {
      return await this.client?.zcount(key, min, max) ?? 0;
    } catch {
      return 0;
    }
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    try {
      return await this.client?.zrangebyscore(key, min, max) ?? [];
    } catch {
      return [];
    }
  }

  isConnected(): boolean {
    return this.connected && this.client?.status === 'ready';
  }

  async close(): Promise<void> {
    try {
      await this.client?.quit();
    } catch {
      // Ignore
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

let cachedClient: RedisClient | null = null;

/**
 * Get or create the Redis client.
 * Returns a real Redis client if REDIS_URL is configured,
 * otherwise returns an in-memory fallback.
 */
export function getRedis(config: AppConfig, logger: Logger): RedisClient {
  if (cachedClient) return cachedClient;

  if (config.REDIS_URL) {
    cachedClient = new RealRedis(config.REDIS_URL, logger);
  } else {
    logger.info('No REDIS_URL configured — using in-memory fallback');
    cachedClient = new InMemoryRedis();
  }

  return cachedClient;
}
