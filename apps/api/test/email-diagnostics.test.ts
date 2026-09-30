import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, loadConfig, type AppConfig } from '@orq8/core';
import {
  describeMailProvider,
  diagnoseMailFailure,
  runMailDiagnosis,
} from '../src/services/email-diagnostics.js';

/**
 * Mail delivery, diagnosed (docs/66 §66.18).
 *
 * Mail is the integration whose failures are invisible until a founder is locked
 * out: signup succeeds, the page says "confirm your email", and no link ever
 * arrives. The check has to be honest about three different things — nothing is
 * configured, the provider rejects the credentials, the provider refuses this
 * message — because they have three different fixes.
 *
 * No network is touched: the provider calls are stubbed, and the dev-log path is
 * asserted to send nothing at all.
 */

const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

const config = (over: Record<string, string> = {}): AppConfig =>
  loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...over });

const RESEND = { RESEND_API_KEY: 're-test-key', EMAIL_FROM: 'ORQ8 <mail@orq8.test>' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mail provider description', () => {
  it('prefers Resend and says what it needs', () => {
    const described = describeMailProvider(config({ ...RESEND, SMTP_HOST: 'smtp.example.com' }));

    expect(described.provider).toBe('resend');
    expect(described.delivers).toBe(true);
    expect(described.missingKeys).toEqual([]);
    expect(described.notes.join(' ')).toContain('verified in Resend');
  });

  it('describes SMTP and reports the keys it is missing', () => {
    const described = describeMailProvider(
      config({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587' }),
    );

    expect(described.provider).toBe('smtp');
    expect(described.configuredKeys).toContain('SMTP_HOST');
    expect(described.missingKeys).toEqual(['SMTP_USER', 'SMTP_PASS']);
  });

  it('calls the log-only fallback what it is: not delivery', () => {
    const described = describeMailProvider(config());

    expect(described.provider).toBe('dev-log');
    expect(described.delivers).toBe(false);
    expect(described.missingKeys).toContain('RESEND_API_KEY');
    expect(described.notes.join(' ')).toContain('written to the API log');
  });

  it('in production, no provider is a misconfiguration rather than a convenience', () => {
    const described = describeMailProvider(
      config({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://orq8:pw@db.example.com:5432/orq8',
        SESSION_SECRET: 'live-session-secret',
        ENCRYPTION_KEY: 'live-encryption-key',
      }),
    );

    expect(described.provider).toBe('none');
    expect(described.notes.join(' ')).toContain('cannot confirm its address');
  });
});

describe('mail failure classification', () => {
  it('turns a rejected Resend key into a fix', () => {
    const diagnosed = diagnoseMailFailure('resend', 'Resend 401: {"message":"API key is invalid"}');

    expect(diagnosed.reason).toContain('rejected the API key');
    expect(diagnosed.fix).toContain('RESEND_API_KEY');
  });

  it('separates an unverified domain from a bad key', () => {
    const diagnosed = diagnoseMailFailure('resend', 'Resend 403: domain is not verified');

    expect(diagnosed.reason).toContain('sending address');
    expect(diagnosed.fix).toContain('Verify the sending domain');
  });

  it('classifies SMTP reachability, credentials and TLS distinctly', () => {
    expect(diagnoseMailFailure('smtp', 'connect ECONNREFUSED 1.2.3.4:587').reason).toContain(
      'could not be reached',
    );
    expect(diagnoseMailFailure('smtp', 'Invalid login: 535 Authentication failed').reason).toContain(
      'rejected the credentials',
    );
    expect(diagnoseMailFailure('smtp', 'self signed certificate in certificate chain').reason).toContain(
      'TLS',
    );
  });

  it('keeps the provider wording when it has nothing better to say', () => {
    const diagnosed = diagnoseMailFailure('resend', 'Resend 500: upstream exploded');

    expect(diagnosed.reason).toContain('upstream exploded');
    expect(diagnosed.fix.length).toBeGreaterThan(0);
  });
});

describe('mail diagnosis', () => {
  it('reports an unconfigured deployment as configured-but-not-delivering', async () => {
    const diagnosis = await runMailDiagnosis(config(), logger, 'founder@orq8.test');

    expect(diagnosis.ok).toBe(false);
    expect(diagnosis.delivered).toBe(false);
    expect(diagnosis.provider).toBe('dev-log');
    expect(diagnosis.steps.map((s) => s.id)).toEqual(['configuration', 'reachability', 'delivery']);
    expect(diagnosis.steps[0]?.ok).toBe(false);
    expect(diagnosis.failure?.fix).toContain('RESEND_API_KEY');
  });

  it('proves delivery against a provider that accepts the key and the message', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const href = String(url);
      calls.push(href);
      if (href.includes('/domains')) {
        return new Response(JSON.stringify({ data: [{ id: 'd1', name: 'orq8.test' }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ id: 'email-abc' }), { status: 200 });
    });

    const diagnosis = await runMailDiagnosis(config(RESEND), logger, 'founder@orq8.test');

    expect(diagnosis.ok).toBe(true);
    expect(diagnosis.delivered).toBe(true);
    expect(diagnosis.failure).toBeNull();
    expect(diagnosis.steps.every((step) => step.ok)).toBe(true);
    expect(diagnosis.steps[2]?.detail).toContain('email-abc');
    // The check asked the provider first and only then sent a message.
    expect(calls.some((c) => c.includes('/domains'))).toBe(true);
    expect(calls.some((c) => c.includes('/emails'))).toBe(true);
  });

  it('stops before sending when the provider rejects the credentials', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const href = String(url);
      calls.push(href);
      return new Response('{"message":"API key is invalid"}', { status: 401 });
    });

    const diagnosis = await runMailDiagnosis(config(RESEND), logger, 'founder@orq8.test');

    expect(diagnosis.ok).toBe(false);
    expect(diagnosis.delivered).toBe(false);
    expect(diagnosis.steps[1]?.ok).toBe(false);
    expect(diagnosis.steps[2]?.detail).toContain('Skipped');
    expect(diagnosis.failure?.reason).toContain('rejected the API key');
    // A rejected key means a send would only repeat the failure.
    expect(calls.some((c) => c.includes('/emails'))).toBe(false);
  });

  it('reports a provider that accepts the key but refuses the message', async () => {
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const href = String(url);
      if (href.includes('/domains')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response('{"message":"domain is not verified"}', { status: 403 });
    });

    const diagnosis = await runMailDiagnosis(config(RESEND), logger, 'founder@orq8.test');

    expect(diagnosis.ok).toBe(false);
    expect(diagnosis.steps[1]?.ok).toBe(true);
    expect(diagnosis.steps[2]?.ok).toBe(false);
    expect(diagnosis.failure?.reason).toContain('sending address');
    // No sending domain registered is worth saying out loud before the send.
    expect(diagnosis.steps[1]?.detail).toContain('no sending domain is registered');
  });

  it('never returns a credential', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"message":"nope"}', { status: 401 }));

    const diagnosis = await runMailDiagnosis(config(RESEND), logger, 'founder@orq8.test');

    expect(JSON.stringify(diagnosis)).not.toContain(RESEND.RESEND_API_KEY);
  });
});
