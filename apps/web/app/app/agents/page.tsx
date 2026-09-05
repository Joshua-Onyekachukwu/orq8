"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Pause,
  Play,
  UserPlus,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
  Users,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  status: string;
  weeklyCost: number;
  tasksCompleted: number;
  currentTask: string | null;
  capabilities: string[];
  config: Record<string, unknown>;
  createdAt: string;
  lastActiveAt?: string | null;
  tasksFailed?: number;
  creditsUsed?: number;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHireModal, setShowHireModal] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Hire form state
  const [hireName, setHireName] = useState("");
  const [hireRole, setHireRole] = useState("");
  const [hireDept, setHireDept] = useState("");
  const [hiring, setHiring] = useState(false);
  const [hireError, setHireError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      const json = await res.json();
      setAgents(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleHire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hireName.trim() || !hireRole.trim()) return;
    setHiring(true);
    setHireError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: hireName.trim(),
          role: hireRole.trim(),
          department: hireDept.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to hire agent");
      }
      const json = await res.json();
      setAgents((prev) => [json.data, ...prev]);
      setShowHireModal(false);
      setHireName("");
      setHireRole("");
      setHireDept("");
    } catch (err) {
      setHireError(err instanceof Error ? err.message : "Failed to hire agent");
    } finally {
      setHiring(false);
    }
  };

  const handleToggleStatus = async (agent: Agent) => {
    if (processingId) return;
    setProcessingId(agent.id);
    try {
      const newStatus = agent.status === "active" ? "paused" : "active";
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to update agent");
      }
      const json = await res.json();
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? json.data : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setProcessingId(null);
    }
  };

  const activeCount = agents.filter((a) => a.status === "active").length;

  return (
    <PageErrorBoundary pageName="AI Employees" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
            Organization · {agents.length} employee{agents.length !== 1 ? 's' : ''} · {activeCount} active
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            AI Workforce
          </h1>
          <p className="mt-1 text-sm text-muted">
            The team that runs your company. Each AI employee is assigned to a
            department with a role, budget, and capabilities you control.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Refresh agent list" onClick={fetchAgents}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>            <button
              type="button"
              onClick={() => setShowHireModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-green-dark"
            >
              <UserPlus className="h-3.5 w-3.5" /> Hire an agent
            </button>
        </div>
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

      {/* Loading state */}
      {loading && agents.length === 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-hairline" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 rounded bg-hairline" />
                  <div className="h-3 w-1/3 rounded bg-hairline" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && agents.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">No agents hired yet</p>
          <p className="mt-1 text-sm text-muted">
            Hire your first AI employee to start building your company&apos;s workforce.
          </p>            <button
              type="button"
              onClick={() => setShowHireModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-green-dark"
            >
              <UserPlus className="h-3.5 w-3.5" /> Hire your first agent
            </button>
        </div>
      )}

      {/* Agent grid */}
      {!loading && agents.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {agents.map((a) => (
            <article
              key={a.id}
              className="rounded-xl border border-hairline bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={`/app/agents/${a.id}`} className="group flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orq8-dark text-sm font-bold text-orq8-green">
                    {a.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-ink group-hover:text-orq8-green transition-colors">{a.name}</h2>
                    <p className="truncate text-xs text-muted">{a.role}</p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleToggleStatus(a)}
                  disabled={processingId === a.id}
                  aria-label={a.status === "active" ? `Pause ${a.name}` : `Resume ${a.name}`}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-50"
                >
                  {processingId === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : a.status === "active" ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="mt-3 flex items-center gap-1.5 font-mono text-3xs font-semibold uppercase tracking-wide">
                {a.status === "active" ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orq8-lime" />
                    <span className="text-orq8-green">Working now</span>
                  </>
                ) : a.status === "error" ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    <span className="text-red-600">Error</span>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-hairline" />
                    <span className="text-muted">Paused</span>
                  </>
                )}
              </p>

              {a.currentTask && (
                <div className="mt-3 rounded-lg bg-orq8-green/5 border border-orq8-green/10 px-3 py-2">
                  <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-orq8-green">Currently executing</p>
                  <p className="mt-0.5 text-xs text-ink line-clamp-2">{a.currentTask}</p>
                </div>
              )}

              {a.capabilities && a.capabilities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {a.capabilities.slice(0, 4).map((cap) => (
                    <span key={cap} className="rounded-full bg-orq8-dark/5 px-2 py-0.5 text-3xs font-medium text-orq8-dark">
                      {cap}
                    </span>
                  ))}
                  {a.capabilities.length > 4 && (
                    <span className="rounded-full bg-orq8-dark/5 px-2 py-0.5 text-3xs font-medium text-orq8-dark">
                      +{a.capabilities.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* Performance metrics */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-canvas px-3 py-2 text-center">
                  <p className="font-mono text-sm font-bold text-ink">{a.tasksCompleted}</p>
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted">Done</p>
                </div>
                <div className="rounded-lg bg-canvas px-3 py-2 text-center">
                  <p className="font-mono text-sm font-bold text-ink">
                    {a.tasksCompleted + (a.tasksFailed ?? 0) > 0
                      ? Math.round((a.tasksCompleted / (a.tasksCompleted + (a.tasksFailed ?? 0))) * 100)
                      : 0}%
                  </p>
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted">Success</p>
                </div>
                <div className="rounded-lg bg-canvas px-3 py-2 text-center">
                  <p className="font-mono text-sm font-bold text-ink">{formatCost(a.weeklyCost)}</p>
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted">Cost/wk</p>
                </div>
              </div>

              {/* Credit usage bar */}
              {(a.creditsUsed ?? 0) > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-3xs">
                    <span className="text-muted">Credits used</span>
                    <span className="font-mono text-muted">{a.creditsUsed}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-hairline overflow-hidden">
                    <div className="h-full rounded-full bg-orq8-green transition-all" style={{ width: `${Math.min(((a.creditsUsed ?? 0) / 100) * 100, 100)}%` }} />
                  </div>
                </div>
              )}

              <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
                <div className="bg-white px-3 py-2">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Dept</dt>
                  <dd className="mt-0.5 truncate text-xs font-medium text-ink">{a.department ?? "—"}</dd>
                </div>
                <div className="bg-white px-3 py-2">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Hired</dt>
                  <dd className="mt-0.5 text-xs font-medium text-ink">{formatDate(a.createdAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      {/* Hire Modal */}
      {showHireModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-orq8-dark/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">Hire an Agent</h2>
              <button
                type="button"
                onClick={() => setShowHireModal(false)}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleHire} className="px-6 py-5">
              {hireError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {hireError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    Agent Name *
                  </label>
                  <input
                    type="text"
                    value={hireName}
                    onChange={(e) => setHireName(e.target.value)}
                    placeholder="e.g. Atlas, Athena, Forge"
                    className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-orq8-green"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    Role *
                  </label>
                  <input
                    type="text"
                    value={hireRole}
                    onChange={(e) => setHireRole(e.target.value)}
                    placeholder="e.g. Market Researcher, Content Writer"
                    className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-orq8-green"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    Department (optional)
                  </label>
                  <input
                    type="text"
                    value={hireDept}
                    onChange={(e) => setHireDept(e.target.value)}
                    placeholder="e.g. Marketing, Engineering"
                    className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-orq8-green"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowHireModal(false)}
                  className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!hireName.trim() || !hireRole.trim() || hiring}                  className="flex items-center gap-2 rounded-lg bg-orq8-green px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark disabled:opacity-50"
                  >
                    {hiring ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Hiring...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Hire Agent
                      </>
                    )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </PageErrorBoundary>
  );
}
