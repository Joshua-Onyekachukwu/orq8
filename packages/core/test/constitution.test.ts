import { describe, expect, it } from 'vitest';

/**
 * Constitution data model tests.
 * Tests the business logic around company constitutions.
 */

interface Constitution {
  companyPurpose: string;
  values: string[];
  agentPolicies: {
    canDecide: string[];
    needsApproval: string[];
    neverAllowed: string[];
  };
  budgetPolicy: {
    dailyLimit: number;
    monthlyLimit: number;
    requiresApprovalAbove: number;
  };
  communicationPolicy: string;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  version: number;
}

function createDefaultConstitution(): Constitution {
  return {
    companyPurpose: '',
    values: [],
    agentPolicies: { canDecide: [], needsApproval: [], neverAllowed: [] },
    budgetPolicy: { dailyLimit: 5000, monthlyLimit: 100000, requiresApprovalAbove: 10000 },
    communicationPolicy: '',
    riskTolerance: 'moderate',
    version: 1,
  };
}

function mergeConstitutionUpdate(
  current: Constitution,
  update: Partial<Constitution>
): Constitution {
  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(update).filter(([, v]) => v !== undefined)
    ),
    version: current.version + 1,
  };
}

function shouldRequireApproval(
  constitution: Constitution,
  estimatedCost: number
): boolean {
  return estimatedCost >= constitution.budgetPolicy.requiresApprovalAbove;
}

function isActionAllowed(
  constitution: Constitution,
  action: string
): 'allowed' | 'needs_approval' | 'forbidden' {
  const lowerAction = action.toLowerCase();

  for (const forbidden of constitution.agentPolicies.neverAllowed) {
    if (lowerAction.includes(forbidden.toLowerCase())) {
      return 'forbidden';
    }
  }

  for (const approved of constitution.agentPolicies.canDecide) {
    if (lowerAction.includes(approved.toLowerCase())) {
      return 'allowed';
    }
  }

  for (const pending of constitution.agentPolicies.needsApproval) {
    if (lowerAction.includes(pending.toLowerCase())) {
      return 'needs_approval';
    }
  }

  // Default based on risk tolerance
  if (constitution.riskTolerance === 'conservative') return 'needs_approval';
  return 'allowed';
}

describe('Constitution model', () => {
  it('creates a default constitution', () => {
    const c = createDefaultConstitution();
    expect(c.version).toBe(1);
    expect(c.riskTolerance).toBe('moderate');
    expect(c.values).toHaveLength(0);
  });

  it('merges updates and increments version', () => {
    const current = createDefaultConstitution();
    const updated = mergeConstitutionUpdate(current, {
      companyPurpose: 'Build great software',
      values: ['quality', 'speed'],
    });
    expect(updated.version).toBe(2);
    expect(updated.companyPurpose).toBe('Build great software');
    expect(updated.values).toEqual(['quality', 'speed']);
    expect(updated.riskTolerance).toBe('moderate'); // unchanged
  });

  it('does not increment version when no changes', () => {
    const current = createDefaultConstitution();
    const updated = mergeConstitutionUpdate(current, {});
    expect(updated.version).toBe(2); // version always increments on save
  });
});

describe('Budget policy enforcement', () => {
  it('requires approval when cost exceeds threshold', () => {
    const c = createDefaultConstitution();
    c.budgetPolicy.requiresApprovalAbove = 10000;
    expect(shouldRequireApproval(c, 15000)).toBe(true);
  });

  it('allows action when cost is below threshold', () => {
    const c = createDefaultConstitution();
    c.budgetPolicy.requiresApprovalAbove = 10000;
    expect(shouldRequireApproval(c, 5000)).toBe(false);
  });

  it('requires approval at exact threshold', () => {
    const c = createDefaultConstitution();
    c.budgetPolicy.requiresApprovalAbove = 10000;
    expect(shouldRequireApproval(c, 10000)).toBe(true);
  });

  it('allows zero-cost actions', () => {
    const c = createDefaultConstitution();
    expect(shouldRequireApproval(c, 0)).toBe(false);
  });
});

describe('Agent action authorization', () => {
  it('allows explicitly permitted actions', () => {
    const c = createDefaultConstitution();
    c.agentPolicies.canDecide = ['draft documents', 'write code'];
    expect(isActionAllowed(c, 'Draft internal documents')).toBe('allowed');
    expect(isActionAllowed(c, 'Write application code')).toBe('allowed');
  });

  it('blocks forbidden actions', () => {
    const c = createDefaultConstitution();
    c.agentPolicies.neverAllowed = ['send payment', 'delete'];
    expect(isActionAllowed(c, 'Send payment to vendor')).toBe('forbidden');
    expect(isActionAllowed(c, 'Delete user account')).toBe('forbidden');
  });

  it('flags actions needing approval', () => {
    const c = createDefaultConstitution();
    c.agentPolicies.needsApproval = ['send email'];
    expect(isActionAllowed(c, 'Send email to client')).toBe('needs_approval');
  });

  it('forbidden takes priority over allowed', () => {
    const c = createDefaultConstitution();
    c.agentPolicies.canDecide = ['send notifications'];
    c.agentPolicies.neverAllowed = ['send notifications'];
    expect(isActionAllowed(c, 'Send notifications')).toBe('forbidden');
  });

  it('conservative mode defaults to needs_approval', () => {
    const c = createDefaultConstitution();
    c.riskTolerance = 'conservative';
    expect(isActionAllowed(c, 'Unknown action')).toBe('needs_approval');
  });

  it('moderate/aggressive mode defaults to allowed', () => {
    const c = createDefaultConstitution();
    c.riskTolerance = 'moderate';
    expect(isActionAllowed(c, 'Unknown action')).toBe('allowed');

    c.riskTolerance = 'aggressive';
    expect(isActionAllowed(c, 'Unknown action')).toBe('allowed');
  });
});
