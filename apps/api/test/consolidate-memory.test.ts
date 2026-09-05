/**
 * Memory consolidation unit tests (Phase 10).
 *
 * Pure tests for the duplicate detector: text normalization, exact-duplicate
 * clusters, and near-duplicate detection via embedding cosine similarity.
 */

import { describe, expect, it } from 'vitest';
import { findDuplicates, normalizeText } from '../src/services/consolidate-memory.js';

describe('normalizeText', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeText('  Hello   WORLD ')).toBe('hello world');
  });

  it('strips punctuation', () => {
    expect(normalizeText('Don\'t stop, the deadline is Friday!')).toBe('don t stop the deadline is friday');
  });

  it('handles empty strings', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('');
  });
});

describe('findDuplicates', () => {
  it('finds exact-duplicate clusters via normalized content', () => {
    // Entries arrive pre-normalized (consolidateOrgMemory normalizes before
    // calling findDuplicates) — so the near-twin must already be normalized.
    const entries = [
      { normalized: 'the api rate limit is 60 rpm', embedding: null },
      { normalized: 'the api rate limit is 60 rpm', embedding: null },
      { normalized: 'marketing uses orange for CTAs', embedding: null },
      { normalized: 'the api rate limit is 60 rpm', embedding: null },
    ];
    const { exact } = findDuplicates(entries);
    expect(exact).toHaveLength(1);
    expect(exact[0]!.keep).toBe(0);
    expect(exact[0]!.dups.sort()).toEqual([1, 3]);
  });

  it('ignores empty normalized content', () => {
    const entries = [
      { normalized: '', embedding: null },
      { normalized: '', embedding: null },
      { normalized: 'x', embedding: null },
    ];
    const { exact } = findDuplicates(entries);
    expect(exact).toHaveLength(0);
  });

  it('detects near-duplicate pairs by embedding similarity', () => {
    const entries = [
      { normalized: 'a', embedding: [1, 0, 0] },
      { normalized: 'b', embedding: [0.99, 0.01, 0] }, // ≈ same direction
      { normalized: 'c', embedding: [0, 1, 0] }, // orthogonal
    ];
    const { nearPairs } = findDuplicates(entries, 0.9);
    expect(nearPairs).toEqual([[0, 1]]);
  });

  it('respects the similarity threshold', () => {
    // cosine([1,0,0],[0.9,0.3,0]) ≈ 0.9487 — between the two thresholds.
    const entries = [
      { normalized: 'a', embedding: [1, 0, 0] },
      { normalized: 'b', embedding: [0.9, 0.3, 0] },
    ];
    expect(findDuplicates(entries, 0.95).nearPairs).toEqual([]);
    expect(findDuplicates(entries, 0.9).nearPairs).toEqual([[0, 1]]);
  });

  it('skips entries without embeddings in near-duplicate pass', () => {
    const entries = [
      { normalized: 'a', embedding: [1, 0, 0] },
      { normalized: 'b', embedding: null },
      { normalized: 'c', embedding: [1, 0, 0] },
    ];
    const { nearPairs } = findDuplicates(entries, 0.9);
    expect(nearPairs).toEqual([[0, 2]]);
  });
});