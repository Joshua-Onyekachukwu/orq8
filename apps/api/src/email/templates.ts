// Waitlist drip email templates (marketing/design_partner_application.md §4, docs/00 GTM).
// HTML is inline-styled (email-safe) in the calm-executive direction: navy base,
// lime accent, mono eyebrow, hairline borders — matching marketing/DESIGN_DIRECTION.md.

export interface DripEmail {
  kind: 'welcome' | 'drip_2d' | 'drip_7d';
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

const NAVY = '#0a1024';
const INK = '#1c2540';
const MUTED = '#5b6478';
const HAIRLINE = '#e4e7ef';
const LIME = '#b6e63d';
const BG = '#f7f8fb';

function firstName(name?: string | null, email?: string): string {
  const raw = name?.trim();
  if (raw) return raw.split(/\s+/)[0] ?? 'there';
  const local = email?.split('@')[0];
  return local ?? 'there';
}

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

function h2(text: string): string {
  return `<h2 style="font-size:18px;line-height:1.35;margin:24px 0 8px;color:${NAVY};">${text}</h2>`;
}

function p(text: string): string {
  return `<p style="margin:8px 0;">${text}</p>`;
}

function cta(href: string, label: string): string {
  return `<p style="margin:24px 0 8px;"><a href="${href}" style="display:inline-block;background:${LIME};color:${NAVY};font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;font-family:'JetBrains Mono',Consolas,Menlo,monospace;font-size:13px;">${label}</a></p>`;
}

export function welcomeEmail(input: { name?: string | null; email: string }): DripEmail {
  const f = firstName(input.name, input.email);
  const subject = 'Application received — ORQ8 design partners';
  const bodyText = [
    `Hi ${f},`,
    '',
    "Thanks — your application is in. We read every one, so thank you for taking the time.",
    '',
    'What happens next: we review applications within 3–5 days. If it looks like a fit, you\'ll get a calendar link for a 20-minute call — we\'ll walk the Golden Workflow on your idea, not a canned demo, and set up your organization, Company Constitution, and first council right after.',
    '',
    "Before the call, have this ready: the one real decision from your application. That's the first thing we'll put through ORQ8 together.",
    '',
    "A quick recap of the deal: free Pro-equivalent access through beta (~6 months) in exchange for using ORQ8 on that one decision and telling us honestly what's broken. Your feedback ships — this cohort defines the product.",
    '',
    'We\'re keeping the cohort deliberately small — 3–5 founders — and slots close when it\'s full.',
    '',
    'Speak soon,',
    'Joshua',
    'Founder, ORQ8 · orq8.ai',
  ].join('\n');

  const bodyHtml = shell(
    'design partners · application received',
    [
      p(`Hi <strong>${f}</strong>,`),
      p("Thanks — your application is in. We read every one, so thank you for taking the time."),
      h2('What happens next'),
      p("We review applications within <strong>3–5 days</strong>. If it looks like a fit, you'll get a calendar link for a <strong>20-minute call</strong> — we'll walk the Golden Workflow on <em>your</em> idea, not a canned demo, and set up your organization, Company Constitution, and first council right after."),
      h2('Before the call'),
      p("Have the <strong>one real decision</strong> from your application ready — it's the first thing we'll put through ORQ8 together."),
      h2('A quick recap of the deal'),
      p("Free <strong>Pro-equivalent access</strong> through beta (~6 months) in exchange for using ORQ8 on that one decision and telling us honestly what's broken. Your feedback ships — this cohort defines the product."),
      p("We're keeping the cohort deliberately small — <strong>3–5 founders</strong> — and slots close when it's full."),
      p("Speak soon,<br />Joshua<br /><span style='color:${MUTED};'>Founder, ORQ8 · orq8.ai</span>"),
    ].join(''),
  );
  return { kind: 'welcome', subject, bodyText, bodyHtml };
}

export function drip2dEmail(input: { name?: string | null; email: string }): DripEmail {
  const f = firstName(input.name, input.email);
  const subject = 'What you\'ll see when ORQ8 opens';
  const bodyText = [
    `Hi ${f},`,
    '',
    'While your application is in the queue, here\'s what you\'ll actually be able to do in the first session:',
    '',
    '1. Tell ORQ8 the one real decision in plain words — "we should build X" or "I\'m not sure where to start".',
    '2. Watch it pull your context, plan the work, and come back with a recommendation — with evidence and the assumptions it made.',
    '3. Approve or push back on one screen. The Executive Agent does the orchestration; you stay the final authority.',
    '',
    'No prompts to learn. No dashboard to master. It reads like a competent employee, not a tool.',
    '',
    'Also: bring your own keys. OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter, or local models — your data stays yours, and costs stay under your control.',
    '',
    "If something's on your mind before the call, just reply to this email — a human reads these.",
    '',
    'Joshua',
    'Founder, ORQ8',
  ].join('\n');

  const bodyHtml = shell(
    'design partners · while you wait',
    [
      p(`Hi <strong>${f}</strong>,`),
      p("While your application is in the queue, here's what you'll actually be able to do in the first session:"),
      h2('1 · State the decision'),
      p("Tell ORQ8 the one real decision in plain words — <em>\"we should build X\"</em> or <em>\"I'm not sure where to start\"</em>."),
      h2('2 · Watch it work'),
      p("It pulls your context, plans the work, and comes back with a recommendation — evidence and assumptions included."),
      h2('3 · Approve on one screen'),
      p("The Executive Agent orchestrates; <strong>you stay the final authority</strong>. No prompts to learn, no dashboard to master — it reads like a competent employee, not a tool."),
      h2('Bring your own keys'),
      p("OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter, or local models. Your data stays yours; costs stay under your control."),
      p("Something on your mind before the call? Reply to this email — a human reads these."),
      p("Joshua<br /><span style='color:${MUTED};'>Founder, ORQ8</span>"),
    ].join(''),
  );
  return { kind: 'drip_2d', subject, bodyText, bodyHtml };
}

export function drip7dEmail(input: { name?: string | null; email: string }): DripEmail {
  const f = firstName(input.name, input.email);
  const subject = 'The cohort closes when it\'s full (3–5 founders)';
  const bodyText = [
    `Hi ${f},`,
    '',
    'Quick note — the design-partner cohort stays deliberately small: 3–5 founders, and the first seats are already filling.',
    '',
    'If ORQ8 is meant to run your one real decision, the best time to lock in a seat is now. If it\'s not the right fit, no hard feelings — we\'re keeping the list warm for general access either way.',
    '',
    'Your application is still open. To keep it front of mind:',
    '',
    `- the one real decision: ${''}`,
    '- the rough edges you can already name',
    '- the thing you keep doing yourself that should be delegated',
    '',
    'Reply to this email with any questions — or with the decision, if you want a head start on the call.',
    '',
    'Joshua',
    'Founder, ORQ8',
  ].join('\n');

  const bodyHtml = shell(
    'design partners · final call',
    [
      p(`Hi <strong>${f}</strong>,`),
      p("Quick note — the design-partner cohort stays deliberately small: <strong>3–5 founders</strong>, and the first seats are already filling."),
      p("If ORQ8 is meant to run your one real decision, the best time to lock in a seat is now. If it's not the right fit, no hard feelings — we're keeping the list warm for general access either way."),
      h2('Keep it front of mind'),
      p("Your application is still open. To come in ready, have these three things on hand:"),
      p("· the one real decision<br />· the rough edges you can already name<br />· the thing you keep doing yourself that should be delegated"),
      p("Reply to this email with any questions — or with the decision, if you want a head start on the call."),
      p("Joshua<br /><span style='color:${MUTED};'>Founder, ORQ8</span>"),
    ].join(''),
  );
  return { kind: 'drip_7d', subject, bodyText, bodyHtml };
}

export const DRIP_KINDS = ['welcome', 'drip_2d', 'drip_7d'] as const;

export function dripEmailsFor(input: { name?: string | null; email: string }): DripEmail[] {
  return [welcomeEmail(input), drip2dEmail(input), drip7dEmail(input)];
}

/** Delay after signup for each drip stage (ms). Welcome goes out ~immediately. */
export const DRIP_DELAYS: Record<(typeof DRIP_KINDS)[number], number> = {
  welcome: 0,
  drip_2d: 2 * 24 * 60 * 60 * 1000,
  drip_7d: 7 * 24 * 60 * 60 * 1000,
};
