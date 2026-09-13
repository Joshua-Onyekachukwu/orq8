/**
 * Calibration → routing feedback (§29 learning loop closes into §31 routing).
 *
 * The confidence-calibration card measures whether the council's declared
 * confidence predicts actual outcomes. This module turns that measurement into
 * routing ADVICE — and only that: when the high-confidence band measurably
 * underperforms, the org stops trusting its own confidence:
 *
 *   • Consequential task routing is pushed to tier-2+ models
 *     (selectMeasuredModel consults this advice).
 *   • Council synthesis runs on the strongest registry model (deliberation
 *     consults this advice), and synthesis always flags founder approval.
 *   • The calibration card renders the effect ("routing consequence" line).
 *
 * Honesty rules:
 *   • Advice exists ONLY when the band's accuracy is measurable
 *     (>= MIN_RESOLVED_FOR_ACCURACY resolved outcomes). No data, no advice.
 *   • The consequence is a documented behavior change, never a fake metric.
 */

import type { Db } from '@orq8/db';
import { decisions } from '@orq8/db';
import { eq } from 'drizzle-orm';
import { computeConfidenceCalibration, type ConfidenceCalibration } from './decision-calibration.js';
import type { ModelTier } from './model-intelligence.js';

export interface CalibrationRoutingAdvice {
  /** True when measured calibration justifies a routing consequence. */
  active: boolean;
  /** Why the advice is (in)active — shown verbatim in the calibration card. */
  reason: string;
  /**
   * Minimum registry tier required for CONSEQUENTIAL task routing. Null =
   * no override (static/measured selection stands).
   */
  minConsequentialTier: ModelTier | null;
  /**
   * Council synthesis must run on the strongest tier AND always require
   * founder approval (the org's confidence is not currently trustworthy).
   */
  councilRequiresFounderApproval: boolean;
}

/**
 * Pure function over the calibration aggregation. Exported for unit tests.
 */
export function calibrationRoutingAdvice(calibration: ConfidenceCalibration | null | undefined): CalibrationRoutingAdvice {
  if (!calibration || calibration.totalResolved === 0) {
    return {
      active: false,
      reason: 'No filed outcomes yet — calibration cannot steer routing.',
      minConsequentialTier: null,
      councilRequiresFounderApproval: false,
    };
  }

  const high = calibration.bands.find((b) => b.band === 'high');
  const low = calibration.bands.find((b) => b.band === 'low');

  // Rule 1: the trust bands exist but are not yet measurable → advice stays off.
  const highMeasurable = !!high && high.accuracyPct !== null;
  const lowMeasurable = !!low && low.accuracyPct !== null;
  if (!highMeasurable && !lowMeasurable) {
    return {
      active: false,
      reason: `Calibration has ${calibration.totalResolved} resolved outcome(s) but no band has the minimum sample yet — routing unchanged.`,
      minConsequentialTier: null,
      councilRequiresFounderApproval: false,
    };
  }

  // Rule 2: high-confidence band measurably UNDERPERFORMS the low band → the
  // org's own confidence is not predictive; stop granting it routing authority.
  // (gap < 0 means low outperforms high, per the calibration card semantics.)
  if (highMeasurable && lowMeasurable && calibration.calibrationGapPct !== null && calibration.calibrationGapPct < 0) {
    return {
      active: true,
      reason: `Measured calibration is inverted (high ${high!.accuracyPct}% vs low ${low!.accuracyPct}%) — consequential routing raised to the strongest tier and council recommendations now require founder approval.`,
      minConsequentialTier: 2,
      councilRequiresFounderApproval: true,
    };
  }

  // Rule 3: high band measurable but weak on its own (< 50% validated).
  if (highMeasurable && high!.accuracyPct !== null && high!.accuracyPct < 50) {
    return {
      active: true,
      reason: `High-confidence recommendations validate only ${high!.accuracyPct}% of the time — consequential routing raised to the strongest tier and council recommendations now require founder approval.`,
      minConsequentialTier: 2,
      councilRequiresFounderApproval: true,
    };
  }

  // Rule 4: calibration healthy (or only low-band data) → no override.
  return {
    active: false,
    reason: highMeasurable
      ? `High-confidence recommendations validate at ${high!.accuracyPct}% — calibration is healthy; no routing override.`
      : 'Only low-confidence outcomes are measurable so far — no routing override.',
    minConsequentialTier: null,
    councilRequiresFounderApproval: false,
  };
}

// ── Cached DB accessor ──────────────────────────────────────────────────────

const ADVICE_TTL_MS = 5 * 60 * 1000;
const adviceCache = new Map<string, { advice: CalibrationRoutingAdvice; at: number }>();

/**
 * Calibration advice for an org, recomputed at most every ADVICE_TTL_MS.
 * Routing hot paths call this — the aggregation is a full decisions read, so
 * a short cache keeps the feedback loop effectively free. DB errors degrade
 * to inactive advice (routing falls back to static/measured behavior).
 */
export async function getCalibrationAdvice(db: Db, orgId: string): Promise<CalibrationRoutingAdvice> {
  const cached = adviceCache.get(orgId);
  if (cached && Date.now() - cached.at < ADVICE_TTL_MS) return cached.advice;
  try {
    const rows = await db
      .select({
        confidence: decisions.confidence,
        predictionAccuracy: decisions.predictionAccuracy,
        outcomeFiledAt: decisions.outcomeFiledAt,
      })
      .from(decisions)
      .where(eq(decisions.orgId, orgId));
    const advice = calibrationRoutingAdvice(computeConfidenceCalibration(rows));
    adviceCache.set(orgId, { advice, at: Date.now() });
    return advice;
  } catch {
    return calibrationRoutingAdvice(null);
  }
}

/** Test hook: clear the per-org advice cache. */
export function clearCalibrationAdviceCache(): void {
  adviceCache.clear();
}
