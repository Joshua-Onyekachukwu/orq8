import type { AppConfig } from '@orq8/core';
import type { Logger } from 'pino';
import { createEmailTransport, verifyMailProvider } from '../email/transport.js';

/**
 * Mail delivery, diagnosed (docs/66 §66.18, docs/68 MVP-001/019).
 *
 * Mail is the one integration whose failures are invisible until a user is
 * locked out: the confirmation link never arrives, the page says "confirm your
 * email", and the founder sees a healthy product. An invitation reports its
 * delivery verdict, but nothing could answer the deployment-level question —
 * *is the configured provider working at all, and if not, what exactly is
 * wrong?*
 *
 * This answers it in three steps that each carry their own verdict:
 *
 *   1. configuration — which provider this deployment chose, and what it needs
 *   2. reachability  — an authenticated provider call, no message sent
 *   3. delivery      — one real message to an address the founder names
 *
 * A failure is classified into what went wrong and what to change, because
 * "Resend 401: {\"message\":\"API key is invalid\"}" is not a founder-facing
 * sentence.
 *
 * Nothing here returns a credential. `detail` carries the provider's own words.
 */

export type MailProviderId = 'resend' | 'smtp' | 'dev-log' | 'none';

export interface MailProviderDescription {
  provider: MailProviderId;
  /** Whether a send from this configuration reaches a mailbox. */
  delivers: boolean;
  from: string;
  /** Keys that are set (names only). */
  configuredKeys: string[];
  /** Keys that would have to be set to change the verdict. */
  missingKeys: string[];
  notes: string[];
}

const RESEND_KEYS = ['RESEND_API_KEY'];
const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

/** What the deployment's mail configuration is, without judging it. */
export function describeMailProvider(config: AppConfig): MailProviderDescription {
  const from = config.EMAIL_FROM ?? 'ORQ8 <founder@orq8.ai>';
  // A key counts as set when it carries a value, including a defaulted one:
  // SMTP_PORT defaults to 587, so it is never "missing" (`docs/51`).
  const present = (key: string): boolean => {
    const value = (config as unknown as Record<string, unknown>)[key];
    if (typeof value === 'string') return value.trim().length > 0;
    return value !== undefined && value !== null;
  };    if (present('RESEND_API_KEY')) {
      // Resend wins when both are set: one HTTP call, no SMTP handshake.
    return {
      provider: 'resend',
      delivers: true,
      from,
      configuredKeys: [...RESEND_KEYS, 'EMAIL_FROM'],
      missingKeys: [],
      notes: [
        'Resend accepts one HTTP call per message, so no SMTP server is involved.',
        `EMAIL_FROM must be on a domain verified in Resend (currently: ${from}).`,
      ],
    };
  }

  if (present('SMTP_HOST')) {
    return {
      provider: 'smtp',
      delivers: true,
      from,
      configuredKeys: [...SMTP_KEYS.filter(present), 'EMAIL_FROM'],
      missingKeys: SMTP_KEYS.filter((key) => !present(key)),
      notes: [
        `Sending through ${config.SMTP_HOST}:${config.SMTP_PORT}.`,
        'Most providers require an app password rather than the account password.',
      ],
    };
  }

  const printable = config.NODE_ENV !== 'production';
  return {
    provider: printable ? 'dev-log' : 'none',
    delivers: false,
    from,
    configuredKeys: [],
    missingKeys: [...RESEND_KEYS, ...SMTP_KEYS],
    notes: printable
      ? [
          'No provider is configured, so message bodies (links included) are written to the API log and nothing is delivered.',
          'That is a development convenience. Set RESEND_API_KEY before real users sign up.',
        ]
      : [
          'Production refuses to pretend: a send with no provider fails, so a new account cannot confirm its address.',
          'Set RESEND_API_KEY (recommended) or the SMTP_* keys.',
        ],
  };
}

export interface MailFailureDiagnosis {
  /** What went wrong, in one sentence a founder can act on. */
  reason: string;
  /** What to change. */
  fix: string;
}

/**
 * Turn a provider error into a cause and a fix.
 *
 * The raw message is always preserved alongside this — the classification is a
 * convenience for the common cases, never a replacement for the provider's own
 * words, which are often the only clue for an unusual failure.
 */
export function diagnoseMailFailure(
  provider: MailProviderId,
  error: string,
): MailFailureDiagnosis {
  const text = error.toLowerCase();

  if (provider === 'none' || provider === 'dev-log' || text.includes('no mail transport')) {
    return {
      reason: 'No mail provider is configured, so nothing can be delivered.',
      fix: 'Set RESEND_API_KEY (recommended), or SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS, then run this check again.',
    };
  }

  if (provider === 'resend') {
    if (/\b401\b|invalid.*(api )?key|unauthor|not authorized|missing.*key/.test(text)) {
      return {
        reason: 'Resend rejected the API key, so every send will fail.',
        fix: 'Create a new key under Resend → API Keys and update RESEND_API_KEY.',
      };
    }
    if (/\b403\b|domain|not verified|verify|from address/.test(text)) {
      return {
        reason: 'Resend refused the sending address.',
        fix: 'Verify the sending domain in Resend and point EMAIL_FROM at an address on it (or at onboarding@resend.dev while testing).',
      };
    }
    if (/\b429\b|rate limit/.test(text)) {
      return {
        reason: 'The Resend account is rate-limited right now.',
        fix: 'Wait a minute and run the check again. If it repeats, review the plan limits in Resend.',
      };
    }
    if (/\b422\b/.test(text)) {
      return {
        reason: 'Resend rejected the message shape, which is almost always EMAIL_FROM.',
        fix: 'Set EMAIL_FROM to "Company <address@verified-domain>".',
      };
    }
  }

  if (provider === 'smtp') {
    if (/econnrefused|enotfound|ehostunreach|etimedout|esocket|timeout|connect/.test(text)) {
      return {
        reason: 'The SMTP host could not be reached.',
        fix: 'Check SMTP_HOST and SMTP_PORT (587 for STARTTLS, 465 for implicit TLS) and that the deployment allows outbound SMTP.',
      };
    }
    if (/535|e auth|authentication|credentials|invalid login|username and password/.test(text)) {
      return {
        reason: 'The SMTP server rejected the credentials.',
        fix: 'Check SMTP_USER and SMTP_PASS. Most providers need an app password, not the account password.',
      };
    }
    if (/self signed|certificate|wrong version|ssl|tls/.test(text)) {
      return {
        reason: 'TLS negotiation with the SMTP server failed.',
        fix: 'Use SMTP_PORT 587 with STARTTLS, or 465 for implicit TLS.',
      };
    }
    if (/\b55[0-3]\b|recipient/.test(text)) {
      return {
        reason: 'The SMTP server rejected the recipient address.',
        fix: 'This is a delivery problem for that one address rather than a configuration problem — test again with your own address.',
      };
    }
  }

  return {
    reason: `The provider rejected the message: ${error}`,
    fix: "Act on the provider's own message above, then run this check again.",
  };
}

export interface MailStep {
  id: 'configuration' | 'reachability' | 'delivery';
  label: string;
  ok: boolean;
  /** What was proven, tried, or skipped. */
  detail: string;
}

export interface MailDiagnosis {
  ok: boolean;
  /** Whether a real mailbox accepted a real message during this check. */
  delivered: boolean;
  provider: MailProviderId;
  from: string;
  to: string;
  steps: MailStep[];
  failure: (MailFailureDiagnosis & { message: string }) | null;
  description: MailProviderDescription;
}

/**
 * Run the three checks. Step 3 sends one real message, so this is only ever
 * called from an authenticated founder action — never on a page load.
 */
export async function runMailDiagnosis(
  config: AppConfig,
  logger: Logger,
  to: string,
): Promise<MailDiagnosis> {
  const description = describeMailProvider(config);
  const steps: MailStep[] = [];
  let failure: MailDiagnosis['failure'] = null;

  const fail = (provider: MailProviderId, message: string): void => {
    if (!failure) failure = { ...diagnoseMailFailure(provider, message), message };
  };

  // 1. Configuration.
  if (description.delivers) {
    steps.push({
      id: 'configuration',
      label: 'A provider is configured',
      ok: true,
      detail:
        description.provider === 'resend'
          ? 'RESEND_API_KEY is set, so messages go out over Resend.'
          : `SMTP_HOST is set (${config.SMTP_HOST}:${config.SMTP_PORT}).`,
    });
  } else {
    const message =
      description.provider === 'dev-log'
        ? 'no mail transport configured (development log-only fallback)'
        : 'no mail transport configured';
    steps.push({
      id: 'configuration',
      label: 'A provider is configured',
      ok: false,
      detail:
        description.provider === 'dev-log'
          ? 'No provider is configured. In this environment messages are printed to the log instead of delivered.'
          : 'No provider is configured, and in production nothing is sent.',
    });
    fail('none', message);
  }

  // 2. Reachability — an authenticated provider call, no message sent.
  if (description.delivers) {
    const check = await verifyMailProvider(config);
    steps.push({
      id: 'reachability',
      label: 'The provider accepts these credentials',
      ok: check.ok,
      detail: check.detail,
    });
    if (!check.ok) fail(check.provider, check.error ?? check.detail);

    // 3. Delivery — one real message.
    if (check.ok) {
      const transport = createEmailTransport(config, logger);
      const result = await transport.send({
        to,
        subject: 'ORQ8 mail delivery check',
        text:
          'This is a delivery check from ORQ8.\n\n' +
          'It was requested from your settings page, and reaching your inbox proves that ' +
          'confirmations, invitations and briefings will reach the people you invite.\n',
        html:
          '<p>This is a delivery check from <strong>ORQ8</strong>.</p>' +
          '<p>It was requested from your settings page. Reaching your inbox proves that ' +
          'confirmations, invitations and briefings will reach the people you invite.</p>',
      });
      const delivered = result.ok && result.delivered !== false;
      steps.push({
        id: 'delivery',
        label: 'A real message was accepted for delivery',
        ok: delivered,
        detail: delivered
          ? `Accepted by the provider${result.messageId ? ` (id ${result.messageId})` : ''}. Check the inbox of ${to}.`
          : result.error
            ? `The provider refused the message: ${result.error}`
            : 'The provider accepted nothing: the message was not delivered.',
      });
      if (!delivered) fail(description.provider, result.error ?? 'message not delivered');
    } else {
      steps.push({
        id: 'delivery',
        label: 'A real message was accepted for delivery',
        ok: false,
        detail: 'Skipped: the provider rejected the credentials, so a send would only repeat the failure.',
      });
    }
  } else {
    steps.push({
      id: 'reachability',
      label: 'The provider accepts these credentials',
      ok: false,
      detail: 'Skipped: no provider is configured.',
    });
    steps.push({
      id: 'delivery',
      label: 'A real message was accepted for delivery',
      ok: false,
      detail: 'Skipped: a message would only be printed to the log.',
    });
  }

  return {
    ok: steps.every((step) => step.ok),
    delivered: steps.find((step) => step.id === 'delivery')?.ok ?? false,
    provider: description.provider,
    from: description.from,
    to,
    steps,
    failure,
    description,
  };
}
