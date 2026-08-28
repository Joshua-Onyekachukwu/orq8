import { describe, expect, it } from 'vitest';

/**
 * Credit balance calculation and validation tests.
 * Tests the pure business logic around credit management.
 */

interface CreditBalance {
  includedCredits: number;
  purchasedCredits: number;
  usedCredits: number;
}

function totalCredits(balance: CreditBalance): number {
  return balance.includedCredits + balance.purchasedCredits;
}

function remainingCredits(balance: CreditBalance): number {
  return Math.max(0, totalCredits(balance) - balance.usedCredits);
}

function utilizationPercent(balance: CreditBalance): number {
  const total = totalCredits(balance);
  if (total === 0) return 0;
  return (balance.usedCredits / total) * 100;
}

function canConsume(balance: CreditBalance, cost: number): boolean {
  return cost <= remainingCredits(balance);
}

describe('Credit balance logic', () => {
  it('calculates total credits correctly', () => {
    const balance: CreditBalance = { includedCredits: 1000, purchasedCredits: 500, usedCredits: 0 };
    expect(totalCredits(balance)).toBe(1500);
  });

  it('calculates remaining credits correctly', () => {
    const balance: CreditBalance = { includedCredits: 1000, purchasedCredits: 500, usedCredits: 300 };
    expect(remainingCredits(balance)).toBe(1200);
  });

  it('never goes negative on remaining', () => {
    const balance: CreditBalance = { includedCredits: 100, purchasedCredits: 0, usedCredits: 200 };
    expect(remainingCredits(balance)).toBe(0);
  });

  it('calculates utilization percentage correctly', () => {
    const balance: CreditBalance = { includedCredits: 1000, purchasedCredits: 0, usedCredits: 250 };
    expect(utilizationPercent(balance)).toBe(25);
  });

  it('returns 0 utilization when no credits', () => {
    const balance: CreditBalance = { includedCredits: 0, purchasedCredits: 0, usedCredits: 0 };
    expect(utilizationPercent(balance)).toBe(0);
  });

  it('allows consumption when sufficient credits', () => {
    const balance: CreditBalance = { includedCredits: 1000, purchasedCredits: 0, usedCredits: 100 };
    expect(canConsume(balance, 50)).toBe(true);
  });

  it('rejects consumption when insufficient credits', () => {
    const balance: CreditBalance = { includedCredits: 100, purchasedCredits: 0, usedCredits: 95 };
    expect(canConsume(balance, 10)).toBe(false);
  });

  it('allows exact consumption of remaining credits', () => {
    const balance: CreditBalance = { includedCredits: 100, purchasedCredits: 0, usedCredits: 90 };
    expect(canConsume(balance, 10)).toBe(true);
  });

  it('handles zero-cost operations', () => {
    const balance: CreditBalance = { includedCredits: 0, purchasedCredits: 0, usedCredits: 0 };
    expect(canConsume(balance, 0)).toBe(true);
  });

  it('handles large credit pools', () => {
    const balance: CreditBalance = { includedCredits: 1_000_000, purchasedCredits: 500_000, usedCredits: 750_000 };
    expect(remainingCredits(balance)).toBe(750_000);
    expect(utilizationPercent(balance)).toBe(50);
  });

  it('only purchased credits can exceed included', () => {
    const balance: CreditBalance = { includedCredits: 100, purchasedCredits: 200, usedCredits: 150 };
    expect(totalCredits(balance)).toBe(300);
    expect(remainingCredits(balance)).toBe(150);
  });
});

describe('Credit threshold detection', () => {
  function getCreditStatus(balance: CreditBalance): {
    isLow: boolean;
    isCritical: boolean;
    level: 'ok' | 'low' | 'critical' | 'exhausted';
  } {
    const total = totalCredits(balance);
    if (total === 0) return { isLow: false, isCritical: false, level: 'ok' };
    const remaining = remainingCredits(balance);
    const pct = (remaining / total) * 100;

    if (remaining === 0) return { isLow: true, isCritical: true, level: 'exhausted' };
    if (pct <= 10) return { isLow: true, isCritical: true, level: 'critical' };
    if (pct <= 25) return { isLow: true, isCritical: false, level: 'low' };
    return { isLow: false, isCritical: false, level: 'ok' };
  }

  it('detects ok when plenty of credits', () => {
    const b: CreditBalance = { includedCredits: 1000, purchasedCredits: 0, usedCredits: 100 };
    expect(getCreditStatus(b).level).toBe('ok');
  });

  it('detects low when below 25%', () => {
    const b: CreditBalance = { includedCredits: 1000, purchasedCredits: 0, usedCredits: 800 };
    expect(getCreditStatus(b).level).toBe('low');
    expect(getCreditStatus(b).isLow).toBe(true);
  });

  it('detects critical when below 10%', () => {
    const b: CreditBalance = { includedCredits: 1000, purchasedCredits: 0, usedCredits: 920 };
    expect(getCreditStatus(b).level).toBe('critical');
    expect(getCreditStatus(b).isCritical).toBe(true);
  });

  it('detects exhausted when no credits left', () => {
    const b: CreditBalance = { includedCredits: 1000, purchasedCredits: 0, usedCredits: 1000 };
    expect(getCreditStatus(b).level).toBe('exhausted');
    expect(getCreditStatus(b).isCritical).toBe(true);
  });
});
