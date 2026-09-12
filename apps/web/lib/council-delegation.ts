/**
 * Approval→execution bridge — pure helpers for the council launch-plan CTA.
 *
 * Extracted from the component so the delegation contract is unit-testable
 * (the web vitest setup is logic-only .ts; .tsx components aren't transformed).
 * Shared by the CTA component and the council page's marker check so the
 * "already delegated" detection and the marker writer can never drift apart.
 */

/** Marker prefix written into decision.founderVerdictNote when execution is delegated. */
export const LAUNCH_PLAN_DELEGATION_MARKER = "Execution delegated to the Executive Agent";

/** True when the decision already records a launch-plan delegation (never re-offer the CTA). */
export function hasDelegationMarker(note: string | null | undefined): boolean {
  return !!note && note.includes(LAUNCH_PLAN_DELEGATION_MARKER);
}

/** The objective handed to the Executive Agent for an approved recommendation. */
export function buildLaunchPlanObjective(recommendation: string): string {
  return `The founder approved this council recommendation: "${recommendation}". Create the launch plan and execute it.`;
}

/** Founder-visible Decision Memory note describing what was delegated (honest task count). */
export function buildDelegationMarkerNote(taskCount: number): string {
  const stamp = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const detail =
    taskCount > 0
      ? `${taskCount} task${taskCount === 1 ? "" : "s"} created — view in Goals & Tasks`
      : "EA is executing — view in Goals & Tasks";
  return `${LAUNCH_PLAN_DELEGATION_MARKER} on ${stamp} (${detail}).`;
}
