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
    case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-brand-ink" />;
    case "failed": return <AlertCircle className="h-3.5 w-3.5 text-error-ink" />;
    case "in_progress": return <Loader2 className="h-3.5 w-3.5 animate-spin text-warm-ink" />;
    default: return <Clock className="h-3.5 w-3.5 text-warm-ink" />;
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
    <div className="mt-4 rounded-xl border border-hairline-light bg-white p-5">
      <div className="flex items-start gap-3">
        {result.status === "error" ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error-ink" />
        ) : result.status === "awaiting_approval" ? (
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warm-ink" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-ink whitespace-pre-wrap">{result.message}</p>

          {/* Credits consumed */}
          {result.credits && result.credits.consumed > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
              <span className="rounded-full bg-brand-deep/10 px-2 py-0.5 text-brand-ink font-medium">
                <Zap className="inline h-3 w-3" /> {result.credits.consumed} credits used
              </span>
              <span>{result.credits.remaining} remaining</span>
            </div>
          )}

          {/* NVIDIA Scope Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="mt-3 rounded-lg bg-warm-soft border border-warm p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-warm-ink" />
                <span className="text-xs font-semibold text-warm-ink uppercase tracking-wide">NVIDIA Access Warning</span>
              </div>
              {result.warnings.map((w, i) => (
                <div key={i} className="text-sm text-warm-ink mb-2 last:mb-0">
                  <p className="font-medium">Model: {w.model}</p>
                  <p className="text-xs text-warm-ink mt-1">{w.hint}</p>
                </div>
              ))}
            </div>
          )}

          {/* Agent Results — Real Execution Status */}
          {result.agentResults && result.agentResults.length > 0 && (
            <div className="mt-4 rounded-lg bg-surface-secondary p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-ink-muted" />
                  <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">Execution</p>
                </div>
                <div className="flex items-center gap-2">
                  {connected && (
                    <div className="flex items-center gap-1.5 text-xs text-brand-ink">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-soft animate-pulse" />
                      Live
                    </div>
                  )}
                  {result.agentResults.some((ar) => ar.status === "in_progress") && (
                    <div className="flex items-center gap-1.5 text-xs text-warm-ink">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Running...
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {result.agentResults.map((ar, i) => (
                  <div key={i} className="rounded-md bg-white px-3 py-2.5 border border-hairline-light">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {statusIcon(ar.status)}
                        <span className="text-sm font-medium text-ink">{ar.taskTitle}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-brand-deep/5 px-2 py-0.5 text-3xs font-medium text-brand-ink">
                          {ar.agentName.replace(/_/g, " ")}
                        </span>
                        <span className={`text-3xs font-medium ${
                          ar.status === "completed" ? "text-brand-ink" :
                          ar.status === "failed" ? "text-error-ink" :
                          ar.status === "in_progress" ? "text-warm-ink" :
                          "text-warm-ink"
                        }`}>
                          {statusLabel(ar.status)}
                        </span>
                      </div>
                    </div>
                    {ar.status === "completed" && ar.result && (                        <div className="mt-2 rounded bg-surface-secondary p-2 text-xs text-ink-muted max-h-20 overflow-hidden">
                        {ar.result.slice(0, 200)}{ar.result.length > 200 ? "..." : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task Decomposition — plan can be absent on streamed approval-gated results */}
          {result.plan?.taskDecomposition && result.plan.taskDecomposition.length > 1 && (
            <div className="mt-3 rounded-lg bg-surface-secondary p-4">
              <div className="flex items-center gap-2 mb-2">                  <ListTodo className="h-4 w-4 text-ink-muted" />
                  <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">Task Breakdown</p>
              </div>
              <div className="space-y-1.5">
                {result.plan.taskDecomposition.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-deep" />                      <span className="text-ink">{step.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plan Summary — guard plan too: streamed results may omit it */}
          {result.plan && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-brand-deep/5 px-2.5 py-1 text-xs font-medium text-brand-ink">
                {result.plan.action}
              </span>
              {result.plan.agents?.map((agent) => (
                <span key={agent} className="rounded-full bg-warm/10 px-2.5 py-1 text-xs font-medium text-warm-ink">
                  {agent.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}

          {/* Approval Request */}
          {result.approvalRequest && (
            <div className="mt-4 rounded-lg border border-warm bg-warm-soft p-4">
              <p className="text-xs font-semibold text-warm-ink uppercase tracking-wide">Approval Required</p>
              <p className="mt-1 text-sm text-warm-ink">{result.approvalRequest.reason}</p>
              {approvalStatus === "submitted" ? (
                <p className="mt-3 text-sm font-medium text-brand-ink">
                  ✓ Decision recorded. Tasks will execute now.
                </p>
              ) : approvalStatus === "error" ? (
                <p className="mt-3 text-sm text-error-ink">
                  Failed to record decision. Please try again or visit the Decision Center.
                </p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={onApprove}
                    disabled={approvalStatus === "submitting"}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-deep px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand disabled:opacity-50"
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
                    className="flex items-center gap-1.5 rounded-lg border border-border-error px-3 py-1.5 text-xs font-medium text-error-ink transition-colors hover:bg-error-soft disabled:opacity-50"
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
