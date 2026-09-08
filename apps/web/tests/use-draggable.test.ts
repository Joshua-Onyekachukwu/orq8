import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useDraggable } from "../hooks/use-draggable";

// ─── Mock window dimensions ──────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 800);
});

/** Create a mock element with getBoundingClientRect and pointer capture methods. */
function mockElement(left: number, top: number) {
  const el = document.createElement("button");
  el.getBoundingClientRect = () => ({
    left, top, width: 48, height: 48,
    right: left + 48, bottom: top + 48,
    x: left, y: top, toJSON: () => {},
  });
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  return el;
}

// ─── Helper to create a mock pointer event ───────────────────────────────────

function createPointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  overrides: Partial<PointerEventInit> & { clientX: number; clientY: number; currentTarget?: Element },
): React.PointerEvent<HTMLButtonElement> {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    ...overrides,
  });
  // jsdom doesn't set currentTarget on manually created events
  if (overrides.currentTarget) {
    Object.defineProperty(event, "currentTarget", { value: overrides.currentTarget, writable: false });
  }
  // Add React-specific properties that the hook expects
  Object.defineProperty(event, "nativeEvent", { value: event, writable: false });
  Object.defineProperty(event, "isDefaultPrevented", { value: () => false, writable: false });
  Object.defineProperty(event, "isPropagationStopped", { value: () => false, writable: false });
  Object.defineProperty(event, "persist", { value: () => {}, writable: false });
  return event as unknown as React.PointerEvent<HTMLButtonElement>;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("useDraggable", () => {
  it("starts in non-dragging state", () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggable({ onSnap }));

    expect(result.current.isDragging).toBe(false);
    expect(result.current.tempPosition).toBeNull();
  });

  it("enters dragging state on pointer down", () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggable({ onSnap }));
    const el = mockElement(100, 200);

    act(() => {
      result.current.handlers.onPointerDown(
        createPointerEvent("pointerdown", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    expect(result.current.isDragging).toBe(true);
    expect(result.current.tempPosition).toEqual({ x: 100, y: 200 });
  });

  it("small movement below threshold does NOT count as drag", () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggable({ onSnap }));
    const el = mockElement(100, 200);

    // Pointer down at (110, 210)
    act(() => {
      result.current.handlers.onPointerDown(
        createPointerEvent("pointerdown", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    // Move 3px (below 6px threshold)
    act(() => {
      result.current.handlers.onPointerMove(
        createPointerEvent("pointermove", { clientX: 113, clientY: 213, currentTarget: el } as any),
      );
    });

    // Pointer up — should NOT snap (not a real drag)
    act(() => {
      result.current.handlers.onPointerUp(
        createPointerEvent("pointerup", { clientX: 113, clientY: 213, currentTarget: el } as any),
      );
    });

    expect(onSnap).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it("movement above threshold counts as drag and snaps", () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggable({ onSnap }));
    const el = mockElement(100, 200);

    // Pointer down at (110, 210)
    act(() => {
      result.current.handlers.onPointerDown(
        createPointerEvent("pointerdown", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    // Move 20px (above 6px threshold) — drag to top-right
    act(() => {
      result.current.handlers.onPointerMove(
        createPointerEvent("pointermove", { clientX: 130, clientY: 190, currentTarget: el } as any),
      );
    });

    // Pointer up — should snap
    act(() => {
      result.current.handlers.onPointerUp(
        createPointerEvent("pointerup", { clientX: 130, clientY: 190, currentTarget: el } as any),
      );
    });

    expect(onSnap).toHaveBeenCalledTimes(1);
    expect(result.current.isDragging).toBe(false);
  });

  it("click without movement does not snap", () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggable({ onSnap }));
    const el = mockElement(100, 200);

    act(() => {
      result.current.handlers.onPointerDown(
        createPointerEvent("pointerdown", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    // No move, just up
    act(() => {
      result.current.handlers.onPointerUp(
        createPointerEvent("pointerup", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    expect(onSnap).not.toHaveBeenCalled();
  });

  it("position is clamped to viewport during drag", () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggable({ onSnap, edgeMargin: 24 }));
    const el = mockElement(100, 200);

    act(() => {
      result.current.handlers.onPointerDown(
        createPointerEvent("pointerdown", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    // Drag way off-screen (left edge)
    act(() => {
      result.current.handlers.onPointerMove(
        createPointerEvent("pointermove", { clientX: -50, clientY: 210, currentTarget: el } as any),
      );
    });

    // Position should be clamped to edgeMargin (24)
    expect(result.current.tempPosition!.x).toBe(24);
  });

  it("pointercancel ends drag and snaps (treated like pointerup)", () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggable({ onSnap }));
    const el = mockElement(100, 200);

    act(() => {
      result.current.handlers.onPointerDown(
        createPointerEvent("pointerdown", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    act(() => {
      result.current.handlers.onPointerMove(
        createPointerEvent("pointermove", { clientX: 150, clientY: 250, currentTarget: el } as any),
      );
    });

    act(() => {
      result.current.handlers.onPointerCancel(
        createPointerEvent("pointercancel", { clientX: 150, clientY: 250, currentTarget: el } as any),
      );
    });

    // pointercancel is mapped to handlePointerUp, so it snaps if there was a real drag
    expect(onSnap).toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it("consumeDragFlag returns false after a click", () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggable({ onSnap }));
    const el = mockElement(100, 200);

    act(() => {
      result.current.handlers.onPointerDown(
        createPointerEvent("pointerdown", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    act(() => {
      result.current.handlers.onPointerUp(
        createPointerEvent("pointerup", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    // consumeDragFlag should return false (was a click, not a drag)
    const wasDrag = result.current.consumeDragFlag();
    expect(wasDrag).toBe(false);
  });

  it("snaps to correct edge based on release position", () => {
    const onSnap = vi.fn();
    const { result } = renderHook(() => useDraggable({ onSnap }));
    const el = mockElement(100, 200);

    // Drag from center to top-right
    act(() => {
      result.current.handlers.onPointerDown(
        createPointerEvent("pointerdown", { clientX: 110, clientY: 210, currentTarget: el } as any),
      );
    });

    act(() => {
      result.current.handlers.onPointerMove(
        createPointerEvent("pointermove", { clientX: 1100, clientY: 50, currentTarget: el } as any),
      );
    });

    act(() => {
      result.current.handlers.onPointerUp(
        createPointerEvent("pointerup", { clientX: 1100, clientY: 50, currentTarget: el } as any),
      );
    });

    expect(onSnap).toHaveBeenCalledWith({ side: "right", vertical: "top" });
  });
});
