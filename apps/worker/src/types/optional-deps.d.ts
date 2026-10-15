/**
 * Ambient types for the OPTIONAL OpenTelemetry SDK packages.
 *
 * The worker compilation type-checks `@orq8/core` sources it imports
 * (tracing.ts), but ambient declarations from that package are not
 * automatically in scope here — so the same two optional modules are
 * declared again in this program. Keep in sync with
 * `packages/core/src/optional-otel.d.ts`. Each `tsc` program sees only
 * one copy, so there is no duplicate-identifier conflict.
 */
declare module '@opentelemetry/sdk-node' {
  export class NodeSDK {
    constructor(options?: { traceExporter?: unknown });
    start(): void;
  }
}

/**
 * The worker also transitively type-checks the API's error-reporting
 * service, whose `@sentry/node` dynamic import needs the same optional
 * declaration in this program. Keep in sync with
 * `apps/api/src/types/optional-deps.d.ts`.
 */
declare module '@sentry/node' {
  export function init(options: {
    dsn: string;
    environment?: string;
    sendDefaultPii?: boolean;
    tracesSampleRate?: number;
    beforeSend?: (event: Record<string, unknown>) => Record<string, unknown> | null;
  }): void;
}

declare module '@opentelemetry/exporter-trace-otlp-http' {
  export class OTLPTraceExporter {
    constructor(options?: { url?: string });
  }
}
