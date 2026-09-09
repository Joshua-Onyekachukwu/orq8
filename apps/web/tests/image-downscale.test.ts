import { describe, it, expect } from "vitest";
import { shouldDownscale, targetDimensions, AVATAR_MAX_DIMENSION } from "../lib/image-downscale";

describe("shouldDownscale", () => {
  it("returns true when the long edge exceeds the max dimension", () => {
    expect(shouldDownscale(4000, 3000)).toBe(true);
    expect(shouldDownscale(513, 100)).toBe(true);
    expect(shouldDownscale(100, 513)).toBe(true);
  });

  it("returns false when already within the limit", () => {
    expect(shouldDownscale(512, 512)).toBe(false);
    expect(shouldDownscale(512, 100)).toBe(false);
    expect(shouldDownscale(320, 240)).toBe(false);
  });

  it("never returns true at exactly the boundary", () => {
    expect(shouldDownscale(AVATAR_MAX_DIMENSION, AVATAR_MAX_DIMENSION)).toBe(false);
    expect(shouldDownscale(AVATAR_MAX_DIMENSION + 1, 1)).toBe(true);
  });

  it("rejects degenerate or non-finite inputs", () => {
    expect(shouldDownscale(0, 100)).toBe(false);
    expect(shouldDownscale(100, 0)).toBe(false);
    expect(shouldDownscale(NaN, 100)).toBe(false);
    expect(shouldDownscale(Infinity, 100)).toBe(false);
    expect(shouldDownscale(-5, 100)).toBe(false);
  });
});

describe("targetDimensions", () => {
  it("fits the long edge to the max while preserving aspect ratio", () => {
    expect(targetDimensions(4000, 3000)).toEqual({ width: 512, height: 384 });
    expect(targetDimensions(3000, 4000)).toEqual({ width: 384, height: 512 });
    expect(targetDimensions(1024, 1024)).toEqual({ width: 512, height: 512 });
  });

  it("never upscales small images", () => {
    expect(targetDimensions(256, 128)).toEqual({ width: 512, height: 256 });
    expect(targetDimensions(100, 50)).toEqual({ width: 512, height: 256 });
  });

  it("handles extreme aspect ratios without zero-sized edges", () => {
    const t = targetDimensions(10000, 10);
    expect(t.width).toBe(512);
    expect(t.height).toBeGreaterThanOrEqual(1);
  });

  it("respects a custom max dimension", () => {
    expect(targetDimensions(1000, 500, 250)).toEqual({ width: 250, height: 125 });
  });
});
