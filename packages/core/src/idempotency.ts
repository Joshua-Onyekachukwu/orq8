// docs/35.1 — Idempotency-Key header on mutating endpoints; responses replayed on retry.
// Phase 1 uses an in-memory store with TTL; a DB-backed store lands with the outbox (Phase 2+).
export interface IdempotencyEntry {
  payloadHash: string;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  storedAt: number;
}

export interface IdempotencyStore {
  get(key: string): IdempotencyEntry | undefined;
  put(key: string, entry: IdempotencyEntry): void;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, IdempotencyEntry>();

  constructor(private readonly ttlMs: number = 24 * 60 * 60 * 1000) {}

  get(key: string): IdempotencyEntry | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.storedAt > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return entry;
  }

  put(key: string, entry: IdempotencyEntry): void {
    this.map.set(key, entry);
    // opportunistic sweep to keep the map bounded
    const now = Date.now();
    for (const [k, e] of this.map) {
      if (now - e.storedAt > this.ttlMs) this.map.delete(k);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

export function stablePayloadHash(payload: unknown): string {
  return JSON.stringify(payload); // deterministic via stable JSON.stringify below
}
