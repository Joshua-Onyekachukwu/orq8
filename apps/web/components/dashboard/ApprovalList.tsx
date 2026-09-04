"use client";

import Link from "next/link";
import { ArrowUpRight, ClipboardCheck } from "lucide-react";
import { ApprovalActions } from "../approval-actions";

interface Approval {
  id: string;
  agentId: string | null;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
  status: string;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function riskBadge(risk: string) {
  if (risk === "high") return "bg-red-100 text-red-700";
  if (risk === "medium") return "bg-amber-50 text-amber-700";
  return "bg-[#B8FF66]/10 text-[#1a5c2e]";
}

interface ApprovalListProps {
  approvals: Approval[];
  onRefresh: () => void;
}

export function ApprovalList({ approvals, onRefresh }: ApprovalListProps) {
  return (
    <section
      aria-labelledby="approvals-heading"
      className="rounded-xl border border-hairline bg-white lg:col-span-2"
    >
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 id="approvals-heading" className="text-sm font-semibold text-ink">
          Decision Center
        </h2>
        <Link
          href="/app/approvals"
          className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted hover:text-[#1a5c2e]"
        >
          All requests <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      {approvals.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm font-medium text-ink">
            No pending approvals
          </p>
          <p className="mt-1 text-xs text-muted">
            When AI employees propose actions, they&apos;ll appear here for
            your review.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-canvas text-left">
                {["Request", "What", "Risk", "Cost", "Action"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {approvals.slice(0, 5).map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-muted">
                    #{a.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm text-ink">
                      <span className="font-semibold">{a.action}</span>
                      {a.description && (
                        <span className="text-muted">
                          {" "}
                          — {a.description}
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${riskBadge(a.riskLevel)}`}
                    >
                      {a.riskLevel}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-muted">
                    {formatCost(a.cost)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <ApprovalActions
                      approvalId={a.id}
                      status={a.status}
                      onDecision={onRefresh}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
