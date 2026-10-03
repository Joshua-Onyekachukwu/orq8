/**
 * BYOK (docs/80 §3.2) — the org's own provider key powers real model calls.
 *
 * Two layers:
 *   1. `selectProviderKeys` — the pure policy. The org key wins when it is present,
 *      within its month-to-date spend ceiling, and allows the requested model;
 *      otherwise the platform keys serve the call. No DB, no network.
 *   2. `loadOrgProviderKeys` — the loader that decrypts stored rows and computes
 *      each key's spend from `llm_performance`. Integration: real embedded Postgres.
 */

import { AesGcmCipher, createLogger, loadConfig, serializeSecret } from '@orq8/core';
import { createDb, llmPerformance, providers, userProviderKeys } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';
import { selectProviderKeys } from '../src/services/llm.js';
import { loadOrgProviderKeys } from '../src/services/org-provider-keys.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

describe('BYOK key selection (pure policy)', () => {
  const orgKey = { apiKey: 'org-secret', allowedModels: [] as string[], withinCeiling: true };

  it('prefers the org key when it is usable', () => {
    const choice = selectProviderKeys({
      platformKeys: ['platform-secret'],
      orgKey,
      requestedModel: 'openai/gpt-4o',
    });
    expect(choice.keySource).toBe('org');
    expect(choice.keys).toEqual(['org-secret']);
  });

  it('falls back to platform keys when the org key is over its ceiling', () => {
    const choice = selectProviderKeys({
      platformKeys: ['platform-secret'],
      orgKey: { ...orgKey, withinCeiling: false },
      requestedModel: 'openai/gpt-4o',
    });
    expect(choice.keySource).toBe('platform');
    expect(choice.keys).toEqual(['platform-secret']);
    expect(choice.reason).toMatch(/ceiling/i);
  });

  it('falls back when the model is not in the org key allow-list', () => {
    const choice = selectProviderKeys({
      platformKeys: ['platform-secret'],
      orgKey: { ...orgKey, allowedModels: ['anthropic/claude-3.5-sonnet'] },
      requestedModel: 'openai/gpt-4o',
    });
    expect(choice.keySource).toBe('platform');
    expect(choice.reason).toMatch(/allow-list/i);
  });

  it('allows a vendor-prefix-insensitive allow-list match', () => {
    const choice = selectProviderKeys({
      platformKeys: ['platform-secret'],
      orgKey: { ...orgKey, allowedModels: ['gpt-4o'] },
      requestedModel: 'openai/gpt-4o',
    });
    expect(choice.keySource).toBe('org');
  });

  it('uses platform keys when the org has no key for the provider', () => {
    const choice = selectProviderKeys({
      platformKeys: ['platform-secret'],
      orgKey: null,
      requestedModel: 'openai/gpt-4o',
    });
    expect(choice.keySource).toBe('platform');
    expect(choice.keys).toEqual(['platform-secret']);
  });
});

// ─── Loader (integration) ────────────────────────────────────────────────────

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let app: FastifyInstance;

beforeAll(async () => {
  if (dbUp) app = await buildApp(deps);
});

afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

const run = dbUp ? describe : describe.skip;

run('BYOK org key loader (integration)', () => {
  async function registerOrg(): Promise<string> {
    const email = `byok-${randomUUID().slice(0, 8)}@test.example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'Test1234!', org_name: 'BYOK Org' },
    });
    expect(res.statusCode).toBe(201);
    const { users } = await import('@orq8/db');
    await deps.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email.trim().toLowerCase()));
    return res.json().data.org.id as string;
  }

  async function providerId(slug: string): Promise<string> {
    const [existing] = await deps.db.select().from(providers).where(eq(providers.slug, slug)).limit(1);
    if (existing) return existing.id;
    const [created] = await deps.db
      .insert(providers)
      .values({ slug, name: slug, kind: 'byok', baseUrl: `https://${slug}.example/v1` })
      .returning();
    return created!.id;
  }

  async function storeKey(params: {
    orgId: string;
    providerId: string;
    secret: string;
    ceiling: number | null;
    enabled?: boolean;
  }): Promise<string> {
    const cipher = new AesGcmCipher(config.ENCRYPTION_KEY);
    const { secret: encrypted, kid } = cipher.encrypt(params.secret, config.ENCRYPTION_KEY_KID);
    const [row] = await deps.db
      .insert(userProviderKeys)
      .values({
        orgId: params.orgId,
        providerId: params.providerId,
        authType: 'api_key',
        keyEncrypted: serializeSecret(encrypted),
        keyKid: kid,
        mask: `${params.secret.slice(0, 4)}…${params.secret.slice(-4)}`,
        allowedModels: [],
        monthlySpendCeiling: params.ceiling,
        enabled: params.enabled ?? true,
        status: 'active',
      })
      .returning();
    return row!.id;
  }

  it('decrypts an active org key back to usable credentials', async () => {
    const orgId = await registerOrg();
    const pid = await providerId('openrouter');
    await storeKey({ orgId, providerId: pid, secret: 'sk-or-org-abcdef123456', ceiling: null });

    const keys = await loadOrgProviderKeys(deps.db, orgId, config);
    const key = keys.get('openrouter');
    expect(key?.apiKey).toBe('sk-or-org-abcdef123456');
    expect(key?.withinCeiling).toBe(true);
  });

  it('marks a key over its monthly spend ceiling as unusable', async () => {
    const orgId = await registerOrg();
    const pid = await providerId('openrouter');
    const keyId = await storeKey({ orgId, providerId: pid, secret: 'sk-or-org-ceiling', ceiling: 5 });

    // $6 of spend through this key this month exceeds the $5 ceiling.
    await deps.db.insert(llmPerformance).values({
      orgId,
      phase: 'task.execute',
      model: 'openai/gpt-4o',
      provider: 'openrouter',
      success: true,
      providerCostUsd: '6',
      providerKeyId: keyId,
      keySource: 'org',
    });

    const keys = await loadOrgProviderKeys(deps.db, orgId, config);
    const key = keys.get('openrouter');
    expect(key?.monthToDateSpendUsd).toBeCloseTo(6);
    expect(key?.withinCeiling).toBe(false);
  });

  it('ignores disabled keys and leaves other orgs untouched', async () => {
    const orgA = await registerOrg();
    const orgB = await registerOrg();
    const pid = await providerId('openrouter');
    await storeKey({ orgId: orgA, providerId: pid, secret: 'sk-or-org-disabled', ceiling: null, enabled: false });

    const keys = await loadOrgProviderKeys(deps.db, orgA, config);
    expect(keys.size).toBe(0);

    const bKeys = await loadOrgProviderKeys(deps.db, orgB, config);
    expect(bKeys.size).toBe(0);
  });
});
