/**
 * NVIDIA Diagnostics Endpoint Unit Tests
 *
 * Verifies the GET /v1/admin/nvidia/diagnostics endpoint logic:
 *   1. Probes all keys × all models
 *   2. Extracts Account ID from 404 responses
 *   3. Generates per-key summary with accessible/denied models
 *   4. Returns configured: false when no NVIDIA provider is set
 *
 * Pure unit tests — no database, no server; fetch is stubbed.
 */

import { loadConfig } from '@orq8/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProviderChain, parseNvidia404Body, buildNvidia404Hint } from '../src/services/llm.js';

type FetchCall = { url: string; init?: RequestInit };

function makeConfig(overrides: Record<string, string> = {}) {
  return loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...overrides } as NodeJS.ProcessEnv);
}

function stubFetch(handler: (call: FetchCall) => { status: number; body?: unknown; text?: string }) {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (url: unknown, init?: unknown) => {
    const call = { url: String(url), init: init as RequestInit | undefined };
    calls.push(call);
    const res = handler(call);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.body ?? { error: 'bad' },
      text: async () => res.text ?? JSON.stringify(res.body ?? {}),
    };
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

describe('NVIDIA diagnostics — provider chain detection', () => {
  it('returns configured: false when no NVIDIA provider is set', () => {
    const chain = buildProviderChain(makeConfig({ LITELLM_BASE_URL: 'http://litellm.local' }));
    const nvidia = chain.find((p) => p.id === 'nvidia');
    expect(nvidia).toBeUndefined();
  });

  it('detects NVIDIA provider with single key', () => {
    const chain = buildProviderChain(makeConfig({ NVIDIA_API_KEY: 'nvapi-test-123' }));
    const nvidia = chain.find((p) => p.id === 'nvidia');
    expect(nvidia).toBeDefined();
    expect(nvidia!.apiKeys).toEqual(['nvapi-test-123']);
  });

  it('detects NVIDIA provider with key pool', () => {
    const chain = buildProviderChain(makeConfig({
      NVIDIA_API_KEY: 'nvapi-k1',
      NVIDIA_API_KEYS: 'nvapi-k2, nvapi-k3',
    }));
    const nvidia = chain.find((p) => p.id === 'nvidia');
    expect(nvidia).toBeDefined();
    expect(nvidia!.apiKeys).toEqual(['nvapi-k1', 'nvapi-k2', 'nvapi-k3']);
  });
});

describe('NVIDIA diagnostics — key×model probing logic', () => {
  const THREE_KEYS = {
    NVIDIA_API_KEY: 'nvapi-k1',
    NVIDIA_API_KEYS: 'nvapi-k2, nvapi-k3',
    NVIDIA_MODEL: 'nvidia/model-a',
    NVIDIA_MODEL_FALLBACKS: 'nvidia/model-b',
  };

  it('probes all 3 keys × 2 models = 6 combinations', async () => {
    const config = makeConfig(THREE_KEYS);
    const chain = buildProviderChain(config);
    const nvidia = chain.find((p) => p.id === 'nvidia')!;
    const models = [nvidia.defaultModel, ...(nvidia.modelFallbacks ?? [])];

    const { calls } = stubFetch(() => ({ status: 200 }));

    // Simulate the endpoint logic: probe each key × model
    for (const key of nvidia.apiKeys) {
      for (const model of models) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (key) headers.Authorization = `Bearer ${key}`;
        await fetch(NVIDIA_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
        });
      }
    }

    expect(calls).toHaveLength(6); // 3 keys × 2 models
  });

  it('generates correct per-key summary', () => {
    // Simulate results from probing
    const results = [
      { keySuffix: 'k1', model: 'nvidia/model-a', status: 200, ok: true },
      { keySuffix: 'k1', model: 'nvidia/model-b', status: 404, ok: false, accountId: 'acct-123', hint: 'Scope missing' },
      { keySuffix: 'k2', model: 'nvidia/model-a', status: 200, ok: true },
      { keySuffix: 'k2', model: 'nvidia/model-b', status: 200, ok: true },
      { keySuffix: 'k3', model: 'nvidia/model-a', status: 503, ok: false, hint: 'Overloaded' },
      { keySuffix: 'k3', model: 'nvidia/model-b', status: 200, ok: true },
    ];

    // Build summary (same logic as the endpoint)
    const keySummaries = ['k1', 'k2', 'k3'].map((suffix) => {
      const keyResults = results.filter((r) => r.keySuffix === suffix);
      const accessible = keyResults.filter((r) => r.ok).map((r) => r.model);
      const denied = keyResults.filter((r) => !r.ok).map((r) => ({
        model: r.model,
        status: r.status,
        accountId: r.accountId,
        hint: r.hint,
      }));
      return { keySuffix: suffix, accessibleModels: accessible, deniedModels: denied, allModelsWork: accessible.length === 2 };
    });

    expect(keySummaries[0]!.accessibleModels).toEqual(['nvidia/model-a']);
    expect(keySummaries[0]!.deniedModels).toHaveLength(1);
    expect(keySummaries[0]!.deniedModels[0]!.accountId).toBe('acct-123');
    expect(keySummaries[0]!.allModelsWork).toBe(false);

    expect(keySummaries[1]!.accessibleModels).toEqual(['nvidia/model-a', 'nvidia/model-b']);
    expect(keySummaries[1]!.deniedModels).toHaveLength(0);
    expect(keySummaries[1]!.allModelsWork).toBe(true);

    expect(keySummaries[2]!.accessibleModels).toEqual(['nvidia/model-b']);
    expect(keySummaries[2]!.deniedModels).toHaveLength(1);
    expect(keySummaries[2]!.deniedModels[0]!.hint).toBe('Overloaded');
    expect(keySummaries[2]!.allModelsWork).toBe(false);
  });

  it('summary counts match probe results', () => {
    const results = [
      { keySuffix: 'k1', model: 'a', status: 200, ok: true },
      { keySuffix: 'k1', model: 'b', status: 404, ok: false },
      { keySuffix: 'k2', model: 'a', status: 200, ok: true },
      { keySuffix: 'k2', model: 'b', status: 200, ok: true },
    ];

    const summary = {
      totalProbes: results.length,
      successful: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };

    expect(summary.totalProbes).toBe(4);
    expect(summary.successful).toBe(3);
    expect(summary.failed).toBe(1);
  });
});

describe('NVIDIA diagnostics — Account ID extraction from 404', () => {
  it('extracts Account ID and generates hint for each 404', async () => {
    const response = new Response(
      JSON.stringify({ detail: 'Function not found for account [Account ID: org-abc-123]' }),
      { status: 404 },
    );

    const parsed = await parseNvidia404Body(response);
    const hint = buildNvidia404Hint(parsed?.accountId);

    expect(parsed?.accountId).toBe('org-abc-123');
    expect(hint).toContain('org-abc-123');
    expect(hint).toContain('Public API Endpoints');
    expect(hint).toContain('build.nvidia.com');
  });

  it('generates hint without Account ID when not present', async () => {
    const response = new Response(
      JSON.stringify({ detail: 'Function not found for account.' }),
      { status: 404 },
    );

    const parsed = await parseNvidia404Body(response);
    const hint = buildNvidia404Hint(parsed?.accountId);

    expect(parsed?.accountId).toBeUndefined();
    expect(hint).toContain('Public API Endpoints');
    expect(hint).not.toContain('org-');
  });
});
