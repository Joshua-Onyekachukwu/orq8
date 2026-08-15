import { describe, expect, it } from 'vitest';
import {
  DRIP_DELAYS,
  DRIP_KINDS,
  dripEmailsFor,
  drip2dEmail,
  drip7dEmail,
  welcomeEmail,
} from '../src/email/templates.js';

describe('waitlist drip templates', () => {
  it('renders all three stages with subject + text + html', () => {
    const emails = dripEmailsFor({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(emails.map((e) => e.kind)).toEqual(['welcome', 'drip_2d', 'drip_7d']);
    for (const e of emails) {
      expect(e.subject.length).toBeGreaterThan(10);
      expect(e.bodyText).toContain('Ada');
      expect(e.bodyHtml).toContain('Ada');
      expect(e.bodyHtml).toContain('ORQ8');
      expect(e.bodyHtml.startsWith('<!doctype html>')).toBe(true);
    }
  });

  it('welcome matches the design-partner confirmation flow (marketing §4)', () => {
    const e = welcomeEmail({ name: 'Ada', email: 'ada@example.com' });
    expect(e.subject).toBe('Application received — ORQ8 design partners');
    expect(e.bodyText).toContain('20-minute call');
    expect(e.bodyText).toContain('3–5 founders');
    expect(e.bodyText).toContain('one real decision');
  });

  it('personalizes with the email local part when no name is given', () => {
    const e = welcomeEmail({ name: null, email: 'ada@example.com' });
    expect(e.bodyText).toContain('Hi ada');
    expect(e.bodyHtml).toContain('Hi <strong>ada</strong>');
  });

  it('drip_2d sells the first-session experience; drip_7d closes the cohort', () => {
    const d2 = drip2dEmail({ name: 'Ada', email: 'ada@example.com' });
    expect(d2.bodyText).toContain('bring your own keys');
    expect(d2.bodyText).toContain('final authority');
    const d7 = drip7dEmail({ name: 'Ada', email: 'ada@example.com' });
    expect(d7.bodyText).toContain('3–5 founders');
    expect(d7.bodyText).toContain('seats are already filling');
  });

  it('drip delays are welcome=0, day 2, day 7', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(DRIP_DELAYS.welcome).toBe(0);
    expect(DRIP_DELAYS.drip_2d).toBe(2 * day);
    expect(DRIP_DELAYS.drip_7d).toBe(7 * day);
    expect(DRIP_KINDS).toEqual(['welcome', 'drip_2d', 'drip_7d']);
  });
});
