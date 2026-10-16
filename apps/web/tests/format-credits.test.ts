import { describe, expect, it } from "vitest";
import { formatCredits } from "../lib/credits";

// Phase 3 (UX fix plan): resolve the C-08 suspicion — credit counts must
// NEVER be divided by 100 into a dollar string. The canonical formatter
// renders raw counts with a `cr` suffix.
describe("formatCredits (single shared credit formatter)", () => {
  it("renders raw credit counts, never dollars", () => {
    expect(formatCredits(0)).toBe("0 cr");
    expect(formatCredits(7)).toBe("7 cr");
    // The old bug shape: 25000 credits rendered as $250.00.
    expect(formatCredits(25000)).toBe("25,000 cr");
    expect(formatCredits(25000)).not.toContain("$");
  });

  it("rounds fractional averages to whole credits", () => {
    expect(formatCredits(12.6)).toBe("13 cr");
    expect(formatCredits(12.4)).toBe("12 cr");
  });

  it("tolerates nullish input instead of printing NaN", () => {
    expect(formatCredits(null as unknown as number)).toBe("0 cr");
    expect(formatCredits(undefined as unknown as number)).toBe("0 cr");
  });

  it("groups thousands for readability", () => {
    expect(formatCredits(1234567)).toBe("1,234,567 cr");
  });
});
