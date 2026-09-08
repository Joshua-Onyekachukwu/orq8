"use client";

/**
 * FloatingLauncher — collision-aware, draggable floating action button.
 *
 * Positioning model:
 *   preferredPosition — where the founder wants it (persisted, never mutated)
 *   effectivePosition — where it renders now (collision override or preferred)
 *
 * Positioning priority:
 * 1. User's saved preference
 * 2. Collision-safe position (if preferred has a collision) — temporary only
 * 3. Nearest safe edge (after drag → becomes the new preference)
 *
 * When the collision disappears, the launcher returns to the saved preference.
 *
 * Usage:
 *   <FloatingLauncher
 *     onClick={togglePanel}
 *     icon={<MessageSquare />}
 *     label="Executive Agent"
 *   />
 */

import { useState, useMemo, useCallback } from "react";
import { useLauncherPreference } from "../hooks/use-launcher-preference";
import { useCollisionDetection } from "../hooks/use-collision-detection";
import { useDraggable } from "../hooks/use-draggable";
import type { LauncherPreference } from "../hooks/use-launcher-preference";

export interface FloatingLauncherProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  /** Extra class names for the button */
  className?: string;
  /** Unique ID for stacking coordination between floating controls */
  floatingId?: string;
  /** Whether the launcher is in an active/toggled-on state (changes icon styling) */
  isActive?: boolean;
  /** Button color when not active — defaults to bg-orq8-dark */
  buttonBg?: string;
  /** Button color when active */
  buttonBgActive?: string;
  /** z-index for stacking order — higher = on top */
  zIndex?: number;
}

/** Position to CSS classes mapping. Safe-area padding keeps the launcher
 * clear of notches/home indicators on mobile. */
function positionToClasses(pos: LauncherPreference): string {
  const horizontal =
    pos.side === "right"
      ? "right-[calc(1.25rem+env(safe-area-inset-right))] lg:right-6"
      : "left-[calc(1.25rem+env(safe-area-inset-left))] lg:left-6";
  const vertical =
    pos.vertical === "bottom"
      ? "bottom-[calc(1.25rem+env(safe-area-inset-bottom))] lg:bottom-6"
      : "top-[calc(1.25rem+env(safe-area-inset-top))] lg:top-6";
  return `${horizontal} ${vertical}`;
}

/** Inline style for the free-floating drag preview. */
function dragPreviewStyle(tempPos: { x: number; y: number }): React.CSSProperties {
  return {
    position: "fixed",
    left: tempPos.x,
    top: tempPos.y,
    right: "auto",
    bottom: "auto",
  };
}

export function FloatingLauncher({
  onClick,
  icon,
  label,
  className = "",
  isActive = false,
  buttonBg = "bg-orq8-dark",
  buttonBgActive,
  zIndex = 40,
}: FloatingLauncherProps) {
  const { preference, setPreference } = useLauncherPreference();
  /** Transient position while dragging (not persisted until snap). */
  const [dragPosition, setDragPosition] = useState<LauncherPreference | null>(null);

  // During a drag we suspend collision evaluation — the founder has taken
  // explicit control, and repositioning under their pointer feels broken.
  const effectivePosition = dragPosition ?? preference;

  const collision = useCollisionDetection(effectivePosition, !dragPosition);

  // Effective position: collision override is TEMPORARY — the preference is
  // never overwritten by the collision engine (spec §8/§9).
  const finalPosition = useMemo(
    () => (collision.hasCollision ? collision.bestPosition : effectivePosition),
    [collision.hasCollision, collision.bestPosition, effectivePosition],
  );

  const handleSnap = useCallback(
    (snapped: LauncherPreference) => {
      setPreference(snapped);
      setDragPosition(null);
    },
    [setPreference],
  );

  const {
    isDragging,
    tempPosition,
    elementRef,
    consumeDragFlag,
    handlers,
  } = useDraggable({ onSnap: handleSnap });

  const handleClick = useCallback(() => {
    // A drag ends with a click event on some browsers — suppress it so the
    // panel doesn't open after repositioning.
    if (consumeDragFlag()) return;
    onClick();
  }, [consumeDragFlag, onClick]);

  const posClasses = positionToClasses(finalPosition);
  const stateClasses = isDragging
    ? "cursor-grabbing scale-110 shadow-2xl opacity-90 transition-none"
    : "cursor-grab hover:scale-105 hover:shadow-xl transition-all";

  return (
    <button
      ref={elementRef}
      data-ea-launcher="true"
      onClick={handleClick}
      className={`group fixed flex h-12 w-12 touch-none select-none items-center justify-center rounded-full text-white shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-orq8-orange/70 focus-visible:ring-offset-2 ${posClasses} ${stateClasses} ${className} ${isActive && buttonBgActive ? buttonBgActive : buttonBg}`}
      style={{ zIndex: zIndex, ...(isDragging && tempPosition ? dragPreviewStyle(tempPosition) : {}) }}
      title={`${label} (\u2318\u21E7E)`}
      aria-label={label}
      aria-keyshortcuts="Meta+Shift+E"
      {...handlers}
    >
      {icon}
      {/* Drag affordance — visible on hover/focus, non-interactive */}
      <span
        aria-hidden="true"
        className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <svg viewBox="0 0 8 8" className="h-2.5 w-2.5 text-gray-600" fill="currentColor">
          <circle cx="2" cy="2" r="1" />
          <circle cx="6" cy="2" r="1" />
          <circle cx="2" cy="6" r="1" />
          <circle cx="6" cy="6" r="1" />
        </svg>
      </span>
    </button>
  );
}
