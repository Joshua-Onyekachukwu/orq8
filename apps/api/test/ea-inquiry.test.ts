import { describe, expect, it } from 'vitest';
import { fallbackAnalysis, validateIntent, type ExecutiveContext } from '../src/services/executive-agent.js';

/**
 * §3 inquiry regression pins — informational founder questions are ANSWERED
 * from live org state, never decomposed into tasks that then fail. Found via
 * the live operate-the-business rehearsal: "What needs my approval right now?"
 * produced "3 tasks created… 3 tasks failed" instead of an answer.
 */

function makeCtx(overrides: Partial<ExecutiveContext> = {}): ExecutiveContext {
  return {
    orgId: 'org-1',
    userId: 'user-1',
    agents: [],
    orgStructure: {
      departments: [],
      teams: [
        {
          id: 't1', name: 'Engineering', departmentId: 'd1', departmentName: 'Engineering',
          lead: null, status: 'active', members: [],
          work: { activeTasks: 4, blockedTasks: 2, overdueTasks: 1 },
        },
      ],
      unassignedAgents: 0,
      counts: { departments: 2, teams: 1, agents: 5, activeAgents: 4 },
    },
    activeGoals: [{ id: 'g1', title: 'Ship launch', status: 'active', priority: 'high', progress: 40 }],
    activeTasks: [],
    pendingApprovals: 1,
    recentMemory: [],
    ...overrides,
  } as ExecutiveContext;
}

describe('fallbackAnalysis — pure informational questions are answerOnly', () => {
  it('answers the approvals question with the real pending count, zero tasks', () => {
    const intent = fallbackAnalysis('What needs my approval right now?', makeCtx());
    expect(intent.answerOnly).toBe(true);
    expect(intent.category).toBe('inquiry');
    expect(intent.taskDecomposition).toHaveLength(0);
    expect(intent.response).toContain('1 approval waiting');
    expect(validateIntent(intent)).toBeNull();
  });

  it('reports no approvals honestly when the queue is empty', () => {
    const intent = fallbackAnalysis('What needs my approval right now?', makeCtx({ pendingApprovals: 0 }));
    expect(intent.answerOnly).toBe(true);
    expect(intent.response).toContain('Nothing is waiting for your approval');
  });

  it('answers the blockers question with real blocked counts', () => {
    const intent = fallbackAnalysis('Why is engineering blocked?', makeCtx());
    expect(intent.answerOnly).toBe(true);
    expect(intent.response).toContain('2 blocked tasks');
  });

  it('answers performance questions with live work numbers', () => {
    const intent = fallbackAnalysis('How are we performing this week?', makeCtx());
    expect(intent.answerOnly).toBe(true);
    expect(intent.response).toContain('Active tasks: 4');
    expect(intent.response).toContain('4/5');
  });

  it('keeps work-requesting questions actionable (not answerOnly)', () => {
    const intent = fallbackAnalysis('Research the market for us?', makeCtx());
    expect(intent.answerOnly).toBeUndefined();
    expect(intent.taskDecomposition.length).toBeGreaterThan(0);
  });
});

describe('fallbackAnalysis — first-run discovery answers, never taskified', () => {
  it('treats "I am building X" as a context answer while onboarding is incomplete', () => {
    const intent = fallbackAnalysis("I'm building an AI platform for Nigerian businesses", makeCtx());
    expect(intent.answerOnly).toBe(true);
    expect(intent.category).toBe('inquiry');
    expect(intent.taskDecomposition).toHaveLength(0);
    expect(intent.response).toContain('AI platform for Nigerian businesses');
    expect(intent.response).toContain('Are you still validating');
    expect(validateIntent(intent)).toBeNull();
  });

  it('describes an existing company the same way', () => {
    const intent = fallbackAnalysis('We run a logistics company for pharmacies', makeCtx());
    expect(intent.answerOnly).toBe(true);
    expect(intent.taskDecomposition).toHaveLength(0);
    expect(intent.response).toContain('logistics company for pharmacies');
  });

  it('asks the idea-vs-company follow-up when the answer is too thin to reason about', () => {
    const intent = fallbackAnalysis("I'm building", makeCtx());
    expect(intent.answerOnly).toBe(true);
    expect(intent.response).toContain('an idea, or an existing company');
  });

  it('never reads building statements as engineering delegation', () => {
    const intent = fallbackAnalysis(
      "I'm building a platform that helps small businesses manage inventory",
      makeCtx(),
    );
    expect(intent.taskDecomposition).toHaveLength(0);
    expect(intent.toolCalls).toBeUndefined();
  });

  it('still delegates engineering work once onboarding is complete', () => {
    const doneCtx = makeCtx({ founderContext: { step: 'complete', completedAt: new Date().toISOString(), analysis: null } });
    const intent = fallbackAnalysis("I'm building an AI platform for Nigerian businesses", doneCtx);
    expect(intent.answerOnly).toBeUndefined();
    expect(intent.taskDecomposition.length).toBeGreaterThan(0);
  });
});
