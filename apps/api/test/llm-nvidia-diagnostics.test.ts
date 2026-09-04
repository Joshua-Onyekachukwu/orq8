/**
 * NVIDIA 404 Diagnostics Unit Tests
 *
 * Verifies:
 *   1. parseNvidia404Body extracts Account ID from NVIDIA error responses
 *   2. buildNvidia404Hint generates actionable guidance text
 *   3. chatCompletion surfaces diagnostics when 404 body contains Account ID
 *   4. popNvidiaDiagnostics returns and clears pending warnings per org
 *
 * Pure unit tests — no database, no server; fetch is stubbed.
 */

import { loadConfig } from '@orq8/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNvidiaDiagnostics,
  __resetNvidiaKeyCursor,
  buildNvidia404Hint,
  chatCompletion,
  parseNvidia404Body,
  popNvidiaDiagnostics,
  type ChatCompletionResponse,
} from '../src/services/llm.js';

type FetchCall = { url: string; init?: RequestInit };

function makeConfig(overrides: Record<string, string> = {}): ReturnType<typeof loadConfig> {
  return loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...overrides } as NodeJS.ProcessEnv);
}

function okBody(): ChatCompletionResponse {
  return {
    id: 'cmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'provider-model',
    choices: [{ index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
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

beforeEach(() => {
  __resetNvidiaKeyCursor();
  __resetNvidiaDiagnostics();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __resetNvidiaDiagnostics();
});

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MSG = { messages: [{ role: 'system' as const, content: 'sys' }, { role: 'user' as const, content: 'hi' }] };

// ─── parseNvidia404Body ─────────────────────────────────────────────────────

describe('parseNvidia404Body', () => {
  it('extracts Account ID from standard NVIDIA 404 response', async () => {
    const response = new Response(
      JSON.stringify({ detail: 'Function not found for account [Account ID: org-abc123-def]' }),
      { status: 404 },
    );
    const result = await parseNvidia404Body(response);
    expect(result).toEqual({
      accountId: 'org-abc123-def',
      nvidiaDetail: 'Function not found for account [Account ID: org-abc123-def]',
    });
  });

  it('extracts Account ID from parenthesized variant', async () => {
    const response = new Response(
      JSON.stringify({ detail: 'Function not found for account (Account ID: nvapi-org-999)' }),
      { status: 404 },
    );
    const result = await parseNvidia404Body(response);
    expect(result?.accountId).toBe('nvapi-org-999');
  });

  it('returns nvidiaDetail but no accountId when none present', async () => {
    const response = new Response(
      JSON.stringify({ detail: 'Function not found for account.' }),
      { status: 404 },
    );
    const result = await parseNvidia404Body(response);
    expect(result).toEqual({
      accountId: undefined,
      nvidiaDetail: 'Function not found for account.',
    });
  });

  it('returns undefined for non-JSON body', async () => {
    const response = new Response('plain text error', { status: 404 });
    const result = await parseNvidia404Body(response);
    expect(result).toBeUndefined();
  });

  it('returns undefined when body has no detail field', async () => {
    const response = new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    const result = await parseNvidia404Body(response);
    expect(result).toBeUndefined();
  });
});

// ─── buildNvidia404Hint ─────────────────────────────────────────────────────

describe('buildNvidia404Hint', () => {
  it('includes Account ID when provided', () => {
    const hint = buildNvidia404Hint('org-abc123');
    expect(hint).toContain('org-abc123');
    expect(hint).toContain('Public API Endpoints');
    expect(hint).toContain('build.nvidia.com');
  });

  it('omits Account ID when not provided', () => {
    const hint = buildNvidia404Hint(undefined);
    expect(hint).toContain('Public API Endpoints');
    expect(hint).not.toContain('org-');
  });
});

// ─── chatCompletion diagnostic collection ────────────────────────────────────

describe('chatCompletion — NVIDIA 404 diagnostics', () => {
  const ORG_ID = 'test-org-diag-1';
  const NVIDIA_MODEL = 'nvidia/some-model';

  it('collects diagnostic with Account ID when NVIDIA returns 404', async () => {
    const config = makeConfig({
      NVIDIA_API_KEY: 'nvapi-test-key',
      NVIDIA_MODEL,
    });

    stubFetch((call) => {
      if (call.url === NVIDIA_URL) {
        return {
          status: 404,
          body: { detail: 'Function not found for account [Account ID: org-xyz-789]' },
        };
      }
      return { status: 200, body: okBody() };
    });

    await chatCompletion(config, {
      ...MSG,
      _trace: { orgId: ORG_ID, phase: 'intent_analysis' },
      retries: 0,
      retryDelayMs: 0,
    });

    const diags = popNvidiaDiagnostics(ORG_ID);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.model).toBe(NVIDIA_MODEL);
    expect(diags[0]!.accountId).toBe('org-xyz-789');
    expect(diags[0]!.hint).toContain('org-xyz-789');
    expect(diags[0]!.nvidiaDetail).toContain('Function not found');
  });

  it('collects diagnostic even when 404 body has no Account ID', async () => {
    const config = makeConfig({
      NVIDIA_API_KEY: 'nvapi-test-key',
      NVIDIA_MODEL,
    });

    stubFetch((call) => {
      if (call.url === NVIDIA_URL) {
        return {
          status: 404,
          body: { detail: 'Function not found for account.' },
        };
      }
      return { status: 200, body: okBody() };
    });

    await chatCompletion(config, {
      ...MSG,
      _trace: { orgId: ORG_ID, phase: 'intent_analysis' },
      retries: 0,
      retryDelayMs: 0,
    });

    const diags = popNvidiaDiagnostics(ORG_ID);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.accountId).toBeUndefined();
    expect(diags[0]!.hint).toContain('Public API Endpoints');
  });

  it('does NOT collect diagnostics when NVIDIA succeeds', async () => {
    const config = makeConfig({
      NVIDIA_API_KEY: 'nvapi-test-key',
      NVIDIA_MODEL,
    });

    stubFetch(() => ({ status: 200, body: okBody() }));

    await chatCompletion(config, {
      ...MSG,
      _trace: { orgId: ORG_ID, phase: 'intent_analysis' },
    });

    const diags = popNvidiaDiagnostics(ORG_ID);
    expect(diags).toHaveLength(0);
  });

  it('pops diagnostics (one-shot read)', async () => {
    const config = makeConfig({
      NVIDIA_API_KEY: 'nvapi-test-key',
      NVIDIA_MODEL,
    });

    stubFetch((call) => {
      if (call.url === NVIDIA_URL) {
        return {
          status: 404,
          body: { detail: 'Function not found for account [Account ID: acct-123]' },
        };
      }
      return { status: 200, body: okBody() };
    });

    await chatCompletion(config, {
      ...MSG,
      _trace: { orgId: ORG_ID, phase: 'intent_analysis' },
      retries: 0,
      retryDelayMs: 0,
    });

    // First pop returns the diagnostics
    const first = popNvidiaDiagnostics(ORG_ID);
    expect(first).toHaveLength(1);

    // Second pop returns empty (consumed)
    const second = popNvidiaDiagnostics(ORG_ID);
    expect(second).toHaveLength(0);
  });

  it('model fallbacks collect diagnostics for each failing model', async () => {
    const config = makeConfig({
      NVIDIA_API_KEY: 'nvapi-test-key',
      NVIDIA_MODEL: 'nvidia/model-a',
      NVIDIA_MODEL_FALLBACKS: 'nvidia/model-b',
    });

    stubFetch(() => ({
      status: 404,
      body: { detail: 'Function not found for account [Account ID: acct-456]' },
    }));

    await chatCompletion(config, {
      ...MSG,
      _trace: { orgId: ORG_ID, phase: 'intent_analysis' },
      retries: 0,
      retryDelayMs: 0,
    });

    const diags = popNvidiaDiagnostics(ORG_ID);
    // Both models 404 → two diagnostic entries
    expect(diags).toHaveLength(2);
    expect(diags.map((d) => d.model)).toEqual(['nvidia/model-a', 'nvidia/model-b']);
    expect(diags[0]!.accountId).toBe('acct-456');
  });

  it('NVIDIA 404 → diagnostics collected → fallback to LiteLLM → command completes', async () => {
    const LITELLM_URL = 'http://litellm.local/v1/chat/completions';
    const config = makeConfig({
      NVIDIA_API_KEY: 'nvapi-test-key',
      NVIDIA_MODEL: 'nvidia/nemotron-3-super-120b-a12b',
      LITELLM_BASE_URL: 'http://litellm.local',
    });

    const calls: FetchCall[] = [];
    stubFetch((call) => {
      calls.push(call);
      // NVIDIA returns 404 with Account ID
      if (call.url === NVIDIA_URL) {
        return {
          status: 404,
          body: { detail: 'Function not found for account [Account ID: org-scope-missing-123]' },
        };
      }
      // LiteLLM succeeds
      if (call.url === LITELLM_URL) {
        return { status: 200, body: okBody() };
      }
      return { status: 500 };
    });

    const result = await chatCompletion(config, {
      ...MSG,
      _trace: { orgId: ORG_ID, phase: 'intent_analysis' },
      retries: 0,
      retryDelayMs: 0,
    });

    // 1. Command completed via LiteLLM fallback
    expect(result).not.toBeNull();
    expect(result!.choices[0]!.message.content).toBe('hello');

    // 2. NVIDIA was tried first, then LiteLLM served
    expect(calls.map((c) => c.url)).toEqual([NVIDIA_URL, LITELLM_URL]);

    // 3. Diagnostics were collected with Account ID
    const diags = popNvidiaDiagnostics(ORG_ID);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.model).toBe('nvidia/nemotron-3-super-120b-a12b');
    expect(diags[0]!.accountId).toBe('org-scope-missing-123');
    expect(diags[0]!.hint).toContain('Public API Endpoints');
    expect(diags[0]!.hint).toContain('org-scope-missing-123');
  });
});
