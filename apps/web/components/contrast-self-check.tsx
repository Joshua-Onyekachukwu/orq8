"use client";

/**
 * ORQ8 dashboard contrast self-check (development/test diagnostic).
 *
 * WHY IT EXISTS
 * -------------
 * The live-site regression (ORQ8 — main dashboard card text visibility) shipped
 * because token resolution looked correct in source. This component verifies the
 * OTHER side of that gap: the ACTUAL computed styles the browser renders. It
 * finds every element marked with `data-contrast-check`, samples its computed
 * foreground and the nearest non-transparent background, computes the WCAG
 * contrast ratio, and surfaces a visible dev-only alert when any pair drops
 * below the AA normal-text threshold (4.5:1).
 *
 * It never ships to production users: the component returns null when
 * NODE_ENV === "production" and the diagnostic banner only renders on failure.
 * The pure math helpers are exported so the same logic can be reused by tests.
 */

import { useEffect, useState } from "react";

/** Parse "rgb(r, g, b)" / "rgba(r, g, b, a)" (0-255 or %) / "#rrggbb". */
export function parseCssColor(color: string): [number, number, number] | null {
  const trimmed = color.trim();

  const hex = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const rgba = /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*[\d.]+)?\s*\)$/i.exec(trimmed);
  if (rgba) {
    const channel = (v: string): number => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    return [channel(rgba[1]!), channel(rgba[2]!), channel(rgba[3]!)];
  }

  return null;
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: [number, number, number]): number {
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  );
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Walk up until a non-transparent background is found (defaults to white). */
export function findEffectiveBackground(el: HTMLElement | null): string {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0)")) return bg;
    node = node.parentElement;
  }
  return "rgb(255, 255, 255)";
}

export interface ContrastIssue {
  label: string;
  className: string;
  ratio: number;
  foreground: string;
  background: string;
}

export const AA_NORMAL_THRESHOLD = 4.5;

/**
 * Development-only diagnostic. Renders a visible alert listing every marked
 * element below AA; renders nothing in production and nothing on success.
 */
export function ContrastSelfCheck({ selector = "[data-contrast-check]" }: { selector?: string }) {
  const [issues, setIssues] = useState<ContrastIssue[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const found: ContrastIssue[] = [];
    document.querySelectorAll(selector).forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const styles = getComputedStyle(el);
      const fg = parseCssColor(styles.color);
      const bgColor = findEffectiveBackground(el);
      const bg = parseCssColor(bgColor);
      if (!fg || !bg) return;
      const ratio = contrastRatio(fg, bg);
      if (ratio < AA_NORMAL_THRESHOLD) {
        found.push({
          label: el.getAttribute("data-contrast-check") ?? el.textContent?.slice(0, 60) ?? "unknown",
          className: typeof el.className === "string" ? el.className : "",
          ratio,
          foreground: styles.color,
          background: bgColor,
        });
      }
    });
    setIssues(found);
    setChecked(true);
  }, [selector]);

  if (process.env.NODE_ENV === "production" || !checked) return null;
  if (issues.length === 0) return null;

  return (
    <div
      data-testid="contrast-self-check-alert"
      role="alert"
      className="fixed bottom-4 right-4 z-[9999] max-w-md rounded-xl border-2 border-red-600 bg-red-50 p-4 shadow-xl"
    >
      <p className="text-sm font-bold text-red-700">
        ⚠ Contrast regression detected ({issues.length} element{issues.length === 1 ? "" : "s"} below AA)
      </p>
      <ul className="mt-2 space-y-1">
        {issues.map((issue, i) => (
          <li key={i} className="text-xs text-red-800">
            <span className="font-semibold">{issue.label}</span> — {issue.ratio.toFixed(2)}:1
            (fg {issue.foreground} on {issue.background})
            <code className="block truncate opacity-70">{issue.className}</code>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-red-700/80">
        Fix the underlying semantic token — do not silence this alert.
      </p>
    </div>
  );
}