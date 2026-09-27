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
  "[class*='fixed']",
  ".sticky",
  "header",
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
const LAUNCHER_SIZE = 48; // 48px = h-12 w-12 (fallback before the node mounts)
const OFFSET = 24; // matches the launcher's CSS offset (bottom-6/right-6 ≈ 24px)
/** Vertical offset for top-anchored launchers. A top corner must clear the
 * 64px sticky top bar by more than COLLISION_MARGIN, otherwise the header
 * counts as a permanent collision there and every corner looks taken.
 * Mirrors `lg:top-24` in FloatingLauncher's position classes. */
const TOP_OFFSET = 96;

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
    position.vertical === "bottom" ? vh - launcherSize - OFFSET : TOP_OFFSET;

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

/** The floatingId of an element when it is a floating launcher. */
function launcherIdOf(el: Element): string | undefined {
  return (el as HTMLElement).dataset?.launcherId || undefined;
}

function findFloatingElements(selfId: string | undefined): Element[] {
  const elements: Element[] = [];
  const seen = new Set<Element>();
  for (const selector of INTERACTIVE_SELECTORS) {
    try {
      const found = document.querySelectorAll(selector);
      for (const el of found) {
        if (seen.has(el)) continue;
        seen.add(el);
        // Never treat this launcher as its own obstacle. Identification is by
        // data-launcher-id rather than a DOM ref: refs are attached during
        // commit, so a render-time ref can still be null when the first scan
        // runs and the launcher would then flee from itself.
        const id = launcherIdOf(el);
        if (id && id === selfId) continue;
        // Another launcher only counts when it OUTRANKS this one: ids are
        // compared as strings and the lower id owns a contested corner. A
        // lower-priority launcher yields instead, so treating it as an
        // obstacle would make both of them give way and chase each other.
        if (id && selfId && !(id < selfId)) continue;
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
  /** This launcher's floatingId, matching data-launcher-id on its button. */
  selfId?: string,
  /** The launcher's saved corner. Always evaluated as a candidate so a
   * displaced launcher returns home once the corner frees up. */
  preferredPosition?: LauncherPosition,
): CollisionResult {
  const [result, setResult] = useState<CollisionResult>({
    hasCollision: false,
    bestPosition: currentPosition,
    collidingElements: [],
  });

  const rafRef = useRef(0);
  const lastCheckRef = useRef(0);
  const positionRef = useRef(currentPosition);
  positionRef.current = currentPosition;
  const selfIdRef = useRef<string | undefined>(selfId);
  selfIdRef.current = selfId;
  const preferredRef = useRef<LauncherPosition | undefined>(preferredPosition);
  preferredRef.current = preferredPosition;

  const checkCollisions = useCallback(() => {
    if (!enabled) return;

    const now = Date.now();
    // Rate-limit: at most one check per MIN_CHECK_INTERVAL_MS
    if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
    lastCheckRef.current = now;

    const current = positionRef.current;
    const id = selfIdRef.current;
    // Measure our own node (offsetWidth ignores hover/scale transforms) so the
    // wider 56px quick-actions FAB is not tested as a 48px box.
    const selfEl = id
      ? [...document.querySelectorAll<HTMLElement>("[data-launcher-id]")].find(
          (el) => el.dataset.launcherId === id,
        )
      : undefined;
    const launcherSize =
      selfEl && selfEl.offsetWidth > 0 ? selfEl.offsetWidth : LAUNCHER_SIZE;
    const launcherRect = getLauncherRect(current, launcherSize);
    const floating = findFloatingElements(id);
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
        if (!prev.hasCollision) return prev;
        return {
          hasCollision: false,
          bestPosition: current,
          collidingElements: [],
        };
      });
      return;
    }

    // Find the best position. The launcher's own saved corner is evaluated
    // FIRST so a displaced launcher returns home as soon as that corner is
    // free again. Remaining corners follow in fallback priority:
    // top-right → bottom-left → top-left → bottom-right.
    const candidates: LauncherPosition[] = [];
    for (const candidate of [
      preferredRef.current ?? current,
      { side: "right", vertical: "top" },
      { side: "left", vertical: "bottom" },
      { side: "left", vertical: "top" },
      { side: "right", vertical: "bottom" },
    ] satisfies LauncherPosition[]) {
      if (
        !candidates.some(
          (c) => c.side === candidate.side && c.vertical === candidate.vertical,
        )
      ) {
        candidates.push(candidate);
      }
    }

    let bestPos: LauncherPosition = candidates[0] ?? current;
    let fewestCollisions = Infinity;

    for (const candidate of candidates) {
      const candidateRect = getLauncherRect(candidate, launcherSize);
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

    // Staged checks after mount (after paint, so layout has settled). A single
    // early check is not enough: a sibling launcher may still be hydrating, or
    // its box may not be laid out yet, and the MutationObserver below only
    // fires on class/style/child changes — plain text re-renders would leave a
    // stacked launcher stacked forever. Retrying converges on the settled
    // layout instead, and every later mutation re-triggers a check anyway.
    const timers = [100, 400, 1200, 2500].map((ms) => setTimeout(scheduleCheck, ms));

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
      timers.forEach(clearTimeout);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", scheduleCheck);
      observer.disconnect();
    };
  }, [checkCollisions, enabled]);

  return result;
}
