/**
 * LLM Fallback Chain Unit Tests
 *
 * Verifies the multi-provider chain in the LLM service:
 *   1. Provider selection order (OpenRouter → NVIDIA NIM → LiteLLM → Ollama)
 *   2. URL normalization (no double /v1 for NVIDIA-style base URLs)
 *   3. Escalation when a provider fails (5xx exhaust → next provider)
 *   4. Fast escalation on 4xx client errors (other than 429)
 *   5. Auth headers per provider (Bearer for NVIDIA/LiteLLM, none for Ollama)
 *   6. All providers failing → null (structured fallback path)
 *
 * Pure unit tests — no database, no server; fetch is stubbed.
 */

import { loadConfig } from '@orq8/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProviderChain,
  chatCompletion,
  chatCompletionsEndpoint,
  getPrimaryProviderId,
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

/** Stub global fetch; handler returns { status, body? } per request URL. */
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'; // normalized — no double /v1
const LITELLM_URL = 'http://litellm.local/v1/chat/completions';
const OLLAMA_URL = 'http://ollama.local/v1/chat/completions';

const ALL_PROVIDERS = {
  OPENROUTER_API_KEY: 'sk-or-test-key',
  NVIDIA_API_KEY: 'nvapi-test-key',
  LITELLM_BASE_URL: 'http://litellm.local',
  OLLAMA_BASE_URL: 'http://ollama.local',
};

const MSG = { messages: [{ role: 'system' as const, content: 'sys' }, { role: 'user' as const, content: 'hi' }] };

describe('LLM fallback chain — provider selection', () => {
  it('builds the chain in priority order OpenRouter → NVIDIA → LiteLLM → Ollama', () => {
    const chain = buildProviderChain(makeConfig(ALL_PROVIDERS));
    expect(chain.map((p) => p.id)).toEqual(['openrouter', 'nvidia', 'litellm', 'ollama']);
    expect(chain[0]!.defaultModel).toBe('openai/gpt-4o-mini'); // OPENROUTER_MODEL default
    expect(chain[1]!.defaultModel).toContain('nvidia');
    expect(chain[3]!.defaultModel).toBe('llama3.1'); // OLLAMA_MODEL default
    expect(getPrimaryProviderId(makeConfig(ALL_PROVIDERS))).toBe('openrouter');
  });

  it('includes only configured providers', () => {
    expect(buildProviderChain(makeConfig({ LITELLM_BASE_URL: 'http://litellm.local' })).map((p) => p.id)).toEqual(['litellm']);
    expect(buildProviderChain(makeConfig({ OLLAMA_BASE_URL: 'http://ollama.local' })).map((p) => p.id)).toEqual(['ollama']);
    expect(getPrimaryProviderId(makeConfig({ OLLAMA_BASE_URL: 'http://ollama.local' }))).toBe('ollama');
    expect(buildProviderChain(makeConfig({}))).toEqual([]);
    expect(getPrimaryProviderId(makeConfig({}))).toBeNull();
  });

  it('ollama only participates when its base URL is set', () => {
    const chain = buildProviderChain(makeConfig({ NVIDIA_API_KEY: 'nvapi-test-key' }));
    expect(chain.map((p) => p.id)).toEqual(['nvidia']); // no ollama unless OLLAMA_BASE_URL
  });
});

describe('LLM fallback chain — OpenRouter is primary', () => {
  it('puts OpenRouter ahead of NVIDIA when both are configured', () => {
    const config = makeConfig({ OPENROUTER_API_KEY: 'sk-or-test-key', NVIDIA_API_KEY: 'nvapi-test-key' });
    const chain = buildProviderChain(config);
    expect(chain.map((p) => p.id)).toEqual(['openrouter', 'nvidia']);
    expect(getPrimaryProviderId(config)).toBe('openrouter');
  });

  it('routes to OpenRouter alone when it is the only credential', () => {
    const config = makeConfig({ OPENROUTER_API_KEY: 'sk-or-test-key' });
    expect(buildProviderChain(config).map((p) => p.id)).toEqual(['openrouter']);
    expect(getPrimaryProviderId(config)).toBe('openrouter');
  });

  it('serves a real call from OpenRouter without touching the fallbacks', async () => {
    const config = makeConfig(ALL_PROVIDERS);
    const { calls } = stubFetch((call) =>
      call.url === OPENROUTER_URL ? { status: 200, body: okBody() } : { status: 500 },
    );

    const res = await chatCompletion(config, MSG);
    expect(res).not.toBeNull();
    expect(calls.map((c) => c.url)).toEqual([OPENROUTER_URL]); // NVIDIA never needed
  });

  it('keeps the development providers last so local config cannot lead a call', () => {
    const ids = buildProviderChain(makeConfig(ALL_PROVIDERS)).map((p) => p.id);
    expect(ids.slice(0, 2)).toEqual(['openrouter', 'nvidia']);
    expect(ids.slice(2)).toEqual(['litellm', 'ollama']);
  });
});

describe('LLM fallback chain — URL normalization', () => {
  it('NVIDIA-style base URLs ending in /v1 do not double up the path', () => {
    expect(chatCompletionsEndpoint('https://openrouter.ai/api/v1')).toBe(OPENROUTER_URL);
    expect(chatCompletionsEndpoint('https://openrouter.ai/api/v1/')).toBe(OPENROUTER_URL);
    expect(chatCompletionsEndpoint('https://integrate.api.nvidia.com/v1')).toBe(NVIDIA_URL);
    expect(chatCompletionsEndpoint('https://integrate.api.nvidia.com/v1/')).toBe(NVIDIA_URL);
    expect(chatCompletionsEndpoint('http://litellm.local')).toBe(LITELLM_URL);
    expect(chatCompletionsEndpoint('http://ollama.local/')).toBe(OLLAMA_URL);
  });
});

describe('LLM fallback chain — escalation', () => {
  it('escalates past a 5xx-exhausted provider to the next one in the chain', async () => {
    const config = makeConfig(ALL_PROVIDERS);
    const { calls } = stubFetch((call) => {
      if (call.url === OPENROUTER_URL) return { status: 500 };
      if (call.url === NVIDIA_URL) return { status: 500 };
      if (call.url === LITELLM_URL) return { status: 500 };
      return { status: 200, body: okBody() };
    });

    const res = await chatCompletion(config, { ...MSG, retries: 0 }); // no backoff sleeps
    expect(res).not.toBeNull();
    expect(res!.choices[0]!.message.content).toBe('hello from model');
    // Every provider ahead of Ollama was attempted, in order
    expect(calls.map((c) => c.url)).toEqual([OPENROUTER_URL, NVIDIA_URL, LITELLM_URL, OLLAMA_URL]);
  });

  it('escalates fast on 4xx client errors without burning retries', async () => {
    const config = makeConfig(ALL_PROVIDERS);
    const { calls } = stubFetch((call) => {
      if (call.url === OPENROUTER_URL) return { status: 401 }; // invalid key — no point retrying OpenRouter
      return { status: 200, body: okBody() };
    });

    const res = await chatCompletion(config, MSG);
    expect(res).not.toBeNull();
    // Exactly one OpenRouter attempt despite default retries=2 (4xx breaks fast),
    // then NVIDIA serves the request — LiteLLM/Ollama never need to run.
    expect(calls.map((c) => c.url)).toEqual([OPENROUTER_URL, NVIDIA_URL]);
  });

  it('retries 429 within the same provider before escalating', async () => {
    const config = makeConfig(ALL_PROVIDERS);
    const { calls } = stubFetch((call) => {
      if (call.url === OPENROUTER_URL) return { status: 429 };
      return { status: 200, body: okBody() };
    });

    const res = await chatCompletion(config, { ...MSG, retries: 1, retryDelayMs: 1 }); // 2 attempts per provider, tiny delay
    expect(res).not.toBeNull();
    const openrouterCalls = calls.filter((c) => c.url === OPENROUTER_URL);
    expect(openrouterCalls.length).toBeGreaterThanOrEqual(2); // retried the rate limit
  });

  it('returns null when every provider in the chain fails', async () => {
    const config = makeConfig(ALL_PROVIDERS);
    const { calls } = stubFetch(() => ({ status: 503 }));

    const res = await chatCompletion(config, { ...MSG, retries: 0 });
    expect(res).toBeNull();
    expect(calls.map((c) => c.url)).toEqual([OPENROUTER_URL, NVIDIA_URL, LITELLM_URL, OLLAMA_URL]);
  });

  it('returns null without calling fetch when no provider is configured', async () => {
    const config = makeConfig({});
    const { mock, calls } = stubFetch(() => ({ status: 200, body: okBody() }));

    const res = await chatCompletion(config, MSG);
    expect(res).toBeNull();
    expect(calls).toHaveLength(0);
    expect(mock).not.toHaveBeenCalled();
  });
});

describe('LLM fallback chain — auth headers', () => {
  it('sends Bearer keys for OpenRouter/NVIDIA/LiteLLM and no Authorization for Ollama', async () => {
    const config = makeConfig(ALL_PROVIDERS);
    const { calls } = stubFetch((call) => {
      if (call.url === OPENROUTER_URL) return { status: 401 }; // escalate past openrouter
      if (call.url === NVIDIA_URL) return { status: 401 }; // escalate past nvidia
      if (call.url === LITELLM_URL) return { status: 401 }; // escalate past litellm
      return { status: 200, body: okBody() };
    });

    await chatCompletion(config, MSG);

    const openrouter = calls.find((c) => c.url === OPENROUTER_URL)!;
    const nvidia = calls.find((c) => c.url === NVIDIA_URL)!;
    const litellm = calls.find((c) => c.url === LITELLM_URL)!;
    const ollama = calls.find((c) => c.url === OLLAMA_URL)!;
    expect(openrouter).toBeDefined();
    expect(nvidia).toBeDefined();
    expect(litellm).toBeDefined();
    expect(ollama).toBeDefined();
    expect((openrouter.init!.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test-key');
    expect((nvidia.init!.headers as Record<string, string>).Authorization).toBe('Bearer nvapi-test-key');
    expect((litellm.init!.headers as Record<string, string>).Authorization).toBe('Bearer sk-orq8-dev-litellm');
    expect((ollama.init!.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
