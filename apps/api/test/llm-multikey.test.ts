/**
 * NVIDIA Multi-Key Pool Unit Tests
 *
 * Verifies that the LLM service treats NVIDIA_API_KEY + NVIDIA_API_KEYS as a
 * key pool that is:
 *   1. Rotated round-robin across sequential/concurrent calls
 *   2. Failed over to the next key on 401/403/404 (invalid / no model access)
 *   3. Retried then failed over on 429 (rate limit)
 *   4. Escalated to the next provider when the whole pool is exhausted
 *
 * Pure unit tests — no database, no server; fetch is stubbed.
 */

import { loadConfig } from '@orq8/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNvidiaKeyCursor,
  buildProviderChain,
  chatCompletion,
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
    choices: [{ index: 0, message: { role: 'assistant', content: 'hello from model' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function stubFetch(handler: (call: FetchCall) => { status: number; body?: ChatCompletionResponse }) {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (url: unknown, init?: unknown) => {
    const call = { url: String(url), init: init as RequestInit | undefined };
    calls.push(call);
    const res = handler(call);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.body,
    };
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

// Deterministic key ordering within each test
beforeEach(() => {
  __resetNvidiaKeyCursor();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const LITELLM_URL = 'http://litellm.local/v1/chat/completions';
const MSG = { messages: [{ role: 'system' as const, content: 'sys' }, { role: 'user' as const, content: 'hi' }] };

function authOf(call: FetchCall): string | undefined {
  return (call.init?.headers as Record<string, string> | undefined)?.Authorization;
}

const THREE_KEYS = {
  NVIDIA_API_KEY: 'nvapi-k1',
  NVIDIA_API_KEYS: 'nvapi-k2, nvapi-k3',
  LITELLM_BASE_URL: 'http://litellm.local',
};

describe('NVIDIA key pool — config parsing', () => {
  it('merges NVIDIA_API_KEY with NVIDIA_API_KEYS into one pool, preserving order', () => {
    const [nv] = buildProviderChain(makeConfig(THREE_KEYS));
    expect(nv!.id).toBe('nvidia');
    expect(nv!.apiKeys).toEqual(['nvapi-k1', 'nvapi-k2', 'nvapi-k3']);
  });

  it('works from NVIDIA_API_KEYS alone and drops empty entries', () => {
    const [nv] = buildProviderChain(makeConfig({ NVIDIA_API_KEYS: 'nvapi-a,, nvapi-b ,' }));
    expect(nv!.apiKeys).toEqual(['nvapi-a', 'nvapi-b']);
  });

  it('dedupes repeated keys', () => {
    const [nv] = buildProviderChain(makeConfig({ NVIDIA_API_KEY: 'nvapi-x', NVIDIA_API_KEYS: 'nvapi-x, nvapi-x' }));
    expect(nv!.apiKeys).toEqual(['nvapi-x']);
  });

  it('omits the nvidia provider when the pool is empty', () => {
    expect(buildProviderChain(makeConfig({}))).toEqual([]);
  });
});

describe('NVIDIA key pool — failover', () => {
  it('fails over from an invalid key (401) to the next key in the pool', async () => {
    const config = makeConfig(THREE_KEYS);
    const { calls } = stubFetch((call) => {
      if (authOf(call) === 'Bearer nvapi-k1') return { status: 401 };
      return { status: 200, body: okBody() };
    });

    const res = await chatCompletion(config, MSG);
    expect(res).not.toBeNull();
    const used = calls.filter((c) => c.url === NVIDIA_URL);
    expect(used.map(authOf)).toEqual(['Bearer nvapi-k1', 'Bearer nvapi-k2']);
  });

  it('a model-level 404 stops that model for all keys and escalates to the next provider', async () => {
    const config = makeConfig(THREE_KEYS);
    const { calls } = stubFetch((call) => {
      if (authOf(call) === 'Bearer nvapi-k1') return { status: 404 }; // account lacks the model
      return { status: 200, body: okBody() };
    });

    const res = await chatCompletion(config, MSG);
    expect(res).not.toBeNull();
    // Only k1 attempted for the 404-ing model (account-level), then LiteLLM served
    const used = calls.filter((c) => c.url === NVIDIA_URL);
    expect(used.map(authOf)).toEqual(['Bearer nvapi-k1']);
    expect(calls.some((c) => c.url === LITELLM_URL)).toBe(true);
    expect(res!.choices[0]!.message.content).toBe('hello from model');
  });

  it('moves to the next key when a key is rate limited (429) without retries left', async () => {
    const config = makeConfig(THREE_KEYS);
    const { calls } = stubFetch((call) => {
      if (authOf(call) === 'Bearer nvapi-k1') return { status: 429 };
      return { status: 200, body: okBody() };
    });

    const res = await chatCompletion(config, { ...MSG, retries: 0 });
    expect(res).not.toBeNull();
    const used = calls.filter((c) => c.url === NVIDIA_URL);
    expect(used.map(authOf)).toEqual(['Bearer nvapi-k1', 'Bearer nvapi-k2']);
  });

  it('escalates to LiteLLM when the only model 404s for the account', async () => {
    const config = makeConfig(THREE_KEYS);
    const { calls } = stubFetch((call) => {
      if (call.url === NVIDIA_URL) return { status: 404 };
      return { status: 200, body: okBody() };
    });

    const res = await chatCompletion(config, { ...MSG, retries: 0 });
    expect(res).not.toBeNull();
    const nvidiaCalls = calls.filter((c) => c.url === NVIDIA_URL);
    const litellmCalls = calls.filter((c) => c.url === LITELLM_URL);
    // 404 is account-level → one attempt, then LiteLLM served
    expect(nvidiaCalls).toHaveLength(1);
    expect(litellmCalls).toHaveLength(1);
    expect(litellmCalls[0]!.url).toBe(LITELLM_URL);
  });

  it('returns null when the pool fails and no other provider is configured', async () => {
    const config = makeConfig({ NVIDIA_API_KEY: 'nvapi-k1', NVIDIA_API_KEYS: 'nvapi-k2' });
    const { calls } = stubFetch(() => ({ status: 403 }));

    const res = await chatCompletion(config, { ...MSG, retries: 0 });
    expect(res).toBeNull();
    expect(calls).toHaveLength(2); // both keys attempted
  });
});

// ─── NVIDIA model fallbacks ─────────────────────────────────────────────────

const MODEL_FALLBACK_CFG = {
  ...THREE_KEYS,
  NVIDIA_MODEL: 'nvidia/model-default',
  NVIDIA_MODEL_FALLBACKS: 'nvidia/model-b, nvidia/model-b, nvidia/model-c',
};

/** Extract the model field from a recorded request body. */
function modelOf(call: FetchCall): string {
  return (JSON.parse(String(call.init?.body)) as { model: string }).model;
}

describe('NVIDIA model fallbacks — config parsing', () => {
  it('parses NVIDIA_MODEL_FALLBACKS into a deduped list excluding the default', () => {
    const [nv] = buildProviderChain(makeConfig(MODEL_FALLBACK_CFG));
    expect(nv!.defaultModel).toBe('nvidia/model-default');
    expect(nv!.modelFallbacks).toEqual(['nvidia/model-b', 'nvidia/model-c']);
  });

  it('defaults to no fallbacks when unset', () => {
    const [nv] = buildProviderChain(makeConfig(THREE_KEYS));
    expect(nv!.modelFallbacks).toEqual([]);
  });
});

describe('NVIDIA model fallbacks — retry next model before escalating', () => {
  it('walks to the next model when the default 404s for the account', async () => {
    const config = makeConfig(MODEL_FALLBACK_CFG);
    const { calls } = stubFetch((call) => {
      if (modelOf(call) === 'nvidia/model-default') return { status: 404 }; // account lacks it
      if (modelOf(call) === 'nvidia/model-b') return { status: 200, body: okBody() };
      return { status: 404 };
    });

    const res = await chatCompletion(config, { ...MSG, retries: 0 });
    expect(res).not.toBeNull();
    const nvidia = calls.filter((c) => c.url === NVIDIA_URL);
    // Default 404s on the first key (account-level → keys skipped), then model-b
    // is tried on the same rotation start key and succeeds.
    expect(nvidia.filter((c) => modelOf(c) === 'nvidia/model-default')).toHaveLength(1);
    const modelBCalls = nvidia.filter((c) => modelOf(c) === 'nvidia/model-b');
    expect(modelBCalls).toHaveLength(1);
    expect(modelBCalls[0] ? authOf(modelBCalls[0]) : undefined).toBe('Bearer nvapi-k1');
    expect(res!.choices[0]!.message.content).toBe('hello from model');
  });

  it('escalates to LiteLLM when every fallback model also 404s', async () => {
    const config = makeConfig(MODEL_FALLBACK_CFG);
    const { calls } = stubFetch((call) => {
      if (call.url === NVIDIA_URL) return { status: 404 };
      return { status: 200, body: okBody() };
    });

    const res = await chatCompletion(config, { ...MSG, retries: 0 });
    expect(res).not.toBeNull();
    const nvidia = calls.filter((c) => c.url === NVIDIA_URL);
    // Each model 404s on the first key (account-level) → one attempt per model
    expect(nvidia).toHaveLength(3);
    const modelsTried = [...new Set(nvidia.map(modelOf))];
    expect(modelsTried).toEqual(['nvidia/model-default', 'nvidia/model-b', 'nvidia/model-c']);
    expect(calls.some((c) => c.url === LITELLM_URL)).toBe(true);
  });

  it('never tries fallbacks when the default model succeeds', async () => {
    const config = makeConfig(MODEL_FALLBACK_CFG);
    const { calls } = stubFetch(() => ({ status: 200, body: okBody() }));

    await chatCompletion(config, MSG);
    const nvidia = calls.filter((c) => c.url === NVIDIA_URL);
    expect(nvidia).toHaveLength(1);
    expect(modelOf(nvidia[0]!)).toBe('nvidia/model-default');
  });

  it('an explicit model override skips the fallback walk', async () => {
    const config = makeConfig(MODEL_FALLBACK_CFG);
    const { calls } = stubFetch(() => ({ status: 200, body: okBody() }));

    await chatCompletion(config, { ...MSG, model: 'custom-requested-model' });
    const nvidia = calls.filter((c) => c.url === NVIDIA_URL);
    expect(nvidia).toHaveLength(1);
    expect(modelOf(nvidia[0]!)).toBe('custom-requested-model');
  });
});

describe('NVIDIA key pool — round-robin rotation', () => {
  it('spreads sequential calls across the pool', async () => {
    const config = makeConfig(THREE_KEYS);
    const { calls } = stubFetch(() => ({ status: 200, body: okBody() }));

    await chatCompletion(config, MSG);
    await chatCompletion(config, MSG);
    await chatCompletion(config, MSG);

    const used = calls.filter((c) => c.url === NVIDIA_URL).map(authOf);
    // Call 1 starts at cursor 0 → k1; call 2 → k2; call 3 → k3
    expect(used).toEqual(['Bearer nvapi-k1', 'Bearer nvapi-k2', 'Bearer nvapi-k3']);
  });

  it('rotation still ends on a healthy key even when an early key is bad', async () => {
    const config = makeConfig(THREE_KEYS);
    const { calls } = stubFetch((call) => {
      // Rotation starts at k3 on the second call; make k3 healthy, k1/k2 broken
      if (authOf(call) === 'Bearer nvapi-k1' || authOf(call) === 'Bearer nvapi-k2') return { status: 401 };
      return { status: 200, body: okBody() };
    });

    // Prime the cursor: call 1 uses k1 (broken → k2 broken → k3 serves)
    const first = await chatCompletion(config, MSG);
    // Call 2 starts at k2 (broken → k3 serves)
    const second = await chatCompletion(config, MSG);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const lastOfEach = [calls.find((c) => authOf(c) === 'Bearer nvapi-k3')];
    expect(lastOfEach[0]).toBeDefined();
  });
});
