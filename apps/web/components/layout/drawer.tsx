"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Drawer — the shared right-side panel (docs/76 Phase 3). One implementation
 * for every right-side surface: agent workspace drawer, task detail, file
 * preview, review panel.
 *
 * Behavior contract:
 *  - below `lg` it covers the viewport as a sheet (with backdrop); at `lg`+
 *    it is a right-side panel over the page (with backdrop, so the founder
 *    can also click away). Escape always closes. Body scroll locks while
 *    open. Underlying page is never unmounted, so state survives open/close.
 *
 * Accessibility: role=dialog aria-modal, labelled by the header, Escape
 * handled here, close button labelled. Focus stays with the trigger
 * (consumers can focus a specific element via autoFocus if desired).
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerRight,
  children,
  width = "lg",
  scope = "console",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Optional right-side header slot (e.g. status dot, "Open full view" link). */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** Panel width class: "md" = 480px, "lg" = 640px, "xl" = 860px. */
  width?: "md" | "lg" | "xl";
  /**
   * Theme scope for the panel. The drawer portals to document.body, which is
   * outside the `#main.console` subtree, so console-scoped styles
   * (`console-card`, `state-dot`, the `--console-*` tokens) simply did not
   * apply inside a drawer. "console" re-applies the scope on the panel itself
   * and mirrors the host console's theme; "none" leaves the panel on the
   * document palette (useful outside the app shell). The overlay stays
   * unscoped either way — the panel must not paint an opaque page background
   * over the dashboard behind it.
   */
  scope?: "console" | "none";
}) {
  const [mounted, setMounted] = useState(false);
  const [consoleTheme, setConsoleTheme] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open || scope !== "console") return;
    setConsoleTheme(
      document.querySelector(".console")?.getAttribute("data-console-theme") ?? null,
    );
  }, [open, scope]);
  // Escape closes; body scroll locks while open (mirrors ea-dock.tsx).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const widthCls =
    width === "md" ? "sm:max-w-md" : width === "xl" ? "sm:max-w-[860px]" : "sm:max-w-2xl";

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 w-full cursor-default bg-black/50 backdrop-blur-[2px]"
        tabIndex={-1}
      />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col border-l border-hairline bg-elevated shadow-2xl",
          scope === "console" && "console",
          widthCls,
        )}
        data-console-theme={scope === "console" ? consoleTheme ?? undefined : undefined}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold text-ink">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-secondary hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
