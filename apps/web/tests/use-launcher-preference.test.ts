import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLauncherPreference } from "../hooks/use-launcher-preference";

const STORAGE_KEY = "orq8-ea-launcher-position";

// ─── localStorage mock ──────────────────────────────────────────────────────

function createLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((_i: number) => null),
  };
}

let mockStorage: ReturnType<typeof createLocalStorageMock>;

beforeEach(() => {
  mockStorage = createLocalStorageMock();
  vi.stubGlobal("localStorage", mockStorage);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("useLauncherPreference", () => {
  it("returns default preference on initial render", () => {
    const { result } = renderHook(() => useLauncherPreference());
    expect(result.current.preference).toEqual({ side: "right", vertical: "bottom" });
  });

  it("persists preference to localStorage", () => {
    const { result } = renderHook(() => useLauncherPreference());

    act(() => {
      result.current.setPreference({ side: "left", vertical: "top" });
    });

    expect(mockStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({ side: "left", vertical: "top" }),
    );
    expect(result.current.preference).toEqual({ side: "left", vertical: "top" });
  });

  it("rehydrates valid preference from localStorage", () => {
    mockStorage.getItem.mockReturnValue(
      JSON.stringify({ side: "left", vertical: "top" }),
    );

    const { result } = renderHook(() => useLauncherPreference());

    // After the useEffect runs, preference should be rehydrated
    expect(result.current.preference).toEqual({ side: "left", vertical: "top" });
  });

  it("falls back to default for malformed JSON", () => {
    mockStorage.getItem.mockReturnValue("not-valid-json");

    const { result } = renderHook(() => useLauncherPreference());

    expect(result.current.preference).toEqual({ side: "right", vertical: "bottom" });
  });

  it("falls back to default for missing side", () => {
    mockStorage.getItem.mockReturnValue(
      JSON.stringify({ vertical: "top" }),
    );

    const { result } = renderHook(() => useLauncherPreference());

    expect(result.current.preference).toEqual({ side: "right", vertical: "bottom" });
  });

  it("falls back to default for invalid side value", () => {
    mockStorage.getItem.mockReturnValue(
      JSON.stringify({ side: "center", vertical: "top" }),
    );

    const { result } = renderHook(() => useLauncherPreference());

    expect(result.current.preference).toEqual({ side: "right", vertical: "bottom" });
  });

  it("falls back to default for invalid vertical value", () => {
    mockStorage.getItem.mockReturnValue(
      JSON.stringify({ side: "right", vertical: "middle" }),
    );

    const { result } = renderHook(() => useLauncherPreference());

    expect(result.current.preference).toEqual({ side: "right", vertical: "bottom" });
  });

  it("falls back to default when localStorage throws", () => {
    mockStorage.getItem.mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const { result } = renderHook(() => useLauncherPreference());

    expect(result.current.preference).toEqual({ side: "right", vertical: "bottom" });
  });

  it("handles localStorage.setItem failure gracefully", () => {
    mockStorage.setItem.mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const { result } = renderHook(() => useLauncherPreference());

    // Should not throw
    act(() => {
      result.current.setPreference({ side: "left", vertical: "bottom" });
    });

    // State should still update even if localStorage fails
    expect(result.current.preference).toEqual({ side: "left", vertical: "bottom" });
  });

  it("updates preference multiple times", () => {
    const { result } = renderHook(() => useLauncherPreference());

    act(() => {
      result.current.setPreference({ side: "left", vertical: "top" });
    });
    expect(result.current.preference).toEqual({ side: "left", vertical: "top" });

    act(() => {
      result.current.setPreference({ side: "right", vertical: "bottom" });
    });
    expect(result.current.preference).toEqual({ side: "right", vertical: "bottom" });
  });
});
