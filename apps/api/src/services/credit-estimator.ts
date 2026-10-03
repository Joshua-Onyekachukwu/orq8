/**
 * Credit estimation (docs/80 Phase 1 / §3.1 item 3).
 *
 * Every unit of work reserves credits *before* it runs, so the estimate has to
 * exist before the tokens do. The estimate is the p90 of measured token usage
 * for the same org and phase over a lookback window, priced at the published
 * formula (1 credit per 1K tokens) — a measured basis, not a guess. When the org
 * has no history for that phase, a cold-start table per operation class stands
 * in.
 *
 * The number is a *reservation*, not a quote (docs/80 decision 2): the ledger
 * settles measured actuals capped by the reservation. An estimate that is too
 * high only holds credits longer; the remainder is released at settlement.
 *
 * The result is additionally capped by the per-task ceiling
 * (`CREDIT_TASK_CEILING`) so one bad estimate cannot hold a whole company's
 * balance, and flagged `approvalRequired` when the raw estimate would have
 * exceeded that ceiling.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { llmPerformance, type Db } from '@orq8/db';
import type { AppConfig } from '@orq8/core';
import { getOrCreateBalance } from './credits.js';

/** Cold-start credits per operation class, used when there is no history. */
const COLD_START_CREDITS: Record<string, number> = {
  'task.execute': 8,
  'task.executed': 8,
  'task.planned': 3,
  'task.created': 3,
  'ai.execute': 8,
  'ai.analyze': 12,
  'ai.import': 20,
  'tool.default': 2,
  default: 5,
};

export interface CreditEstimateRequest {
  orgId: string;
  /** Operation class (e.g. `task.execute`, `ai.analyze`) — the cold-start key. */
  operationClass?: string;
  /** llm_performance phase to measure against; defaults to the operation class. */
  phase?: string;
  agentId?: string;
}

export interface CreditEstimate {
  /** Credits to reserve now. */
  estimate: number;
  /** The floor applied to a measured/cold-start estimate. */
  floor: number;
  /** The per-task ceiling this estimate was capped by. */
  ceiling: number;
  /** Credits available in the org before this estimate. */
  headroom: number;
  /** True when the raw estimate exceeded the ceiling (founder sign-off advised). */
  approvalRequired: boolean;
  source: 'measured' | 'cold_start';
  basis: {
    p90Tokens: number | null;
    samples: number;
    phase: string | null;
    lookbackDays: number;
  };
}

/**
 * Estimate the credits a unit of work should reserve.
 * Never throws for a missing org balance beyond what `getOrCreateBalance` does.
 */
export async function estimateCredits(
  db: Db,
  config: AppConfig,
  request: CreditEstimateRequest,
): Promise<CreditEstimate> {
  const floor = config.CREDIT_ESTIMATE_FLOOR;
  const ceiling = config.CREDIT_TASK_CEILING;
  const lookbackDays = config.CREDIT_ESTIMATE_LOOKBACK_DAYS;
  const phase = request.phase ?? request.operationClass ?? null;

  const balance = await getOrCreateBalance(db, request.orgId);

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  let p90Tokens: number | null = null;
  let samples = 0;
  try {
    const [row] = await db
      .select({
        p90: sql<number | null>`percentile_cont(0.9) within group (order by (${llmPerformance.promptTokens} + ${llmPerformance.completionTokens}))`,
        samples: sql<number>`count(*)::int`,
      })
      .from(llmPerformance)
      .where(
        and(
          eq(llmPerformance.orgId, request.orgId),
          gte(llmPerformance.createdAt, since),
          ...(phase ? [eq(llmPerformance.phase, phase)] : []),
        ),
      );
    if (row && row.samples > 0 && row.p90 !== null) {
      p90Tokens = Math.max(0, Math.round(Number(row.p90)));
      samples = row.samples;
    }
  } catch {
    // Estimation must never block the work path; fall through to cold start.
    p90Tokens = null;
    samples = 0;
  }

  let raw: number;
  let source: 'measured' | 'cold_start';
  if (p90Tokens === null) {
    raw = COLD_START_CREDITS[request.operationClass ?? phase ?? ''] ?? COLD_START_CREDITS.default!;
    source = 'cold_start';
  } else {
    // Published formula: 1 credit per 1K tokens, at least the floor.
    raw = Math.max(floor, Math.ceil(p90Tokens / 1000));
    source = 'measured';
  }

  const approvalRequired = raw > ceiling;
  const estimate = Math.max(0, Math.min(ceiling, Math.max(floor, raw)));

  return {
    estimate,
    floor,
    ceiling,
    headroom: balance.available,
    approvalRequired,
    source,
    basis: { p90Tokens, samples, phase, lookbackDays },
  };
}
