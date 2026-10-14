import { describe, expect, it, vi } from 'vitest';
import { initTracing, isTracingExporting, withSpan } from '../src/tracing.js';

/**
 * Tracing seam battery (Phase 7/INFRA): without an endpoint nothing is
 * exported; with an endpoint but no SDK the process warns once and keeps
 * running untraced instead of crashing the boot.
 */

describe('tracing seam', () => {
  it('is a no-op without an endpoint and still runs the work', async () => {
    await expect(initTracing(undefined)).resolves.toBe(false);
    await expect(withSpan('test-op', async () => 42)).resolves.toBe(42);
    expect(isTracingExporting()).toBe(false);
  });

  it('warns (not crashes) when an endpoint is set but the SDK is absent', async () => {
    const warn = vi.fn();
    await expect(
      initTracing('http://localhost:4318/v1/traces', warn),
    ).resolves.toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('pnpm add');
    expect(isTracingExporting()).toBe(false);
    // Spans still execute the wrapped work.
    await expect(withSpan('test-op', async () => 'ok')).resolves.toBe('ok');
  });
});
