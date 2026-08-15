import { describe, expect, it } from 'vitest';
import { InMemoryIdempotencyStore, stablePayloadHash } from '../src/idempotency.js';

describe('idempotency (docs/35.1)', () => {
  it('stores and replays entries within TTL', () => {
    const store = new InMemoryIdempotencyStore(60_000);
    store.put('key-1', {
      payloadHash: stablePayloadHash({ a: 1 }),
      status: 201,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
      storedAt: Date.now(),
    });
    expect(store.get('key-1')).toBeDefined();
    expect(store.get('missing')).toBeUndefined();
  });

  it('expires entries after TTL', () => {
    const store = new InMemoryIdempotencyStore(1);
    store.put('key-1', {
      payloadHash: stablePayloadHash({ a: 1 }),
      status: 201,
      headers: {},
      body: {},
      storedAt: Date.now() - 5_000,
    });
    expect(store.get('key-1')).toBeUndefined();
  });

  it('hashes payloads deterministically', () => {
    expect(stablePayloadHash({ a: 1, b: 2 })).toBe(stablePayloadHash({ a: 1, b: 2 }));
  });
});
