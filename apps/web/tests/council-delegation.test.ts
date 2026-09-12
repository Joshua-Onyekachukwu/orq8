/**
 * Unit tests for the approval→execution bridge helpers.
 * Covers marker detection (CTA visibility contract), objective composition
 * (grounded in the real recommendation), and the honest marker-note wording.
 */
import { describe, expect, it } from "vitest";
import {
  LAUNCH_PLAN_DELEGATION_MARKER,
  buildDelegationMarkerNote,
  buildLaunchPlanObjective,
  hasDelegationMarker,
} from "../lib/council-delegation";

describe("hasDelegationMarker", () => {
  it("is false when there is no note — approved verdicts must be offered the delegation CTA", () => {
    expect(hasDelegationMarker(null)).toBe(false);
    expect(hasDelegationMarker(undefined)).toBe(false);
    expect(hasDelegationMarker("")).toBe(false);
  });

  it("is false for a founder's own verdict note — only delegation marks it", () => {
    expect(hasDelegationMarker("Approved because the numbers hold")).toBe(false);
  });

  it("is true once the delegation marker note is recorded", () => {
    expect(hasDelegationMarker(`${LAUNCH_PLAN_DELEGATION_MARKER} on Sep 12 (2 tasks created).`)).toBe(true);
  });
});

describe("buildLaunchPlanObjective", () => {
  it("grounds the EA objective in the real approved recommendation", () => {
    const objective = buildLaunchPlanObjective("Launch in 3 markets in Q4");
    expect(objective).toContain("Launch in 3 markets in Q4");
    expect(objective).toContain("founder approved");
    expect(objective).toContain("launch plan");
  });

  it("does not corrupt the recommendation into the command grammar", () => {
    const objective = buildLaunchPlanObjective('Ship "v2" with 20% discount');
    expect(objective).toContain('Ship "v2" with 20% discount');
    expect(objective.endsWith("Create the launch plan and execute it.")).toBe(true);
  });
});

describe("buildDelegationMarkerNote", () => {
  it("counts tasks honestly — singular", () => {
    expect(buildDelegationMarkerNote(1)).toContain("1 task created");
  });

  it("counts tasks honestly — plural", () => {
    expect(buildDelegationMarkerNote(4)).toContain("4 tasks created");
  });

  it("states the honest fallback when the EA executed without task creation", () => {
    expect(buildDelegationMarkerNote(0)).toContain("EA is executing");
    expect(buildDelegationMarkerNote(0)).not.toContain("0 tasks");
  });

  it("always carries the marker prefix used for CTA visibility", () => {
    expect(buildDelegationMarkerNote(2).startsWith(LAUNCH_PLAN_DELEGATION_MARKER)).toBe(true);
    expect(hasDelegationMarker(buildDelegationMarkerNote(2))).toBe(true);
  });
});
