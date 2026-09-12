/**
 * §29 confidence-calibration — does the council actually know what it knows?
 *
 * A founding claim of the Decision Council is that high-confidence
 * recommendations deserve founder trust. This module tests that claim against
 * Decision Memory: grouping resolved decisions (outcomes filed) by the
 * confidence band the council declared at decision time and computing accuracy
 * per band. Every number derives from real rows; when there is insufficient
 * data the aggregation says so explicitly rather than inventing a calibration.
 *
 * Band accuracy = validated / resolved (validated + reversed) within the band,
 * using the same definition as the org-wide learningScore in
 * decision-memory.ts — one honest metric, two cuts.
 */

import type { Decision } from '@orq8/db';

export type CalibrationBand = 'high' | 'medium' | 'low';

export interface CalibrationBandStats {
  band: CalibrationBand;
  /** Resolved decisions in this band (outcome filed with a known accuracy). */
  resolved: number;
  /** Of those, how many were validated by the actual outcome. */
  validated: number;
  /** Of those, how many were reversed by the actual outcome. */
  reversed: number;
  /** validated/resolved as % — null when resolved === 0 (no invented 0%). */
  accuracyPct: number | null;
}

export interface ConfidenceCalibration {
  bands: CalibrationBandStats[];
  /** True only when every band has a usable sample; otherwise the card explains. */
  fullyCalibrated: boolean;
  /**
   * Positive only when high-confidence accuracy measurably exceeds
   * low-confidence accuracy with usable samples in both bands. Null when the
   * comparison cannot honestly be made (insufficient data on either side).
   */
  calibrationGapPct: number | null;
  /** Total resolved decisions considered across all bands. */
  totalResolved: number;
  /** Total decisions with an outcome filed but outside the three known bands. */
  unresolvedBandCount: number;
}

/** Minimum sample per band before an accuracy figure is reported. */
export const MIN_RESOLVED_FOR_ACCURACY = 3;

const BANDS: CalibrationBand[] = ['high', 'medium', 'low'];

/**
 * Pure aggregation over Decision rows. Exported for unit tests — the DB is
 * only touched by the caller in decision-memory.ts.
 */
export function computeConfidenceCalibration(decisionRows: Array<Pick<Decision, 'confidence' | 'predictionAccuracy' | 'outcomeFiledAt'>>): ConfidenceCalibration {
  const byBand = new Map<CalibrationBand, { resolved: number; validated: number; reversed: number }>();
  for (const band of BANDS) byBand.set(band, { resolved: 0, validated: 0, reversed: 0 });

  let unresolvedBandCount = 0;

  for (const d of decisionRows) {
    // Only decisions whose outcome was actually filed and classified count —
    // awaiting-outcome decisions say nothing about calibration.
    if (!d.outcomeFiledAt || !d.predictionAccuracy) continue;
    const band = d.confidence as CalibrationBand;
    const bucket = byBand.get(band);
    if (!bucket) {
      unresolvedBandCount += 1;
      continue;
    }
    bucket.resolved += 1;
    if (d.predictionAccuracy === 'accurate') bucket.validated += 1;
    else if (d.predictionAccuracy === 'inaccurate') bucket.reversed += 1;
    // partially_accurate counts toward the sample but neither validated nor reversed.
  }

  const bands: CalibrationBandStats[] = BANDS.map((band) => {
    const bucket = byBand.get(band)!;
    const accuracyPct =
      bucket.resolved >= MIN_RESOLVED_FOR_ACCURACY
        ? Math.round((bucket.validated / bucket.resolved) * 100)
        : null;
    return { band, ...bucket, accuracyPct };
  });

  const high = bands.find((b) => b.band === 'high')!;
  const low = bands.find((b) => b.band === 'low')!;
  const calibrationGapPct =
    high.accuracyPct !== null && low.accuracyPct !== null ? high.accuracyPct - low.accuracyPct : null;

  return {
    bands,
    fullyCalibrated: bands.every((b) => b.accuracyPct !== null),
    calibrationGapPct,
    totalResolved: bands.reduce((sum, b) => sum + b.resolved, 0),
    unresolvedBandCount,
  };
}
