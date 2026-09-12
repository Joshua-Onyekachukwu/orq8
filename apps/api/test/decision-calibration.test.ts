/**
 * §29 confidence-calibration tests — the "does the council know what it knows"
 * aggregation must never invent accuracy from thin data.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_RESOLVED_FOR_ACCURACY,
  computeConfidenceCalibration,
} from '../src/services/decision-calibration.js';

type Row = { confidence: string; predictionAccuracy: string | null; outcomeFiledAt: Date | null };

const filed = (accuracy: string): Row => ({ confidence: 'high', predictionAccuracy: accuracy, outcomeFiledAt: new Date() });
const awaiting = (): Row => ({ confidence: 'high', predictionAccuracy: null, outcomeFiledAt: null });

describe('computeConfidenceCalibration', () => {
  it('reports null accuracy for every band when nothing is resolved — no invented 0%', () => {
    const c = computeConfidenceCalibration([awaiting(), awaiting(), awaiting()]);
    expect(c.totalResolved).toBe(0);
    expect(c.bands.every((b) => b.accuracyPct === null)).toBe(true);
    expect(c.fullyCalibrated).toBe(false);
    expect(c.calibrationGapPct).toBe(null);
  });

  it('counts partially_accurate toward the sample but neither validated nor reversed', () => {
    const rows: Row[] = Array.from({ length: MIN_RESOLVED_FOR_ACCURACY }, () => filed('partially_accurate'));
    const c = computeConfidenceCalibration(rows);
    const high = c.bands.find((b) => b.band === 'high')!;
    expect(high.resolved).toBe(3);
    expect(high.validated).toBe(0);
    expect(high.reversed).toBe(0);
    expect(high.accuracyPct).toBe(0); // honest: 0 of 3 validated
  });

  it('requires the minimum sample before reporting a band accuracy', () => {
    const c = computeConfidenceCalibration([filed('accurate'), filed('accurate')]); // 2 < 3
    expect(c.bands.find((b) => b.band === 'high')!.accuracyPct).toBe(null);
  });

  it('computes accuracy per band from real filed outcomes', () => {
    const rows: Row[] = [
      { ...filed('accurate'), confidence: 'high' },
      { ...filed('accurate'), confidence: 'high' },
      { ...filed('partially_accurate'), confidence: 'high' },
      { ...filed('accurate'), confidence: 'high' },
      { ...filed('inaccurate'), confidence: 'low' },
      { ...filed('inaccurate'), confidence: 'low' },
      { ...filed('accurate'), confidence: 'low' },
    ];
    const c = computeConfidenceCalibration(rows);
    const high = c.bands.find((b) => b.band === 'high')!;
    const low = c.bands.find((b) => b.band === 'low')!;
    expect(high.accuracyPct).toBe(75); // 3 validated of 4
    expect(low.accuracyPct).toBe(33); // 1 of 3
    expect(c.calibrationGapPct).toBe(42);
  });

  it('refuses the gap comparison when either band lacks a usable sample', () => {
    const rows: Row[] = [filed('accurate'), filed('accurate')]; // only 2 high, no low
    const c = computeConfidenceCalibration(rows);
    expect(c.calibrationGapPct).toBe(null);
    expect(c.fullyCalibrated).toBe(false);
  });

  it('tallies resolved decisions whose band is outside the three known bands', () => {
    const rows: Row[] = [
      { confidence: 'urgent', predictionAccuracy: 'accurate', outcomeFiledAt: new Date() },
      ...Array.from({ length: MIN_RESOLVED_FOR_ACCURACY }, () => filed('accurate')),
    ];
    const c = computeConfidenceCalibration(rows);
    expect(c.unresolvedBandCount).toBe(1);
    expect(c.totalResolved).toBe(3); // unknown band excluded from band totals
  });

  it('ignores decisions still awaiting their outcome', () => {
    const c = computeConfidenceCalibration([awaiting(), awaiting()]);
    expect(c.totalResolved).toBe(0);
    expect(c.unresolvedBandCount).toBe(0);
  });
});
