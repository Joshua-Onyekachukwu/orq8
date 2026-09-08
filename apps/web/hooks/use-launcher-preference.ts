"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "orq8-ea-launcher-position";

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

export function useLauncherPreference() {
  const [preference, setPreferenceState] = useState<LauncherPreference>(
    DEFAULT_PREFERENCE,
  );

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
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
  }, []);

  const setPreference = useCallback((pref: LauncherPreference) => {
    setPreferenceState(pref);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
    } catch {
      // Ignore storage errors
    }
  }, []);

  return { preference, setPreference };
}
