import { describe, it, expect } from 'vitest';
import { recommendFromProfile, buildHistoryWindows } from '../src/services/agent-reliability.js';

const base = {
  total: 20,
  completionRate: 90,
  failureRate: 5,
  revisionRate: 10,
  escalationRate: 5,
  averageQAScore: 85,
  averageCostPerTask: 100,
  trend: 'stable' as const,
  autonomyLevel: 'trusted' as const,
};

describe('recommendFromProfile', () => {
  it('KEEP for strong consistent performance', () => {
    const r = recommendFromProfile(base);
    expect(r.recommendation).toBe('KEEP');
  });

  it('MONITOR with insufficient history', () => {
    const r = recommendFromProfile({ ...base, total: 1 });
    expect(r.recommendation).toBe('MONITOR');
    expect(r.recommendationReason).toContain('Insufficient');
  });

  it('REPLACE / ESCALATE when paused by repeated failures', () => {
    const r = recommendFromProfile({ ...base, autonomyLevel: 'paused' });
    expect(r.recommendation).toBe('REPLACE / ESCALATE');
  });

  it('REPLACE / ESCALATE at extreme failure rate', () => {
    const r = recommendFromProfile({ ...base, failureRate: 60 });
    expect(r.recommendation).toBe('REPLACE / ESCALATE');
  });

  it('IMPROVE on high revision rate', () => {
    const r = recommendFromProfile({ ...base, revisionRate: 40 });
    expect(r.recommendation).toBe('IMPROVE');
  });

  it('IMPROVE on low QA score', () => {
    const r = recommendFromProfile({ ...base, averageQAScore: 55 });
    expect(r.recommendation).toBe('IMPROVE');
  });

  it('RETRAIN / ADJUST on low completion despite low failure', () => {
    const r = recommendFromProfile({ ...base, completionRate: 40, failureRate: 10 });
    expect(r.recommendation).toBe('RETRAIN / ADJUST');
  });

  it('RETRAIN / ADJUST on high cost with weak output', () => {
    const r = recommendFromProfile({ ...base, averageCostPerTask: 900, completionRate: 60, averageQAScore: 85 });
    expect(r.recommendation).toBe('RETRAIN / ADJUST');
  });

  it('MONITOR on declining trend', () => {
    const r = recommendFromProfile({ ...base, trend: 'declining' });
    expect(r.recommendation).toBe('MONITOR');
  });

  it('never returns an empty reason', () => {
    for (const variant of [base, { ...base, total: 0 }, { ...base, failureRate: 99 }, { ...base, escalationRate: 50 }]) {
      const r = recommendFromProfile(variant);
      expect(r.recommendationReason.length).toBeGreaterThan(10);
    }
  });
});

describe('buildHistoryWindows', () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  it('returns three windows (7/30/90) with noData true when empty', () => {
    const h = buildHistoryWindows([], [], now);
    expect(h.map((w) => w.windowDays)).toEqual([7, 30, 90]);
    expect(h.every((w) => w.noData)).toBe(true);
    expect(h.every((w) => w.completionRate === 0)).toBe(true);
  });

  it('buckets recent tasks into the 7-day window and computes rates', () => {
    const tasks = [
      { createdAt: new Date(now - 2 * day), status: 'completed', cost: 100 },
      { createdAt: new Date(now - 3 * day), status: 'completed', cost: 100 },
      { createdAt: new Date(now - 4 * day), status: 'failed', cost: 50 },
      // Inside the 90-day window but outside 7/30
      { createdAt: new Date(now - 60 * day), status: 'completed', cost: 100 },
      // Outside every window
      { createdAt: new Date(now - 120 * day), status: 'completed', cost: 100 },
    ];
    const events = [
      { occurredAt: new Date(now - 1 * day), type: 'task.revision' },
      { occurredAt: new Date(now - 200 * day), type: 'task.revision' },
    ];
    const h = buildHistoryWindows(tasks, events, now);
    const w7 = h.find((w) => w.windowDays === 7)!;
    expect(w7.totalTasks).toBe(3);
    expect(w7.completedTasks).toBe(2);
    expect(w7.failedTasks).toBe(1);
    expect(w7.completionRate).toBe(67); // 2/3
    expect(w7.failureRate).toBe(33); // 1/3
    expect(w7.revisionTasks).toBe(1); // only the in-window revision event
    expect(w7.averageCostPerTask).toBe(83); // (100+100+50)/3
    expect(w7.noData).toBe(false);

    const w30 = h.find((w) => w.windowDays === 30)!;
    expect(w30.totalTasks).toBe(3);
    expect(w30.completedTasks).toBe(2);

    const w90 = h.find((w) => w.windowDays === 90)!;
    expect(w90.totalTasks).toBe(4);
    expect(w90.completedTasks).toBe(3);
    expect(w90.noData).toBe(false);
  });

  it('marks a window noData when only out-of-window history exists', () => {
    const h = buildHistoryWindows(
      [{ createdAt: new Date(now - 200 * day), status: 'completed', cost: 100 }],
      [],
      now,
    );
    expect(h.every((w) => w.noData)).toBe(true);
  });
});