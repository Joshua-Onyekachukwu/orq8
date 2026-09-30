/**
 * Console theme helpers for the web app. Mirrors resolveConsoleTheme in
 * packages/core/src/design-tokens.ts (kept local so the client bundle never
 * imports core's server-side dependency graph). The CSS values themselves
 * live in app/globals.css `.console`; the token source of truth is
 * packages/core/src/design-tokens.ts.
 */
export type ConsoleTheme = "dark" | "light";

export const DEFAULT_CONSOLE_THEME: ConsoleTheme = "dark";

export function isConsoleTheme(value: unknown): value is ConsoleTheme {
  return value === "dark" || value === "light";
}

export function resolveConsoleTheme(stored: unknown): ConsoleTheme {
  return isConsoleTheme(stored) ? stored : DEFAULT_CONSOLE_THEME;
}
