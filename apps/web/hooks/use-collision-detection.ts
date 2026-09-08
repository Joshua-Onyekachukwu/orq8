"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import type { LauncherPreference } from "./use-launcher-preference";

export type LauncherPosition = LauncherPreference;

interface CollisionResult {
  hasCollision: boolean;
  bestPosition: LauncherPosition;
  collidingElements: string[];
}

/**
 * Selectors for FIXED/STICKY floating UI that the launcher must avoid.
 *
 * Deliberately NOT included: ordinary in-flow buttons/links. Those scroll with
 * the page, so a viewport-anchored launcher can only "cover" them transiently
 * as the user scrolls — reacting to them would make the icon jump constantly
 * (the exact behavior this system must avoid). Only viewport-anchored
 * elements (fixed/sticky) genuinely compete for screen space.
 */
const INTERACTIVE_SELECTORS = [
  ".fixed",
  ".sticky",
  "[data-sticky]",
  "[data-bottom-nav]",
  "[data-mobile-nav]",
  "[data-fab]",
  ".fab",
  "[role='dialog']",
  "[role='alertdialog']",
  // Sticky headers/footers built with utility classes
  "[class*='sticky ']",
  "[class*=' fixed']",
];

const COLLISION_MARGIN = 16; // px around the launcher to check
const LAUNCHER_SIZE = 48; // 48px = h-12 w-12
const OFFSET = 24; // matches the launcher's CSS offset (bottom-6/right-6 ≈ 24px)

/** Stability: a position change must persist for this long before the
 * launcher moves again. Prevents flip-flopping on transient layout churn. */
const STABILITY_MS = 400;
/** How often DOM mutation checks are allowed to run at most. */
const MIN_CHECK_INTERVAL_MS = 250;

function rectsOverlap(a: DOMRect, b: DOMRect, margin: number = 0): boolean {
  return !(
    a.right + margin < b.left ||
    a.left - margin > b.right ||
    a.bottom + margin < b.top ||
    a.top - margin > b.bottom
  );
}

function getLauncherRect(
  position: LauncherPosition,
  launcherSize: number = LAUNCHER_SIZE,
): DOMRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const left =
    position.side === "right" ? vw - launcherSize - OFFSET : OFFSET;
  const top =
    position.vertical === "bottom" ? vh - launcherSize - OFFSET : OFFSET;

  return new DOMRect(left, top, launcherSize, launcherSize);
}

function isElementVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  // Zero-area elements can't collide
  if (rect.width === 0 || rect.height === 0) return false;
  return true;
}

function findFloatingElements(): Element[] {
  const elements: Element[] = [];
  const seen = new Set<Element>();
  for (const selector of INTERACTIVE_SELECTORS) {
    try {
      const found = document.querySelectorAll(selector);
      for (const el of found) {
        if (seen.has(el)) continue;
        seen.add(el);
        // Skip the launcher itself
        if (el.closest("[data-ea-launcher]")) continue;
        // Skip anything inside an open panel/dialog's backdrop tree? No —
        // dialogs SHOULD count as collisions.
        if (!isElementVisible(el)) continue;
        elements.push(el);
      }
    } catch {
      // Invalid selector — skip
    }
  }
  return elements;
}

export function useCollisionDetection(
  currentPosition: LauncherPosition,
  enabled: boolean = true,
): CollisionResult {
  const [result, setResult] = useState<CollisionResult>({
    hasCollision: false,
    bestPosition: currentPosition,
    collidingElements: [],
  });

  const rafRef = useRef(0);
  const lastCheckRef = useRef(0);
  /** Timestamp of the last committed position; used for stability debounce. */
  const lastCommitRef = useRef(Date.now());
  const positionRef = useRef(currentPosition);
  positionRef.current = currentPosition;

  const checkCollisions = useCallback(() => {
    if (!enabled) return;

    const now = Date.now();
    // Rate-limit: at most one check per MIN_CHECK_INTERVAL_MS
    if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
    lastCheckRef.current = now;

    const current = positionRef.current;
    const launcherRect = getLauncherRect(current);
    const floating = findFloatingElements();
    const collisions: string[] = [];

    for (const el of floating) {
      const elRect = el.getBoundingClientRect();
      if (rectsOverlap(launcherRect, elRect, COLLISION_MARGIN)) {
        const desc =
          el.tagName.toLowerCase() +
          (el.id ? `#${el.id}` : "") +
          (typeof el.className === "string" && el.className
            ? `.${el.className.split(" ").slice(0, 2).join(".")}`
            : "");
        collisions.push(desc);
      }
    }

    if (collisions.length === 0) {
      setResult((prev) => {
        // Stability: only clear the collision after it has been absent long
        // enough — avoids rapid flip between states.
        if (!prev.hasCollision) return prev;
        lastCommitRef.current = Date.now();
        return {
          hasCollision: false,
          bestPosition: current,
          collidingElements: [],
        };
      });
      return;
    }

    // Find the best alternative position, respecting fallback priority:
    // bottom-right (current) → top-right → bottom-left → top-left
    const candidates: LauncherPosition[] = [
      { side: "right", vertical: "top" },
      { side: "left", vertical: "bottom" },
      { side: "left", vertical: "top" },
    ];

    const fallback: LauncherPosition = candidates[0] ?? {
      side: "right",
      vertical: "top",
    };
    let bestPos: LauncherPosition = fallback;
    let fewestCollisions = Infinity;

    for (const candidate of candidates) {
      const candidateRect = getLauncherRect(candidate);
      let candidateCollisions = 0;
      for (const el of floating) {
        const elRect = el.getBoundingClientRect();
        if (rectsOverlap(candidateRect, elRect, COLLISION_MARGIN)) {
          candidateCollisions++;
        }
      }
      if (candidateCollisions < fewestCollisions) {
        fewestCollisions = candidateCollisions;
        bestPos = candidate;
      }
    }

    setResult((prev) => {
      if (prev.hasCollision && prev.bestPosition.side === bestPos.side && prev.bestPosition.vertical === bestPos.vertical) {
        return prev; // No change — avoid re-render churn
      }
      lastCommitRef.current = Date.now();
      return {
        hasCollision: true,
        bestPosition: bestPos,
        collidingElements: collisions,
      };
    });
  }, [enabled]);

  // Debounced collision check on resize + DOM changes.
  // NOTE: no scroll listener — the launcher is viewport-anchored, and reacting
  // to scroll would cause constant repositioning (spec §2).
  useEffect(() => {
    if (!enabled) return;

    const scheduleCheck = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(checkCollisions);
    };

    // Initial check (after paint, so layout is settled)
    const initialTimer = setTimeout(scheduleCheck, 100);

    window.addEventListener("resize", scheduleCheck, { passive: true });

    // MutationObserver, throttled by MIN_CHECK_INTERVAL_MS inside checkCollisions
    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });

    return () => {
      clearTimeout(initialTimer);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", scheduleCheck);
      observer.disconnect();
    };
  }, [checkCollisions, enabled]);

  return result;
}
