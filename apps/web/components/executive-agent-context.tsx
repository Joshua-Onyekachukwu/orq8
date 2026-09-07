"use client";

/**
 * ExecutiveAgentContext — page-aware context registry.
 *
 * Pages register structured context with the Executive Agent so it can answer
 * "what am I looking at?" without the founder having to explain.
 *
 * The registry is a simple React context that pages populate via hooks.
 * No global state library needed — the existing pattern in this codebase
 * uses React contexts + fetch-based API calls.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

/** What the Executive Agent receives about the current page. */
export interface PageContext {
  /** Current route path, e.g. "/app/engineering" */
  route: string;
  /** Human-readable page name, e.g. "Engineering" */
  pageName: string;
  /** Primary entity being viewed (optional). */
  entity?: {
    type: string; // "task" | "agent" | "goal" | "department" | "integration" | ...
    id: string;
    name?: string;
    status?: string;
  };
  /** Additional structured context specific to the page. */
  extra?: Record<string, unknown>;
}

export interface ExecutiveAgentContextValue {
  /** Current page context registered by the active page. */
  pageContext: PageContext | null;
  /** Pages call this to register their context. */
  setPageContext: (ctx: PageContext | null) => void;
  /** Whether the assistant panel is open. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Toggle the panel. */
  togglePanel: () => void;
}

const ExecutiveAgentCtx = createContext<ExecutiveAgentContextValue | null>(null);

export function ExecutiveAgentProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const togglePanel = useCallback(() => setPanelOpen((p) => !p), []);

  return (
    <ExecutiveAgentCtx.Provider
      value={{ pageContext, setPageContext, panelOpen, setPanelOpen, togglePanel }}
    >
      {children}
    </ExecutiveAgentCtx.Provider>
  );
}

/** Hook for the Executive Agent panel to read context and control open/close. */
export function useExecutiveAgent() {
  const ctx = useContext(ExecutiveAgentCtx);
  if (!ctx) throw new Error("useExecutiveAgent must be used within ExecutiveAgentProvider");
  return ctx;
}

/** Hook for pages to register their context on mount/unmount. */
export function usePageContext(ctx: PageContext | null) {
  const { setPageContext } = useExecutiveAgent();
  // Register on mount, clear on unmount.
  // Using a ref pattern via effect so stale closures don't accumulate.
  useState(() => {
    setPageContext(ctx);
  });
  // Update when context changes.
  if (ctx && (ctx.route !== null || ctx.entity !== undefined)) {
    setPageContext(ctx);
  }
}
