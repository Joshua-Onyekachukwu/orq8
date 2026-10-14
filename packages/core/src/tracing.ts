import { trace } from '@opentelemetry/api';

let enabled = false;
let exporting = false;
let warned = false;

type WarnFn = (msg: string) => void;

/**
 * docs/39 — tracing seam. Spans carry ONLY operation names and caught
 * exceptions: prompt text, memory excerpts, credentials, and request bodies
 * are never set as span attributes anywhere in this codebase, so enabling
 * export cannot leak them through telemetry.
 *
 * - No endpoint configured → pure no-op (the @opentelemetry/api default
 *   propagator records nothing, zero overhead, zero network).
 * - Endpoint configured → tries to register the OTLP/HTTP exporter. The
 *   SDK packages are OPTIONAL dependencies on purpose: at pre-launch scale
 *   every deployment should boot without them. If they are absent the
 *   process keeps running untraced and logs exactly what to install.
 *
 * Returns true when spans are being exported, false otherwise.
 */
export async function initTracing(endpoint?: string, warn?: WarnFn): Promise<boolean> {
  enabled = true;
  if (!endpoint) return false;
  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter({ url: endpoint }) });
    sdk.start();
    exporting = true;
    return true;
  } catch (err) {
    if (!warned) {
      warned = true;
      (warn ?? console.warn)(
        '[tracing] OTEL_EXPORTER_OTLP_ENDPOINT is set but the OpenTelemetry SDK ' +
          'is not installed — running untraced. Install with: ' +
          'pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http ' +
          `(${err instanceof Error ? err.message : String(err)})`,
      );
    }
    return false;
  }
}

/** True once an OTLP exporter has been registered in this process. */
export function isTracingExporting(): boolean {
  return exporting;
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
