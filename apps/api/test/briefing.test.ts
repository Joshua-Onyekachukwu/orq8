/**
 * Executive briefing unit tests (Phases 11–12).
 *
 * Pure tests for the deterministic helpers: UTC day boundary, approval aging,
 * and quiet-org detection (no fabricated data, no meaningless briefings).
 */

import { describe, expect, it } from 'vitest';
import {
  dayStart,
  isAging,
  isQuietContent,
  type BriefingContent,
} from '../src/services/briefing.js';

describe('dayStart', () => {
  it('returns UTC midnight for the same day', () => {
    const start = dayStart(new Date('2026-09-05T14:30:00Z'));
    expect(start.toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });

  it('rounds down into the previous day for early-morning UTC', () => {
    const start = dayStart(new Date('2026-09-05T00:30:00Z'));
    expect(start.toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });
});

describe('isAging — approval waiting > 24h', () => {
  const now = new Date('2026-09-05T12:00:00Z');

  it('flags approvals older than 24h', () => {
    expect(isAging(new Date('2026-09-04T11:00:00Z'), now)).toBe(true);
  });

  it('does not flag recent approvals', () => {
    expect(isAging(new Date('2026-09-05T10:00:00Z'), now)).toBe(false);
  });

  it('treats exactly 24h as not aging', () => {
    expect(isAging(new Date('2026-09-04T12:00:00Z'), now)).toBe(false);
  });
});

describe('isQuietContent — no meaningful activity', () => {
  const stats = (overrides: Partial<BriefingContent['stats']> = {}): BriefingContent['stats'] => ({
    tasksCompleted: 0,
    tasksFailed: 0,
    approvalsPending: 0,
    approvalsAging: 0,
    goalsActive: 0,
    goalsOverdue: 0,
    connectorOutcomes: 0,
    webhookEvents: 0,
    agentsPaused: 0,
    ...overrides,
  });

  it('returns true when nothing meaningful happened', () => {
    expect(isQuietContent(stats())).toBe(true);
  });

  it('returns false when any metric is non-zero', () => {
    expect(isQuietContent(stats({ tasksCompleted: 1 }))).toBe(false);
    expect(isQuietContent(stats({ tasksFailed: 1 }))).toBe(false);
    expect(isQuietContent(stats({ approvalsPending: 2 }))).toBe(false);
    expect(isQuietContent(stats({ goalsActive: 3 }))).toBe(false);
    expect(isQuietContent(stats({ connectorOutcomes: 1 }))).toBe(false);
    expect(isQuietContent(stats({ webhookEvents: 1 }))).toBe(false);
  });
});