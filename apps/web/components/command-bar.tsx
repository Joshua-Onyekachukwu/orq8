"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useRealtime } from "../hooks/use-realtime";
import { CommandInput } from "./command-bar-input";
import { CommandResultDisplay } from "./command-bar-result";
import { runCommandStream, CommandStreamError } from "../lib/command-stream";
import { analytics } from "@/lib/analytics";

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
    taskDecomposition?: any[];
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
  agentResults?: any[];
  credits?: { consumed: number; remaining: number };
  warnings?: any[];
}

export interface CommandContext {
  page?: string;
  goalId?: string;
  goalTitle?: string;
  agentId?: string;
  agentName?: string;
  departmentId?: string;
  departmentName?: string;
  teamId?: string;
  teamName?: string;
  taskId?: string;
  taskTitle?: string;
}

export function CommandBar({ context }: { context?: CommandContext }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [history, setHistory] = useState<CommandResult[]>([]);
  const [approvalStatus, setApprovalStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");

  const { connected } = useRealtime({
    onEvent: useCallback((event: any) => {
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
      if (event.type === "approval.decided") setApprovalStatus("submitted");
      if (event.type === "credits.consumed") {
        setResult((prev) => {
          if (!prev) return prev;
          return { ...prev, credits: { consumed: (prev.credits?.consumed ?? 0) + event.amount, remaining: event.remaining } };
        });
      }
    }, []),
  });

  const handleSubmit = async (command: string) => {
    setIsProcessing(true);
    setResult(null);
    setApprovalStatus("idle");
    const startTime = performance.now();
    analytics.commandSent(command); // length only — never content
    try {
      // Streaming first: live pipeline progress, same final result shape as
      // POST /api/commands. The stream runs the REAL pipeline — a `done`
      // event means the command executed exactly once.
      let data: any;
      try {
        data = await runCommandStream({
          command,
          context: context as Record<string, unknown> | undefined,
          // Stage/task stream events are deliberately not rendered: the
          // founder asked for execute-and-report, not a "reading the
          // organization…" play-by-play. The stream still emits them for logs.
        });
      } catch (err) {
        // Fall back to the buffered POST ONLY when the stream never got far
        // enough to start the real pipeline (route missing, proxy down, auth).
        // If the pipeline already ran, retrying could double-execute/double-charge.
        if (err instanceof CommandStreamError && !err.pipelineStarted) {
          const response = await fetch("/api/commands", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command, context }),
          });
          const payload = await response.json();
          data = payload?.data ?? payload;
        } else {
          throw err;
        }
      }
      const newResult = data?.data ?? data;
      setResult(newResult);
      if (newResult && newResult.status !== "error") {
        setHistory((prev) => [newResult, ...prev].slice(0, 10));
      }
      analytics.commandCompleted(newResult?.status ?? "unknown", Math.round(performance.now() - startTime));
    } catch {
      analytics.commandCompleted("error", Math.round(performance.now() - startTime));
      setResult({
        commandId: "", command, plan: { action: "error", description: "Failed to process command", agents: [], estimatedCost: 0, requiresApproval: false },
        approvalRequest: null, status: "error", message: "Something went wrong. Please try again.", taskIds: [],
      });
    } finally {
      setIsProcessing(false);
    }
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
      <CommandInput isProcessing={isProcessing} onSubmit={handleSubmit} onSuggestionClick={(cmd) => handleSubmit(cmd)} />

      {isProcessing && (
        <div
          className="mt-3 flex items-center gap-2 rounded-lg border border-hairline-light bg-white p-3 text-sm text-ink-muted shadow-sm"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin text-ink-faint" aria-hidden />
          Working on it — the result appears here when it is ready.
        </div>
      )}

      {result && (
        <CommandResultDisplay
          result={result}
          connected={connected}
          approvalStatus={approvalStatus}
          onApprove={() => handleApprovalDecision("approved")}
          onReject={() => handleApprovalDecision("rejected")}
          onApproving={() => setApprovalStatus("submitting")}
        />
      )}

      {history.length > 1 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-ink-muted">Recent Commands</p>
          <div className="space-y-2">
            {history.slice(1, 4).map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSubmit(item.command)}
                className="w-full rounded-lg border border-hairline-light bg-white p-3 text-left transition-colors hover:bg-surface-secondary"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink truncate max-w-[80%]">{item.command}</span>
                  <span className={`text-xs ${
                    item.status === "awaiting_approval" ? "text-warm-ink" :
                    item.status === "error" ? "text-error-ink" : "text-brand-ink"
                  }`}>
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
