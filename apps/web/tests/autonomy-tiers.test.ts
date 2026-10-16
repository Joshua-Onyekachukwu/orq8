import { describe, expect, it } from "vitest";
import { levelAllowed } from "../lib/autonomy-tiers";

// P2 tier map: Trial/Founder top out at execute_with_approval, autonomous
// unlocks at Team/Company. Fails open on unknown ceilings — the API enforces.
describe("levelAllowed (plan-tier autonomy disclosure)", () => {
  it("caps trial and founder at execute_with_approval", () => {
    expect(levelAllowed("execute_with_approval", "autonomous")).toBe(false);
    expect(levelAllowed("execute_with_approval", "execute_with_approval")).toBe(true);
    expect(levelAllowed("execute_with_approval", "observe")).toBe(true);
  });

  it("unlocks autonomous at team/company", () => {
    expect(levelAllowed("autonomous", "autonomous")).toBe(true);
    expect(levelAllowed("autonomous", "draft")).toBe(true);
  });

  it("fails open on unknown ceilings, closed on unknown levels", () => {
    expect(levelAllowed(null, "autonomous")).toBe(true);
    expect(levelAllowed(undefined, "autonomous")).toBe(true);
    expect(levelAllowed("future-level", "autonomous")).toBe(true);
    expect(levelAllowed("autonomous", "not-a-level")).toBe(false);
  });
});
