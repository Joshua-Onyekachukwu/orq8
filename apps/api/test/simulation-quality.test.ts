import { describe, it, expect } from 'vitest';
import {
  MIN_SAMPLE,
  wilsonInterval,
  adjustRateForScenario,
  modelQualityProjection,
  type HistoricalPerformance,
} from '../src/services/simulation-quality.js';

const richHistorical: HistoricalPerformance = {
  completion: { rate: 80, sampleSize: 120 },
  approval: { rate: 75, sampleSize: 40 },
  revision: { rate: 20, sampleSize: 60 },
  reliability: { rate: 90, sampleSize: 110 },
};

const scenario = { currentAgents: 5, proposedAgents: 7, workloadChangePercent: 20 };

describe('wilsonInterval', () => {
  it('returns null for an empty sample', () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });
  it('produces a finite interval containing the point estimate', () => {
    const [lo, hi] = wilsonInterval(80, 100) ?? [0, 0]; // p = 0.8
    expect(lo).toBeLessThanOrEqual(80);
    expect(hi).toBeGreaterThanOrEqual(80);
    expect(lo).toBeLessThan(hi);
  });
  it('widens the interval for small samples', () => {
    const small = wilsonInterval(8, 10) ?? [0, 0];
    const large = wilsonInterval(80, 100) ?? [0, 0];
    expect(small[1] - small[0]).toBeGreaterThan(large[1] - large[0]);
  });
});

describe('adjustRateForScenario — direction sensitivity', () => {
  it('adding agents improves completion and reliability; heavy workload reduces completion', () => {
    const up = adjustRateForScenario('completion_rate', 50, { currentAgents: 2, proposedAgents: 5, workloadChangePercent: 0 });
    expect(up).toBeGreaterThan(50);
    const down = adjustRateForScenario('completion_rate', 50, { currentAgents: 5, proposedAgents: 5, workloadChangePercent: 100 });
    expect(down).toBeLessThan(50);
  });
  it('clamps projections to the valid 0-100 range', () => {
    const high = adjustRateForScenario('completion_rate', 99, { currentAgents: 1, proposedAgents: 20, workloadChangePercent: 0 });
    expect(high).toBeLessThanOrEqual(100);
    const low = adjustRateForScenario('revision_rate', 1, { currentAgents: 10, proposedAgents: 1, workloadChangePercent: 0 });
    expect(low).toBeGreaterThanOrEqual(0);
  });
});

describe('modelQualityProjection', () => {
  it('projects all four metrics with confidence ranges and labeled method', () => {
    const out = modelQualityProjection(richHistorical, scenario);
    expect(out).toHaveLength(4);
    for (const m of out) {
      expect(m.available).toBe(true);
      expect(m.method).toBe('wilson');
      expect(m.confidenceLevel).toBe(0.9);
      expect(m.lower).not.toBeNull();
      expect(m.upper).not.toBeNull();
      expect(m.liveRate).not.toBeNull();
      expect(m.projectedRate).not.toBeNull();
    }
  });

  it('preserves the live baseline as a distinct value from the projection', () => {
    const out = modelQualityProjection(richHistorical, scenario);
    const completion = out.find((m) => m.metric === 'completion_rate')!;
    // live baseline must stay the historical rate, never overwritten
    expect(completion.liveRate).toBe(80);
    // projection differs from the baseline under a real scenario
    expect(completion.projectedRate).not.toBe(80);
  });

  it('reports insufficient data instead of fabricating a projection', () => {
    const sparse: HistoricalPerformance = {
      completion: { rate: 50, sampleSize: 2 },
      approval: { rate: null, sampleSize: 0 },
      revision: { rate: null, sampleSize: 0 },
      reliability: { rate: null, sampleSize: 0 },
    };
    const out = modelQualityProjection(sparse, scenario);
    for (const m of out) {
      expect(m.available).toBe(false);
      expect(m.projectedRate).toBeNull();
      expect(m.lower).toBeNull();
      expect(m.upper).toBeNull();
      expect(m.method).toBeNull();
    }
  });

  it('treats exactly MIN_SAMPLE as sufficient (threshold boundary)', () => {
    const boundary: HistoricalPerformance = {
      completion: { rate: 50, sampleSize: MIN_SAMPLE },
      approval: { rate: null, sampleSize: 0 },
      revision: { rate: null, sampleSize: 0 },
      reliability: { rate: null, sampleSize: 0 },
    };
    const out = modelQualityProjection(boundary, scenario);
    expect(out.find((m) => m.metric === 'completion_rate')!.available).toBe(true);
  });

  it('is deterministic — same input always yields the same output', () => {
    const a = modelQualityProjection(richHistorical, scenario);
    const b = modelQualityProjection(richHistorical, scenario);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a high-performance org projects better than a low-performance one under the same scenario', () => {
    const high = modelQualityProjection({ ...richHistorical, completion: { rate: 95, sampleSize: 200 } }, scenario);
    const low = modelQualityProjection({ ...richHistorical, completion: { rate: 40, sampleSize: 200 } }, scenario);
    const h = high.find((m) => m.metric === 'completion_rate')!.projectedRate!;
    const l = low.find((m) => m.metric === 'completion_rate')!.projectedRate!;
    expect(h).toBeGreaterThan(l);
  });
});