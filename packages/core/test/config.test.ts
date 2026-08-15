import { describe, expect, it } from 'vitest';
import { allowedOrigins, loadConfig } from '../src/config.js';

describe('config (docs/42.5 — validated at boot)', () => {
  it('applies dev defaults for the free local stack', () => {
    const cfg = loadConfig({});
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.PORT).toBe(3001);
    expect(cfg.DATABASE_URL).toContain('localhost:5432');
  });

  it('parses allowed origins', () => {
    const cfg = loadConfig({ ALLOWED_ORIGINS: 'http://a.test, http://b.test' });
    expect(allowedOrigins(cfg)).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects an invalid PORT', () => {
    expect(() => loadConfig({ PORT: 'not-a-number' })).toThrow(/Invalid environment/);
  });
});
