// Transactional email send helper.
// Wires the email transport to the transactional templates.
// Falls back to dev mode (log only) when SMTP is not configured.

import type { Logger } from 'pino';
import type { EmailTransport } from './transport.js';
import {
  passwordResetEmail,
  creditAlertEmail,
  weeklyReportEmail,
} from './transactional.js';

export interface TransactionalEmailer {
  sendPasswordReset(input: {
    email: string;
    resetUrl: string;
    expiresInMinutes?: number;
  }): Promise<{ ok: boolean; error?: string }>;

  sendCreditAlert(input: {
    email: string;
    orgName: string;
    alertType: 'warning' | 'low' | 'critical' | 'exhausted';
    remaining: number;
    total: number;
    utilizationPercent: number;
    daysRemaining: number;
  }): Promise<{ ok: boolean; error?: string }>;

  sendWeeklyReport(input: {
    email: string;
    orgName: string;
    founderName: string;
    weekStart: string;
    weekEnd: string;
    stats: {
      tasksCompleted: number;
      tasksPending: number;
      approvalsProcessed: number;
      creditsUsed: number;
      creditsRemaining: number;
      agentsActive: number;
      agentsTotal: number;
    };
    highlights: string[];
  }): Promise<{ ok: boolean; error?: string }>;
}

export function createTransactionalEmailer(
  transport: EmailTransport,
  logger: Logger,
): TransactionalEmailer {
  async function send(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const result = await transport.send({ to, subject, text, html });
    if (!result.ok) {
      logger.error({ to, subject, error: result.error }, 'Transactional email failed');
    } else {
      logger.info({ to, subject, messageId: result.messageId }, 'Transactional email sent');
    }
    return result;
  }

  return {
    async sendPasswordReset(input) {
      const email = passwordResetEmail(input);
      return send(input.email, email.subject, email.text, email.html);
    },

    async sendCreditAlert(input) {
      const email = creditAlertEmail(input);
      return send(input.email, email.subject, email.text, email.html);
    },

    async sendWeeklyReport(input) {
      const email = weeklyReportEmail(input);
      return send(input.email, email.subject, email.text, email.html);
    },
  };
}
