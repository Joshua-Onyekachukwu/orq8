/**
 * Console theme helpers for the web app. Mirrors resolveConsoleTheme in
 * packages/core/src/design-tokens.ts (kept local so the client bundle never
 * imports core's server-side dependency graph). The CSS values themselves
 * live in app/globals.css `.console`; the token source of truth is
 * packages/core/src/design-tokens.ts.
 */
export type ConsoleTheme = "dark" | "light";

export const DEFAULT_CONSOLE_THEME: ConsoleTheme = "dark";

/**
 * Cookie the console theme is persisted in.
 *
 * It lives here — a plain module — rather than next to the toggle that writes
 * it. `theme-toggle.tsx` is a `"use client"` module, and a server component
 * (`app/app/layout.tsx`) reads this value on every request: importing it from a
 * client module hands the server a client *reference*, not the string, so the
 * lookup silently found nothing and the founder's light choice was discarded on
 * every navigation. Components may cross that boundary; plain values may not.
 */
export const CONSOLE_THEME_COOKIE = "orq8_console_theme";

export function isConsoleTheme(value: unknown): value is ConsoleTheme {
  return value === "dark" || value === "light";
}

export function resolveConsoleTheme(stored: unknown): ConsoleTheme {
  return isConsoleTheme(stored) ? stored : DEFAULT_CONSOLE_THEME;
}
