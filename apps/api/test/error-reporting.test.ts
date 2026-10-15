import { describe, expect, it, vi } from 'vitest';
import {
  REDACTED,
  initErrorReporting,
  scrubEvent,
  scrubText,
} from '../src/services/error-reporting.js';

/**
 * Error-reporting privacy battery (Phase 7/INFRA): before any error leaves
 * the process, emails, tokens, secrets, and request bodies are removed.
 * A scrubber that passes everything through would exfiltrate prompts and
 * credentials to a third party — these cases pin the redaction.
 */

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as never;
}

describe('scrubText removes identifiers and secrets from free text', () => {
  it('redacts email addresses but keeps surrounding prose', () => {
    const out = scrubText('login failed for founder@acme.test from Lagos');
    expect(out).toContain(REDACTED);
    expect(out).not.toContain('founder@acme.test');
    expect(out).toContain('Lagos');
  });

  it('redacts bearer tokens', () => {
    const out = scrubText('upstream 401, header Bearer abc.def.ghi rejected');
    expect(out).not.toContain('abc.def.ghi');
    expect(out).toContain(`Bearer ${REDACTED}`);
  });

  it('redacts key=value secrets', () => {
    const out = scrubText('config dump: {"password": "hunter2", "ok": true}');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('"ok": true');
  });

  it('leaves ordinary error prose untouched', () => {
    const msg = 'ECONNREFUSED to pooler:5432 after 3 attempts';
    expect(scrubText(msg)).toBe(msg);
  });
});

describe('scrubEvent strips request-shaped and secret-shaped fields', () => {
  it('drops bodies, headers, cookies, and secret keys wholesale', () => {
    const event = scrubEvent({
      message: 'task failed',
      request: { body: { prompt: 'secret plan' }, headers: { authorization: 'Bearer x' } },
      password: 'hunter2',
      taskId: 't-1',
    })!;

    expect(event.request).toBe(REDACTED);
    expect(event.password).toBe(REDACTED);
    expect(event.taskId).toBe('t-1');
    expect(event.message).toBe('task failed');
  });

  it('removes attached user context even if the SDK adds it', () => {
    const event = scrubEvent({ message: 'boom', user: { email: 'a@b.test' } })!;
    expect(event).not.toHaveProperty('user');
  });

  it('scrubs nested structures without destroying shape', () => {
    const event = scrubEvent({
      message: 'failed',
      contexts: { run: { owner: 'boss@acme.test', retries: 2 } },
    })!;
    expect(event.contexts).toMatchObject({ run: { owner: REDACTED, retries: 2 } });
  });
});

describe('initErrorReporting is a safe no-op until configured', () => {
  it('does nothing without a DSN and never throws', async () => {
    const log = logger();
    await expect(
      initErrorReporting({ NODE_ENV: 'test' } as never, log as never),
    ).resolves.toBe(false);
  });

  it('warns (not crashes) when a DSN is set but the SDK is absent', async () => {
    const log = logger();
    const live = await initErrorReporting(
      { SENTRY_DSN: 'https://x@sentry.io/1', SENTRY_TRACES_SAMPLE_RATE: 0.1, NODE_ENV: 'test' } as never,
      log as never,
    );
    // @sentry/node is intentionally not installed: must degrade, not throw.
    expect(live).toBe(false);
  });
});
