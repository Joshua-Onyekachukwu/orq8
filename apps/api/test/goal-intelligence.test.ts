import { describe, it, expect } from 'vitest';
import { classifyGoalHealth, buildRecoveryProposal } from '../src/services/goal-intelligence.js';

const NOW = new Date('2026-09-06T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('classifyGoalHealth', () => {
  it('reports no_activity when the goal has no tasks', () => {
    expect(classifyGoalHealth({ progress: 0, dueDate: null, updatedAt: NOW, now: NOW, taskCount: 0, blockedCount: 0, failedCount: 0 }))
      .toBe('no_activity');
  });

  it('reports on_track for a healthy goal', () => {
    expect(classifyGoalHealth({ progress: 80, dueDate: new Date(NOW.getTime() + 10 * DAY), updatedAt: NOW, now: NOW, taskCount: 3, blockedCount: 0, failedCount: 0 }))
      .toBe('on_track');
  });

  it('reports at_risk when due within 72h below 60%', () => {
    expect(classifyGoalHealth({ progress: 40, dueDate: new Date(NOW.getTime() + 24 * 60 * 60 * 1000), updatedAt: NOW, now: NOW, taskCount: 2, blockedCount: 0, failedCount: 0 }))
      .toBe('at_risk');
  });

  it('is not at risk when past due', () => {
    expect(classifyGoalHealth({ progress: 40, dueDate: new Date(NOW.getTime() - DAY), updatedAt: NOW, now: NOW, taskCount: 2, blockedCount: 0, failedCount: 0 }))
      .not.toBe('at_risk');
  });

  it('reports stalled after 3 days without update', () => {
    expect(classifyGoalHealth({ progress: 50, dueDate: null, updatedAt: new Date(NOW.getTime() - 4 * DAY), now: NOW, taskCount: 2, blockedCount: 0, failedCount: 0 }))
      .toBe('stalled');
  });

  it('reports blocked when tasks are blocked or failed', () => {
    expect(classifyGoalHealth({ progress: 50, dueDate: null, updatedAt: NOW, now: NOW, taskCount: 2, blockedCount: 1, failedCount: 0 }))
      .toBe('blocked');
    expect(classifyGoalHealth({ progress: 50, dueDate: null, updatedAt: NOW, now: NOW, taskCount: 2, blockedCount: 0, failedCount: 1 }))
      .toBe('blocked');
  });
});

describe('buildRecoveryProposal', () => {
  const base = {
    goalTitle: 'Launch MVP',
    health: 'on_track' as const,
    blockedTasks: [],
    overdueTasks: [],
    failedTasks: [],
    atRisk: false,
  };

  it('proposes creating tasks when there is no activity', () => {
    const out = buildRecoveryProposal({ ...base, health: 'no_activity' });
    expect(out.some((r) => r.action.includes('Create initial tasks'))).toBe(true);
  });

  it('flags deadline risk with an approval-gated action', () => {
    const out = buildRecoveryProposal({ ...base, health: 'at_risk', atRisk: true });
    expect(out.some((r) => r.action.includes('Raise priority') && r.requiresApproval)).toBe(true);
  });

  it('proposes investigation for blocked and overdue tasks', () => {
    const out = buildRecoveryProposal({
      ...base,
      blockedTasks: [{ title: 'Design landing page' }],
      overdueTasks: [{ title: 'Write copy' }],
    });
    expect(out.some((r) => r.action.includes('Investigate or reassign "Design landing page"'))).toBe(true);
    expect(out.some((r) => r.action.includes('Reschedule or reassign "Write copy"'))).toBe(true);
  });

  it('proposes diagnosis for failed tasks', () => {
    const out = buildRecoveryProposal({ ...base, failedTasks: [{ title: 'Setup CI' }] });
    expect(out.some((r) => r.action.includes('Diagnose and revise "Setup CI"'))).toBe(true);
  });

  it('returns a continue action when nothing is wrong', () => {
    const out = buildRecoveryProposal(base);
    expect(out).toHaveLength(1);
    expect(out[0]?.action).toContain('Continue current execution');
  });
});