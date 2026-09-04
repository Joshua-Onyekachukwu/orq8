"use client";

import { useState } from "react";
import { Check, PencilLine, X, Loader2 } from "lucide-react";

interface ApprovalActionsProps {
  approvalId: string;
  status: string;
  onDecision?: (decision: string) => void;
}

export function ApprovalActions({ approvalId, status, onDecision }: ApprovalActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleDecision(decision: string) {
    if (done || loading) return;
    setLoading(decision);
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision }),
      });
      if (res.ok) {
        setDone(true);
        onDecision?.(decision);
      }
    } catch {
      // Silently handle — user can retry
    } finally {
      setLoading(null);
    }
  }

  if (status !== "pending" || done) {
    return <span className="text-xs text-muted">—</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        title="Approve"
        aria-label="Approve"
        disabled={loading !== null}
        onClick={() => handleDecision("approved")}
        className="rounded-lg border border-hairline p-1.5 text-[#1a5c2e] transition-colors hover:border-[#1a5c2e] hover:bg-[#1a5c2e] hover:text-white disabled:opacity-50"
      >
        {loading === "approved" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        title="Modify"
        aria-label="Modify"
        disabled={loading !== null}
        className="rounded-lg border border-hairline p-1.5 text-[#1a5c2e] transition-colors hover:border-[#1a5c2e] disabled:opacity-50"
      >
        <PencilLine className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Reject"
        aria-label="Reject"
        disabled={loading !== null}
        onClick={() => handleDecision("rejected")}
        className="rounded-lg border border-hairline p-1.5 text-muted transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-50"
      >
        {loading === "rejected" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <X className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
