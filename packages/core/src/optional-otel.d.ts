/**
 * Ambient types for the OPTIONAL OpenTelemetry SDK packages.
 *
 * tracing.ts loads these by dynamic import only when an OTLP endpoint is
 * configured, and runs untraced when they are absent — so they are
 * intentionally not in package.json. These minimal declarations describe
 * exactly the surface we use so `tsc --noEmit` resolves the dynamic
 * imports without forcing every install to carry the SDK.
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
