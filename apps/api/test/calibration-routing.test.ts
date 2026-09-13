/**
 * §29→§31 calibration→routing feedback tests — measured band accuracy must
 * produce honest routing advice, and nothing else. No data, no advice; small
 * samples never flip routing; weak calibration visibly changes behavior.
 */
import { describe, expect, it } from 'vitest';
import { calibrationRoutingAdvice } from '../src/services/calibration-routing.js';
import { computeConfidenceCalibration, MIN_RESOLVED_FOR_ACCURACY } from '../src/services/decision-calibration.js';

type Row = { confidence: string; predictionAccuracy: string | null; outcomeFiledAt: Date | null };
const filed = (band: string, accuracy: string): Row => ({ confidence: band, predictionAccuracy: accuracy, outcomeFiledAt: new Date() });

const calibrate = (rows: Row[]) => calibrationRoutingAdvice(computeConfidenceCalibration(rows));

describe('calibrationRoutingAdvice', () => {
  it('is inactive with no data — no outcomes, no routing override', () => {
    const a = calibrate([]);
    expect(a.active).toBe(false);
    expect(a.minConsequentialTier).toBeNull();
    expect(a.councilRequiresFounderApproval).toBe(false);
  });

  it('is inactive when no band has the minimum sample', () => {
    const a = calibrate([filed('high', 'inaccurate'), filed('high', 'inaccurate')]);
    expect(a.active).toBe(false);
    expect(a.reason).toMatch(/minimum sample/i);
  });

  it('activates the consequential-tier floor when calibration is INVERTED (low outperforms high)', () => {
    const rows: Row[] = [
      ...Array.from({ length: MIN_RESOLVED_FOR_ACCURACY }, () => filed('high', 'inaccurate')),
      ...Array.from({ length: MIN_RESOLVED_FOR_ACCURACY }, () => filed('low', 'accurate')),
    ];
    const a = calibrate(rows);
    expect(a.active).toBe(true);
    expect(a.minConsequentialTier).toBe(2);
    expect(a.councilRequiresFounderApproval).toBe(true);
    expect(a.reason).toMatch(/inverted/i);
  });

  it('activates when the high band is weak on its own (<50% validated)', () => {
    const rows: Row[] = [
      filed('high', 'accurate'),
      filed('high', 'inaccurate'),
      filed('high', 'inaccurate'),
    ];
    const a = calibrate(rows);
    expect(a.active).toBe(true);
    expect(a.minConsequentialTier).toBe(2);
    expect(a.councilRequiresFounderApproval).toBe(true);
  });

  it('stays inactive when calibration is healthy', () => {
    const rows: Row[] = [
      ...Array.from({ length: MIN_RESOLVED_FOR_ACCURACY }, () => filed('high', 'accurate')),
      ...Array.from({ length: MIN_RESOLVED_FOR_ACCURACY }, () => filed('low', 'inaccurate')),
    ];
    const a = calibrate(rows);
    expect(a.active).toBe(false);
    expect(a.minConsequentialTier).toBeNull();
    expect(a.councilRequiresFounderApproval).toBe(false);
  });

  it('treats null calibration as inactive advice', () => {
    const a = calibrationRoutingAdvice(null);
    expect(a.active).toBe(false);
    expect(a.reason).toMatch(/no filed outcomes/i);
  });
});
