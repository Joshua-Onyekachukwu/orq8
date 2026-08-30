"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Search, Users, AlertCircle, RefreshCw } from "lucide-react";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  type: "human" | "agent";
  status: string;
  department: string | null;
  tasksCompleted: number;
  weeklyCost: number;
  memberSince: string;
  createdAt: string;
}

const roleStyles: Record<string, string> = {
  owner: "bg-lime/20 text-navy-900",
  admin: "bg-indigo-50 text-indigo-700",
  member: "bg-canvas text-muted",
  agent: "bg-emerald/15 text-emerald-700",
};

const rowsPerPage = 10;

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/members");
      if (!res.ok) throw new Error("Failed to fetch members");
      const json = await res.json();
      setMembers(json.data ?? []);
      setTotalCount(json.meta?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const filtered = useMemo(
    () =>
      members.filter(
        (m) =>
          m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.email.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [members, searchTerm]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const displayed = filtered.slice(
    (safePage - 1) * rowsPerPage,
    safePage * rowsPerPage
  );

  const humanCount = members.filter((m) => m.type === "human").length;
  const agentCount = members.filter((m) => m.type === "agent").length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            Organization · {humanCount} human{humanCount !== 1 ? "s" : ""} · {agentCount} agent{agentCount !== 1 ? "s" : ""}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Members &amp; Roles
          </h1>
          <p className="mt-1 text-sm text-muted">
            The humans and AI agents in your company, with the authority each one
            holds.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchMembers}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      {/* Error state */}
      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-xs text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && members.length === 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-white">
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-hairline px-5 py-4 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-hairline" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/4 rounded bg-hairline" />
                  <div className="h-3 w-1/3 rounded bg-hairline" />
                </div>
                <div className="h-6 w-16 rounded-full bg-hairline" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && members.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">No members yet</p>
          <p className="mt-1 text-sm text-muted">
            Members will appear here once you invite humans or hire AI agents.
          </p>
        </div>
      )}

      {/* Members table */}
      {!loading && members.length > 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-white">
          <div className="border-b border-hairline px-5 py-4">
            <label className="relative block max-w-xs">
              <span className="sr-only">Search members</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search members..."
                className="w-full rounded-lg border border-hairline bg-canvas py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy-800"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas text-left">
                  {["Member", "Email", "Type", "Role", "Department", "Status", "Joined"].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {displayed.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-canvas/60">
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-emerald">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-ink">{m.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                      {m.email}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                          m.type === "agent"
                            ? "bg-emerald/15 text-emerald-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {m.type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                          roleStyles[m.role] ?? "bg-canvas text-muted"
                        }`}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                      {m.department ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                          m.status === "active"
                            ? "bg-emerald/15 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            m.status === "active" ? "bg-emerald" : "bg-gray-400"
                          }`}
                        />
                        {m.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                      {formatDate(m.memberSince)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
            <p className="text-sm text-muted">
              Showing {displayed.length} of {filtered.length} results
              {totalCount > filtered.length ? ` (${totalCount} total)` : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                aria-label="Previous page"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:border-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-900 text-xs font-semibold text-white">
                {safePage}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                aria-label="Next page"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:border-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
