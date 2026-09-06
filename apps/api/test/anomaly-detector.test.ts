/**
 * Anomaly detector — pure threshold unit tests (no DB).
 */

import { describe, expect, it } from 'vitest';
import {
  isStalledGoal,
  isAtRiskGoal,
  isBlockedTask,
  isFailureSpike,
  isSpendSpike,
} from '../src/services/anomaly-detector.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date('2026-09-06T12:00:00Z');

describe('anomaly detector — goal thresholds', () => {
  it('flags a goal with no updates past the stall window', () => {
    expect(isStalledGoal(new Date(now.getTime() - 4 * DAY), now)).toBe(true);
    expect(isStalledGoal(new Date(now.getTime() - 1 * DAY), now)).toBe(false);
  });

  it('flags a goal due soon with low progress but not one with good progress', () => {
    const dueSoon = new Date(now.getTime() + 24 * HOUR);
    expect(isAtRiskGoal(dueSoon, 20, now)).toBe(true);
    expect(isAtRiskGoal(dueSoon, 80, now)).toBe(false);
    expect(isAtRiskGoal(new Date(now.getTime() + 30 * DAY), 20, now)).toBe(false);
    expect(isAtRiskGoal(null, 10, now)).toBe(false);
  });

  it('flags tasks untouched beyond the blocked window', () => {
    expect(isBlockedTask(new Date(now.getTime() - 3 * DAY), now)).toBe(true);
    expect(isBlockedTask(new Date(now.getTime() - 6 * HOUR), now)).toBe(false);
  });
});

describe('anomaly detector — spike thresholds', () => {
  it('detects a failure spike with a floor and multiplier', () => {
    expect(isFailureSpike(6, 2)).toBe(true);
    expect(isFailureSpike(3, 0)).toBe(true); // at the floor with no prior failures
    expect(isFailureSpike(2, 4)).toBe(false);
    expect(isFailureSpike(1, 0)).toBe(false); // below the failure floor
  });

  it('detects spend spikes, ignoring quiet baselines', () => {
    expect(isSpendSpike(120, 40)).toBe(true);
    expect(isSpendSpike(120, 0)).toBe(true); // > 2x the quiet floor with no prior usage
    expect(isSpendSpike(40, 10)).toBe(false); // below the spend floor
    expect(isSpendSpike(80, 60)).toBe(false); // not double
  });
});
