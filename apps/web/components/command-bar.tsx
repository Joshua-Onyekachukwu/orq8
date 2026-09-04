"use client";

import { useState, useCallback } from "react";
import { useRealtime } from "../hooks/use-realtime";
import { CommandInput } from "./command-bar-input";
import { CommandResultDisplay } from "./command-bar-result";

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
    try {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, context }),
      });
      const data = await response.json();
      const newResult = data?.data ?? data;
      setResult(newResult);
      if (newResult && newResult.status !== "error") {
        setHistory((prev) => [newResult, ...prev].slice(0, 10));
      }
    } catch {
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
          <p className="mb-2 text-xs font-medium text-gray-400">Recent Commands</p>
          <div className="space-y-2">
            {history.slice(1, 4).map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSubmit(item.command)}
                className="w-full rounded-lg border border-gray-100 bg-white p-3 text-left transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900 truncate max-w-[80%]">{item.command}</span>
                  <span className={`text-xs ${
                    item.status === "awaiting_approval" ? "text-amber-600" :
                    item.status === "error" ? "text-red-500" : "text-orq8-green"
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
