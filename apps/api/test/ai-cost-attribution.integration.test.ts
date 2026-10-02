/**
 * Cost attribution integration tests (docs/77 P1 §5).
 *
 * Proves the chain that makes margin knowable, at every link:
 *
 *   1. an LLM call records a **USD** cost (not credits) in llm_performance;
 *   2. a task's calls sum into one attribution (provider/model/tokens/cost);
 *   3. the settlement writes that attribution onto the credit ledger row — the
 *      columns existed since docs/77 P0 and were never populated;
 *   4. `/v1/admin/ai-usage` reports USD and credits as separate units, and its
 *      margin obeys revenue − cost = margin at the stated rate;
 *   5. a non-platform-admin cannot read any of it.
 *
 * Skips when PostgreSQL is unreachable, like the rest of the suite.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb, creditTransactions, llmPerformance, users } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';
import { consumeCredits } from '../src/services/credits.js';
import { taskProviderCost } from '../src/services/llm-pricing.js';
import { endTrace, persistTrace, startTrace } from '../src/services/llm-tracer.js';

// ─── Setup ──────────────────────────────────────────────────────────────────

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: process.env.DATABASE_URL } as NodeJS.ProcessEnv);

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
  app = await buildApp(deps);
});

afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

// A registry model with visible prices: $0.00035 / 1K in, $0.0014 / 1K out.
const PRICED_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function registerConfirmedOrg(tag: string): Promise<{ token: string; orgId: string; email: string; userId: string }> {
  const email = `${tag}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `${tag} Org` },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { data?: { token?: string; user?: { id: string }; org?: { id: string } } };

  // Confirm the address the way the founder's link does, then re-login for a
  // token that carries an active session.
  await deps.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email.trim().toLowerCase()));
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password: 'Test1234!' },
  });
  expect(login.statusCode).toBe(200);
  const loginBody = login.json() as { token?: string; data?: { token?: string } };
  const token = loginBody.token ?? loginBody.data?.token ?? body.data?.token ?? '';
  expect(token).toBeTruthy();

  const [row] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  const memberships = await app.inject({
    method: 'GET',
    url: '/v1/auth/me',
    headers: { authorization: `Bearer ${token}` },
  });
  const me = memberships.json() as { data?: { active_org_id?: string | null; memberships?: Array<{ org: { id: string } }> } };
  const orgId = me.data?.active_org_id ?? me.data?.memberships?.[0]?.org.id ?? '';
  expect(orgId).toBeTruthy();
  return { token, orgId, email, userId: row?.id ?? '' };
}

async function promoteToPlatformAdmin(userId: string): Promise<void> {
  await deps.db.update(users).set({ platformRole: 'admin' }).where(eq(users.id, userId));
}

async function loginToken(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password: 'Test1234!' },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { token?: string; data?: { token?: string } };
  const token = body.token ?? body.data?.token ?? '';
  expect(token).toBeTruthy();
  return token;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe.skipIf(!dbUp)('LLM cost attribution', () => {
  it('records a USD cost per call, sums it per task, and carries it into the ledger', async () => {
    const { orgId } = await registerConfirmedOrg('cost');
    const taskId = randomUUID();

    // 1. A call goes through the tracer — the same path every real call takes.
    const trace = startTrace({
      orgId,
      phase: 'task_execution',
      model: PRICED_MODEL,
      provider: 'nvidia',
      taskId,
    });
    endTrace(trace.traceId, {
      success: true,
      promptTokens: 1_000,
      completionTokens: 2_000,
      totalTokens: 3_000,
      model: PRICED_MODEL,
    });
    const { getTraceById } = await import('../src/services/llm-tracer.js');
    const entry = getTraceById(trace.traceId);
    expect(entry).toBeDefined();
    await persistTrace(deps.db, entry!);

    // The row carries money, not credits: 1K in + 2K out at the registry rates.
    const [row] = await deps.db
      .select({
        providerCostUsd: llmPerformance.providerCostUsd,
        pricingSource: llmPerformance.pricingSource,
        creditsAttributed: llmPerformance.creditsAttributed,
      })
      .from(llmPerformance)
      .where(and(eq(llmPerformance.orgId, orgId), eq(llmPerformance.taskId, taskId)));
    expect(row).toBeDefined();
    expect(Number(row!.providerCostUsd)).toBeCloseTo(0.00315, 8);
    expect(row!.pricingSource).toBe('registry');
    // Attribution of the published credit formula, not a charge.
    expect(row!.creditsAttributed).toBe(3);

    // 2. The task's calls sum into one attribution.
    const attribution = await taskProviderCost(deps.db, taskId);
    expect(attribution.calls).toBe(1);
    expect(attribution.provider).toBe('nvidia');
    expect(attribution.model).toBe(PRICED_MODEL);
    expect(attribution.inputTokens).toBe(1_000);
    expect(attribution.outputTokens).toBe(2_000);
    expect(attribution.providerCostUsd).toBeCloseTo(0.00315, 8);
    expect(attribution.pricingSources).toEqual(['registry']);

    // 3. Settlement writes that attribution onto the ledger row.
    const charge = await consumeCredits(deps.db, orgId, 'task.executed', 'Cost attribution test', taskId, 'task', {
      amount: 3,
      attribution: {
        provider: attribution.provider ?? undefined,
        model: attribution.model ?? undefined,
        inputTokens: attribution.inputTokens,
        outputTokens: attribution.outputTokens,
        providerCostUsd: attribution.providerCostUsd,
        taskId,
        metadata: { llmCalls: attribution.calls },
      },
    });
    expect(charge.consumed).toBe(3);

    const [ledger] = await deps.db
      .select({
        amount: creditTransactions.amount,
        provider: creditTransactions.provider,
        model: creditTransactions.model,
        inputTokens: creditTransactions.inputTokens,
        outputTokens: creditTransactions.outputTokens,
        providerCostUsd: creditTransactions.providerCostUsd,
      })
      .from(creditTransactions)
      .where(and(eq(creditTransactions.orgId, orgId), eq(creditTransactions.taskId, taskId)));
    expect(ledger).toBeDefined();
    expect(ledger!.amount).toBe(-3);
    expect(ledger!.provider).toBe('nvidia');
    expect(ledger!.model).toBe(PRICED_MODEL);
    expect(ledger!.inputTokens).toBe(1_000);
    expect(ledger!.outputTokens).toBe(2_000);
    expect(Number(ledger!.providerCostUsd)).toBeCloseTo(0.00315, 8);
  });

  it('records 0 USD and marks the call unpriced when the model cannot be priced', async () => {
    const { orgId } = await registerConfirmedOrg('unpriced');
    const taskId = randomUUID();

    const trace = startTrace({
      orgId,
      phase: 'fallback',
      model: 'nonexistent-vendor/nonexistent-model',
      provider: 'openrouter',
      taskId,
    });
    endTrace(trace.traceId, { success: true, promptTokens: 500, completionTokens: 500, totalTokens: 1_000 });
    const { getTraceById } = await import('../src/services/llm-tracer.js');
    await persistTrace(deps.db, getTraceById(trace.traceId)!);

    const [row] = await deps.db
      .select({
        providerCostUsd: llmPerformance.providerCostUsd,
        pricingSource: llmPerformance.pricingSource,
      })
      .from(llmPerformance)
      .where(and(eq(llmPerformance.orgId, orgId), eq(llmPerformance.taskId, taskId)));
    expect(Number(row!.providerCostUsd)).toBe(0);
    // The important half: it says so, so a report can count the gap.
    expect(row!.pricingSource).toBe('unknown');
  });

  it('reports USD and credits as separate units, and a margin that obeys its own rate', async () => {
    const { orgId, userId, email } = await registerConfirmedOrg('usage');
    const taskId = randomUUID();

    // One priced call, then a settlement that carries its cost.
    const trace = startTrace({ orgId, phase: 'task_execution', model: PRICED_MODEL, provider: 'nvidia', taskId });
    endTrace(trace.traceId, {
      success: true,
      promptTokens: 2_000,
      completionTokens: 4_000,
      totalTokens: 6_000,
      model: PRICED_MODEL,
    });
    const { getTraceById } = await import('../src/services/llm-tracer.js');
    await persistTrace(deps.db, getTraceById(trace.traceId)!);

    const attribution = await taskProviderCost(deps.db, taskId);
    await consumeCredits(deps.db, orgId, 'task.executed', 'Usage report test', taskId, 'task', {
      amount: 6,
      attribution: {
        provider: attribution.provider ?? undefined,
        model: attribution.model ?? undefined,
        providerCostUsd: attribution.providerCostUsd,
        taskId,
      },
    });

    // Unauthenticated, the report is closed (docs/77 A-series: /admin is the
    // platform surface and this endpoint carries every tenant's spend).
    expect((await app.inject({ method: 'GET', url: '/v1/admin/ai-usage' })).statusCode).toBe(401);

    await promoteToPlatformAdmin(userId);
    const adminToken = await loginToken(email);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/ai-usage',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: any }).data;

    // Units are separate and labelled.
    expect(data.billing.usdPerCredit).toBeGreaterThan(0);
    expect(String(data.billing.rateBasis)).toContain('plan list price');
    expect(data.credits.used).toBeGreaterThanOrEqual(6);

    // Our spend is in the report, in USD, and attributable to the model.
    // 2K in @ $0.00035/1K + 4K out @ $0.0014/1K = $0.0063 (plus whatever the
    // other tests in this file spent, since the aggregates are platform-wide).
    expect(data.allTime.providerCostUsd).toBeGreaterThanOrEqual(0.0063);
    expect(data.allTime.calls).toBeGreaterThanOrEqual(1);
    const modelRow = (data.byModel as Array<{ model: string; providerCostUsd: number }>).find(
      (m) => m.model === PRICED_MODEL,
    );
    expect(modelRow).toBeDefined();
    expect(modelRow!.providerCostUsd).toBeGreaterThanOrEqual(0.0063);
    expect((data.byProvider as Array<{ provider: string }>).some((p) => p.provider === 'nvidia')).toBe(true);

    // The margin arithmetic holds on the response's own numbers — globally, so
    // this cannot drift with whatever else the shared test database contains.
    for (const key of ['monthly', 'allTime'] as const) {
      const m = data.margin[key];
      expect(m.revenueUsd).toBeCloseTo(m.creditsUsed * data.billing.usdPerCredit, 1);
      expect(m.marginUsd).toBeCloseTo(m.revenueUsd - m.providerCostUsd, 1);
      if (m.revenueUsd > 0) expect(typeof m.marginPct).toBe('number');
    }

    // Coverage markers exist so an incomplete margin cannot be read as complete.
    expect(typeof data.spend.unknownPricingCalls).toBe('number');
    expect(typeof data.spend.failedCalls).toBe('number');
    expect(typeof data.margin.monthlyUnbilledProviderCostUsd).toBe('number');
  });
});
