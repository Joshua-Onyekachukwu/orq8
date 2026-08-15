import { trace } from '@opentelemetry/api';

let enabled = false;

// docs/39 — pino + OpenTelemetry. The SDK/exporters are wired in Phase 16;
// this keeps a stable tracing seam (withSpan) in place from day one.
export function initTracing(_endpoint?: string): void {
  enabled = true;
}

export async function withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();
  return trace.getTracer('orq8').startActiveSpan(name, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}
