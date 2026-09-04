"use client";

import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
  X,
  Bot,
  ListTodo,
  RefreshCw,
  Loader2,
  Zap,
} from "lucide-react";
import { ApprovalActions } from "./approval-actions";

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
  credits?: { consumed: number; remaining: number };
  warnings?: Array<{
    model: string;
    keySuffix: string;
    accountId?: string;
    hint: string;
  }>;
}

function statusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-[#1a5c2e]" />;
    case "failed": return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    case "in_progress": return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E86A33]" />;
    default: return <Clock className="h-3.5 w-3.5 text-amber-500" />;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "in_progress": return "Running";
    default: return "Pending";
  }
}

interface CommandResultDisplayProps {
  result: CommandResult;
  connected: boolean;
  approvalStatus: "idle" | "submitting" | "submitted" | "error";
  onApprove: () => void;
  onReject: () => void;
  onApproving: () => void;
}

export function CommandResultDisplay({
  result,
  connected,
  approvalStatus,
  onApprove,
  onReject,
  onApproving,
}: CommandResultDisplayProps) {
  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-white p-5">
      <div className="flex items-start gap-3">
        {result.status === "error" ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        ) : result.status === "awaiting_approval" ? (
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1a5c2e]" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">{result.message}</p>

          {/* Credits consumed */}
          {result.credits && result.credits.consumed > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <span className="rounded-full bg-[#1a5c2e]/10 px-2 py-0.5 text-[#1a5c2e] font-medium">
                <Zap className="inline h-3 w-3" /> {result.credits.consumed} credits used
              </span>
              <span>{result.credits.remaining} remaining</span>
            </div>
          )}

          {/* NVIDIA Scope Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">NVIDIA Access Warning</span>
              </div>
              {result.warnings.map((w, i) => (
                <div key={i} className="text-sm text-amber-900 mb-2 last:mb-0">
                  <p className="font-medium">Model: {w.model}</p>
                  <p className="text-xs text-amber-700 mt-1">{w.hint}</p>
                </div>
              ))}
            </div>
          )}

          {/* Agent Results — Real Execution Status */}
          {result.agentResults && result.agentResults.length > 0 && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Execution</p>
                </div>
                <div className="flex items-center gap-2">
                  {connected && (
                    <div className="flex items-center gap-1.5 text-xs text-[#1a5c2e]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF66] animate-pulse" />
                      Live
                    </div>
                  )}
                  {result.agentResults.some((ar) => ar.status === "in_progress") && (
                    <div className="flex items-center gap-1.5 text-xs text-[#E86A33]">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Running...
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {result.agentResults.map((ar, i) => (
                  <div key={i} className="rounded-md bg-white px-3 py-2.5 border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {statusIcon(ar.status)}
                        <span className="text-sm font-medium text-gray-900">{ar.taskTitle}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#1a5c2e]/5 px-2 py-0.5 text-[10px] font-medium text-[#1a5c2e]">
                          {ar.agentName.replace(/_/g, " ")}
                        </span>
                        <span className={`text-[10px] font-medium ${
                          ar.status === "completed" ? "text-[#1a5c2e]" :
                          ar.status === "failed" ? "text-red-500" :
                          ar.status === "in_progress" ? "text-[#E86A33]" :
                          "text-amber-500"
                        }`}>
                          {statusLabel(ar.status)}
                        </span>
                      </div>
                    </div>
                    {ar.status === "completed" && ar.result && (
                      <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-500 max-h-20 overflow-hidden">
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
            <div className="mt-3 rounded-lg bg-gray-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ListTodo className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Task Breakdown</p>
              </div>
              <div className="space-y-1.5">
                {result.plan.taskDecomposition.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a5c2e]" />
                    <span className="text-gray-900">{step.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plan Summary */}
          {result.plan && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#1a5c2e]/5 px-2.5 py-1 text-xs font-medium text-[#1a5c2e]">
                {result.plan.action}
              </span>
              {result.plan.agents?.map((agent) => (
                <span key={agent} className="rounded-full bg-[#E86A33]/10 px-2.5 py-1 text-xs font-medium text-[#E86A33]">
                  {agent.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}

          {/* Approval Request */}
          {result.approvalRequest && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Approval Required</p>
              <p className="mt-1 text-sm text-amber-700">{result.approvalRequest.reason}</p>
              {approvalStatus === "submitted" ? (
                <p className="mt-3 text-sm font-medium text-[#1a5c2e]">
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
                    onClick={onApprove}
                    disabled={approvalStatus === "submitting"}
                    className="flex items-center gap-1.5 rounded-lg bg-[#1a5c2e] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#144a24] disabled:opacity-50"
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
                    onClick={onReject}
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
  );
}
