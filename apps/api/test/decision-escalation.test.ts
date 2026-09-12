import { describe, expect, it } from 'vitest';
import { evaluateEscalation } from '../src/services/model-intelligence.js';

/**
 * §17 decision-escalation regression pins.
 *
 * Root cause fixed here: a launch go/no-go question that draws in four
 * departments ("launch now or run a controlled beta?") was classified
 * `single_agent` because the impact-dimension regexes key on $ figures and
 * strategy/security/legal keywords. The deliberation then ran 3 rounds × 4
 * participants at council depth — but skipped Decision Memory persistence,
 * so the session never appeared on the Decision Council page. Department
 * breadth now counts toward escalation, and council-level sessions always
 * persist.
 */
describe('evaluateEscalation — department-aware escalation', () => {
  it('classifies a multi-department launch question as department_council (regression)', () => {
    const result = evaluateEscalation({
      question:
        'Should we launch the AI Workflow Intelligence product now, or run a two-week controlled beta with existing users first?',
      context:
        'Demo org is Stage 1 with Product, Engineering, Marketing, Sales and Executive Office departments.',
    });

    // 4 department hints match (engineering, marketing, sales, product) —
    // this is a cross-department decision even with no $ figure present.
    expect(result.departments.length).toBeGreaterThanOrEqual(3);
    expect(result.level).toBe('department_council');
  });

  it('classifies a $10k strategic launch as executive_deliberation with founder approval', () => {
    const result = evaluateEscalation({
      question: 'Should we spend $20,000 launching this product?',
    });

    expect(result.level).toBe('executive_deliberation');
    expect(result.requiresFounderApproval).toBe(true);
  });

  it('keeps trivial single-department questions at single_agent', () => {
    const result = evaluateEscalation({
      question: 'Summarize the support inbox for today.',
    });

    expect(result.departments.length).toBeLessThan(3);
    expect(result.level).toBe('single_agent');
  });

  it('escalates two-dimension questions to department_council as before', () => {
    const result = evaluateEscalation({
      question: 'We should invest in a security audit for the new billing flow.',
    });

    expect(result.level).toBe('department_council');
  });
});
