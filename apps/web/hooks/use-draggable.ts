"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { LauncherPreference, LauncherSide, LauncherVertical } from "./use-launcher-preference";

export type LauncherPosition = LauncherPreference;

interface DraggableState {
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  tempPosition: { x: number; y: number } | null;
}

interface UseDraggableOptions {
  onSnap: (position: LauncherPosition) => void;
  launcherSize?: number;
  edgeMargin?: number;
}

const LAUNCHER_SIZE = 48;
const EDGE_MARGIN = 24;
/** Distance (px) the pointer must move before we treat the gesture as a drag
 * rather than a click. Prevents the panel from opening after a drag ends. */
const DRAG_THRESHOLD = 6;

function snapToNearestEdge(
  x: number,
  y: number,
  launcherSize: number,
): LauncherPreference {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const horizontalDistFromRight = vw - x - launcherSize;
  const horizontalDistFromLeft = x;
  const verticalDistFromBottom = vh - y - launcherSize;
  const verticalDistFromTop = y;

  const side: LauncherSide =
    horizontalDistFromRight <= horizontalDistFromLeft ? "right" : "left";
  const vertical: LauncherVertical =
    verticalDistFromBottom <= verticalDistFromTop ? "bottom" : "top";

  return { side, vertical };
}

export function useDraggable({
  onSnap,
  launcherSize = LAUNCHER_SIZE,
  edgeMargin = EDGE_MARGIN,
}: UseDraggableOptions) {
  const [state, setState] = useState<DraggableState>({
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
    tempPosition: null,
  });

  /** True when the current gesture actually moved beyond the click threshold. */
  const didDragRef = useRef(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const elementRef = useRef<HTMLButtonElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // Only drag with the primary button / touch / pen
      if (e.button !== 0) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      originRef.current = { x: e.clientX, y: e.clientY };
      didDragRef.current = false;

      setState({
        isDragging: true,
        dragOffset: { x: offsetX, y: offsetY },
        tempPosition: { x: rect.left, y: rect.top },
      });

      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!state.isDragging || !state.dragOffset) return;

      // Mark as a genuine drag once movement exceeds the threshold
      if (originRef.current) {
        const dx = e.clientX - originRef.current.x;
        const dy = e.clientY - originRef.current.y;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          didDragRef.current = true;
        }
      }

      // Clamp to viewport so the launcher can never leave the screen
      const x = Math.max(
        edgeMargin,
        Math.min(window.innerWidth - launcherSize - edgeMargin, e.clientX - state.dragOffset.x),
      );
      const y = Math.max(
        edgeMargin,
        Math.min(window.innerHeight - launcherSize - edgeMargin, e.clientY - state.dragOffset.y),
      );

      setState((prev) => ({ ...prev, tempPosition: { x, y } }));
    },
    [state.isDragging, state.dragOffset, launcherSize, edgeMargin],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!state.isDragging) return;

      const wasRealDrag = didDragRef.current;

      if (wasRealDrag && state.tempPosition) {
        // Snap to nearest edge and persist the new preference
        const snapped = snapToNearestEdge(state.tempPosition.x, state.tempPosition.y, launcherSize);
        onSnap(snapped);
      }

      setState({
        isDragging: false,
        dragOffset: { x: 0, y: 0 },
        tempPosition: null,
      });
      originRef.current = null;
      didDragRef.current = false;

      // Release pointer capture if still held
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer already released — ignore
      }
    },
    [state.isDragging, state.tempPosition, launcherSize, onSnap],
  );

  /** True when the last gesture ended as a drag (not a click).
   * The launcher uses this to suppress the click that follows pointerup. */
  const consumeDragFlag = useCallback(() => {
    const did = didDragRef.current;
    didDragRef.current = false;
    return did;
  }, []);

  // Cancel drag on Escape
  useEffect(() => {
    if (!state.isDragging) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setState({
          isDragging: false,
          dragOffset: { x: 0, y: 0 },
          tempPosition: null,
        });
        originRef.current = null;
        didDragRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.isDragging]);

  return {
    ...state,
    elementRef,
    /** Whether the last gesture was a drag; resets the flag when read. */
    consumeDragFlag,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
}
