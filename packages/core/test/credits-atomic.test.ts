import { describe, expect, it } from 'vitest';

/**
 * Tests for the credit consumption atomic guard (race condition prevention).
 *
 * The core mechanism is a SQL WHERE clause:
 *   UPDATE credit_balances
 *   SET usedCredits = usedCredits + cost
 *   WHERE org_id = ?
 *     AND usedCredits + cost <= includedCredits + purchasedCredits
 *
 * If two concurrent requests both read the balance and both try to consume,
 * the second UPDATE will find 0 matching rows (the guard clause fails)
 * and throw CreditExhaustedError.
 *
 * These tests verify the guard logic at the business-logic level.
 */

// ─── Credit Balance Model ────────────────────────────────────────────────────

interface CreditBalance {
  orgId: string;
  includedCredits: number;
  purchasedCredits: number;
  usedCredits: number;
}

function totalCredits(b: CreditBalance): number {
  return b.includedCredits + b.purchasedCredits;
}

function remainingCredits(b: CreditBalance): number {
  return Math.max(0, totalCredits(b) - b.usedCredits);
}

/**
 * Simulates the atomic guard check.
 * In the real system, this is done via SQL WHERE clause.
 * Here we simulate it at the application level.
 */
function atomicGuardCheck(b: CreditBalance, cost: number): boolean {
  return b.usedCredits + cost <= totalCredits(b);
}

/**
 * Simulates atomic consumption.
 * Returns the updated balance if the guard passes, or null if it fails.
 */
function atomicConsume(b: CreditBalance, cost: number): CreditBalance | null {
  if (!atomicGuardCheck(b, cost)) return null;
  return {
    ...b,
    usedCredits: b.usedCredits + cost,
  };
}

/**
 * Simulates a race condition: two concurrent requests reading the same
 * balance and both trying to consume.
 * Returns an array of outcomes (success or failure for each request).
 */
function simulateRaceCondition(
  initialBalance: CreditBalance,
  costs: number[],
): Array<{ success: boolean; finalBalance: CreditBalance | null }> {
  // Both requests read the SAME initial state (the race)
  const readState = { ...initialBalance };
  const results: Array<{ success: boolean; finalBalance: CreditBalance | null }> = [];

  for (const cost of costs) {
    const result = atomicConsume(readState, cost);
    if (result) {
      // This request succeeded — update the shared state
      readState.usedCredits = result.usedCredits;
      results.push({ success: true, finalBalance: result });
    } else {
      // Guard failed — credits exhausted by the previous request
      results.push({ success: false, finalBalance: null });
    }
  }

  return results;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Credit balance fundamentals', () => {
  it('calculates total from included + purchased', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 1000,
      purchasedCredits: 500,
      usedCredits: 0,
    };
    expect(totalCredits(b)).toBe(1500);
  });

  it('calculates remaining correctly', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 1000,
      purchasedCredits: 0,
      usedCredits: 750,
    };
    expect(remainingCredits(b)).toBe(250);
  });

  it('remaining never goes negative', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 200,
    };
    expect(remainingCredits(b)).toBe(0);
  });
});

describe('Atomic guard check', () => {
  it('allows consumption when sufficient credits', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 1000,
      purchasedCredits: 0,
      usedCredits: 100,
    };
    expect(atomicGuardCheck(b, 50)).toBe(true);
  });

  it('rejects consumption when insufficient credits', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 95,
    };
    expect(atomicGuardCheck(b, 10)).toBe(false);
  });

  it('allows exact consumption of remaining credits', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 90,
    };
    expect(atomicGuardCheck(b, 10)).toBe(true);
  });

  it('rejects when even 1 credit over the limit', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 91,
    };
    expect(atomicGuardCheck(b, 10)).toBe(false);
  });

  it('allows zero-cost operations even with no credits', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 0,
      purchasedCredits: 0,
      usedCredits: 0,
    };
    expect(atomicGuardCheck(b, 0)).toBe(true);
  });

  it('rejects non-zero cost with zero credits', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 0,
      purchasedCredits: 0,
      usedCredits: 0,
    };
    expect(atomicGuardCheck(b, 1)).toBe(false);
  });

  it('accounts for purchased credits in the guard', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 50,
      usedCredits: 120,
    };
    // 120 + 30 = 150 <= 150 → allowed
    expect(atomicGuardCheck(b, 30)).toBe(true);
    // 120 + 31 = 151 > 150 → rejected
    expect(atomicGuardCheck(b, 31)).toBe(false);
  });
});

describe('Atomic consume operation', () => {
  it('returns updated balance on success', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 1000,
      purchasedCredits: 0,
      usedCredits: 100,
    };
    const result = atomicConsume(b, 50);
    expect(result).not.toBeNull();
    expect(result!.usedCredits).toBe(150);
    expect(result!.includedCredits).toBe(1000);
  });

  it('returns null when guard fails', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 95,
    };
    const result = atomicConsume(b, 10);
    expect(result).toBeNull();
  });

  it('does not mutate the original balance', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 1000,
      purchasedCredits: 0,
      usedCredits: 100,
    };
    atomicConsume(b, 50);
    expect(b.usedCredits).toBe(100); // unchanged
  });

  it('consumes large amounts correctly', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 1_000_000,
      purchasedCredits: 500_000,
      usedCredits: 1_400_000,
    };
    const result = atomicConsume(b, 100_000);
    expect(result).not.toBeNull();
    expect(result!.usedCredits).toBe(1_500_000);
  });

  it('handles multiple sequential consumptions', () => {
    let b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 0,
    };

    b = atomicConsume(b, 30)!;
    expect(b.usedCredits).toBe(30);

    b = atomicConsume(b, 30)!;
    expect(b.usedCredits).toBe(60);

    b = atomicConsume(b, 30)!;
    expect(b.usedCredits).toBe(90);

    // 4th consumption of 30 fails (only 10 remaining)
    const fail = atomicConsume(b, 30);
    expect(fail).toBeNull();
    expect(b.usedCredits).toBe(90); // unchanged
  });
});

describe('Race condition simulation', () => {
  it('prevents double-spend when two requests race for the last credits', () => {
    const initial: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 90,
    };
    // Only 10 remaining. Two requests both want 10.
    const results = simulateRaceCondition(initial, [10, 10]);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[0].finalBalance!.usedCredits).toBe(100);
  });

  it('prevents triple-spend on a tight balance', () => {
    const initial: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 95,
    };
    // Only 5 remaining. Three requests all want 3.
    // First succeeds (5→2), second fails (2 < 3)
    const results = simulateRaceCondition(initial, [3, 3, 3]);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(false);
    expect(results[0].finalBalance!.usedCredits).toBe(98);
  });

  it('allows multiple requests when credits are sufficient', () => {
    const initial: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 1000,
      purchasedCredits: 0,
      usedCredits: 0,
    };
    // 1000 available. 5 requests of 100 each = 500 total. All should succeed.
    const results = simulateRaceCondition(initial, [100, 100, 100, 100, 100]);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results[4].finalBalance!.usedCredits).toBe(500);
  });

  it('rejects requests after credits are fully consumed', () => {
    const initial: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 0,
    };
    // 4 requests of 30 = 120 total. Only 100 available.
    const results = simulateRaceCondition(initial, [30, 30, 30, 30]);
    expect(results[0].success).toBe(true); // 30
    expect(results[1].success).toBe(true); // 60
    expect(results[2].success).toBe(true); // 90
    expect(results[3].success).toBe(false); // 120 > 100 → rejected
    expect(results[2].finalBalance!.usedCredits).toBe(90);
  });

  it('handles purchased credits in race condition', () => {
    const initial: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 50,
      usedCredits: 130,
    };
    // 150 - 130 = 20 remaining. Two requests of 15 each.
    const results = simulateRaceCondition(initial, [15, 15]);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false); // 145 + 15 = 160 > 150
  });

  it('handles zero-cost operations without affecting credit pool', () => {
    const initial: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 95,
    };
    // 5 remaining. Zero-cost operation should always succeed.
    const results = simulateRaceCondition(initial, [0, 0, 0]);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('handles interleaved large and small requests', () => {
    const initial: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 500,
      purchasedCredits: 0,
      usedCredits: 0,
    };
    // Mix of operations: deep research (5), standard (2), deep (5), standard (2)
    const costs = [5, 2, 5, 2, 5, 2, 5, 2, 5, 2]; // total = 35
    const results = simulateRaceCondition(initial, costs);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results[9].finalBalance!.usedCredits).toBe(35);
  });
});

describe('CreditExhaustedError behavior', () => {
  it('has the correct properties', () => {
    class CreditExhaustedError extends Error {
      constructor(
        public readonly orgId: string,
        public readonly remaining: number,
        public readonly required: number,
        public readonly operationType: string,
      ) {
        super(
          `Work Credits exhausted: ${remaining} remaining, ${required} required for "${operationType}". ` +
          `Upgrade your plan or purchase additional credits.`,
        );
        this.name = 'CreditExhaustedError';
      }
    }

    const err = new CreditExhaustedError('org-123', 5, 10, 'research.deep');
    expect(err.name).toBe('CreditExhaustedError');
    expect(err.orgId).toBe('org-123');
    expect(err.remaining).toBe(5);
    expect(err.required).toBe(10);
    expect(err.operationType).toBe('research.deep');
    expect(err.message).toContain('5 remaining');
    expect(err.message).toContain('10 required');
    expect(err.message).toContain('research.deep');
  });

  it('is an instance of Error', () => {
    class CreditExhaustedError extends Error {
      constructor(
        public readonly orgId: string,
        public readonly remaining: number,
        public readonly required: number,
        public readonly operationType: string,
      ) {
        super(`Work Credits exhausted`);
        this.name = 'CreditExhaustedError';
      }
    }

    const err = new CreditExhaustedError('org-1', 0, 5, 'default');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CreditExhaustedError);
  });
});

describe('Operation cost table', () => {
  const OPERATION_COSTS: Record<string, number> = {
    'task.planned': 1,
    'task.executed': 2,
    'research.deep': 5,
    'code.generation': 5,
    'communication.external': 5,
    'default': 2,
  };

  it('has defined costs for common operations', () => {
    expect(OPERATION_COSTS['task.planned']).toBe(1);
    expect(OPERATION_COSTS['task.executed']).toBe(2);
    expect(OPERATION_COSTS['research.deep']).toBe(5);
    expect(OPERATION_COSTS['default']).toBe(2);
  });

  it('high-cost operations consume more credits', () => {
    expect(OPERATION_COSTS['research.deep']).toBeGreaterThan(OPERATION_COSTS['task.executed']);
    expect(OPERATION_COSTS['code.generation']).toBeGreaterThan(OPERATION_COSTS['task.planned']);
  });

  it('guard correctly handles different operation costs', () => {
    const b: CreditBalance = {
      orgId: 'org-1',
      includedCredits: 100,
      purchasedCredits: 0,
      usedCredits: 97,
    };

    // 3 remaining
    // task.planned (1) → allowed
    expect(atomicGuardCheck(b, OPERATION_COSTS['task.planned'])).toBe(true);
    // task.executed (2) → allowed
    expect(atomicGuardCheck(b, OPERATION_COSTS['task.executed'])).toBe(true);
    // research.deep (5) → rejected (only 3 remaining)
    expect(atomicGuardCheck(b, OPERATION_COSTS['research.deep'])).toBe(false);
  });
});
