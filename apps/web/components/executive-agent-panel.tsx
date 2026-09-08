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
  Sparkles,
} from "lucide-react";
import { useExecutiveAgent, type PageContext } from "./executive-agent-context";
import { FloatingLauncher } from "./floating-launcher";

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
  const { pageContext, panelOpen, setPanelOpen, togglePanel } =
    useExecutiveAgent();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

      try {
        const res = await fetch("/api/executive-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: text.trim(), contextNote }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Agent returned ${res.status}`);
        }

        const data = await res.json();
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            data.data?.message ??
            data.data?.intent?.response ??
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
      {/* Floating trigger — collision-aware, draggable, snap-to-edge */}
      <FloatingLauncher
        onClick={togglePanel}
        icon={<MessageSquare className="h-5 w-5" />}
        label="Executive Agent"
      />

      {/* Panel overlay */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 lg:inset-y-0 lg:right-0 lg:left-auto">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setPanelOpen(false)}
          />

          {/* Panel — slide from right on desktop, bottom sheet on mobile */}
          <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col bg-white shadow-2xl lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[420px] lg:border-l lg:border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orq8-dark">
                  <Sparkles className="h-4 w-4 text-orq8-lime" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Executive Agent
                  </h3>
                  {pageContext && (
                    <p className="text-xs text-gray-500">
                      Context: {pageContext.pageName}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close Executive Agent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
                    <Bot className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">
                    Ask me anything about your organization
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    I understand the current page and your company context
                  </p>
                  <button
                    onClick={() => sendMessage(suggestion)}
                    className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
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
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orq8-dark">
                      <Bot className="h-3.5 w-3.5 text-orq8-lime" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-orq8-dark text-white"
                        : "bg-gray-100 text-gray-800"
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
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200">
                      <User className="h-3.5 w-3.5 text-gray-600" />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orq8-dark">
                    <Bot className="h-3.5 w-3.5 text-orq8-lime" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-500">Thinking...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggested questions when there are few messages */}
            {messages.length <= 1 && pageContext && (
              <div className="border-t border-gray-100 px-4 py-2">
                <p className="mb-2 text-xs font-medium text-gray-500">
                  Quick questions:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "How is the company doing?",
                    "What needs my attention?",
                    "Explain agent performance",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-gray-100 px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the Executive Agent..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orq8-orange/40 focus:outline-none focus:ring-2 focus:ring-orq8-orange/20"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-orq8-dark text-white transition-colors hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
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
