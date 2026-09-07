/**
 * Connector health-state classifier unit tests.
 *
 * The classifier is the single source of truth for the health states the
 * founder sees (healthy / degraded / expired / error / disconnected). It is
 * deliberately pure so the states are unit-testable without a database or a
 * live provider.
 */

import { describe, expect, it } from 'vitest';
import { classifyConnectorState } from '../src/services/integrations.js';

describe('classifyConnectorState', () => {
  it('no stored credential → disconnected, no reconnect needed', () => {
    const r = classifyConnectorState({ hasCredential: false, expiredByTime: false, probeHealthy: null });
    expect(r.state).toBe('disconnected');
    expect(r.requiresReconnect).toBe(false);
  });

  it('token expired by time → expired + reconnect required', () => {
    const r = classifyConnectorState({ hasCredential: true, expiredByTime: true, probeHealthy: null });
    expect(r.state).toBe('expired');
    expect(r.requiresReconnect).toBe(true);
  });

  it('successful probe → healthy', () => {
    const r = classifyConnectorState({ hasCredential: true, expiredByTime: false, probeHealthy: true, probeStatus: 200 });
    expect(r.state).toBe('healthy');
    expect(r.requiresReconnect).toBe(false);
  });

  it('401/403 (revoked or invalid token) → expired + reconnect required', () => {
    for (const status of [401, 403]) {
      const r = classifyConnectorState({ hasCredential: true, expiredByTime: false, probeHealthy: false, probeStatus: status, error: 'Token invalid or revoked' });
      expect(r.state).toBe('expired');
      expect(r.requiresReconnect).toBe(true);
    }
  });

  it('provider-side failure (5xx / network) → degraded, credentials intact', () => {
    for (const status of [500, 502, 503, 0]) {
      const r = classifyConnectorState({ hasCredential: true, expiredByTime: false, probeHealthy: false, probeStatus: status, error: 'GitHub API error' });
      expect(r.state).toBe('degraded');
      expect(r.requiresReconnect).toBe(false);
    }
  });

  it('probe not attempted with credentials → error', () => {
    const r = classifyConnectorState({ hasCredential: true, expiredByTime: false, probeHealthy: null });
    expect(r.state).toBe('error');
  });
});