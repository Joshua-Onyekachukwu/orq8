"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Search, ExternalLink } from "lucide-react";

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

export function AdminApprovalQueue({ approvals }: { approvals: Approval[] }) {
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");

  const filtered = approvals.filter((a) => {
    const matchesFilter = filter === "all" || a.status === filter;
    const q = search.toLowerCase();
    const matchesSearch =
      a.action.toLowerCase().includes(q) ||
      (a.description ?? "").toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <div className="rounded-xl border border-hairline bg-white">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
            <ShieldCheck className="h-4.5 w-4.5 text-amber-600" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Approval Queue</h2>
            <p className="text-xs text-muted">
              {pendingCount > 0 ? `${pendingCount} pending` : "All clear"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 w-40 rounded-lg border border-hairline bg-canvas pl-8 pr-3 text-xs text-ink outline-none focus:border-orq8-green"
            />
          </div>
          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-8 rounded-lg border border-hairline bg-canvas px-3 text-xs text-ink outline-none"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted/30" />
          <p className="mt-3 text-sm font-medium text-ink">No approvals</p>
          <p className="mt-1 text-xs text-muted">
            {filter === "pending" ? "All approvals have been decided." : "No approval requests yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-canvas text-left">
                {["ID", "Agent", "Action", "Cost", "Risk", "Status", "Created"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-5 py-2.5 font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.slice(0, 10).map((a) => (
                <tr key={a.id} className="hover:bg-canvas/50">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted">
                    #{a.id.slice(0, 8)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className="text-sm font-medium text-ink">
                      {a.agentId ? `Agent ${a.agentId.slice(0, 6)}` : "System"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-sm text-ink truncate max-w-[250px]">{a.action}</p>
                    {a.description && (
                      <p className="text-xs text-muted truncate max-w-[250px]">{a.description}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs tabular-nums text-muted">
                    ${(a.cost / 100).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase ${
                        a.riskLevel === "high"
                          ? "bg-red-100 text-red-700"
                          : a.riskLevel === "medium"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-orq8-lime/10 text-orq8-green"
                      }`}
                    >
                      {a.riskLevel}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        a.status === "pending"
                          ? "bg-amber-50 text-amber-700"
                          : a.status === "approved"
                          ? "bg-orq8-lime/10 text-orq8-green"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 10 && (
        <div className="border-t border-hairline px-5 py-3 text-center">
          <Link
            href="/admin/approvals"
            className="inline-flex items-center gap-1 text-xs font-medium text-orq8-green hover:underline"
          >
            View all {filtered.length} approvals <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}


