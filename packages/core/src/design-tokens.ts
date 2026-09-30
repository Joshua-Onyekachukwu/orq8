/**
 * ORQ8 design tokens (docs/71 §F, revised through founder Revision 4 and the
 * color-quieting pass) — the single source of truth for the ORQ8 palette.
 *
 * The mock (marketing/headquarters-mock-v2.html) mirrors these values in its
 * :root block. The web app maps them onto the semantic --orq-* tokens inside
 * the `.console` scope (apps/web/app/globals.css), so the dark console and
 * the founder-facing light/dark toggle resolve from here.
 *
 * Accents are deliberately desaturated (founder: sharp colors "give AI
 * slop"); color carries meaning only — state dots, danger, one primary CTA.
 */

/** The quieted dark-console palette — hex triplet per token. */
export const CONSOLE_DARK = {
  // Surfaces
  bg: "#0B0F14",
  surface: "#11161D",
  hover: "#161D26",
  line: "#1E2732",
  lineStrong: "#2A3646",
  // Accents (quieted)
  lime: "#A6CE95",
  limeSoft: "rgba(166, 206, 149, 0.07)",
  limeDim: "rgba(166, 206, 149, 0.45)",
  orange: "#E9974F",
  orangeSoft: "rgba(233, 151, 79, 0.07)",
  red: "#E07A7A",
  redSoft: "rgba(224, 122, 122, 0.08)",
  info: "#8FB8D8",
  infoSoft: "rgba(143, 184, 216, 0.07)",
  // Text
  muted: "#97A3B4",
  body: "#E6EAF0",
  white: "#FFFFFF",
  // On-accent fills (the orange CTA carries dark ink)
  onOrange: "#231206",
} as const;

/** The light mode the dark console toggles into (founder choice, user-facing). */
export const CONSOLE_LIGHT = {
  bg: "#FFFFFF",
  surface: "#F7F8FA",
  hover: "#EEF1F4",
  line: "#E3E8EE",
  lineStrong: "#C9D2DC",
  lime: "#5C9E31",
  orange: "#C4661B",
  orangeStrong: "#E8761A",
  red: "#C23B3B",
  info: "#2563EB",
  ink: "#0E1520",
  body: "#2A3340",
  muted: "#5C6878",
  faint: "#8B95A3",
  onOrange: "#FFFFFF",
} as const;

/** Which theme a console surface is currently rendering in. */
export type ConsoleTheme = "dark" | "light";

export const DEFAULT_CONSOLE_THEME: ConsoleTheme = "dark";

export function isConsoleTheme(value: unknown): value is ConsoleTheme {
  return value === "dark" || value === "light";
}

/**
 * Resolve the stored preference. The app passes its storage (cookie /
 * localStorage) value through here so both ends share one parsing rule.
 */
export function resolveConsoleTheme(stored: unknown): ConsoleTheme {
  return isConsoleTheme(stored) ? stored : DEFAULT_CONSOLE_THEME;
}

/** CSS custom properties for a given theme, ready to inline on a scope. */
export function consoleThemeVars(theme: ConsoleTheme): Record<string, string> {
  const t = theme === "dark" ? CONSOLE_DARK : CONSOLE_LIGHT;
  return {
    "--console-bg": t.bg,
    "--console-surface": t.surface,
    "--console-hover": t.hover,
    "--console-line": t.line,
    "--console-line-strong": t.lineStrong,
    "--console-lime": t.lime,
    "--console-orange": t.orange,
    "--console-red": t.red,
    "--console-info": t.info,
    "--console-muted": t.muted,
    "--console-body": t.body,
    "--console-on-orange": t.onOrange,
  };
}
