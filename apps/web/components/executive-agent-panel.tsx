"use client";

/**
 * ExecutiveAgentPanel — persistent assistant surface for the founder.
 *
 * Renders as a slide-in side panel (right side) on desktop, and a bottom
 * sheet on mobile. The founder can ask questions about the current page,
 * the organization, or any entity they're viewing.
 *
 * All responses go through the real Executive Agent backend (no fake data).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Loader2,
} from "lucide-react";
import { useExecutiveAgent, type PageContext } from "./executive-agent-context";
import { ExecutiveAgentProgress, type EAProgressStage } from "./ea-progress";
import { runCommandStream, CommandStreamError } from "../lib/command-stream";
import { FloatingLauncher } from "./floating-launcher";
import { EA_NAME } from "../lib/ea";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  contextNote?: string;
}

/** Format the page context into a short note for the backend. */
function formatContextNote(ctx: PageContext | null): string | undefined {
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

/** Generate a suggested question based on the current page. */
function suggestedQuestion(ctx: PageContext | null): string {
  if (!ctx) return "How is the company doing today?";
  switch (ctx.pageName) {
    case "Dashboard":
      return "What should I focus on today?";
    case "Engineering":
      return "Why are tasks failing?";
    case "AI Employees":
      return "How are my agents performing?";
    case "Goals":
      return "Which goals are behind schedule?";
    case "Integrations":
      return "Why are integrations unhealthy?";
    case "Performance":
      return "What changed this week?";
    case "Simulation":
      return "What happens if we add another agent?";
    case "Audit Trail":
      return "What happened recently?";
    case "Company Health":
      return "Explain the biggest risk.";
    case "Strategy":
      return "Are we working on the right things?";
    case "Departments":
      return "Which department is overloaded?";
    case "Approvals":
      return "What needs my attention?";
    default:
      return `What am I looking at on the ${ctx.pageName} page?`;
  }
}

export function ExecutiveAgentPanel() {
  const {
    pageContext,
    panelOpen,
    setPanelOpen,
    togglePanel,
    userId,
    founderStage,
    pendingPrompt,
    setPendingPrompt,
  } = useExecutiveAgent();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live pipeline stages from the streaming endpoint.
  const [stages, setStages] = useState<EAProgressStage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore the persisted thread for this user (best-effort: a missing or
  // corrupt entry simply starts a fresh conversation).
  const storageKey = userId ? `orq8:ea:thread:${userId}` : null;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
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

  // Persist as the conversation grows; cap the thread so storage stays bounded.
  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(messages.slice(-40)),
      );
    } catch {
      // Quota exceeded — persistence is best-effort.
    }
  }, [messages, hydrated, storageKey]);

  // A page action queued a prompt (e.g. the dashboard's "Tell the EA" action):
  // pre-fill the input when the panel opens, then consume it.
  useEffect(() => {
    if (panelOpen && pendingPrompt) {
      setInput(pendingPrompt);
      setPendingPrompt(null);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [panelOpen, pendingPrompt, setPendingPrompt]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens.
  useEffect(() => {
    if (panelOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [panelOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const contextNote = formatContextNote(pageContext);
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
        contextNote,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
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
        setLoading(false);
      }
    },
    [pageContext, loading],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const suggestion = suggestedQuestion(pageContext);

  return (
    <>
      {/* Floating trigger — collision-aware, draggable, snap-to-edge. Hidden
          while the panel is open: the panel owns the screen then, and the
          collision engine would otherwise fling the launcher to the opposite
          corner (over the sidebar) for as long as the panel stays open. */}
      {!panelOpen && (
        <FloatingLauncher
          onClick={togglePanel}
          icon={<MessageSquare className="h-5 w-5" />}
          label={EA_NAME}
          floatingId="ea"
        />
      )}

      {/* Panel overlay */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 lg:inset-y-0 lg:right-0 lg:left-auto">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setPanelOpen(false)}
          />

          {/* Panel — slide from right on desktop, bottom sheet on mobile */}
          <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col bg-white shadow-2xl lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[420px] lg:border-l lg:border-hairline">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline-light px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full ink">
                  <Bot className="h-4 w-4 text-warm-ink" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    {EA_NAME}
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Executive Agent
                    {pageContext ? ` · ${pageContext.pageName}` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-secondary hover:text-ink-muted"
                aria-label="Close Executive Agent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && founderStage === "new" && (
                <div className="flex gap-3 justify-start">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ink">
                    <Bot className="h-3.5 w-3.5 text-warm-ink" />
                  </div>
                  <div className="max-w-[85%] rounded-xl bg-surface-secondary px-4 py-3 text-sm leading-relaxed text-ink">
                    <p className="whitespace-pre-wrap">
                      {`Welcome. I'm ${EA_NAME}, your Executive Agent. I help you turn your direction into an operating company: structure the organization, identify what needs to be done, coordinate your teams, and keep you informed as work moves forward.`}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap">
                      Before I start organizing work, I need to understand what
                      you're building. What are you building, and what would you
                      like to accomplish with it?
                    </p>
                  </div>
                </div>
              )}

              {messages.length === 0 && founderStage === "in_progress" && (
                <div className="flex gap-3 justify-start">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ink">
                    <Bot className="h-3.5 w-3.5 text-warm-ink" />
                  </div>
                  <div className="max-w-[85%] rounded-xl bg-surface-secondary px-4 py-3 text-sm leading-relaxed text-ink">
                    <p className="whitespace-pre-wrap">
                      We're partway through setting up your company. Finish
                      onboarding and I'll start organizing work. You can also
                      tell me what you're building here and I'll keep it as
                      context.
                    </p>
                  </div>
                </div>
              )}

              {messages.length === 0 && founderStage !== "new" && founderStage !== "in_progress" && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary">
                    <Bot className="h-8 w-8 text-ink-faint" />
                  </div>
                  <p className="text-sm font-medium text-ink">
                    Ask me anything about your company
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    I understand the current page and your company context
                  </p>
                  <button
                    onClick={() => sendMessage(suggestion)}
                    className="mt-4 rounded-lg border border-hairline bg-surface-secondary px-4 py-2 text-sm text-ink transition-colors hover:border-hairline-strong"
                  >
                    &ldquo;{suggestion}&rdquo;
                  </button>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ink">
                      <Bot className="h-3.5 w-3.5 text-warm-ink" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "ink text-white"
                        : "bg-surface-secondary text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.contextNote && msg.role === "user" && (
                      <p className="mt-1 text-xs opacity-60">
                        {msg.contextNote}
                      </p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-disabled-surface">
                      <User className="h-3.5 w-3.5 text-ink-muted" />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ink">
                    <Bot className="h-3.5 w-3.5 text-warm-ink" />
                  </div>
                  <div className="rounded-xl bg-surface-secondary px-4 py-3">
                    {stages.length > 0 ? (
                      <ExecutiveAgentProgress stages={stages} />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />
                        <span className="text-sm text-ink-muted">Thinking...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-border-error bg-error-soft px-4 py-2 text-xs text-error-ink">
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggested questions when there are few messages */}
            {messages.length <= 1 && pageContext && (
              <div className="border-t border-hairline-light px-4 py-2">
                <p className="mb-2 text-xs font-medium text-ink-muted">
                  Quick questions:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(founderStage === "new"
                    ? [
                        "I'm building a new product",
                        "I have an existing business",
                        "What can you do for me?",
                      ]
                    : founderStage === "in_progress"
                      ? [
                          "What remains to set up?",
                          "I'm building a new product",
                          "How does onboarding work?",
                        ]
                      : [
                          "How is the company doing?",
                          "What needs my attention?",
                          "Explain AI employee performance",
                        ]
                  ).map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="rounded-full border border-hairline bg-white px-3 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-secondary"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-hairline-light px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the Executive Agent..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-hairline bg-surface-secondary px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-warm/40 focus:outline-none focus:ring-2 focus:ring-warm/20"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="flex h-10 w-10 items-center justify-center rounded-xl ink text-white transition-colors hover:bg-brand-deep disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
