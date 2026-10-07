"use client";

/**
 * ExecutiveAgentPanel — persistent assistant surface for the founder.
 *
 * Renders as a slide-in side panel (right side) on desktop, and a bottom
 * sheet on mobile. The founder can ask questions about the current page,
 * the organization, or any entity they're viewing.
 *
 * The conversation lives in ExecutiveAgentProvider (shared with the
 * dashboard's Atlas dock), so a thread started on the dashboard continues
 * here on any other page. On the dashboard route the floating launcher is
 * hidden — the fixed Atlas dock owns the EA surface there; "Expand" on the
 * dock opens this panel.
 *
 * All responses go through the real Executive Agent backend (no fake data).
 */

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Loader2,
} from "lucide-react";
import { useExecutiveAgent, useEaName, type PageContext } from "./executive-agent-context";
import { FloatingLauncher } from "./floating-launcher";

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
    founderStage,
    pendingPrompt,
    setPendingPrompt,
    messages,
    sendMessage,
    loading,
    error,
  } = useExecutiveAgent();
  const EA_NAME = useEaName();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // On the dashboard the fixed Atlas dock replaces the floating launcher —
  // two doors to the same EA on one screen would read as two agents.
  const pathname = usePathname();
  const isDashboard = pathname === "/app";

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
      setInput("");
    }
  };

  const suggestion = suggestedQuestion(pageContext);

  return (
    <>
      {/* Floating trigger — collision-aware, draggable, snap-to-edge. Hidden
          while the panel is open: the panel owns the screen then, and the
          collision engine would otherwise fling the launcher to the opposite
          corner (over the sidebar) for as long as the panel stays open. Also
          hidden on the dashboard: the fixed Atlas dock is the EA surface
          there; the launcher lives on every other page. */}
      {!panelOpen && !isDashboard && (
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
                <div className="ea-avatar flex h-8 w-8 items-center justify-center rounded-full">
                  <Bot className="h-4 w-4" />
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

            {/* Messages — the thread gets the full height between header and
                composer; the stage list is gone, so more of the conversation
                stays in view. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
                        ? "border border-hairline-strong bg-surface-secondary text-ink"
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
                    {/* Single quiet indicator while working. The stage-by-stage
                        narration ("reading the organization", "analysing
                        command"…) was noise the founder explicitly asked to
                        remove: execute the task and report, not a play-by-play.
                        Stages stay in the stream for logs and the dock. */}
                    <div
                      className="flex items-center gap-2 text-sm text-ink-muted"
                      aria-live="polite"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />
                      {EA_NAME} is working…
                    </div>
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
                  placeholder={`Message ${EA_NAME} — give direction, ask anything, or type / for commands`}
                  rows={3}
                  className="min-h-[4.5rem] flex-1 resize-y rounded-xl border border-hairline bg-surface-secondary px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-warm/40 focus:outline-none focus:ring-2 focus:ring-warm/20"
                />
                <button
                  onClick={() => {
                    void sendMessage(input);
                    setInput("");
                  }}
                  disabled={!input.trim() || loading}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-warm text-on-warm transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
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
