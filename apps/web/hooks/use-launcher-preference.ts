"use client";

import { useState, useCallback, useEffect } from "react";

/**
 * Saved launcher corner, keyed per floating control id. The EA trigger and
 * the quick-actions FAB must NOT share one key: a shared key makes both
 * launchers read (and drag-write) the same corner, so they stack and drag
 * each other around. Each floatingId gets its own persisted preference.
 */

export type LauncherSide = "right" | "left";
export type LauncherVertical = "bottom" | "top";

export interface LauncherPreference {
  side: LauncherSide;
  vertical: LauncherVertical;
}

const DEFAULT_PREFERENCE: LauncherPreference = {
  side: "right",
  vertical: "bottom",
};

function storageKeyFor(id: string): string {
  return id === "ea"
    ? "orq8-ea-launcher-position" // legacy key: existing users keep their corner
    : `orq8-launcher-position-${id}`;
}

export function useLauncherPreference(id: string = "ea") {
  const [preference, setPreferenceState] = useState<LauncherPreference>(
    DEFAULT_PREFERENCE,
  );

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKeyFor(id));
      if (stored) {
        const parsed = JSON.parse(stored) as LauncherPreference;
        if (
          parsed.side &&
          parsed.vertical &&
          ["right", "left"].includes(parsed.side) &&
          ["bottom", "top"].includes(parsed.vertical)
        ) {
          setPreferenceState(parsed);
        }
      }
    } catch {
      // Ignore parse errors — use default
    }
  }, [id]);

  const setPreference = useCallback((pref: LauncherPreference) => {
    setPreferenceState(pref);
    try {
      localStorage.setItem(storageKeyFor(id), JSON.stringify(pref));
    } catch {
      // Ignore storage errors
    }
  }, [id]);

  return { preference, setPreference };
}
