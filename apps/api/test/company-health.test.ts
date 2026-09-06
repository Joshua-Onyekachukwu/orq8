import { describe, it, expect } from 'vitest';
import {
  scoreGoals,
  scoreTasks,
  scoreWorkforce,
  scoreApprovals,
  scoreCredits,
  scoreConnectors,
  computeHealth,
  gradeForScore,
  type HealthFactor,
} from '../src/services/company-health.js';

describe('scoreGoals', () => {
  it('100 with goals on track', () => {
    const r = scoreGoals({ totalGoals: 4, activeGoals: 3, stalled: 0, atRisk: 0, completedGoals: 1 });
    expect(r.score).toBe(100);
    expect(r.reasons.some((x) => x.kind === 'positive')).toBe(true);
  });

  it('deducts for stalled goals with critical reason', () => {
    const r = scoreGoals({ totalGoals: 4, activeGoals: 3, stalled: 2, atRisk: 0, completedGoals: 0 });
    expect(r.score).toBe(70);
    expect(r.reasons.some((x) => x.kind === 'critical' && x.message.includes('stalled'))).toBe(true);
  });

  it('deducts for at-risk goals', () => {
    const r = scoreGoals({ totalGoals: 4, activeGoals: 3, stalled: 0, atRisk: 2, completedGoals: 0 });
    expect(r.score).toBe(80);
  });

  it('neutral-but-informative when no goals exist', () => {
    const r = scoreGoals({ totalGoals: 0, activeGoals: 0, stalled: 0, atRisk: 0, completedGoals: 0 });
    expect(r.score).toBe(60);
    expect(r.reasons[0]?.kind).toBe('info');
  });
});

describe('scoreTasks', () => {
  it('100 with high completion and no blockers', () => {
    const r = scoreTasks({ totalTasks: 10, completedTasks: 9, openTasks: 1, blocked: 0, failedRecent: 1, failedPrior: 1 });
    expect(r.score).toBe(100);
  });

  it('deducts for low completion rate', () => {
    const r = scoreTasks({ totalTasks: 10, completedTasks: 3, openTasks: 7, blocked: 0, failedRecent: 0, failedPrior: 0 });
    expect(r.score).toBeLessThan(100);
    expect(r.reasons.some((x) => x.kind === 'warning' && x.message.includes('completion rate'))).toBe(true);
  });

  it('deducts heavily for blocked tasks', () => {
    const r = scoreTasks({ totalTasks: 10, completedTasks: 9, openTasks: 1, blocked: 2, failedRecent: 0, failedPrior: 0 });
    expect(r.score).toBeLessThan(100);
    expect(r.reasons.some((x) => x.kind === 'critical' && x.message.includes('blocked'))).toBe(true);
  });

  it('deducts for a failure spike (2x prior window)', () => {
    const r = scoreTasks({ totalTasks: 20, completedTasks: 15, openTasks: 5, blocked: 0, failedRecent: 4, failedPrior: 1 });
    expect(r.score).toBeLessThan(100);
    expect(r.reasons.some((x) => x.kind === 'critical' && x.message.includes('spike'))).toBe(true);
  });

  it('does not flag a spike below the floor', () => {
    const r = scoreTasks({ totalTasks: 20, completedTasks: 15, openTasks: 5, blocked: 0, failedRecent: 2, failedPrior: 1 });
    expect(r.reasons.some((x) => x.message.includes('spike'))).toBe(false);
  });
});

describe('scoreWorkforce', () => {
  it('informative when no agent data yet', () => {
    const r = scoreWorkforce({ agentsWithData: 0, avgCompletionRate: 0, avgFailureRate: 0, avgRevisionRate: 0, declining: 0, replaceRecommended: 0 });
    expect(r.score).toBe(70);
    expect(r.reasons[0]?.kind).toBe('info');
  });

  it('100 for a strong workforce', () => {
    const r = scoreWorkforce({ agentsWithData: 5, avgCompletionRate: 92, avgFailureRate: 4, avgRevisionRate: 8, declining: 0, replaceRecommended: 0 });
    expect(r.score).toBe(100);
    expect(r.reasons.some((x) => x.kind === 'positive')).toBe(true);
  });

  it('deducts when replacement is recommended', () => {
    const r = scoreWorkforce({ agentsWithData: 5, avgCompletionRate: 92, avgFailureRate: 4, avgRevisionRate: 8, declining: 0, replaceRecommended: 2 });
    expect(r.score).toBe(80);
    expect(r.reasons.some((x) => x.kind === 'critical' && x.message.includes('replacement'))).toBe(true);
  });
});

describe('scoreApprovals', () => {
  it('100 with nothing pending', () => {
    const r = scoreApprovals({ pending: 0, rejected: 0, totalDecided: 0 });
    expect(r.score).toBe(100);
  });

  it('deducts for a large pending queue', () => {
    const r = scoreApprovals({ pending: 8, rejected: 0, totalDecided: 0 });
    expect(r.score).toBeLessThan(100);
    expect(r.reasons.some((x) => x.kind === 'warning' && x.message.includes('awaiting'))).toBe(true);
  });

  it('deducts for a high rejection rate', () => {
    const r = scoreApprovals({ pending: 0, rejected: 6, totalDecided: 10 });
    expect(r.score).toBe(90);
    expect(r.reasons.some((x) => x.kind === 'warning' && x.message.includes('rejection rate'))).toBe(true);
  });
});

describe('scoreCredits', () => {
  it('no spend is neutral-positive', () => {
    const r = scoreCredits({ spend7d: 0, spendPrior7d: 0, avgCreditsPerTask: 0 });
    expect(r.score).toBe(85);
  });

  it('flags a spend spike above the multiplier', () => {
    const r = scoreCredits({ spend7d: 120, spendPrior7d: 40, avgCreditsPerTask: 50 });
    expect(r.score).toBe(80);
    expect(r.reasons.some((x) => x.kind === 'critical' && x.message.includes('spike'))).toBe(true);
  });

  it('does not flag spend below the floor', () => {
    const r = scoreCredits({ spend7d: 30, spendPrior7d: 5, avgCreditsPerTask: 50 });
    expect(r.reasons.some((x) => x.message.includes('spike'))).toBe(false);
  });
});

describe('scoreConnectors', () => {
  it('informative when none connected', () => {
    const r = scoreConnectors({ total: 0, degraded: 0 });
    expect(r.score).toBe(80);
  });

  it('deducts for degraded integrations', () => {
    const r = scoreConnectors({ total: 3, degraded: 2 });
    expect(r.score).toBe(80);
    expect(r.reasons.some((x) => x.kind === 'warning' && x.message.includes('degraded'))).toBe(true);
  });
});

describe('computeHealth + gradeForScore', () => {
  const factors: HealthFactor[] = [
    { key: 'goals', label: 'Goals', score: 100, weight: 25, reasons: [{ kind: 'positive', message: 'All good' }] },
    { key: 'tasks', label: 'Tasks', score: 100, weight: 25, reasons: [] },
    { key: 'workforce', label: 'Workforce', score: 100, weight: 25, reasons: [] },
    { key: 'approvals', label: 'Approvals', score: 100, weight: 10, reasons: [] },
    { key: 'credits', label: 'Credits', score: 100, weight: 10, reasons: [] },
    { key: 'connectors', label: 'Connectors', score: 100, weight: 5, reasons: [] },
  ];

  it('perfect factors give 100 / excellent', () => {
    const h = computeHealth('org-1', factors);
    expect(h.score).toBe(100);
    expect(h.grade).toBe('excellent');
  });

  it('is deterministic for identical inputs', () => {
    const a = computeHealth('org-1', factors);
    const b = computeHealth('org-1', factors);
    expect(a.score).toBe(b.score);
    expect(a.reasons).toEqual(b.reasons);
  });

  it('weights lower factors correctly', () => {
    const h = computeHealth('org-1', [
      ...factors.slice(0, 3).map((f) => ({ ...f, score: 100 })),
      { key: 'approvals', label: 'Approvals', score: 0, weight: 10, reasons: [{ kind: 'warning', message: 'blocked' }] },
      { key: 'credits', label: 'Credits', score: 0, weight: 10, reasons: [] },
      { key: 'connectors', label: 'Connectors', score: 0, weight: 5, reasons: [] },
    ]);
    // 100*0.75 + 0*0.25 = 75
    expect(h.score).toBe(75);
    expect(h.grade).toBe('good');
  });

  it('orders reasons critical before warning before positive', () => {
    const h = computeHealth('org-1', [
      { key: 'goals', label: 'Goals', score: 50, weight: 25, reasons: [
        { kind: 'positive', message: 'ok' },
        { kind: 'critical', message: 'bad' },
        { kind: 'warning', message: 'warn' },
      ]},
      ...factors.slice(1),
    ]);
    const kinds = h.reasons.map((r) => r.kind);
    expect(kinds).toEqual(['critical', 'warning', 'positive']);
  });

  it('grade thresholds', () => {
    expect(gradeForScore(90)).toBe('excellent');
    expect(gradeForScore(75)).toBe('good');
    expect(gradeForScore(60)).toBe('fair');
    expect(gradeForScore(40)).toBe('poor');
    expect(gradeForScore(20)).toBe('critical');
  });
});