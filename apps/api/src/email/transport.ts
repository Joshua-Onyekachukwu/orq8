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
        return result;
      },
    };
  }

  const transporter = getTransporter(config);

  if (!transporter) {
    // Dev/log mode — never throws, marks sends as ok so the queue drains.
    return {
      async send(input) {
        logger.info({ mode: 'dev-mail', to: input.to, subject: input.subject }, 'waitlist email (dev)');
        return { ok: true, messageId: `dev-${Date.now()}` };
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
        return { ok: true, messageId: info.messageId };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message, to: input.to, subject: input.subject }, 'waitlist email failed');
        return { ok: false, error: message };
      }
    },
  };
}
