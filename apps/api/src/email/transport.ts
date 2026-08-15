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
    });
  }
  return cachedTransporter;
}

export function createEmailTransport(config: AppConfig, logger: Logger): EmailTransport {
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
