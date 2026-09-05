/**
 * Embeddings unit tests (Phase 9).
 *
 * Pure unit tests: cosine similarity math, pgvector string parsing, and the
 * OpenAI-compatible embedding client with graceful fallback (fetch stubbed).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '@orq8/core';
import {
  cosineSimilarity,
  generateEmbedding,
  parseVector,
} from '../src/services/embeddings.js';

function makeConfig(overrides: Record<string, string> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    PORT: 3001,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://localhost:5432/orq8',
    SESSION_SECRET: 'test-session-secret-16-chars',
    ENCRYPTION_KEY: 'test-encryption-key-1234567890',
    ENCRYPTION_KEY_KID: 'v1',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    EMBEDDING_BASE_URL: overrides.EMBEDDING_BASE_URL ?? '',
    EMBEDDING_MODEL: overrides.EMBEDDING_MODEL ?? 'nomic-embed-text',
    EMBEDDING_API_KEY: overrides.EMBEDDING_API_KEY ?? '',
    ...overrides,
  } as unknown as AppConfig;
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });

  it('returns 0 for mismatched or empty lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('parseVector — pgvector strings', () => {
  it('parses the string form pgvector returns', () => {
    expect(parseVector('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
    expect(parseVector('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('passes number[] through (driver-parsed)', () => {
    expect(parseVector([0.5, 0.25])).toEqual([0.5, 0.25]);
  });

  it('returns null for null/undefined/garbage', () => {
    expect(parseVector(null)).toBeNull();
    expect(parseVector(undefined)).toBeNull();
    expect(parseVector('not-a-vector')).toBeNull();
    expect(parseVector('[1,2,x]')).toBeNull();
    expect(parseVector('[1,2]extra')).toBeNull();
  });
});

describe('generateEmbedding — graceful fallback', () => {
  it('returns null when no EMBEDDING_BASE_URL is configured', async () => {
    const config = makeConfig({ EMBEDDING_BASE_URL: '' });
    expect(await generateEmbedding('hello', config)).toBeNull();
  });

  it('calls the OpenAI-compatible /embeddings endpoint', async () => {
    const config = makeConfig({ EMBEDDING_BASE_URL: 'http://localhost:4000' });
    const mock = vi.fn(async (url: unknown, init?: unknown) => {
      expect(String(url)).toBe('http://localhost:4000/embeddings');
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body.model).toBe('nomic-embed-text');
      expect(body.input).toBe('hello world');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
      };
    });
    vi.stubGlobal('fetch', mock);

    const emb = await generateEmbedding('hello world', config);
    expect(emb).toEqual([0.1, 0.2, 0.3]);
  });

  it('sends the API key when configured', async () => {
    const config = makeConfig({
      EMBEDDING_BASE_URL: 'https://embeddings.example.com',
      EMBEDDING_API_KEY: 'sk-embed-secret',
    });
    const mock = vi.fn(async (_url: unknown, init?: unknown) => {
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer sk-embed-secret');
      return { ok: true, status: 200, json: async () => ({ data: [{ embedding: [1] }] }) };
    });
    vi.stubGlobal('fetch', mock);
    const emb = await generateEmbedding('x', config);
    expect(emb).toEqual([1]);
  });

  it('returns null on provider failure instead of throwing', async () => {
    const config = makeConfig({ EMBEDDING_BASE_URL: 'http://localhost:4000' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    expect(await generateEmbedding('x', config)).toBeNull();
  });

  it('returns null on network error instead of throwing', async () => {
    const config = makeConfig({ EMBEDDING_BASE_URL: 'http://localhost:4000' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await generateEmbedding('x', config)).toBeNull();
  });

  it('returns null for malformed provider responses', async () => {
    const config = makeConfig({ EMBEDDING_BASE_URL: 'http://localhost:4000' });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding: 'oops' }] }),
    })));
    expect(await generateEmbedding('x', config)).toBeNull();
  });
});