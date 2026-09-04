/**
 * LLM Timeout Unit Tests
 *
 * Verifies the two-stage request timeout in the LLM service (docs/22):
 *   1. A provider function that HANGS instead of 404ing (unprovisioned) is
 *      aborted after LLM_HEADERS_TIMEOUT_MS and the chain escalates fast.
 *   2. A hanging NVIDIA model does not burn one timeout per key — same-account
 *      keys share the hang, so the remaining keys are skipped for that model.
 *   3. Normal (answering) requests still return their response unchanged.
 *
 * Pure unit tests — no database, no server; fetch is stubbed with a mock that
 * honors the abort signal so timeouts fire deterministically.
 */

import { loadConfig } from '@orq8/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chatCompletion,
  type ChatCompletionResponse,
} from '../src/services/llm.js';

type FetchCall = { url: string; init?: RequestInit };

type HandlerResult = { status: number; body?: ChatCompletionResponse };

function makeConfig(overrides: Record<string, string> = {}): ReturnType<typeof loadConfig> {
  return loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...overrides } as NodeJS.ProcessEnv);
}

function okBody(): ChatCompletionResponse {
  return {
    id: 'cmpl-timeout-test',
    object: 'chat.completion',
    created: 0,
    model: 'provider-model',
    choices: [{ index: 0, message: { role: 'assistant', content: 'hello from model' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

/**
 * Stub global fetch with an abort-signal-aware mock.
 * When the handler returns `undefined`, the request hangs until the caller
 * aborts (rejecting with the abort reason, like a real fetch) — this is how
 * we simulate a provider function that hangs instead of 404ing.
 */
function stubFetchSignalAware(
  handler: (call: FetchCall) => HandlerResult | Promise<HandlerResult> | undefined,
): { calls: FetchCall[]; mock: ReturnType<typeof vi.fn> } {
  const calls: FetchCall[] = [];
  const mock = vi.fn(
    (url: unknown, init?: unknown) =>
      new Promise<{
        ok: boolean;
        status: number;
        json: () => Promise<ChatCompletionResponse>;
      }>((resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        const call = { url: String(url), init: init as RequestInit | undefined };
        calls.push(call);
        signal?.addEventListener('abort', () => {
          const reason = (signal as AbortSignal).reason;
          reject(reason instanceof Error ? reason : new DOMException('aborted', 'AbortError'));
        });
        const res = handler(call);
        if (res === undefined) return; // hangs until aborted
        Promise.resolve(res).then((r) =>
          resolve({
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body as ChatCompletionResponse,
          }),
        );
      }),
  );
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LLM two-stage timeouts', () => {
  it('fails a hanging provider fast and escalates to the next provider', async () => {
    const config = makeConfig({
      NVIDIA_API_KEY: 'nvapi-hang',
      OLLAMA_BASE_URL: 'http://localhost:11434',
      LLM_HEADERS_TIMEOUT_MS: '150',
      LLM_TIMEOUT_MS: '2000',
    });
    const { calls } = stubFetchSignalAware((call) => {
      if (call.url.includes('11434')) return { status: 200, body: okBody() };
      return undefined; // NVIDIA NIM hangs (unprovisioned function)
    });

    const started = Date.now();
    const result = await chatCompletion(config, {
      messages: [{ role: 'user', content: 'hi' }],
    });
    const elapsed = Date.now() - started;

    // The chain moved on and the working provider served the call
    expect(result?.choices?.[0]?.message?.content).toBe('hello from model');
    expect(calls.filter((c) => c.url.includes('integrate.api.nvidia.com')).length).toBe(1);
    expect(calls.filter((c) => c.url.includes('11434')).length).toBe(1);
    // Aborted at the headers deadline — nowhere near the old 2-minute stall
    expect(elapsed).toBeLessThan(5_000);
  });

  it('skips remaining same-account keys when a model hangs (no timeout per key)', async () => {
    const config = makeConfig({
      NVIDIA_API_KEY: 'nvapi-hang1',
      NVIDIA_API_KEYS: 'nvapi-hang2,nvapi-hang3',
      OLLAMA_BASE_URL: 'http://localhost:11434',
      LLM_HEADERS_TIMEOUT_MS: '150',
      LLM_TIMEOUT_MS: '2000',
    });
    const { calls } = stubFetchSignalAware((call) => {
      if (call.url.includes('11434')) return { status: 200, body: okBody() };
      return undefined; // every NVIDIA key hangs for this model
    });

    const result = await chatCompletion(config, {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result?.choices?.[0]?.message?.content).toBe('hello from model');
    const nvidiaCalls = calls.filter((c) => c.url.includes('integrate.api.nvidia.com'));
    // One key attempted, not three — a dead model costs one timeout, not N
    expect(nvidiaCalls.length).toBe(1);
  });

  it('returns a normal response unchanged when the provider answers', async () => {
    const config = makeConfig({ NVIDIA_API_KEY: 'nvapi-ok' });
    const { calls } = stubFetchSignalAware(() => ({ status: 200, body: okBody() }));

    const result = await chatCompletion(config, {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result?.choices?.[0]?.message?.content).toBe('hello from model');
    expect(calls.length).toBe(1);
  });
});