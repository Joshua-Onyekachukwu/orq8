/**
 * Ambient types for the OPTIONAL @sentry/node dependency.
 *
 * error-reporting.ts loads this package by dynamic import only when
 * SENTRY_DSN is configured, and degrades gracefully when it is absent —
 * so it is intentionally not in package.json. These minimal declarations
 * describe exactly the surface we use so `tsc --noEmit` resolves the
 * dynamic import without forcing every install to carry the SDK.
 */
/**
 * The API compilation also type-checks `@orq8/core` sources it imports
 * (e.g. tracing.ts), but ambient declarations from that package are not
 * automatically in scope here — so the same two optional OpenTelemetry
 * modules are declared again in this program. Keep in sync with
 * `packages/core/src/optional-otel.d.ts`. Each `tsc` program sees only
 * one copy, so there is no duplicate-identifier conflict.
 */
declare module '@opentelemetry/sdk-node' {
  export class NodeSDK {
    constructor(options?: { traceExporter?: unknown });
    start(): void;
  }
}

declare module '@opentelemetry/exporter-trace-otlp-http' {
  export class OTLPTraceExporter {
    constructor(options?: { url?: string });
  }
}

declare module '@sentry/node' {
  export function init(options: {
    dsn: string;
    environment?: string;
    sendDefaultPii?: boolean;
    tracesSampleRate?: number;
    beforeSend?: (event: Record<string, unknown>) => Record<string, unknown> | null;
  }): void;
}
