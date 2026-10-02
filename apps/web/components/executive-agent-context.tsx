"use client";

/**
 * ExecutiveAgentContext — page-aware context registry + the shared EA thread.
 *
 * Two things live here:
 *
 * 1. The page-context registry: pages register structured context with the
 *    Executive Agent so it can answer "what am I looking at?" without the
 *    founder having to explain.
 *
 * 2. The shared conversation store (docs/71 §F): the dashboard's Atlas dock
 *    and the slide-in panel are two views of ONE thread. A message sent from
 *    the dock is visible from the panel on any other page — the store is in
 *    this provider (mounted once in the app layout), so it survives route
 *    changes, and it persists to localStorage keyed by user id.
 *
 * No global state library needed — the existing pattern in this codebase
 * uses React contexts + fetch-based API calls.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { EAProgressStage } from "./ea-progress";
import { runCommandStream, CommandStreamError } from "../lib/command-stream";

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

/** Onboarding stage, reported by the dashboard from persisted backend state. */
export type FounderStage = "new" | "in_progress" | "active";

/** One message in the shared EA thread. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  contextNote?: string;
}

/** Format the page context into a short note for the backend. */
export function formatContextNote(ctx: PageContext | null): string | undefined {
  if (!ctx) return undefined;
  const parts = [`Page: ${ctx.pageName} (${ctx.route})`];
  if (ctx.entity) {
    parts.push(
      `Viewing: ${ctx.entity.type} "${ctx.entity.name ?? ctx.entity.id}" [${ctx.entity.status ?? "unknown"}]`,
    );
  }
  if (ctx.extra) {
    const entries = Object.entries(ctx.extra).slice(0, 5);
    for (const [k, v] of entries) {
      parts.push(`${k}: ${String(v)}`);
    }
  }
  return parts.join(" | ");
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
  /** Authenticated user id — keys the persisted conversation thread. */
  userId: string | null;
  /** Onboarding stage from the dashboard (null on pages that don't report it). */
  founderStage: FounderStage | null;
  setFounderStage: (stage: FounderStage | null) => void;
  /** Prompt queued by a page action; consumed by the panel when it opens. */
  pendingPrompt: string | null;
  setPendingPrompt: (prompt: string | null) => void;
  /** Open the panel, optionally pre-filling the input with a prompt. */
  openPanel: (prompt?: string) => void;
  // ── Shared thread (dock + panel are two views of this one conversation) ──
  messages: ChatMessage[];
  /** Send a message through the real Executive Agent backend. */
  sendMessage: (text: string) => Promise<void>;
  /** True while the EA is working on the latest message. */
  loading: boolean;
  /** Live pipeline stages for the in-flight request. */
  stages: EAProgressStage[];
  /** Transport/processing error for the latest request. */
  error: string | null;
}

const ExecutiveAgentCtx = createContext<ExecutiveAgentContextValue | null>(null);

/** Cap the persisted thread so storage stays bounded. */
const THREAD_LIMIT = 40;

export function ExecutiveAgentProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [founderStage, setFounderStage] = useState<FounderStage | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  // ── Shared thread state ──────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<EAProgressStage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const togglePanel = useCallback(() => {
    setPendingPrompt(null);
    setPanelOpen((p) => !p);
  }, []);
  const openPanel = useCallback((prompt?: string) => {
    setPendingPrompt(prompt ?? null);
    setPanelOpen(true);
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl + Shift + E opens/closes the panel.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        togglePanel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePanel]);

  // Restore the persisted thread for this user (best-effort: a missing or
  // corrupt entry simply starts a fresh conversation). Keyed by user id so a
  // different account never sees another account's thread.
  const storageKey = userId ? `orq8:ea:thread:${userId}` : null;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(false);
    setMessages([]);
    if (!storageKey) {
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(
            parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })),
          );
        }
      }
    } catch {
      // Unreadable storage — start fresh.
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist as the conversation grows.
  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(messages.slice(-THREAD_LIMIT)),
      );
    } catch {
      // Quota exceeded — persistence is best-effort.
    }
  }, [messages, hydrated, storageKey]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loadingRef.current) return;
      loadingRef.current = true;

      const contextNote = formatContextNote(pageContext);
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
        contextNote,
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError(null);
      setStages([]);

      try {
        // Streaming first: live pipeline progress while the Executive Agent
        // works, then the full result in a final `done` event. Falls back to
        // the buffered POST ONLY when the stream never started the real
        // pipeline (route missing / proxy down) — never after work began,
        // to avoid double execution.
        let data: any;
        try {
          data = await runCommandStream({
            command: text.trim(),
            context: { page: pageContext?.route, contextNote },
            onStage: (ev) =>
              setStages((prev) => {
                const next = prev.filter((s) => s.stage !== ev.stage);
                next.push({ stage: ev.stage, label: ev.label, status: ev.status });
                return next;
              }),
          });
        } catch (err) {
          if (err instanceof CommandStreamError && !err.pipelineStarted) {
            const res = await fetch("/api/executive-agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ command: text.trim(), contextNote }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => null);
              throw new Error(body?.error ?? `Agent returned ${res.status}`);
            }
            data = await res.json();
          } else {
            throw err;
          }
        }

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            // Streaming endpoint: the `done` event's result IS the execution
            // result, so the message sits at the top level. The buffered POST
            // fallback wraps it in a `{ data }` envelope. Handle both — the
            // stream shape must win or every streamed reply degrades to the
            // generic "I processed your request..." line.
            data?.message ??
            data?.data?.message ??
            data?.data?.intent?.response ??
            data?.intent?.response ??
            "I processed your request. Check the results in the relevant pages.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(errMsg);
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I couldn't process that request: ${errMsg}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [pageContext],
  );

  return (
    <ExecutiveAgentCtx.Provider
      value={{
        pageContext,
        setPageContext,
        panelOpen,
        setPanelOpen,
        togglePanel,
        userId,
        founderStage,
        setFounderStage,
        pendingPrompt,
        setPendingPrompt,
        openPanel,
        messages,
        sendMessage,
        loading,
        stages,
        error,
      }}
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

/**
 * Hook for pages to register their context on mount/unmount.
 *
 * Pages pass a fresh object literal, so the effect is keyed on the flattened
 * *content* of the context rather than its identity. The previous version called
 * `setPageContext` during render (its guard, `ctx.route !== null`, is true for
 * every real page), which meant: render → set provider state → re-render → set
 * provider state again, forever. Any page that registered context locked its own
 * main thread; nothing had called this hook yet, so the loop was never seen.
 */
export function usePageContext(ctx: PageContext | null) {
  const { setPageContext } = useExecutiveAgent();
  const route = ctx?.route ?? null;
  const pageName = ctx?.pageName ?? null;
  const entityType = ctx?.entity?.type ?? null;
  const entityId = ctx?.entity?.id ?? null;
  const entityName = ctx?.entity?.name ?? null;
  const entityStatus = ctx?.entity?.status ?? null;
  const extra = ctx?.extra ?? null;
  const extraKey = extra ? JSON.stringify(extra) : null;

  useEffect(() => {
    // `ctx` is read at effect time; the dependency list is its content, which is
    // what actually changes between renders.
    setPageContext(ctx);
    return () => setPageContext(null);
    // The dependency list is the flattened content of `ctx`; the object identity
    // is intentionally excluded because callers build it inline on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, pageName, entityType, entityId, entityName, entityStatus, extraKey, setPageContext]);
}
