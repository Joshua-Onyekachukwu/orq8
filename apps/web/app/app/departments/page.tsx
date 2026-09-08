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
  Plus,
  Archive,
  Trash2,
} from "lucide-react";

interface Department {
  id: string;
  name: string | null;
  description: string | null;
  head: string | null;
  budget: number | null;
  status: string;
  agentCount: number;
  activeCount: number;
}

interface WorkforceCoverage {
  departmentId: string;
  departmentName: string;
  agentCount: number;
  activeAgentCount: number;
  totalCapacityHours: number;
  totalWorkloadHours: number;
  utilizationPct: number;
  coverageStatus: string;
  coveragePct: number;
  teamCount: number;
  capabilityGap: string[];
}

interface Team {
  id: string;
  name: string;
  department: string | null;
  agentCount: number;
  activeCount: number;
  lead: string | null;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [workforce, setWorkforce] = useState<WorkforceCoverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createHead, setCreateHead] = useState("");
  const [createBudget, setCreateBudget] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editBudget, setEditBudget] = useState("");
  const [editHead, setEditHead] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Archive/delete state
  const [confirmDept, setConfirmDept] = useState<Department | null>(null);
  const [confirmAction, setConfirmAction] = useState<"archive" | "delete">("archive");
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Hire from Template state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateDeptId, setTemplateDeptId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; slug: string; role: string; description: string | null; capabilities: string[]; suggestedAutonomy: string; typicalTasks: string[] }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [hireName, setHireName] = useState("");
  const [hiring, setHiring] = useState(false);

  const fetchTemplates = async (deptId?: string | null) => {
    setTemplatesLoading(true);
    try {
      const url = deptId ? `/api/agent-templates?department=${encodeURIComponent(deptId)}` : "/api/agent-templates";
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setTemplates(json.data ?? []);
      }
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleHireFromTemplate = async () => {
    if (!selectedTemplate) return;
    setHiring(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent-templates/${selectedTemplate}/hire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: hireName.trim() || undefined,
          departmentId: templateDeptId || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to hire from template");
      }
      setShowTemplateModal(false);
      setSelectedTemplate(null);
      setHireName("");
      setTemplateDeptId(null);
      fetchDepartments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hire from template");
    } finally {
      setHiring(false);
    }
  };

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, teamsRes, workforceRes] = await Promise.all([
        fetch("/api/departments"),
        fetch("/api/teams"),
        fetch("/api/workforce"),
      ]);
      if (!res.ok) throw new Error("Failed to fetch departments");
      const json = await res.json();
      setDepartments((json.data ?? []).filter((d: Department) => d.id !== null));
      if (teamsRes.ok) {
        const teamsJson = await teamsRes.json();
        setTeams(teamsJson.data ?? []);
      }
      if (workforceRes.ok) {
        const wfJson = await workforceRes.json();
        setWorkforce(wfJson.data?.departments ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  useEffect(() => {
    if (showTemplateModal) {
      fetchTemplates(templateDeptId);
    }
  }, [showTemplateModal, templateDeptId]);

  const openEdit = (dept: Department) => {
    setEditingDept(dept);
    setEditBudget(dept.budget?.toString() ?? "");
    setEditHead(dept.head ?? "");
    setEditDesc(dept.description ?? "");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || undefined,
          head: createHead.trim() || undefined,
          budget: createBudget ? Number(createBudget) : undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to create department");
      }
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      setCreateHead("");
      setCreateBudget("");
      fetchDepartments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create department");
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!editingDept?.id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/departments/${editingDept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget: editBudget ? Number(editBudget) : null,
          head: editHead.trim() || null,
          description: editDesc.trim() || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to update department");
      }
      setEditingDept(null);
      fetchDepartments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmDept?.id) return;
    setConfirmBusy(true);
    setError(null);
    try {
      const res =
        confirmAction === "archive"
          ? await fetch(`/api/departments/${confirmDept.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "archived" }),
            })
          : await fetch(`/api/departments/${confirmDept.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Action failed");
      }
      setConfirmDept(null);
      fetchDepartments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <PageErrorBoundary pageName="Departments" backHref="/app">
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
            Founder-managed directly — no Executive Agent required. Each department groups AI employees by function and controls their budgets.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Refresh departments" onClick={fetchDepartments}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => { setShowTemplateModal(true); setTemplateDeptId(null); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-orq8-green/30 bg-orq8-green/5 px-4 py-2 text-xs font-semibold text-orq8-green transition-colors hover:bg-orq8-green/10"
          >
            <Plus className="h-3.5 w-3.5" /> Hire from Template
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-green-dark"
          >
            <Plus className="h-3.5 w-3.5" /> Create department
          </button>
        </div>
      </header>

      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Teams access — Organization → Department → Teams → AI employees */}
      {!loading && (
        <a
          href="/app/teams"
          className="mt-6 flex items-center gap-4 rounded-xl border border-hairline bg-white p-4 transition-colors hover:border-orq8-green/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orq8-dark text-orq8-green">
            <GitBranch className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Teams</p>
            <p className="text-xs text-muted">
              {teams.length === 0
                ? "No teams yet — teams group AI employees inside departments for focused work."
                : `${teams.length} team${teams.length !== 1 ? "s" : ""} · ${teams.reduce((sum, t) => sum + t.agentCount, 0)} member${teams.reduce((sum, t) => sum + t.agentCount, 0) !== 1 ? "s" : ""} across ${new Set(teams.map((t) => t.department ?? "")).size} department${new Set(teams.map((t) => t.department ?? "")).size !== 1 ? "s" : ""}`}
            </p>
          </div>
          <span className="text-xs font-medium text-orq8-green">
            {teams.length === 0 ? "Create a team →" : "Manage teams →"}
          </span>
        </a>
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
            Create your first department directly, or let departments form when you assign agents during hiring.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-green-dark"
          >
            <Plus className="h-3.5 w-3.5" /> Create department
          </button>
        </div>
      )}

      {!loading && departments.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {departments.map((dept) => (
            <article key={dept.id} className="rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orq8-dark text-sm font-bold text-orq8-green">
                    <GitBranch className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-ink">{dept.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      {(() => {
                        const wf = workforce.find((w) => w.departmentId === dept.id);
                        if (!wf) return null;
                        const badge = wf.coverageStatus === 'healthy'
                          ? { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: '🟢' }
                          : wf.coverageStatus === 'near_capacity'
                          ? { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: '🟡' }
                          : wf.coverageStatus === 'over_capacity'
                          ? { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: '🔴' }
                          : { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', icon: '⚪' };
                        return (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium ${badge.bg} ${badge.text} ${badge.border}`}>
                            {badge.icon} {wf.coveragePct}% coverage
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-muted mt-1">
                      {dept.agentCount} agent{dept.agentCount !== 1 ? "s" : ""}
                      {" · "}
                      {dept.activeCount} active
                      {" · "}
                      <a
                        href="/app/teams"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 text-orq8-green hover:underline"
                      >
                        {teams.filter((t) => t.department === dept.name).length} team
                        {teams.filter((t) => t.department === dept.name).length !== 1 ? "s" : ""}
                      </a>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(dept)}
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
                    title="Configure department"
                    aria-label={`Configure ${dept.name}`}
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfirmDept(dept); setConfirmAction(dept.status === "archived" ? "delete" : "archive"); }}
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-red-600"
                    title={dept.status === "archived" ? "Delete department" : "Archive department"}
                    aria-label={`Archive ${dept.name}`}
                  >
                    {dept.status === "archived" ? <Trash2 className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {dept.description && (
                <p className="mt-3 text-xs text-muted leading-relaxed">{dept.description}</p>
              )}

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => { setShowTemplateModal(true); setTemplateDeptId(dept.id); }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-orq8-green transition-colors hover:text-orq8-green-dark"
                >
                  <Plus className="h-3 w-3" /> Hire from Template
                </button>
              </div>

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
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Capacity</dt>
                  <dd className="mt-0.5 text-xs font-medium tabular-nums text-ink">
                    {(() => {
                      const wf = workforce.find((w) => w.departmentId === dept.id);
                      return wf ? `${Math.round(wf.totalWorkloadHours)}h / ${Math.round(wf.totalCapacityHours)}h` : `${dept.agentCount} agents`;
                    })()}
                  </dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Teams</dt>
                  <dd className="mt-0.5 text-xs font-medium text-ink">
                    {(() => {
                      const wf = workforce.find((w) => w.departmentId === dept.id);
                      const teamCount = wf?.teamCount ?? teams.filter((t) => t.department === dept.name).length;
                      return teamCount > 0 ? teamCount : "—";
                    })()}
                  </dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Utilization</dt>
                  <dd className="mt-0.5 text-xs font-medium text-ink">
                    {(() => {
                      const wf = workforce.find((w) => w.departmentId === dept.id);
                      return wf ? `${wf.utilizationPct}%` : (dept.agentCount > 0 ? `${Math.round((dept.activeCount / dept.agentCount) * 100)}%` : "—");
                    })()}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-orq8-dark/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">Create Department</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Name *</label>
                <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Marketing, Engineering" required className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Description</label>
                <textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} rows={2} placeholder="What does this department do?" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green resize-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Department Head</label>
                <input type="text" value={createHead} onChange={(e) => setCreateHead(e.target.value)} placeholder="e.g. Atlas" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Budget (credits)</label>
                <input type="number" value={createBudget} onChange={(e) => setCreateBudget(e.target.value)} placeholder="e.g. 10000" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green" />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">
                  Cancel
                </button>
                <button type="submit" disabled={!createName.trim() || creating} className="flex items-center gap-2 rounded-lg bg-orq8-green px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark disabled:opacity-50">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-orq8-dark/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">
                Configure {editingDept.name}
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

      {/* Hire from Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-orq8-dark/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">Hire from Template</h2>
              <button type="button" onClick={() => { setShowTemplateModal(false); setSelectedTemplate(null); setHireName(""); }} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {templatesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-orq8-green" />
                  <span className="ml-2 text-sm text-muted">Loading templates…</span>
                </div>
              ) : templates.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted">No templates available. Create templates through the Executive Agent or API.</p>
                </div>
              ) : (
                <div className="max-h-[300px] space-y-2 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selectedTemplate === t.id
                          ? "border-orq8-green bg-orq8-green/5"
                          : "border-hairline hover:border-orq8-green/40"
                      }`}
                    >
                      <p className="text-sm font-medium text-ink">{t.name}</p>
                      <p className="text-xs text-muted mt-0.5">{t.role}</p>
                      {t.description && (
                        <p className="text-xs text-muted/70 mt-1 line-clamp-2">{t.description}</p>
                      )}
                      {t.capabilities.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.capabilities.slice(0, 3).map((cap) => (
                            <span key={cap} className="rounded-full bg-canvas px-2 py-0.5 text-2xs text-muted">{cap}</span>
                          ))}
                          {t.capabilities.length > 3 && (
                            <span className="rounded-full bg-canvas px-2 py-0.5 text-2xs text-muted">+{t.capabilities.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selectedTemplate && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">Display Name (optional)</label>
                  <input
                    type="text"
                    value={hireName}
                    onChange={(e) => setHireName(e.target.value)}
                    placeholder="Custom name for this employee"
                    className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-hairline px-6 py-4">
              <button type="button" onClick={() => { setShowTemplateModal(false); setSelectedTemplate(null); setHireName(""); }} className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleHireFromTemplate}
                disabled={!selectedTemplate || hiring}
                className="flex items-center gap-2 rounded-lg bg-orq8-green px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark disabled:opacity-50"
              >
                {hiring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Hire
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm archive/delete Modal */}
      {confirmDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-orq8-dark/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">
                {confirmAction === "archive" ? "Archive department" : "Delete department"}
              </h2>
              <button type="button" onClick={() => setConfirmDept(null)} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              {confirmAction === "archive" ? (
                <p className="text-sm text-muted leading-relaxed">
                  Archive <span className="font-medium text-ink">{confirmDept.name}</span>? Archived departments stay in the audit
                  trail and can be restored. Its agents are not deleted.
                </p>
              ) : (
                <p className="text-sm text-muted leading-relaxed">
                  Delete <span className="font-medium text-ink">{confirmDept.name}</span>? Deletion is permanent. Departments with
                  assigned AI employees cannot be deleted — archive them instead.
                </p>
              )}
              {confirmDept.agentCount > 0 && (
                <p className="mt-3 rounded-lg bg-orq8-orange/5 border border-orq8-orange/20 px-3 py-2 text-xs text-orq8-orange">
                  {confirmDept.agentCount} AI employee{confirmDept.agentCount !== 1 ? "s" : ""} currently assigned to this department.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-hairline px-6 py-4">
              <button type="button" onClick={() => setConfirmDept(null)} className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirmBusy}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                  confirmAction === "archive" ? "bg-orq8-orange hover:bg-orq8-orange-dark" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {confirmBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirmAction === "archive" ? "Archive" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageErrorBoundary>
  );
}