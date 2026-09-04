"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  GitBranch,
  Users,
  AlertCircle,
  RefreshCw,
  Settings,
  X,
  Loader2,
  Building2,
} from "lucide-react";

interface Department {
  name: string | null;
  agentCount: number;
  activeCount: number;
  budget: number | null;
  head: string | null;
  description: string | null;
}

export default function TeamsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editBudget, setEditBudget] = useState("");
  const [editHead, setEditHead] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) throw new Error("Failed to fetch departments");
      const json = await res.json();
      setDepartments(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  const openEdit = (dept: Department) => {
    setEditingDept(dept);
    setEditBudget(dept.budget?.toString() ?? "");
    setEditHead(dept.head ?? "");
    setEditDesc(dept.description ?? "");
  };

  const handleSave = async () => {
    if (!editingDept?.name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/departments/${encodeURIComponent(editingDept.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget: editBudget ? Number(editBudget) : null,
          head: editHead.trim() || null,
          description: editDesc.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update department");
      setEditingDept(null);
      fetchDepartments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageErrorBoundary pageName="Departments & Teams" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
            Organization
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Departments
          </h1>
          <p className="mt-1 text-sm text-muted">
            How your AI company is organized. Each department groups agents by function and controls their budgets.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchDepartments}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {loading && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-5">
              <div className="h-4 w-1/2 rounded bg-hairline" />
              <div className="mt-3 h-3 w-1/3 rounded bg-hairline" />
              <div className="mt-3 h-16 rounded bg-hairline" />
            </div>
          ))}
        </div>
      )}

      {!loading && departments.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">No departments yet</p>
          <p className="mt-1 text-sm text-muted max-w-md mx-auto">
            Departments are created automatically when you assign agents to departments during hiring.
            Hire agents and assign them to departments to see them here.
          </p>
          <a
            href="/app/agents"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-green-dark"
          >
            <Users className="h-3.5 w-3.5" /> Hire agents
          </a>
        </div>
      )}

      {!loading && departments.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {departments.map((dept) => (
            <article key={dept.name ?? "unassigned"} className="rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orq8-dark text-sm font-bold text-orq8-green">
                    <GitBranch className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-ink">{dept.name ?? "Unassigned"}</h2>
                    <p className="text-xs text-muted">
                      {dept.agentCount} agent{dept.agentCount !== 1 ? "s" : ""}
                      {" · "}
                      {dept.activeCount} active
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(dept)}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
                  title="Configure department"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>

              {dept.description && (
                <p className="mt-3 text-xs text-muted leading-relaxed">{dept.description}</p>
              )}

              {/* Budget visualization */}
              {dept.budget != null && dept.budget > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-3xs mb-1">
                    <span className="text-muted uppercase font-semibold tracking-wide">Budget utilization</span>
                    <span className="font-mono text-muted">{dept.agentCount} agents · {dept.activeCount} active</span>
                  </div>
                  <div className="h-2 rounded-full bg-hairline overflow-hidden">
                    <div
                      className="h-full rounded-full bg-orq8-green transition-all"
                      style={{ width: `${Math.min((dept.activeCount / Math.max(dept.agentCount, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
                <div className="bg-white px-3 py-2.5">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Budget</dt>
                  <dd className="mt-0.5 text-xs font-medium tabular-nums text-ink">
                    {dept.budget != null ? `${dept.budget.toLocaleString()} cr` : "Not set"}
                  </dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Head</dt>
                  <dd className="mt-0.5 text-xs font-medium text-ink truncate">{dept.head ?? "—"}</dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Utilization</dt>
                  <dd className="mt-0.5 text-xs font-medium text-ink">
                    {dept.agentCount > 0 ? Math.round((dept.activeCount / dept.agentCount) * 100) : 0}%
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-orq8-dark/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">
                Configure {editingDept.name ?? "Unassigned"}
              </h2>
              <button type="button" onClick={() => setEditingDept(null)} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Department Head</label>
                <input type="text" value={editHead} onChange={(e) => setEditHead(e.target.value)} placeholder="e.g. Atlas" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Budget (credits)</label>
                <input type="number" value={editBudget} onChange={(e) => setEditBudget(e.target.value)} placeholder="e.g. 10000" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Description</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} placeholder="What does this department do?" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-hairline px-6 py-4">
              <button type="button" onClick={() => setEditingDept(null)} className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-orq8-green px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageErrorBoundary>
  );
}
