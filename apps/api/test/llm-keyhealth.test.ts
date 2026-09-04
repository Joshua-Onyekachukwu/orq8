/**
 * Per-key 429 smoothing unit tests (docs/22).
 *
 * Under sustained parallel load the round-robin keeps re-picking a key that
 * is being rate-limited, burning a 429 + backoff before failing over. These
 * tests verify the health tracker: keys with recent 429s are deprioritized
 * (sink to the tail of the attempt order), all-hot pools still work (keys are
 * never excluded), and resetting the tracker restores plain round-robin.
 *
 * Pure unit tests — no database, no server; fetch is stubbed.
 */

import { loadConfig } from '@orq8/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNvidiaKeyCursor,
  __resetNvidiaKeyHealth,
  chatCompletion,
  type ChatCompletionResponse,
} from '../src/services/llm.js';

const KEY_A = 'nvapi-key-a-aaaaaaaaaaaaaaaaaaaa';
const KEY_B = 'nvapi-key-b-bbbbbbbbbbbbbbbbbbbb';
const KEY_C = 'nvapi-key-c-cccccccccccccccccccc';

type HandlerResult = { status: number; body?: ChatCompletionResponse };

function makeConfig(overrides: Record<string, string> = {}): ReturnType<typeof loadConfig> {
  return loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...overrides } as NodeJS.ProcessEnv);
}

function okBody(): ChatCompletionResponse {
  return {
    id: 'cmpl-health-test',
    object: 'chat.completion',
    created: 0,
    model: 'provider-model',
    choices: [{ index: 0, message: { role: 'assistant', content: 'hello from model' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

/** Stub fetch, recording the key used per call (from the Authorization header). */
function stubFetchWithKeys(
  handler: (call: { url: string; key?: string }) => HandlerResult | undefined,
): { calls: Array<{ url: string; key?: string }> } {
  const calls: Array<{ url: string; key?: string }> = [];
  const mock = vi.fn(
    (url: unknown, init?: unknown) =>
      new Promise<{
        ok: boolean;
        status: number;
        json: () => Promise<ChatCompletionResponse>;
        headers: { get: () => null };
      }>((resolve, reject) => {
        const headers = (init as { headers?: Record<string, string> })?.headers;
        const auth = headers?.Authorization;
        const key = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : undefined;
        calls.push({ url: String(url), key });
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener('abort', () => {
          const reason = (signal as AbortSignal).reason;
          reject(reason instanceof Error ? reason : new DOMException('aborted', 'AbortError'));
        });
        const res = handler({ url: String(url), key });
        if (res === undefined) return; // hang until aborted
        Promise.resolve(res).then((r) =>
          resolve({
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body as ChatCompletionResponse,
            headers: { get: () => null },
          }),
        );
      }),
  );
  vi.stubGlobal('fetch', mock);
  return { calls };
}

function keyPoolConfig(): ReturnType<typeof loadConfig> {
  return makeConfig({
    NVIDIA_API_KEY: KEY_A,
    NVIDIA_API_KEYS: `${KEY_B},${KEY_C}`,
  });
}

async function runCommand(): Promise<ChatCompletionResponse | null> {
  return chatCompletion(keyPoolConfig(), {
    messages: [{ role: 'user', content: 'hi' }],
    retries: 0, // one 429 moves straight to the next key — deterministic health accumulation
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetNvidiaKeyCursor();
  __resetNvidiaKeyHealth();
});

describe('per-key 429 smoothing', () => {
  it('deprioritizes a key after repeated 429s', async () => {
    const { calls } = stubFetchWithKeys((call) => {
      if (call.key === KEY_A) return { status: 429 };
      return { status: 200, body: okBody() };
    });

    // Run 1: A → 429 (1 hit), B serves. Run 2: A → 429 (2 hits → hot), B serves.
    await __resetNvidiaKeyCursor();
    expect(await runCommand()).not.toBeNull();
    await __resetNvidiaKeyCursor();
    expect(await runCommand()).not.toBeNull();

    // Run 3: A is hot → it must sink to the tail; B (cold) is tried first and
    // serves immediately, so A is not attempted at all.
    await __resetNvidiaKeyCursor();
    expect(await runCommand()).not.toBeNull();

    // Each of the first two runs attempted [A, B]; the third must start at B.
    expect(calls.slice(0, 4).map((c) => c.key)).toEqual([KEY_A, KEY_B, KEY_A, KEY_B]);
    expect(calls.slice(4).map((c) => c.key)).toEqual([KEY_B]);
  });

  it('still tries keys when the whole pool is hot (no starvation)', async () => {
    let mode: '429' | '200' = '429';
    const { calls } = stubFetchWithKeys(() =>
      mode === '429' ? { status: 429 } : { status: 200, body: okBody() },
    );

    await __resetNvidiaKeyCursor();
    expect(await runCommand()).toBeNull(); // every key 429'd → null
    await __resetNvidiaKeyCursor();
    expect(await runCommand()).toBeNull(); // every key now has 2 hits → all hot

    // All keys hot, but none may be excluded — the first hot key still serves.
    mode = '200';
    await __resetNvidiaKeyCursor();
    expect(await runCommand()).not.toBeNull();

    const keys = calls.map((c) => c.key);
    expect(keys.length).toBe(7); // 3 + 3 + 1
    expect(keys.slice(6)).toEqual([KEY_A]); // r3: A attempted first and served
  });

  it('restores plain round-robin after health is reset', async () => {
    const { calls } = stubFetchWithKeys((call) => {
      if (call.key === KEY_A) return { status: 429 };
      return { status: 200, body: okBody() };
    });

    await __resetNvidiaKeyCursor();
    await runCommand(); // A: 1 hit
    await __resetNvidiaKeyCursor();
    await runCommand(); // A: 2 hits → hot

    __resetNvidiaKeyHealth(); // simulate the 60s window cooling down
    await __resetNvidiaKeyCursor();
    expect(await runCommand()).not.toBeNull();

    const keys = calls.map((c) => c.key);
    // Fresh health → plain round-robin: A is tried first again
    expect(keys.slice(4)).toEqual([KEY_A, KEY_B]);
  });

  it('leaves healthy keys untouched (A always serves first)', async () => {
    // Only C would 429 — but A serves first on every call, so C is never hit
    // and no key ever records a failure. Ordering stays pure round-robin.
    const { calls } = stubFetchWithKeys((call) => {
      if (call.key === KEY_C) return { status: 429 };
      return { status: 200, body: okBody() };
    });

    await __resetNvidiaKeyCursor();
    for (let i = 0; i < 3; i++) {
      await __resetNvidiaKeyCursor();
      expect(await runCommand()).not.toBeNull();
    }

    const keys = calls.map((c) => c.key);
    expect(keys.every((k) => k === KEY_A)).toBe(true);
  });
});