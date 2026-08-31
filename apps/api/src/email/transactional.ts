// Transactional email templates for ORQ8.
// HTML is inline-styled (email-safe) matching the ORQ8 design system.

const NAVY = '#0a1024';
const INK = '#1c2540';
const MUTED = '#5b6478';
const HAIRLINE = '#e4e7ef';
const LIME = '#b6e63d';
const BG = '#f7f8fb';

function shell(eyebrow: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:12px;overflow:hidden;">
      <tr><td style="background:${NAVY};padding:20px 28px;">
        <span style="font-family:'JetBrains Mono',Consolas,Menlo,monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${LIME};">${eyebrow}</span>
        <span style="float:right;color:#ffffff;font-weight:700;font-size:15px;letter-spacing:0.06em;">ORQ8</span>
      </td></tr>
      <tr><td style="padding:32px 28px;font-size:15px;line-height:1.6;">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid ${HAIRLINE};color:${MUTED};font-size:12px;line-height:1.5;">
        ORQ8 — the AI organization operating system.<br />
        <span style="font-family:'JetBrains Mono',Consolas,Menlo,monospace;">reply to this email · founder@orq8.ai</span>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

function p(text: string): string {
  return `<p style="margin:8px 0;">${text}</p>`;
}

function cta(href: string, label: string): string {
  return `<p style="margin:24px 0 8px;"><a href="${href}" style="display:inline-block;background:${LIME};color:${NAVY};font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;font-family:'JetBrains Mono',Consolas,Menlo,monospace;font-size:13px;">${label}</a></p>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${HAIRLINE};margin:20px 0;" />`;
}

// ─── Password Reset ─────────────────────────────────────────────────────────

export function passwordResetEmail(input: {
  email: string;
  resetUrl: string;
  expiresInMinutes?: number;
}): { subject: string; text: string; html: string } {
  const mins = input.expiresInMinutes ?? 60;
  const subject = 'Reset your ORQ8 password';
  const text = [
    'You requested a password reset for your ORQ8 account.',
    '',
    `Click the link below to reset your password. This link expires in ${mins} minutes.`,
    '',
    input.resetUrl,
    '',
    'If you did not request this, you can safely ignore this email.',
    '',
    'ORQ8 — the AI organization operating system.',
  ].join('\n');

  const html = shell(
    'security · password reset',
    [
      p('You requested a password reset for your ORQ8 account.'),
      p(`Click the button below to set a new password. This link expires in <strong>${mins} minutes</strong>.`),
      cta(input.resetUrl, 'Reset Password'),
      divider(),
      p(`<span style="color:${MUTED};font-size:13px;">If you did not request this, you can safely ignore this email. Your password will not change until you click the link and set a new one.</span>`),
    ].join(''),
  );

  return { subject, text, html };
}

// ─── Credit Alerts ──────────────────────────────────────────────────────────

export function creditAlertEmail(input: {
  orgName: string;
  alertType: 'warning' | 'low' | 'critical' | 'exhausted';
  remaining: number;
  total: number;
  utilizationPercent: number;
  daysRemaining: number;
}): { subject: string; text: string; html: string } {
  const { orgName, alertType, remaining, total, utilizationPercent, daysRemaining } = input;

  const subjects = {
    warning: `[ORQ8] Work Credits at ${utilizationPercent}% — ${remaining} remaining`,
    low: `[ORQ8] Work Credits running low — ${remaining} remaining`,
    critical: `[ORQ8] ⚠️ Work Credits critically low — only ${remaining} left`,
    exhausted: `[ORQ8] 🚨 Work Credits exhausted — action required`,
  };

  const headlines = {
    warning: 'work credits · usage update',
    low: 'work credits · running low',
    critical: 'work credits · critically low',
    exhausted: 'work credits · exhausted',
  };

  const accentColor = {
    warning: '#f59e0b',
    low: '#f97316',
    critical: '#ef4444',
    exhausted: '#dc2626',
  };

  const bodyLines = {
    warning: [
      `Your AI organization <strong>${orgName}</strong> has used ${utilizationPercent}% of its monthly Work Credits.`,
      `<strong>${remaining}</strong> credits remain out of <strong>${total}</strong> this period.`,
      `At current usage, you have approximately <strong>${daysRemaining} days</strong> left in this billing cycle.`,
    ],
    low: [
      `Your AI organization <strong>${orgName}</strong> is running low on Work Credits.`,
      `Only <strong>${remaining}</strong> credits remain out of <strong>${total}</strong> (${utilizationPercent}% used).`,
      `Your AI employees may not be able to complete all assigned tasks if credits run out.`,
    ],
    critical: [
      `Your AI organization <strong>${orgName}</strong> has critically low Work Credits.`,
      `Only <strong>${remaining}</strong> credits remain. AI employee operations may fail.`,
      `<strong>Top up credits or upgrade your plan</strong> to keep your AI workforce running.`,
    ],
    exhausted: [
      `Your AI organization <strong>${orgName}</strong> has <strong>exhausted all Work Credits</strong>.`,
      `All AI employee operations are currently paused.`,
      `<strong>Top up credits or upgrade your plan</strong> to resume operations.`,
    ],
  };

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const subject = subjects[alertType];
  const text = [
    headlines[alertType],
    '',
    ...bodyLines[alertType].map((line) => line.replace(/<[^>]+>/g, '')),
    '',
    `View Credits & Upgrade: ${appUrl}/app/budgets`,
    '',
    'ORQ8 — the AI organization operating system.',
  ].join('\n');

  const html = shell(
    headlines[alertType],
    [
      ...bodyLines[alertType].map((line) => p(line)),
      cta(`${appUrl}/app/budgets`, 'View Credits & Upgrade'),
    ].join(''),
  );

  return { subject, text, html };
}

// ─── Weekly Report ──────────────────────────────────────────────────────────

export function weeklyReportEmail(input: {
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
}): { subject: string; text: string; html: string } {
  const { orgName, founderName, weekStart, weekEnd, stats, highlights } = input;
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  const subject = `[ORQ8] Weekly Report — ${weekStart} to ${weekEnd}`;
  const text = [
    `Hi ${founderName},`,
    '',
    `Here's your weekly executive summary for ${orgName}.`,
    '',
    `Tasks: ${stats.tasksCompleted} completed, ${stats.tasksPending} pending`,
    `Approvals: ${stats.approvalsProcessed} processed`,
    `Credits: ${stats.creditsUsed} used, ${stats.creditsRemaining} remaining`,
    `AI Workforce: ${stats.agentsActive}/${stats.agentsTotal} active`,
    '',
    'Highlights:',
    ...highlights.map((h) => `· ${h}`),
    '',
    `View full report: ${appUrl}/app/report`,
    '',
    'ORQ8 — the AI organization operating system.',
  ].join('\n');

  const html = shell(
    'weekly report',
    [
      p(`Hi <strong>${founderName}</strong>,`),
      p(`Here's your weekly executive summary for <strong>${orgName}</strong>.`),
      p(`<span style="color:${MUTED};font-size:13px;">${weekStart} — ${weekEnd}</span>`),

      // Stats grid
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
        <tr>
          <td style="padding:12px;background:${BG};border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:24px;font-weight:700;color:${NAVY};">${stats.tasksCompleted}</div>
            <div style="font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.1em;">Tasks Done</div>
          </td>
          <td style="width:4px;"></td>
          <td style="padding:12px;background:${BG};border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:24px;font-weight:700;color:${NAVY};">${stats.approvalsProcessed}</div>
            <div style="font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.1em;">Approvals</div>
          </td>
          <td style="width:4px;"></td>
          <td style="padding:12px;background:${BG};border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:24px;font-weight:700;color:${NAVY};">${stats.creditsUsed}</div>
            <div style="font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.1em;">Credits Used</div>
          </td>
          <td style="width:4px;"></td>
          <td style="padding:12px;background:${BG};border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:24px;font-weight:700;color:${NAVY};">${stats.agentsActive}/${stats.agentsTotal}</div>
            <div style="font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.1em;">Agents Active</div>
          </td>
        </tr>
      </table>`,

      divider(),

      p('<strong>This Week\'s Highlights</strong>'),
      ...highlights.map((h) => p(`· ${h}`)),

      cta(`${appUrl}/app/report`, 'View Full Report'),
    ].join(''),
  );

  return { subject, text, html };
}
