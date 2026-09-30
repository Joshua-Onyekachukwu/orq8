import { describe, expect, it } from 'vitest';
import {
  approvalSeverity,
  approvalSource,
  ATTENTION_SOURCES,
  blockedTaskSeverity,
  classifyApproval,
  classifyBlockedTask,
  classifyCreditAlert,
  classifyEscalation,
  classifyFailedTask,
  classifyGoalDeadline,
  compareAttentionItems,
  creditAlertLabel,
  creditAlertSeverity,
  deadlineSeverity,
  failureSeverity,
  formatCents,
  isPermissionRequest,
  summarizeAttention,
  type AttentionItem,
} from '../src/services/attention.js';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 60 * 60 * 1000);

describe('attention classification', () => {
  it('separates tool permission requests from business approvals', () => {
    expect(isPermissionRequest('Tool: Send external email')).toBe(true);
    expect(isPermissionRequest('tool: gmail.send')).toBe(true);
    expect(isPermissionRequest('Agent "Researcher" wants to use tool "scrape"')).toBe(true);
    expect(isPermissionRequest('Approve the pilot launch budget')).toBe(false);

    expect(approvalSource('Tool: Send external email')).toBe('permission');
    expect(approvalSource('Approve the pilot launch budget')).toBe('approval');
  });

  it('maps approval risk to severity', () => {
    expect(approvalSeverity('high')).toBe('critical');
    expect(approvalSeverity('medium')).toBe('warning');
    expect(approvalSeverity('low')).toBe('info');
    expect(approvalSeverity('unknown')).toBe('info');
  });

  it('escalates urgent blocked work and keeps normal priority informational', () => {
    expect(blockedTaskSeverity('urgent')).toBe('critical');
    expect(blockedTaskSeverity('high')).toBe('warning');
    expect(blockedTaskSeverity('normal')).toBe('info');
  });

  it('keeps fresh high priority failures critical and older ones a warning', () => {
    expect(failureSeverity('urgent', NOW, hoursAgo(48))).toBe('critical');
    expect(failureSeverity('high', NOW, hoursAgo(1))).toBe('critical');
    expect(failureSeverity('high', NOW, hoursAgo(48))).toBe('warning');
    expect(failureSeverity('normal', NOW, hoursAgo(1))).toBe('warning');
  });

  it('maps credit alert types to severity and labels', () => {
    expect(creditAlertSeverity('exhausted')).toBe('critical');
    expect(creditAlertSeverity('critical')).toBe('critical');
    expect(creditAlertSeverity('low')).toBe('warning');
    expect(creditAlertSeverity('warning')).toBe('info');
    expect(creditAlertLabel('exhausted')).toBe('Work Credits exhausted');
    expect(creditAlertLabel('renewal_reminder')).toBe('Work Credits renew soon');
    expect(deadlineSeverity(true)).toBe('critical');
    expect(deadlineSeverity(false)).toBe('warning');
  });

  it('formats cents as the unit the schema stores', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(12345)).toBe('$123.45');
  });
});

function approval(overrides: Partial<Parameters<typeof classifyApproval>[0]> = {}) {
  return classifyApproval(
    {
      id: '11111111-1111-1111-1111-111111111111',
      action: 'Approve the pilot launch budget',
      description: 'The pilot needs a paid channel budget to start.',
      cost: 25000,
      riskLevel: 'medium',
      createdAt: daysAgo(2),
      agentName: 'Atlas',
      agentRole: 'executive_agent',
      ...overrides,
    },
    'Atlas',
  );
}

describe('attention item shape', () => {
  it('traces an approval to its row and offers real actions', () => {
    const item = approval();
    expect(item.id).toBe('approval:11111111-1111-1111-1111-111111111111');
    expect(item.source).toBe('approval');
    expect(item.severity).toBe('warning');
    expect(item.what).toBe('Approve the pilot launch budget');
    expect(item.why).toContain('paid channel budget');
    expect(item.who).toBe('Atlas');
    expect(item.impact).toBe('$250.00 of Work Credits at stake');
    expect(item.next.length).toBeGreaterThan(0);
    expect(item.entity).toEqual({ type: 'approval', id: '11111111-1111-1111-1111-111111111111' });

    const approve = item.actions.find((a) => a.kind === 'approve');
    expect(approve?.endpoint).toBe('/v1/approvals/11111111-1111-1111-1111-111111111111');
    expect(approve?.method).toBe('PATCH');
    expect(approve?.payload).toEqual({ status: 'approved' });

    const reject = item.actions.find((a) => a.kind === 'reject');
    expect(reject?.payload).toEqual({ status: 'rejected' });

    const ask = item.actions.find((a) => a.kind === 'ask_ea');
    expect(ask?.label).toBe('Ask Atlas');
    expect(ask?.prompt).toContain('pilot launch budget');
    expect(ask?.endpoint).toBeUndefined();
  });

  it('classifies a tool permission request as permission with an authority reason', () => {
    const item = approval({
      action: 'Tool: Send external email',
      description: null,
      cost: 0,
      riskLevel: 'high',
    });
    expect(item.source).toBe('permission');
    expect(item.severity).toBe('critical');
    expect(item.authority).toContain('authority profile');
    expect(item.why).toContain('gated tool');
    expect(item.impact).toBe('High risk action');
  });

  it('names the work a decision blocks, instead of asking the founder to rule on a sentence', () => {
    const item = approval({
      taskId: '22222222-2222-2222-2222-222222222222',
      taskTitle: 'Roll out the onboarding sequence',
    });

    expect(item.why).toContain('Roll out the onboarding sequence');
    expect(item.authority).toContain('approving resumes');
    expect(item.authority).toContain('rejecting stops it');
    // The reference stays the approval: the action endpoints must still work.
    expect(item.entity.type).toBe('approval');
  });

  it('names the tool when the gate came from a tool call rather than a task', () => {
    const item = approval({ toolId: 'github.create_pr', description: null, cost: 0 });

    expect(item.why).toContain('github.create_pr');
    expect(item.authority).toContain('authority profile');
  });

  it('describes blocked work with its real age and cancel action', () => {
    const item = classifyBlockedTask(
      {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Migrate billing data',
        status: 'in_progress',
        priority: 'urgent',
        createdAt: daysAgo(9),
        updatedAt: daysAgo(4),
        dueDate: null,
        agentName: 'Engineer',
      },
      NOW,
      'Atlas',
    );
    expect(item.source).toBe('blocked_work');
    expect(item.severity).toBe('critical');
    expect(item.why).toBe('No progress for 4 days while marked in progress.');
    expect(item.who).toBe('Engineer');
    expect(item.actions.map((a) => a.kind)).toEqual(['cancel', 'ask_ea']);
    expect(item.actions[0]?.payload).toEqual({ status: 'cancelled' });
  });

  it('describes a failure with the recorded reason and retry action', () => {
    const item = classifyFailedTask(
      {
        id: '33333333-3333-3333-3333-333333333333',
        title: 'Draft the investor update',
        status: 'failed',
        priority: 'high',
        result: 'No model was available to run the task',
        createdAt: daysAgo(3),
        updatedAt: hoursAgo(2),
        dueDate: null,
        agentName: 'Writer',
      },
      NOW,
      'Atlas',
    );
    expect(item.source).toBe('failure');
    expect(item.severity).toBe('critical');
    expect(item.why).toBe('Last attempt failed: No model was available to run the task');
    // Retry is the endpoint that re-runs the work and reports the outcome, not
    // a status patch that only requeues it.
    const retry = item.actions.find((a) => a.kind === 'retry');
    expect(retry?.method).toBe('POST');
    expect(retry?.endpoint).toBe('/v1/commands/tasks/33333333-3333-3333-3333-333333333333/retry');
    expect(item.actions.find((a) => a.kind === 'cancel')?.payload).toEqual({ status: 'cancelled' });
  });

  it('truncates long failure reasons instead of pasting a wall of text', () => {
    const item = classifyFailedTask(
      {
        id: '33333333-3333-3333-3333-333333333334',
        title: 'Long failure',
        status: 'failed',
        priority: 'normal',
        result: 'x'.repeat(1000),
        createdAt: daysAgo(1),
        updatedAt: hoursAgo(1),
        dueDate: null,
        agentName: null,
      },
      NOW,
      'Atlas',
    );
    expect(item.why.length).toBeLessThan(250);
    expect(item.who).toBe('Unassigned');
  });

  it('describes credit alerts from the recorded message and metadata', () => {
    const item = classifyCreditAlert(
      {
        id: '44444444-4444-4444-4444-444444444444',
        type: 'critical',
        message: 'Work Credits critically low, only 12 remaining.',
        sentAt: hoursAgo(3),
        metadata: { remaining: 12, total: 1000, utilizationPercent: 99 },
      },
      'Atlas',
    );
    expect(item.source).toBe('credits');
    expect(item.severity).toBe('critical');
    expect(item.what).toBe('Work Credits critically low');
    expect(item.impact).toBe('12 of 1000 credits remaining this period');
    expect(item.actions.find((a) => a.kind === 'acknowledge')?.endpoint).toBe(
      '/v1/credits/alerts/44444444-4444-4444-4444-444444444444/read',
    );
  });

  it('distinguishes overdue goals from goals close to their deadline', () => {
    const overdue = classifyGoalDeadline(
      {
        id: '55555555-5555-5555-5555-555555555555',
        title: 'Launch the Lagos pilot',
        progress: 40,
        priority: 'high',
        dueDate: daysAgo(2),
        createdAt: daysAgo(30),
      },
      NOW,
      'Atlas',
    );
    expect(overdue.source).toBe('deadline');
    expect(overdue.severity).toBe('critical');
    expect(overdue.why).toBe('Overdue by 2 days at 40% progress.');
    expect(overdue.next).toBe('Re-plan the goal or pause it.');
    expect(overdue.actions.find((a) => a.kind === 'pause')?.payload).toEqual({ status: 'paused' });

    const soon = classifyGoalDeadline(
      {
        id: '55555555-5555-5555-5555-555555555556',
        title: 'Close the pilot contract',
        progress: 20,
        priority: 'normal',
        dueDate: hoursFromNow(30),
        createdAt: daysAgo(10),
      },
      NOW,
      'Atlas',
    );
    expect(soon.severity).toBe('warning');
    expect(soon.why).toBe('Due in about 30h at 20% progress.');
    expect(soon.next).toBe('Decide whether the deadline still holds.');
  });

  it('treats a council escalation as a decision the founder owes', () => {
    const item = classifyEscalation(
      {
        id: '66666666-6666-6666-6666-666666666666',
        title: 'Should we enter the Nigerian market this quarter?',
        confidence: 'medium',
        whatWasDecided: 'Recommend a limited pilot first.',
        createdAt: hoursAgo(5),
      },
      'Atlas',
    );
    expect(item.source).toBe('escalation');
    expect(item.severity).toBe('critical');
    expect(item.who).toBe('Decision Council');
    expect(item.why).toContain('Recommend a limited pilot first.');
    expect(item.impact).toBe('Council confidence: medium');
    expect(item.actions.find((a) => a.kind === 'approve')?.payload).toEqual({ founderVerdict: 'approved' });
    expect(item.actions.find((a) => a.kind === 'reject')?.payload).toEqual({ founderVerdict: 'rejected' });
  });
});

describe('attention ordering and summary', () => {
  function item(partial: Partial<AttentionItem>): AttentionItem {
    return {
      id: 'x',
      source: 'approval',
      severity: 'warning',
      what: 'x',
      why: 'x',
      who: null,
      authority: 'x',
      impact: null,
      next: 'x',
      entity: { type: 'approval', id: 'x' },
      createdAt: NOW.toISOString(),
      dueAt: null,
      actions: [],
      ...partial,
    };
  }

  it('orders severity first, then decisions before information, then oldest first', () => {
    const items = [
      item({ id: 'info-deadline', source: 'deadline', severity: 'info', createdAt: hoursAgo(1).toISOString() }),
      item({ id: 'warning-failure', source: 'failure', severity: 'warning', createdAt: hoursAgo(1).toISOString() }),
      item({ id: 'critical-credits', source: 'credits', severity: 'critical', createdAt: hoursAgo(1).toISOString() }),
      item({ id: 'critical-approval-old', source: 'approval', severity: 'critical', createdAt: hoursAgo(72).toISOString() }),
      item({ id: 'critical-approval-new', source: 'approval', severity: 'critical', createdAt: hoursAgo(2).toISOString() }),
      item({ id: 'warning-approval', source: 'approval', severity: 'warning', createdAt: hoursAgo(5).toISOString() }),
    ];
    const ordered = [...items].sort(compareAttentionItems).map((i) => i.id);
    expect(ordered).toEqual([
      'critical-approval-old',
      'critical-approval-new',
      'critical-credits',
      'warning-approval',
      'warning-failure',
      'info-deadline',
    ]);
  });

  it('summarizes counts by severity and source and reports zeroes honestly', () => {
    const summary = summarizeAttention([
      item({ id: 'a', source: 'approval', severity: 'critical' }),
      item({ id: 'b', source: 'failure', severity: 'warning' }),
      item({ id: 'c', source: 'failure', severity: 'info' }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.critical).toBe(1);
    expect(summary.warning).toBe(1);
    expect(summary.info).toBe(1);
    expect(summary.bySource.failure).toBe(2);
    expect(summary.bySource.approval).toBe(1);
    for (const source of ATTENTION_SOURCES) {
      if (source === 'failure' || source === 'approval') continue;
      expect(summary.bySource[source]).toBe(0);
    }

    const quiet = summarizeAttention([]);
    expect(quiet.total).toBe(0);
    expect(quiet.bySource.escalation).toBe(0);
  });
});
