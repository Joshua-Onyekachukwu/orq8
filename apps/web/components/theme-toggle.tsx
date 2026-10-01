"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { CONSOLE_THEME_COOKIE, resolveConsoleTheme } from "../lib/console-theme";
import type { ConsoleTheme } from "../lib/console-theme";

function readTheme(): ConsoleTheme {
  const attr = document
    .querySelector(".console[data-console-theme]")
    ?.getAttribute("data-console-theme");
  return resolveConsoleTheme(attr ?? undefined);
}

function writeTheme(theme: ConsoleTheme) {
  const scope = document.querySelector(".console");
  if (scope) scope.setAttribute("data-console-theme", theme);
  // Persist for a year; the server layout reads the same cookie.
  document.cookie = `${CONSOLE_THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Light/dark toggle for the console (docs/71 item 6 — user's choice).
 * Flips `data-console-theme` on the `.console` scope, which re-points the
 * --orq-* tokens (globals.css). Reads the live attribute on mount, so the
 * button label agrees with whatever the server rendered from the cookie —
 * no flash, no hydration mismatch (state settles after hydration).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ConsoleTheme>("dark");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const toggle = () => {
    const next: ConsoleTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    writeTheme(next);
  };

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-secondary hover:text-ink"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
