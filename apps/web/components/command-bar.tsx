"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowRight, Loader2, CheckCircle2, AlertCircle, Clock, Check, X, Bot, ListTodo, RefreshCw } from "lucide-react";
import { useRealtime } from "../hooks/use-realtime";

interface TaskStep {
  title: string;
  description: string;
  suggestedAgentRole: string;
  priority: string;
}

interface AgentResult {
  agentName: string;
  taskTitle: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
}

interface CommandResult {
  commandId: string;
  command: string;
  plan: {
    action: string;
    description: string;
    agents: string[];
    estimatedCost: number;
    requiresApproval: boolean;
    riskLevel?: string;
    taskDecomposition?: TaskStep[];
  };
  approvalRequest: {
    id: string;
    action: string;
    reason: string;
    riskLevel: string;
  } | null;
  status: "completed" | "awaiting_approval" | "error";
  message: string;
  taskIds: string[];
  agentResults?: AgentResult[];
  credits?: {
    consumed: number;
    remaining: number;
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

  // Real-time SSE connection for live task updates
  const { connected } = useRealtime({
    onEvent: useCallback((event: any) => {
      // Update agent results in real-time via SSE
      if (event.type === "task.completed" || event.type === "task.failed" || event.type === "task.started") {
        setResult((prev) => {
          if (!prev?.agentResults) return prev;
          const taskIdx = prev.taskIds.indexOf(event.taskId);
          if (taskIdx === -1) return prev;
          const ar = prev.agentResults[taskIdx];
          if (!ar) return prev;
          const updated = [...prev.agentResults];
          updated[taskIdx] = {
            ...ar,
            status: event.type === "task.completed" ? "completed" as const : event.type === "task.failed" ? "failed" as const : "in_progress" as const,
            result: event.type === "task.completed" ? (event as any).result ?? ar.result : ar.result,
          };
          return { ...prev, agentResults: updated };
        });
      }

      // Handle approval decisions
      if (event.type === "approval.decided") {
        setApprovalStatus("submitted");
      }

      // Handle credit consumption
      if (event.type === "credits.consumed") {
        setResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            credits: {
              consumed: (prev.credits?.consumed ?? 0) + event.amount,
              remaining: event.remaining,
            },
          };
        });
      }
    }, []),
  });

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

      const data = await response.json();
      const newResult = data?.data ?? data;
      setResult(newResult);
      if (newResult && newResult.status !== "error") {
        setHistory((prev) => [newResult, ...prev].slice(0, 10));
      }

      // SSE will handle real-time updates for any pending tasks

      setCommand("");
    } catch {
      setResult({
        commandId: "",
        command,
        plan: { action: "error", description: "Failed to process command", agents: [], estimatedCost: 0, requiresApproval: false },
        approvalRequest: null,
        status: "error",
        message: "Something went wrong. Please try again.",
        taskIds: [],
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

      // SSE will handle real-time updates for task execution after approval
    } catch {
      setApprovalStatus("error");
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald" />;
      case "failed": return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      case "in_progress": return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Completed";
      case "failed": return "Failed";
      case "in_progress": return "Running";
      default: return "Pending";
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
              <p className="text-sm font-medium text-ink whitespace-pre-wrap">{result.message}</p>

              {/* Credits consumed */}
              {result.credits && result.credits.consumed > 0 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <span className="rounded-full bg-emerald/10 px-2 py-0.5 text-emerald font-medium">
                    {result.credits.consumed} credits used
                  </span>
                  <span>{result.credits.remaining} remaining</span>
                </div>
              )}

              {/* Agent Results — Real Execution Status */}
              {result.agentResults && result.agentResults.length > 0 && (
                <div className="mt-4 rounded-lg bg-canvas p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted" />
                      <p className="text-xs font-medium text-muted uppercase tracking-wide">Execution</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {connected && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
                          Live
                        </div>
                      )}
                      {result.agentResults.some((ar) => ar.status === "in_progress") && (
                        <div className="flex items-center gap-1.5 text-xs text-blue-500">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Running...
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {result.agentResults.map((ar, i) => (
                      <div key={i} className="rounded-md bg-white px-3 py-2.5 border border-hairline">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {statusIcon(ar.status)}
                            <span className="text-sm font-medium text-ink">{ar.taskTitle}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-navy-900/5 px-2 py-0.5 text-[10px] font-medium text-navy-900">
                              {ar.agentName.replace(/_/g, " ")}
                            </span>
                            <span className={`text-[10px] font-medium ${
                              ar.status === "completed" ? "text-emerald" :
                              ar.status === "failed" ? "text-red-500" :
                              ar.status === "in_progress" ? "text-blue-500" :
                              "text-amber-500"
                            }`}>
                              {statusLabel(ar.status)}
                            </span>
                          </div>
                        </div>
                        {/* Show result preview when completed */}
                        {ar.status === "completed" && ar.result && (
                          <div className="mt-2 rounded bg-canvas p-2 text-xs text-muted max-h-20 overflow-hidden">
                            {ar.result.slice(0, 200)}{ar.result.length > 200 ? "..." : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Task Decomposition */}
              {result.plan.taskDecomposition && result.plan.taskDecomposition.length > 1 && (
                <div className="mt-3 rounded-lg bg-canvas p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ListTodo className="h-4 w-4 text-muted" />
                    <p className="text-xs font-medium text-muted uppercase tracking-wide">Task Breakdown</p>
                  </div>
                  <div className="space-y-1.5">
                    {result.plan.taskDecomposition.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />
                        <span className="text-ink">{step.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Plan Summary */}
              {result.plan && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-navy-900/5 px-2.5 py-1 text-xs font-medium text-navy-900">
                    {result.plan.action}
                  </span>
                  {result.plan.agents?.map((agent) => (
                    <span key={agent} className="rounded-full bg-emerald/10 px-2.5 py-1 text-xs font-medium text-emerald">
                      {agent.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}

              {/* Approval Request */}
              {result.approvalRequest && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-medium text-amber-800">Approval Required</p>
                  <p className="mt-1 text-sm text-amber-700">{result.approvalRequest.reason}</p>
                  {approvalStatus === "submitted" ? (
                    <p className="mt-3 text-sm font-medium text-emerald-700">
                      ✓ Decision recorded. Tasks will execute now.
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
                  <span className="text-sm text-ink truncate max-w-[80%]">{item.command}</span>
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
