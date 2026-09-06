import { describe, it, expect } from 'vitest';
import { recommendFromProfile } from '../src/services/agent-reliability.js';

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