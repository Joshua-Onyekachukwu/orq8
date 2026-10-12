/**
 * Weekly report EA byline — the org's own Executive Agent name must appear as
 * the report byline, and a rename must never leave a stale default behind.
 */
import { describe, expect, it } from 'vitest';
import { weeklyReportEmail } from '../src/email/transactional.js';

const base = {
  orgName: 'Northwind Labs',
  founderName: 'Ada',
  weekStart: '2026-09-28',
  weekEnd: '2026-10-04',
  stats: {
    tasksCompleted: 3,
    tasksPending: 2,
    approvalsProcessed: 2,
    creditsUsed: 12,
    creditsRemaining: 88,
    agentsActive: 7,
    agentsTotal: 7,
  },
  highlights: ['Shipped pricing page'],
};

describe('weeklyReportEmail EA byline', () => {
  it('signs the report with the org’s EA name in text and html', () => {
    const email = weeklyReportEmail({ ...base, eaName: 'Vera' });
    expect(email.text).toContain('Prepared by Vera, your Executive Agent.');
    expect(email.html).toContain('Prepared by Vera, your Executive Agent.');
    expect(email.text).not.toContain('Atlas');
    expect(email.html).not.toContain('Atlas');
  });

  it('omits the byline when the org never renamed its EA', () => {
    const email = weeklyReportEmail(base);
    expect(email.text).not.toContain('Prepared by');
    expect(email.html).not.toContain('Prepared by');
  });
});
