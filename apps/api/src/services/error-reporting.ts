/**
 * Opt-in error reporting (Sentry) — unset SENTRY_DSN means errors stay in
 * process logs only. Never sends: prompt text, memory excerpts, credentials,
 * tokens, emails, or request bodies. The scrubber below runs on every event
 * before send; `sendDefaultPii` stays false and request data is dropped.
 *
 * The @sentry/node package is intentionally NOT a dependency: it loads by
 * dynamic import only when a DSN is configured. Until the founder creates a
 * Sentry project, this module is a tested no-op.
 */
import type { AppConfig } from '@orq8/core';
import type { Logger } from 'pino';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/=]+/gi;
const SECRET_KEY_RE =
  /(?:"?(?:password|passwd|secret|api[_-]?key|token|session|authorization)"?\s*[:=]\s*"?)([^"\s,}]+)/gi;

export const REDACTED = '[redacted]';

/** Scrub a free-text field: emails, bearer tokens, key=value secrets. */
export function scrubText(value: string): string {
  return value
    .replace(EMAIL_RE, REDACTED)
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(SECRET_KEY_RE, (_m, _secret: string) => _m.replace(_secret, REDACTED));
}

function scrubUnknown(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map((v) => scrubUnknown(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Drop request bodies/headers/cookies wholesale — they carry prompts,
      // credentials, and session tokens by construction. `request` itself is
      // dropped too: redacting only its fields would leave the container
      // (and any future SDK-attached field) in the event.
      if (/^(request|body|headers|cookies|data|params|query|form|auth|user)$/i.test(k)) {
        out[k] = REDACTED;
        continue;
      }
      if (/password|secret|token|session|cookie|authorization|api[_-]?key/i.test(k)) {
        out[k] = REDACTED;
        continue;
      }
      out[k] = scrubUnknown(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Sentry beforeSend hook — pure, unit-tested. Returns null to drop. */
export function scrubEvent(event: Record<string, unknown>): Record<string, unknown> | null {
  if (!event) return null;
  const scrubbed = scrubUnknown(event) as Record<string, unknown>;
  // Never send user-identifying context even if the SDK attaches it.
  delete scrubbed.user;
  return scrubbed;
}

let initialized = false;

/**
 * Initialize Sentry when SENTRY_DSN is set. Returns true when live.
 * Safe to call unconditionally at boot; no-ops without a DSN or SDK.
 */
export async function initErrorReporting(
  config: Pick<AppConfig, 'SENTRY_DSN' | 'SENTRY_TRACES_SAMPLE_RATE' | 'NODE_ENV'>,
  logger: Logger,
): Promise<boolean> {
  if (!config.SENTRY_DSN) return false;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: config.SENTRY_DSN,
      environment: config.NODE_ENV ?? 'development',
      sendDefaultPii: false,
      tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
      beforeSend: (event) => scrubEvent(event as unknown as Record<string, unknown>) as never,
    });
    initialized = true;
    logger.info('error reporting enabled (Sentry, scrubbed)');
    return true;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'SENTRY_DSN is set but @sentry/node is not installed — errors stay in logs. Install with: pnpm add @sentry/node',
    );
    return false;
  }
}

export function isErrorReportingLive(): boolean {
  return initialized;
}
