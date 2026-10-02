/**
 * Provider cost — what ORQ8 actually pays for a model call, in USD (docs/77 P1 §5).
 *
 * Before this module no USD figure existed anywhere in the system. The trace
 * `cost` field and `activityEvents.cost` both held the *credit* formula
 * (`ceil(tokens / 1000)`) in a field named cost, `llm_performance` had no cost
 * column at all, and `/v1/admin/ai-usage` summed those credits and labelled them
 * `costCents`. The company could not compute its own margin, and the numbers on
 * the screen were wrong by construction.
 *
 * This is the single place where a call's real provider spend is derived:
 *
 *   1. **The provider's own reported cost**, when it sends one. OpenRouter
 *      returns `usage.cost` in USD per request; it is metered by the party that
 *      charged us, so it stays right when upstream prices change.
 *   2. **The published registry price**, per 1K input/output tokens
 *      (`MODEL_REGISTRY`), for every other provider.
 *
 * A model the registry does not list (e.g. a model reached through
 * `OPENROUTER_MODEL`, or a provider suffix we have never seen) records **0 USD
 * with `pricing_source = 'unknown'`** rather than a guess. A fabricated number in
 * a margin report is worse than a missing one, and the source column makes the
 * gap countable instead of invisible.
 */

import { eq, sql } from 'drizzle-orm';
import { llmPerformance, type Db } from '@orq8/db';
import { MODEL_REGISTRY, type ModelDefinition } from './model-router.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Where the USD figure came from. Persisted so a report can exclude guesses. */
export type PricingSource = 'provider_reported' | 'registry' | 'unknown';

export interface ProviderCost {
  /** USD paid to the provider for this call (0 when unknown). */
  providerCostUsd: number;
  pricingSource: PricingSource;
  /** The rates used, for audit. Null on provider-reported pricing. */
  inputPer1kUsd: number | null;
  outputPer1kUsd: number | null;
}

export interface TaskProviderCost {
  providerCostUsd: number;
  /** The provider/model that carried the most of the task's spend. */
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  /** Distinct pricing sources in the task's calls, for honest reporting. */
  pricingSources: string[];
}

// ─── Model lookup ───────────────────────────────────────────────────────────

/** OpenRouter-style suffixes that are routing hints, not part of the price. */
const ROUTING_SUFFIX = /:(free|nitro|extended|online|thinking|floor)$/;

export function normalizeModelId(model: string): string {
  return model.trim().toLowerCase().replace(ROUTING_SUFFIX, '');
}

/**
 * Find the registry entry for a model id as reported by a provider.
 *
 * Provider and registry names disagree in both directions: the registry carries
 * vendor-prefixed ids (`nvidia/nemotron-3-super-120b-a12b`) while a provider may
 * report the bare name, and OpenRouter reports `vendor/model` for models the
 * registry lists with a different vendor prefix. Exact match first, then the
 * slug tail — with the vendor prefix ignored on either side.
 */
export function findModelPrice(model: string): ModelDefinition | undefined {
  const id = normalizeModelId(model);
  if (!id) return undefined;

  const exact = MODEL_REGISTRY.find((m) => normalizeModelId(m.id) === id);
  if (exact) return exact;

  const tail = id.split('/').pop() ?? id;
  if (!tail) return undefined;
  return MODEL_REGISTRY.find((m) => normalizeModelId(m.id).split('/').pop() === tail);
}

// ─── Cost derivation ────────────────────────────────────────────────────────

/** numeric(14,8) — match the column's scale so storage never rounds twice. */
function toUsdScale(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

export function computeProviderCost(params: {
  model: string;
  promptTokens: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Provider-reported USD cost, when the provider includes one. */
  reportedCostUsd?: number | null;
}): ProviderCost {
  const reported = params.reportedCostUsd;
  // A provider that reports 0 (a free or promotional model) is telling the truth;
  // only an absent number falls through to the registry.
  if (typeof reported === 'number' && Number.isFinite(reported) && reported >= 0) {
    return {
      providerCostUsd: toUsdScale(reported),
      pricingSource: 'provider_reported',
      inputPer1kUsd: null,
      outputPer1kUsd: null,
    };
  }

  const input = Math.max(0, Math.floor(params.promptTokens || 0));
  const completion = Math.max(
    0,
    Math.floor(params.completionTokens ?? Math.max(0, (params.totalTokens ?? 0) - input)),
  );

  const price = findModelPrice(params.model);
  if (!price) {
    return { providerCostUsd: 0, pricingSource: 'unknown', inputPer1kUsd: null, outputPer1kUsd: null };
  }

  const costUsd = (input / 1000) * price.costPer1kInput + (completion / 1000) * price.costPer1kOutput;
  return {
    providerCostUsd: toUsdScale(costUsd),
    pricingSource: 'registry',
    inputPer1kUsd: price.costPer1kInput,
    outputPer1kUsd: price.costPer1kOutput,
  };
}

// ─── Task-level attribution ─────────────────────────────────────────────────

/**
 * Sum a task's real provider spend from its per-call rows.
 *
 * Called at settlement so the credit ledger's usage row carries the USD cost it
 * incurred (the column exists since docs/77 P0 but was never populated — the
 * ledger recorded a credits figure and no cost). Best-effort: attribution must
 * never block a settlement, so a failure returns the empty reading.
 */
export async function taskProviderCost(db: Db, taskId: string): Promise<TaskProviderCost> {
  const empty: TaskProviderCost = {
    providerCostUsd: 0,
    provider: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    pricingSources: [],
  };
  if (!taskId) return empty;

  try {
    const rows = await db
      .select({
        provider: llmPerformance.provider,
        model: llmPerformance.model,
        calls: sql<number>`count(*)::int`,
        costUsd: sql<number>`coalesce(sum(${llmPerformance.providerCostUsd}), 0)::float8`,
        inputTokens: sql<number>`coalesce(sum(${llmPerformance.promptTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${llmPerformance.completionTokens}), 0)::int`,
      })
      .from(llmPerformance)
      .where(eq(llmPerformance.taskId, taskId))
      .groupBy(llmPerformance.provider, llmPerformance.model);

    if (rows.length === 0) return empty;

    const sources = await db
      .select({ source: llmPerformance.pricingSource })
      .from(llmPerformance)
      .where(eq(llmPerformance.taskId, taskId))
      .groupBy(llmPerformance.pricingSource);

    const total = rows.reduce((sum, r) => sum + Number(r.costUsd ?? 0), 0);
    // The dominant row carries the attribution: the provider/model the task
    // mostly ran on, weighted by what it cost rather than by call count, so a
    // cheap classifier call cannot outrank the model that did the work.
    const dominant = [...rows].sort((a, b) => Number(b.costUsd ?? 0) - Number(a.costUsd ?? 0))[0];

    return {
      providerCostUsd: toUsdScale(total),
      provider: dominant?.provider ?? null,
      model: dominant?.model ?? null,
      inputTokens: rows.reduce((sum, r) => sum + Number(r.inputTokens ?? 0), 0),
      outputTokens: rows.reduce((sum, r) => sum + Number(r.outputTokens ?? 0), 0),
      calls: rows.reduce((sum, r) => sum + Number(r.calls ?? 0), 0),
      pricingSources: sources.map((s) => s.source).sort(),
    };
  } catch {
    return empty;
  }
}
