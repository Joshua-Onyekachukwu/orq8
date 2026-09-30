import { describe, expect, it } from 'vitest';
import {
  capabilityReadiness,
  envRequiredInProduction,
  envSurface,
  loadConfig,
  type AppConfig,
} from '@orq8/core';

/**
 * The activation model (docs/69).
 *
 * docs/62 found the deployment surface drifting from the code; docs/66.11 found
 * production blocked on credentials nobody had a list of. Both are the same
 * failure: the system knows what it needs and never says so. This test pins the
 * four properties that make the readiness report trustworthy.
 *
 *   1. A minimal deployment is not reported as complete.
 *   2. A configured deployment is, and `blocking` is empty only then.
 *   3. A local substitute (disk storage, LiteLLM) reports `dev_only`, never
 *      `ready` — it works here and would not work once deployed.
 *   4. No value ever leaves the model, only key names.
 *
 * It runs against `loadConfig` with a literal environment, not `process.env`,
 * so the result cannot change with the machine it runs on.
 */

const base = (over: Record<string, string> = {}): AppConfig =>
  loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...over });

const CONFIGURED = {
  DATABASE_URL: 'postgres://orq8:pw@db.example.com:5432/orq8',
  SESSION_SECRET: 'session-value-2f9c',
  ENCRYPTION_KEY: 'encryption-value-7b31',
  APP_URL: 'https://orq8.app',
  ALLOWED_ORIGINS: 'https://orq8.app',
  OPENROUTER_API_KEY: 'key-openrouter-5ac1',
  RESEND_API_KEY: 'key-resend-88de',
  EMBEDDING_BASE_URL: 'https://embeddings.example.com',
  S3_ENDPOINT: 'https://s3.example.com',
  S3_ACCESS_KEY: 'access-id-11aa',
  S3_SECRET_KEY: 'storage-value-40ff',
  S3_BUCKET: 'orq8',
  REDIS_URL: 'redis://cache:6379',
  INTERNAL_TOKEN: 'token-internal-9c2d',
  SERPAPI_KEY: 'key-search-6e40',
  GITHUB_CLIENT_ID: 'gh-id-3b7e',
  GITHUB_CLIENT_SECRET: 'gh-value-52ad',
  GOOGLE_CLIENT_ID: 'g-id-9d10',
  GOOGLE_CLIENT_SECRET: 'g-value-77cb',
  STRIPE_SECRET_KEY: 'stripe-value-1e88',
  STRIPE_WEBHOOK_SECRET: 'stripe-hook-64b2',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.com',
};

describe('capability readiness', () => {
  it('does not call a minimally configured deployment complete', () => {
    const report = capabilityReadiness(base());

    expect(report.capabilities.length).toBeGreaterThan(10);
    expect(report.configurationRequired).toBeGreaterThan(0);
    // The two that make the product unusable for a founder if absent:
    expect(report.blocking).toContain('model_gateway');
    expect(report.blocking).toContain('email');
  });

  it('reports a fully configured deployment ready with nothing blocking', () => {
    const report = capabilityReadiness(base(CONFIGURED));

    expect(report.blocking).toEqual([]);
    expect(report.configurationRequired).toBe(0);
    expect(report.ready).toBe(report.capabilities.length);
  });

  it('bounds blocking to production-critical capabilities', () => {
    const report = capabilityReadiness(base(CONFIGURED));
    const blocking = new Set(report.blocking);
    const optionalMissing = report.capabilities.filter(
      (c) => !c.productionCritical && c.status !== 'ready',
    );

    for (const capability of optionalMissing) {
      expect(blocking.has(capability.id)).toBe(false);
    }
    // A missing optional capability is reported as degradation, not silence.
    expect(report.capabilities.find((c) => c.id === 'search')?.degraded).toBe(true);
  });

  it('calls a capability kept alive by a local substitute dev_only, not ready', () => {
    const withoutStorage: Record<string, string> = { ...CONFIGURED };
    for (const key of ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET']) {
      delete withoutStorage[key];
    }
    const report = capabilityReadiness(
      base({ ...withoutStorage, LOCAL_STORAGE_DIR: './.local-storage' }),
    );
    const storage = report.capabilities.find((c) => c.id === 'storage');

    expect(storage?.status).toBe('dev_only');
    expect(storage?.missing).toContain('S3_ENDPOINT');
    expect(report.blocking).toEqual([]);
  });

  it('names the missing keys so the founder knows exactly what to set', () => {
    const report = capabilityReadiness(base({ DATABASE_URL: 'postgres://x' }));
    const model = report.capabilities.find((c) => c.id === 'model_gateway');
    const email = report.capabilities.find((c) => c.id === 'email');

    // A capability satisfied by alternatives reports the whole group as missing.
    expect(model?.missing).toEqual([
      'OPENROUTER_API_KEY',
      'OPENROUTER_API_KEYS',
      'NVIDIA_API_KEY',
      'NVIDIA_API_KEYS',
    ]);
    expect(email?.missing).toEqual(['RESEND_API_KEY', 'SMTP_HOST']);
    expect(report.capabilities.find((c) => c.id === 'database')?.status).toBe('ready');
  });

  it('never leaks a value, only key names', () => {
    const report = capabilityReadiness(base(CONFIGURED));
    const serialised = JSON.stringify(report);

    for (const secret of [
      CONFIGURED.OPENROUTER_API_KEY,
      CONFIGURED.RESEND_API_KEY,
      CONFIGURED.SESSION_SECRET,
      CONFIGURED.ENCRYPTION_KEY,
      CONFIGURED.STRIPE_SECRET_KEY,
      CONFIGURED.S3_SECRET_KEY,
      CONFIGURED.GITHUB_CLIENT_SECRET,
    ]) {
      expect(serialised).not.toContain(secret);
    }
    // A key name is not a value: the names are what a deployer needs.
    expect(serialised).toContain('OPENROUTER_API_KEY');
  });

  it('only names keys that exist in the configuration surface', () => {
    const surface = new Set(envSurface());
    const named = new Set(
      capabilityReadiness(base())
        .capabilities.flatMap((c) => [...c.requires, ...c.anyOf.flat()]),
    );

    for (const key of named) {
      expect(surface.has(key)).toBe(true);
    }
    // The activation model must at least cover what a deployment is required to
    // set, or a key could be mandatory and reported nowhere.
    for (const key of envRequiredInProduction()) {
      expect(named.has(key)).toBe(true);
    }
  });
});
