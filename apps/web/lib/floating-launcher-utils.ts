/**
 * Pure utility functions for the FloatingLauncher system.
 * Separated from hooks for direct unit testing.
 */

import type { LauncherPreference, LauncherSide, LauncherVertical } from "../hooks/use-launcher-preference";

// ─── Collision Geometry ────────────────────────────────────────────────────

const LAUNCHER_SIZE = 48;
const OFFSET = 24;
const COLLISION_MARGIN = 16;

/**
 * Test whether two rectangles overlap (with optional margin).
 */
export function rectsOverlap(a: DOMRect, b: DOMRect, margin: number = 0): boolean {
  return !(
    a.right + margin < b.left ||
    a.left - margin > b.right ||
    a.bottom + margin < b.top ||
    a.top - margin > b.bottom
  );
}

/**
 * Compute the launcher's bounding rectangle given a corner preference.
 */
export function getLauncherRect(
  position: LauncherPreference,
  launcherSize: number = LAUNCHER_SIZE,
  offset: number = OFFSET,
): DOMRect {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const left =
    position.side === "right" ? vw - launcherSize - offset : offset;
  const top =
    position.vertical === "bottom" ? vh - launcherSize - offset : offset;

  return new DOMRect(left, top, launcherSize, launcherSize);
}

/**
 * Given a dropped position (pixel coordinates), determine which corner
 * is closest — used by snap-to-edge after a drag.
 */
export function snapToNearestEdge(
  x: number,
  y: number,
  launcherSize: number = LAUNCHER_SIZE,
): LauncherPreference {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const distFromRight = vw - x - launcherSize;
  const distFromLeft = x;
  const distFromBottom = vh - y - launcherSize;
  const distFromTop = y;

  const side: LauncherSide =
    distFromRight <= distFromLeft ? "right" : "left";
  const vertical: LauncherVertical =
    distFromBottom <= distFromTop ? "bottom" : "top";

  return { side, vertical };
}

/**
 * Evaluate all four corners and return the one with the fewest collisions
 * against a set of floating elements. Used by the collision engine.
 */
export function findBestPosition(
  currentPosition: LauncherPreference,
  floatingElements: Element[],
): LauncherPreference {
  const candidates: LauncherPreference[] = [
    currentPosition,
    { side: "right", vertical: "top" },
    { side: "left", vertical: "bottom" },
    { side: "left", vertical: "top" },
  ];

  let bestPos: LauncherPreference = candidates[0] ?? currentPosition;
  let fewestCollisions = Infinity;

  for (const candidate of candidates) {
    const candidateRect = getLauncherRect(candidate);
    let collisions = 0;
    for (const el of floatingElements) {
      const elRect = el.getBoundingClientRect();
      if (rectsOverlap(candidateRect, elRect, COLLISION_MARGIN)) {
        collisions++;
      }
    }
    if (collisions < fewestCollisions) {
      fewestCollisions = collisions;
      bestPos = candidate;
    }
  }

  return bestPos;
}
