// Email transport (docs/00 GTM, 58). SMTP configured → real send via nodemailer.
// SMTP unset → dev mode: the email is logged as a JSON line and reported sent,
// so the free local stack and tests never need an SMTP server.

import type { Logger } from 'pino';
import type { AppConfig } from '@orq8/core';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  /**
   * Whether a mail service actually accepted this message.
   *
   * `ok` means "the queue may move on" — the log-only transport answers ok so a
   * local stack and the tests never need an SMTP server. That made "ok" a lie to
   * report to a founder, so delivery is recorded separately: an invitation can
   * then say "we emailed them" or "mail is not configured — copy this link".
   */
  delivered?: boolean;
}

export interface EmailTransport {
  send(input: SendInput): Promise<SendResult>;
}

let cachedTransporter: Transporter | undefined;

function getTransporter(config: AppConfig): Transporter | undefined {
  if (!config.SMTP_HOST) return undefined;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' }
        : undefined,
      // Fail fast when the SMTP server is unreachable instead of hanging on the
      // OS connect timeout (which can take minutes). Email must never block the
      // request path indefinitely — the caller turns failures into queued rows.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 30_000,
    });
  }
  return cachedTransporter;
}

// ─── Resend transport ─────────────────────────────────────────────────────
// When RESEND_API_KEY is set, emails are sent via Resend's HTTP API instead of SMTP.
// This is simpler for production deployments (no SMTP server needed).
let resendKey: string | undefined;

async function sendViaResend(
  apiKey: string,
  input: SendInput,
  from: string,
): Promise<SendResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${err}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, messageId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Resend failed' };
  }
}

/**
 * Prove the configured provider is reachable and authorised, without sending.
 *
 * `send()` answers "did this one message go out", which is the wrong question
 * when mail is quietly broken: every invite, confirmation and briefing fails the
 * same way and the only trace is a log line the founder never reads. This does
 * the provider-level check instead — an authenticated call for Resend, a real
 * handshake for SMTP — so a diagnosis can separate "mail is not configured"
 * from "the key is revoked" from "the sending domain is not verified".
 *
 * Never returns a credential: `detail` carries the provider's own words.
 */
export interface ProviderCheck {
  ok: boolean;
  provider: 'resend' | 'smtp' | 'none';
  /** What was proven, in the provider's language. */
  detail: string;
  /** Present when the check failed, for classification. */
  error?: string;
}

export async function verifyMailProvider(config: AppConfig): Promise<ProviderCheck> {
  if (config.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/domains?limit=1', {
        headers: { Authorization: `Bearer ${config.RESEND_API_KEY}` },
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        return {
          ok: false,
          provider: 'resend',
          detail: `Resend rejected the key (HTTP ${res.status}).`,
          error: `Resend ${res.status}: ${body}`,
        };
      }
      const data = (await res.json().catch(() => ({}))) as { data?: unknown[] };
      const domains = Array.isArray(data.data) ? data.data.length : 0;
      return {
        ok: true,
        provider: 'resend',
        detail:
          domains > 0
            ? `Resend accepted the API key (${domains} sending domain${domains === 1 ? '' : 's'} registered).`
            : 'Resend accepted the API key, but no sending domain is registered yet — EMAIL_FROM must be on a verified domain.',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resend unreachable';
      return {
        ok: false,
        provider: 'resend',
        detail: 'Resend could not be reached.',
        error: message,
      };
    }
  }

  const transporter = getTransporter(config);
  if (!transporter) {
    return {
      ok: false,
      provider: 'none',
      detail: 'No mail provider is configured.',
      error: 'no mail transport configured',
    };
  }

  try {
    await transporter.verify();
    return {
      ok: true,
      provider: 'smtp',
      detail: `Connected to ${config.SMTP_HOST}:${config.SMTP_PORT} and authenticated.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMTP check failed';
    return {
      ok: false,
      provider: 'smtp',
      detail: `Could not complete an SMTP handshake with ${config.SMTP_HOST}:${config.SMTP_PORT}.`,
      error: message,
    };
  }
}

export function createEmailTransport(config: AppConfig, logger: Logger): EmailTransport {
  // Priority: Resend > SMTP > dev-log
  const resendApiKey = config.RESEND_API_KEY;
  if (resendApiKey) {
    resendKey = resendApiKey;
    const from = config.EMAIL_FROM ?? 'ORQ8 <founder@orq8.ai>';
    return {
      async send(input) {
        logger.info({ mode: 'resend', to: input.to, subject: input.subject }, 'sending email via Resend');
        const result = await sendViaResend(resendApiKey, input, from);
        if (!result.ok) logger.error({ err: result.error, to: input.to }, 'Resend send failed');
        return { ...result, delivered: result.ok };
      },
    };
  }

  const transporter = getTransporter(config);

  if (!transporter) {
    // No provider configured. Outside production that is a development choice:
    // the message body is printed (links and all) so a signup can actually be
    // completed without a mail server, and the send reports success so the
    // queue drains.
    //
    // In production it is a misconfiguration, and it used to look exactly like
    // success: the only visible trace was `waitlist email (dev)`, the message
    // was dropped, and every account created afterwards was locked out with
    // "Confirm your email address to continue" while the founder waited for a
    // link that could never arrive. It now fails loudly instead.
    const printable = config.NODE_ENV !== 'production';
    return {
      async send(input) {
        if (printable) {
          // `warn`, not `info`: a stack that runs at LOG_LEVEL=warn would
          // otherwise drop the only copy of a link the user needs.
          logger.warn({ mode: 'dev-mail', to: input.to, subject: input.subject }, 'no mail provider configured — printing the message (non-production)');
          logger.warn({ to: input.to, subject: input.subject, body: input.text }, 'mail body');
          // ok, but not delivered: nothing left this process but a log line.
          return { ok: true, messageId: `dev-${Date.now()}`, delivered: false };
        }
        logger.error(
          { to: input.to, subject: input.subject },
          'no mail provider configured — set RESEND_API_KEY or SMTP; this message was NOT delivered and the account cannot confirm itself',
        );
        return { ok: false, error: 'no mail transport configured', delivered: false };
      },
    };
  }

  return {
    async send(input) {
      try {
        const info = await transporter.sendMail({
          from: config.EMAIL_FROM,
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
        });
        return { ok: true, messageId: info.messageId, delivered: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message, to: input.to, subject: input.subject }, 'waitlist email failed');
        return { ok: false, error: message };
      }
    },
  };
}
