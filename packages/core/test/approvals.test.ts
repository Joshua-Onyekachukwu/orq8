import { describe, expect, it } from 'vitest';

/**
 * Approval Gates tests — state machine, validation, and decision logic.
 *
 * Tests the pure business logic of the approval system without
 * requiring a running server or database.
 */

// ─── Approval State Machine ──────────────────────────────────────────────────

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'modified' | 'expired';

interface ApprovalRequest {
  id: string;
  orgId: string;
  agentId: string | null;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: 'low' | 'medium' | 'high';
  status: ApprovalStatus;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

/**
 * Simulates the approval decision logic from the backend.
 * Only pending approvals can be decided upon.
 */
function decideApproval(
  approval: ApprovalRequest,
  newStatus: 'approved' | 'rejected' | 'modified',
  note?: string,
): { success: boolean; updated?: ApprovalRequest; error?: string } {
  if (approval.status !== 'pending') {
    return { success: false, error: `Cannot decide on approval with status "${approval.status}"` };
  }

  if (newStatus === 'modified' && (!note || note.trim().length === 0)) {
    return { success: false, error: 'Modified approvals require a decision note' };
  }

  return {
    success: true,
    updated: {
      ...approval,
      status: newStatus,
      decisionNote: note ?? null,
      decidedAt: new Date(),
    },
  };
}

/**
 * Determines whether an action requires approval based on risk rules.
 */
function requiresApproval(action: string, riskLevel: string): boolean {
  const lower = action.toLowerCase();

  // Always require approval for high-risk actions
  if (riskLevel === 'high') return true;

  // External communications always require approval
  const externalWords = ['send', 'publish', 'deploy', 'email', 'notify', 'post', 'announce'];
  if (externalWords.some(w => lower.includes(w))) return true;

  // Financial actions always require approval
  const financialWords = ['buy', 'purchase', 'pay', 'spend', 'transfer', 'invoice'];
  if (financialWords.some(w => lower.includes(w))) return true;

  // Destructive actions always require approval
  const destructiveWords = ['delete', 'remove', 'destroy', 'terminate', 'fire'];
  if (destructiveWords.some(w => lower.includes(w))) return true;

  // Medium risk requires approval
  if (riskLevel === 'medium') return true;

  return false;
}

/**
 * Validates an approval creation request.
 */
function validateApprovalRequest(input: {
  action?: string;
  cost?: number;
  risk_level?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.action || input.action.trim().length === 0) {
    errors.push('action is required');
  } else if (input.action.length > 500) {
    errors.push('action must be 500 characters or less');
  }

  if (input.cost !== undefined && input.cost < 0) {
    errors.push('cost must be non-negative');
  }

  if (input.cost !== undefined && !Number.isInteger(input.cost)) {
    errors.push('cost must be an integer');
  }

  if (input.risk_level && !['low', 'medium', 'high'].includes(input.risk_level)) {
    errors.push('risk_level must be low, medium, or high');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Approval state machine', () => {
  const pendingApproval: ApprovalRequest = {
    id: 'test-approval-1',
    orgId: 'org-1',
    agentId: 'agent-1',
    action: 'Send email campaign',
    description: 'Launch the Q3 email campaign to 500 leads',
    cost: 500,
    riskLevel: 'medium',
    status: 'pending',
    decisionNote: null,
    decidedAt: null,
    createdAt: new Date(),
  };

  it('allows approving a pending approval', () => {
    const result = decideApproval(pendingApproval, 'approved');
    expect(result.success).toBe(true);
    expect(result.updated?.status).toBe('approved');
    expect(result.updated?.decidedAt).toBeInstanceOf(Date);
  });

  it('allows rejecting a pending approval', () => {
    const result = decideApproval(pendingApproval, 'rejected', 'Budget too high');
    expect(result.success).toBe(true);
    expect(result.updated?.status).toBe('rejected');
    expect(result.updated?.decisionNote).toBe('Budget too high');
  });

  it('allows modifying a pending approval with a note', () => {
    const result = decideApproval(pendingApproval, 'modified', 'Reduce budget to $200');
    expect(result.success).toBe(true);
    expect(result.updated?.status).toBe('modified');
    expect(result.updated?.decisionNote).toBe('Reduce budget to $200');
  });

  it('rejects modification without a note', () => {
    const result = decideApproval(pendingApproval, 'modified');
    expect(result.success).toBe(false);
    expect(result.error).toContain('decision note');
  });

  it('rejects modification with empty note', () => {
    const result = decideApproval(pendingApproval, 'modified', '   ');
    expect(result.success).toBe(false);
  });

  it('rejects decisions on already-approved approvals', () => {
    const approved = { ...pendingApproval, status: 'approved' as const };
    const result = decideApproval(approved, 'rejected');
    expect(result.success).toBe(false);
    expect(result.error).toContain('approved');
  });

  it('rejects decisions on already-rejected approvals', () => {
    const rejected = { ...pendingApproval, status: 'rejected' as const };
    const result = decideApproval(rejected, 'approved');
    expect(result.success).toBe(false);
    expect(result.error).toContain('rejected');
  });

  it('rejects decisions on expired approvals', () => {
    const expired = { ...pendingApproval, status: 'expired' as const };
    const result = decideApproval(expired, 'approved');
    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
  });
});

describe('Approval requirement detection', () => {
  it('requires approval for high-risk actions', () => {
    expect(requiresApproval('Draft a report', 'high')).toBe(true);
  });

  it('requires approval for external communications', () => {
    expect(requiresApproval('Send email to customers', 'low')).toBe(true);
    expect(requiresApproval('Publish blog post', 'low')).toBe(true);
    expect(requiresApproval('Deploy to production', 'low')).toBe(true);
  });

  it('requires approval for financial actions', () => {
    expect(requiresApproval('Buy domain name', 'low')).toBe(true);
    expect(requiresApproval('Purchase software license', 'low')).toBe(true);
  });

  it('requires approval for destructive actions', () => {
    expect(requiresApproval('Delete old records', 'low')).toBe(true);
    expect(requiresApproval('Remove unused agents', 'low')).toBe(true);
  });

  it('requires approval for medium-risk actions', () => {
    expect(requiresApproval('Update pricing page', 'medium')).toBe(true);
  });

  it('does NOT require approval for low-risk research', () => {
    expect(requiresApproval('Research competitor pricing', 'low')).toBe(false);
  });

  it('does NOT require approval for low-risk writing', () => {
    expect(requiresApproval('Draft internal memo', 'low')).toBe(false);
  });

  it('does NOT require approval for low-risk analysis', () => {
    expect(requiresApproval('Analyze quarterly metrics', 'low')).toBe(false);
  });

  it('does NOT require approval for low-risk planning', () => {
    expect(requiresApproval('Plan next sprint', 'low')).toBe(false);
  });
});

describe('Approval request validation', () => {
  it('accepts a valid request', () => {
    const result = validateApprovalRequest({
      action: 'Send email campaign',
      cost: 500,
      risk_level: 'medium',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing action', () => {
    const result = validateApprovalRequest({ cost: 100 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('action is required');
  });

  it('rejects empty action', () => {
    const result = validateApprovalRequest({ action: '  ' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('action is required');
  });

  it('rejects action over 500 characters', () => {
    const result = validateApprovalRequest({ action: 'a'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('action must be 500 characters or less');
  });

  it('accepts action at exactly 500 characters', () => {
    const result = validateApprovalRequest({ action: 'a'.repeat(500) });
    expect(result.valid).toBe(true);
  });

  it('rejects negative cost', () => {
    const result = validateApprovalRequest({ action: 'Test', cost: -100 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cost must be non-negative');
  });

  it('rejects non-integer cost', () => {
    const result = validateApprovalRequest({ action: 'Test', cost: 10.5 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cost must be an integer');
  });

  it('accepts zero cost', () => {
    const result = validateApprovalRequest({ action: 'Test', cost: 0 });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid risk level', () => {
    const result = validateApprovalRequest({ action: 'Test', risk_level: 'extreme' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('risk_level must be low, medium, or high');
  });

  it('accepts all valid risk levels', () => {
    expect(validateApprovalRequest({ action: 'Test', risk_level: 'low' }).valid).toBe(true);
    expect(validateApprovalRequest({ action: 'Test', risk_level: 'medium' }).valid).toBe(true);
    expect(validateApprovalRequest({ action: 'Test', risk_level: 'high' }).valid).toBe(true);
  });

  it('collects multiple errors', () => {
    const result = validateApprovalRequest({
      action: '',
      cost: -5,
      risk_level: 'invalid',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Approval cost tracking', () => {
  it('tracks cost correctly', () => {
    const approval: ApprovalRequest = {
      id: 'a1',
      orgId: 'org1',
      agentId: null,
      action: 'Deploy feature',
      description: null,
      cost: 1500,
      riskLevel: 'high',
      status: 'pending',
      decisionNote: null,
      decidedAt: null,
      createdAt: new Date(),
    };

    expect(approval.cost).toBe(1500);
    expect(approval.riskLevel).toBe('high');
  });

  it('allows zero-cost approvals', () => {
    const approval: ApprovalRequest = {
      id: 'a2',
      orgId: 'org1',
      agentId: null,
      action: 'Internal memo',
      description: null,
      cost: 0,
      riskLevel: 'low',
      status: 'pending',
      decisionNote: null,
      decidedAt: null,
      createdAt: new Date(),
    };

    expect(approval.cost).toBe(0);
  });
});
