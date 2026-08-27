"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowRight, Loader2, CheckCircle2, AlertCircle, Clock, Check, X } from "lucide-react";

interface PlanStep {
  action: string;
  description: string;
  agents?: string[];
  estimatedCost?: number;
}

interface CommandResult {
  command: string;
  plan: PlanStep;
  status: "ready_to_execute" | "awaiting_approval" | "error";
  message: string;
  approvalRequest?: {
    id: string;
    agent: string;
    what: string;
    cost: number;
    reason: string;
  };
}

const SAMPLE_COMMANDS = [
  "Research the Nigerian renewable energy market",
  "Prepare a competitor analysis for our three biggest competitors",
  "Create a marketing plan for next month",
  "Find what needs my attention today",
  "Draft the weekly executive report",
  "Send a status update to the team",
];

export function CommandBar() {
  const [command, setCommand] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [history, setHistory] = useState<CommandResult[]>([]);
  const [approvalStatus, setApprovalStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K to focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isProcessing) return;

    setIsProcessing(true);
    setResult(null);
    setApprovalStatus("idle");

    try {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: command.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to process command");
      }

      const data = await response.json();
      const newResult = data.data;
      setResult(newResult);
      setHistory((prev) => [newResult, ...prev].slice(0, 10));
      setCommand("");
    } catch {
      setResult({
        command,
        plan: { action: "error", description: "Failed to process command" },
        status: "error",
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setCommand(suggestion);
    inputRef.current?.focus();
  };

  const handleApprovalDecision = async (decision: "approved" | "rejected") => {
    if (!result?.approvalRequest?.id || approvalStatus === "submitting") return;
    setApprovalStatus("submitting");
    try {
      const res = await fetch(`/api/approvals/${result.approvalRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision }),
      });
      if (!res.ok) throw new Error("Failed to submit decision");
      setApprovalStatus("submitted");
    } catch {
      setApprovalStatus("error");
    }
  };

  return (
    <div className="w-full">
      {/* Command input */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center gap-3 rounded-xl border border-hairline bg-white p-3 shadow-sm transition-all focus-within:border-emerald focus-within:ring-2 focus-within:ring-emerald/20">
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Give ORQ8 a command..."
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted outline-none"
            disabled={isProcessing}
          />
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted sm:inline">
              <kbd className="rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            </span>
            <button
              type="submit"
              disabled={!command.trim() || isProcessing}
              className="flex h-8 items-center gap-2 rounded-lg bg-navy-900 px-4 text-xs font-medium text-white transition-colors hover:bg-navy-800 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  Send
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Quick suggestions */}
      {!result && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLE_COMMANDS.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs text-muted transition-colors hover:border-emerald hover:text-emerald"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-4 rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-start gap-3">
            {result.status === "error" ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            ) : result.status === "awaiting_approval" ? (
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">{result.message}</p>

              {result.plan && (
                <div className="mt-4 rounded-lg bg-canvas p-4">
                  <p className="text-xs font-medium text-muted">Executive Agent Plan</p>
                  <p className="mt-1 text-sm text-ink">{result.plan.description}</p>
                  {result.plan.agents && result.plan.agents.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {result.plan.agents.map((agent) => (
                        <span
                          key={agent}
                          className="rounded-full bg-emerald/10 px-2.5 py-1 text-xs font-medium text-emerald"
                        >
                          {agent}
                        </span>
                      ))}
                    </div>
                  )}
                  {result.plan.estimatedCost !== undefined && result.plan.estimatedCost > 0 && (
                    <p className="mt-2 text-xs text-muted">
                      Estimated cost: <span className="font-medium text-ink">${result.plan.estimatedCost}</span>
                    </p>
                  )}
                </div>
              )}

              {result.approvalRequest && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-medium text-amber-800">Approval Required</p>
                  <p className="mt-1 text-sm text-amber-700">{result.approvalRequest.reason}</p>
                  {approvalStatus === "submitted" ? (
                    <p className="mt-3 text-sm font-medium text-emerald-700">
                      ✓ Decision recorded. The approval queue has been updated.
                    </p>
                  ) : approvalStatus === "error" ? (
                    <p className="mt-3 text-sm text-red-600">
                      Failed to record decision. Please try again or visit the Decision Center.
                    </p>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprovalDecision("approved")}
                        disabled={approvalStatus === "submitting"}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald px-3 py-1.5 text-xs font-medium text-navy-950 transition-colors hover:bg-emerald/80 disabled:opacity-50"
                      >
                        {approvalStatus === "submitting" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprovalDecision("rejected")}
                        disabled={approvalStatus === "submitting"}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        {approvalStatus === "submitting" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Command history */}
      {history.length > 1 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted">Recent Commands</p>
          <div className="space-y-2">
            {history.slice(1, 4).map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSuggestionClick(item.command)}
                className="w-full rounded-lg border border-hairline bg-white p-3 text-left transition-colors hover:bg-canvas"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">{item.command}</span>
                  <span
                    className={`text-xs ${
                      item.status === "awaiting_approval"
                        ? "text-amber-600"
                        : item.status === "error"
                        ? "text-red-500"
                        : "text-emerald"
                    }`}
                  >
                    {item.status === "awaiting_approval" ? "Awaiting" : item.status === "error" ? "Failed" : "Done"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
