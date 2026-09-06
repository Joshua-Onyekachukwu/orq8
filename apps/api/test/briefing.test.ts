/**
 * Executive briefing unit tests (Phases 11–12).
 *
 * Pure tests for the deterministic helpers: UTC day boundary, approval aging,
 * and quiet-org detection (no fabricated data, no meaningless briefings).
 */

import { describe, expect, it } from 'vitest';
import {
  dayStart,
  weekStart,
  monthStart,
  periodFor,
  periodDeltaLabel,
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

describe('period boundaries — weekly/monthly', () => {
  it('weekStart returns Monday 00:00 UTC for any day of the week', () => {
    // 2026-09-06 is a Sunday → previous Monday is 2026-08-31.
    expect(weekStart(new Date('2026-09-06T12:00:00Z')).toISOString()).toBe('2026-08-31T00:00:00.000Z');
    // Monday itself stays the same day.
    expect(weekStart(new Date('2026-08-31T08:00:00Z')).toISOString()).toBe('2026-08-31T00:00:00.000Z');
    // Mid-week Wednesday.
    expect(weekStart(new Date('2026-09-02T18:30:00Z')).toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('monthStart returns the 1st 00:00 UTC', () => {
    expect(monthStart(new Date('2026-09-06T12:00:00Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(monthStart(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('periodFor resolves deterministic windows per kind', () => {
    const now = new Date('2026-09-02T12:00:00Z'); // Wednesday
    const daily = periodFor('daily', now);
    expect(daily.periodStart.toISOString()).toBe('2026-09-02T00:00:00.000Z');
    expect(daily.periodEnd.toISOString()).toBe('2026-09-03T00:00:00.000Z');

    const weekly = periodFor('weekly', now);
    expect(weekly.periodStart.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(weekly.periodEnd.toISOString()).toBe('2026-09-07T00:00:00.000Z');
    expect(weekly.label).toBe('Weekly');

    const monthly = periodFor('monthly', now);
    expect(monthly.periodStart.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(monthly.periodEnd.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('periodDeltaLabel — real trend deltas without fabrication', () => {
  it('labels growth, decline and no-change honestly', () => {
    expect(periodDeltaLabel(12, 9)).toBe('12 (+33% vs previous)');
    expect(periodDeltaLabel(4, 8)).toBe('4 (-50% vs previous)');
    expect(periodDeltaLabel(5, 5)).toBe('5 (no change)');
  });

  it('handles zero baselines without inventing percentages', () => {
    expect(periodDeltaLabel(0, 0)).toBeNull();
    expect(periodDeltaLabel(3, 0)).toBe('3 (new — no prior activity)');
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