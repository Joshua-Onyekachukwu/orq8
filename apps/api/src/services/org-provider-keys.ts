/**
 * Org provider keys (BYOK) — resolving a company's own model credentials for real
 * model calls (docs/80 §3.2, closing the docs/77 finding that org keys were stored
 * but never used).
 *
 * `user_provider_keys` holds each key AES-256-GCM encrypted with a versioned
 * master key (docs/23.5). Until now nothing on the call path ever read a row:
 * `llm.ts` built its provider chain from environment variables only, so a
 * customer who "connected" OpenAI or NVIDIA was still served by the platform's
 * key and charged the platform's cost base.
 *
 * This module is the one place a key row is turned back into usable credentials
 * for the gateway. It is deliberately narrow:
 *
 *   - only `active`, `enabled` rows are considered;
 *   - a row whose payload fails to decrypt is skipped (a rotated master key must
 *     degrade to the platform key, never crash a call);
 *   - the per-key `monthly_spend_ceiling` is evaluated here against the key's own
 *     month-to-date spend summed from `llm_performance` (the `provider_key_id`
 *     column, migration 0019), so the gateway can fall back to platform keys the
 *     moment a key is over budget.
 *
 * `monthly_spend_ceiling` is stored as an integer with no documented unit; by the
 * convention used everywhere else a founder enters a money figure (plan prices,
 * packs), **it is read as USD dollars** here. The API stores what the caller sent
 * and this module compares in the same unit.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { AesGcmCipher, parseSecret, type AppConfig } from '@orq8/core';
import { llmPerformance, providers, userProviderKeys, type Db } from '@orq8/db';

export interface OrgProviderKey {
  /** The `user_provider_keys` row id — persisted as `llm_performance.provider_key_id`. */
  keyId: string;
  /** Provider slug as the gateway's provider ids use it (`openrouter`, `nvidia`, …). */
  providerSlug: string;
  /** BYO endpoint override, when the row sets one; else null (use the provider base). */
  baseUrl: string | null;
  /** The decrypted secret. Never logged, never returned to a client. */
  apiKey: string;
  /** Models this key may serve; empty means "any model the provider offers". */
  allowedModels: string[];
  /** USD ceiling for the calendar month, or null for uncapped. */
  monthlySpendCeilingUsd: number | null;
  /** USD spent through this key since the start of the month. */
  monthToDateSpendUsd: number;
  /** False once month-to-date spend has reached the ceiling. */
  withinCeiling: boolean;
}

/** First instant of the current UTC month — the accounting window for ceilings. */
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Month-to-date spend per org key, in USD, from `llm_performance`.
 *
 * One grouped read for the whole org (not a per-key query), keyed by
 * `provider_key_id`. This is the number the settings page shows beside each
 * key's ceiling and the number `loadOrgProviderKeys` compares against it.
 */
export async function monthToDateSpendByKey(
  db: Db,
  orgId: string,
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      keyId: llmPerformance.providerKeyId,
      spendUsd: sql<number>`coalesce(sum(${llmPerformance.providerCostUsd}), 0)::float8`,
    })
    .from(llmPerformance)
    .where(
      and(
        eq(llmPerformance.orgId, orgId),
        gte(llmPerformance.createdAt, monthStartUtc(now)),
        sql`${llmPerformance.providerKeyId} is not null`,
      ),
    )
    .groupBy(llmPerformance.providerKeyId);

  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.keyId) out.set(row.keyId, Number(row.spendUsd ?? 0));
  }
  return out;
}

/**
 * Load every usable org provider key, keyed by provider slug.
 *
 * Returns an empty map when the org has none — the gateway then behaves exactly
 * as before (environment keys only).
 */
export async function loadOrgProviderKeys(
  db: Db,
  orgId: string,
  config: AppConfig,
  now: Date = new Date(),
): Promise<Map<string, OrgProviderKey>> {
  const rows = await db
    .select({
      id: userProviderKeys.id,
      keyEncrypted: userProviderKeys.keyEncrypted,
      baseUrl: userProviderKeys.baseUrl,
      allowedModels: userProviderKeys.allowedModels,
      monthlySpendCeiling: userProviderKeys.monthlySpendCeiling,
      providerSlug: providers.slug,
      providerBaseUrl: providers.baseUrl,
    })
    .from(userProviderKeys)
    .innerJoin(providers, eq(userProviderKeys.providerId, providers.id))
    .where(
      and(
        eq(userProviderKeys.orgId, orgId),
        eq(userProviderKeys.status, 'active'),
        eq(userProviderKeys.enabled, true),
      ),
    );

  if (rows.length === 0) return new Map();

  const spendRows = await db
    .select({
      keyId: llmPerformance.providerKeyId,
      spendUsd: sql<number>`coalesce(sum(${llmPerformance.providerCostUsd}), 0)::float8`,
    })
    .from(llmPerformance)
    .where(
      and(
        eq(llmPerformance.orgId, orgId),
        gte(llmPerformance.createdAt, monthStartUtc(now)),
        sql`${llmPerformance.providerKeyId} is not null`,
      ),
    )
    .groupBy(llmPerformance.providerKeyId);

  const spendByKey = new Map<string, number>();
  for (const row of spendRows) {
    if (row.keyId) spendByKey.set(row.keyId, Number(row.spendUsd ?? 0));
  }

  const cipher = new AesGcmCipher(config.ENCRYPTION_KEY);
  const out = new Map<string, OrgProviderKey>();

  for (const row of rows) {
    let apiKey: string;
    try {
      apiKey = cipher.decrypt(parseSecret(row.keyEncrypted));
    } catch {
      // Master key rotated or payload corrupt: skip this key rather than fail the
      // call — the platform key is the documented fallback.
      continue;
    }
    if (!apiKey) continue;

    const ceiling = row.monthlySpendCeiling ?? null;
    const spend = spendByKey.get(row.id) ?? 0;

    out.set(row.providerSlug, {
      keyId: row.id,
      providerSlug: row.providerSlug,
      baseUrl: row.baseUrl ?? row.providerBaseUrl ?? null,
      apiKey,
      allowedModels: Array.isArray(row.allowedModels) ? (row.allowedModels as string[]) : [],
      monthlySpendCeilingUsd: ceiling,
      monthToDateSpendUsd: spend,
      withinCeiling: ceiling === null || spend < ceiling,
    });
  }

  return out;
}
