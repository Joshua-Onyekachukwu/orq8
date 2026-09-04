"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, MessageSquare, Send } from "lucide-react";

interface ReviewPanelProps {
  taskId: string;
  taskTitle: string;
  taskResult: string;
  qaVerdict?: string;
  qaScore?: number;
  onReviewed?: () => void;
}

export function ReviewPanel({
  taskId,
  taskTitle,
  taskResult,
  qaVerdict,
  qaScore,
  onReviewed,
}: ReviewPanelProps) {
  const [decision, setDecision] = useState<"approve" | "reject" | "revision" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!decision) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quality/review/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, feedback: feedback.trim() || undefined }),
      });
      if (res.ok) {
        setSubmitted(true);
        onReviewed?.();
      }
    } catch {
      // error handled by UI state
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-800">Review submitted</p>
        <p className="mt-1 text-xs text-emerald-600">
          {decision === "approve" && "Work approved and marked complete."}
          {decision === "reject" && "Work rejected. Agent will be notified."}
          {decision === "revision" && "Revision requested. Agent will revise and resubmit."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink">Review Work</h3>
        {qaVerdict && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-medium ${
            qaVerdict === "pass" ? "bg-emerald-50 text-emerald-700" :
            qaVerdict === "pass_with_warnings" ? "bg-amber-50 text-amber-700" :
            "bg-red-50 text-red-700"
          }`}>
            QA: {qaVerdict.replace(/_/g, " ")} {qaScore != null && `(${qaScore})`}
          </span>
        )}
      </div>

      {/* Task result preview */}
      <div className="mb-4 rounded-lg border border-hairline bg-canvas p-3 max-h-40 overflow-y-auto">
        <p className="text-xs font-medium text-muted mb-1">{taskTitle}</p>
        <p className="text-sm text-ink whitespace-pre-wrap">{taskResult.slice(0, 500)}{taskResult.length > 500 ? "..." : ""}</p>
      </div>

      {/* Decision buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setDecision("approve")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            decision === "approve"
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-hairline bg-white text-ink hover:border-emerald-300"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          Approve
        </button>
        <button
          onClick={() => setDecision("revision")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            decision === "revision"
              ? "border-amber-500 bg-amber-50 text-amber-700"
              : "border-hairline bg-white text-ink hover:border-amber-300"
          }`}
        >
          <RotateCcw className="h-4 w-4" />
          Revise
        </button>
        <button
          onClick={() => setDecision("reject")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            decision === "reject"
              ? "border-red-500 bg-red-50 text-red-700"
              : "border-hairline bg-white text-ink hover:border-red-300"
          }`}
        >
          <XCircle className="h-4 w-4" />
          Reject
        </button>
      </div>

      {/* Feedback textarea */}
      {decision && (
        <div className="mb-4">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
            <MessageSquare className="h-3 w-3" />
            Feedback {decision === "revision" && "(required)"}
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={
              decision === "approve"
                ? "Optional: what did the agent do well?"
                : decision === "revision"
                ? "What needs to change? Be specific."
                : "Why is this work being rejected?"
            }
            className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-orq8-green focus:outline-none focus:ring-1 focus:ring-orq8-green/20 resize-none"
            rows={3}
          />
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!decision || submitting || (decision === "revision" && !feedback.trim())}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-orq8-dark px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-dark/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className="h-4 w-4" />
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </div>
  );
}
