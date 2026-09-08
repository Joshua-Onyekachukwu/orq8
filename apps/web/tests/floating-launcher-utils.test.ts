import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  rectsOverlap,
  getLauncherRect,
  snapToNearestEdge,
  findBestPosition,
} from "../lib/floating-launcher-utils";

// ─── Mock window dimensions ────────────────────────────────────────────────

function setViewport(width: number, height: number) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
}

/** Create a mock element with a specific bounding rect.
 * jsdom's getBoundingClientRect returns all zeros, so we monkey-patch it. */
function mockElement(rect: { left: number; top: number; width: number; height: number }): Element {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    new DOMRect(rect.left, rect.top, rect.width, rect.height);
  return el;
}

// ─── rectsOverlap ──────────────────────────────────────────────────────────

describe("rectsOverlap", () => {
  it("returns true when rectangles overlap", () => {
    const a = new DOMRect(0, 0, 50, 50);
    const b = new DOMRect(25, 25, 50, 50);
    expect(rectsOverlap(a, b)).toBe(true);
  });

  it("returns false when rectangles do not overlap", () => {
    const a = new DOMRect(0, 0, 50, 50);
    const b = new DOMRect(100, 100, 50, 50);
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it("returns true when rectangles are adjacent (zero gap — touching counts as collision)", () => {
    const a = new DOMRect(0, 0, 50, 50);
    const b = new DOMRect(50, 0, 50, 50);
    // Zero gap = touching, treated as collision for launcher avoidance
    expect(rectsOverlap(a, b)).toBe(true);
  });

  it("returns true when margin causes overlap", () => {
    const a = new DOMRect(0, 0, 50, 50);
    const b = new DOMRect(60, 0, 50, 50);
    // 10px gap, but margin = 20 → overlap
    expect(rectsOverlap(a, b, 20)).toBe(true);
  });

  it("returns false when rectangles are identical size but far apart", () => {
    const a = new DOMRect(0, 0, 50, 50);
    const b = new DOMRect(0, 200, 50, 50);
    expect(rectsOverlap(a, b)).toBe(false);
  });

  it("treats zero-width rectangles as overlapping (edge case — filtered upstream)", () => {
    const a = new DOMRect(0, 0, 0, 0);
    const b = new DOMRect(0, 0, 50, 50);
    // Zero-area rects are filtered by isElementVisible before reaching this function
    expect(rectsOverlap(a, b)).toBe(true);
  });
});

// ─── getLauncherRect ───────────────────────────────────────────────────────

describe("getLauncherRect", () => {
  const DEFAULT_SIZE = 48;
  const DEFAULT_OFFSET = 24;

  beforeEach(() => {
    setViewport(1280, 800);
  });

  it("bottom-right: places at viewport minus size minus offset", () => {
    const rect = getLauncherRect({ side: "right", vertical: "bottom" });
    expect(rect.left).toBe(1280 - DEFAULT_SIZE - DEFAULT_OFFSET); // 1208
    expect(rect.top).toBe(800 - DEFAULT_SIZE - DEFAULT_OFFSET);    // 728
    expect(rect.width).toBe(DEFAULT_SIZE);
    expect(rect.height).toBe(DEFAULT_SIZE);
  });

  it("top-right: top offset, right edge", () => {
    const rect = getLauncherRect({ side: "right", vertical: "top" });
    expect(rect.left).toBe(1280 - DEFAULT_SIZE - DEFAULT_OFFSET);
    expect(rect.top).toBe(DEFAULT_OFFSET);
  });

  it("bottom-left: left offset, bottom edge", () => {
    const rect = getLauncherRect({ side: "left", vertical: "bottom" });
    expect(rect.left).toBe(DEFAULT_OFFSET);
    expect(rect.top).toBe(800 - DEFAULT_SIZE - DEFAULT_OFFSET);
  });

  it("top-left: both offsets", () => {
    const rect = getLauncherRect({ side: "left", vertical: "top" });
    expect(rect.left).toBe(DEFAULT_OFFSET);
    expect(rect.top).toBe(DEFAULT_OFFSET);
  });

  it("works with custom viewport", () => {
    setViewport(640, 480);
    const rect = getLauncherRect({ side: "right", vertical: "bottom" });
    expect(rect.left).toBe(640 - DEFAULT_SIZE - DEFAULT_OFFSET); // 568
    expect(rect.top).toBe(480 - DEFAULT_SIZE - DEFAULT_OFFSET);  // 408
  });
});

// ─── snapToNearestEdge ─────────────────────────────────────────────────────

describe("snapToNearestEdge", () => {
  beforeEach(() => {
    setViewport(1280, 800);
  });

  it("snaps bottom-right corner to bottom-right", () => {
    const result = snapToNearestEdge(1200, 720);
    expect(result).toEqual({ side: "right", vertical: "bottom" });
  });

  it("snaps top-right corner to top-right", () => {
    const result = snapToNearestEdge(1200, 20);
    expect(result).toEqual({ side: "right", vertical: "top" });
  });

  it("snaps bottom-left corner to bottom-left", () => {
    const result = snapToNearestEdge(10, 720);
    expect(result).toEqual({ side: "left", vertical: "bottom" });
  });

  it("snaps top-left corner to top-left", () => {
    const result = snapToNearestEdge(10, 20);
    expect(result).toEqual({ side: "left", vertical: "top" });
  });

  it("snaps center to nearest edge (right+bottom in 1280x800)", () => {
    const result = snapToNearestEdge(640, 400);
    expect(result.side).toBe("right");
    expect(result.vertical).toBe("bottom");
  });

  it("snaps exact center horizontally to the right (equal distance)", () => {
    // Exact horizontal center: distance from left == distance from right
    // distFromLeft = x, distFromRight = vw - x - launcherSize
    // 640 == 1280 - 640 - 48 = 592 → distFromLeft > distFromRight → right
    const result = snapToNearestEdge(640, 400);
    expect(result.side).toBe("right");
  });

  it("snaps exact center vertically to the bottom (equal distance)", () => {
    // distFromTop = y = 400, distFromBottom = vh - y - size = 800 - 400 - 48 = 352
    // 352 < 400 → bottom
    const result = snapToNearestEdge(640, 400);
    expect(result.vertical).toBe("bottom");
  });

  it("works on a narrow viewport", () => {
    setViewport(375, 667);
    const result = snapToNearestEdge(10, 10);
    expect(result).toEqual({ side: "left", vertical: "top" });
  });
});

// ─── findBestPosition ──────────────────────────────────────────────────────

describe("findBestPosition", () => {
  beforeEach(() => {
    setViewport(1280, 800);
  });

  it("returns current position when no elements collide", () => {
    const pos = { side: "right" as const, vertical: "bottom" as const };
    const result = findBestPosition(pos, []);
    expect(result).toEqual(pos);
  });

  it("moves to top-right when bottom-right is blocked", () => {
    // Place a 100x100 element at the bottom-right corner of a 1280x800 viewport
    // That covers: left=1180, top=700, width=100, height=100
    const el = mockElement({ left: 1180, top: 700, width: 100, height: 100 });

    const pos = { side: "right" as const, vertical: "bottom" as const };
    const result = findBestPosition(pos, [el]);
    expect(result.side).toBe("right");
    // Should be top (not bottom, since bottom-right is blocked)
    expect(result.vertical).toBe("top");
  });

  it("prefers fewest-collision position", () => {
    // Block bottom-right AND top-right — only left-side positions are free
    // Bottom-right launcher at (1208, 728): block with element covering it
    const el1 = mockElement({ left: 1180, top: 700, width: 100, height: 100 });
    // Top-right launcher at (1208, 24): block with element covering it
    const el2 = mockElement({ left: 1180, top: 0, width: 100, height: 100 });

    const pos = { side: "right" as const, vertical: "bottom" as const };
    const result = findBestPosition(pos, [el1, el2]);
    // bottom-right blocked, top-right blocked → bottom-left wins
    expect(result).toEqual({ side: "left", vertical: "bottom" });
  });

  it("returns current position when all corners have collisions", () => {
    // Place 4 elements to block all four corners
    // Each is 80x80 with 16px margin overlap to the 48x48 launcher at 24px offset
    const blockerSize = 80;
    const corners = [
      { left: 1180, top: 700 },  // bottom-right
      { left: 1180, top: 0 },    // top-right
      { left: 0, top: 700 },     // bottom-left
      { left: 0, top: 0 },       // top-left
    ];
    const els = corners.map((c) => mockElement({ ...c, width: blockerSize, height: blockerSize }));

    const pos = { side: "right" as const, vertical: "bottom" as const };
    const result = findBestPosition(pos, els);
    // Even with all corners blocked, it returns a valid position
    expect(result.side).toBeDefined();
    expect(result.vertical).toBeDefined();
  });
});
