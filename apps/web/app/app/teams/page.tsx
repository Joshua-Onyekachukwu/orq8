"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Users,
  AlertCircle,
  RefreshCw,
  Settings,
  X,
  Loader2,
  Plus,
  Archive,
  Trash2,
  Building2,
} from "lucide-react";

interface Team {
  id: string;
  name: string;
  description: string | null;
  lead: string | null;
  departmentId: string | null;
  department: string | null;
  status: string;
  agentCount: number;
  activeCount: number;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface Goal {
  id: string;
  title: string;
  status: string;
  progress: number;
  priority: string;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createLead, setCreateLead] = useState("");
  const [createDept, setCreateDept] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLead, setEditLead] = useState("");
  const [editDept, setEditDept] = useState("");
  const [saving, setSaving] = useState(false);

  // Archive/delete state
  const [confirmTeam, setConfirmTeam] = useState<Team | null>(null);
  const [confirmAction, setConfirmAction] = useState<"archive" | "delete">("archive");
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Team-scoped goals/tasks (Task 8 — team pages show their work)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamGoals, setTeamGoals] = useState<Record<string, Goal[]>>({});
  const [teamTasks, setTeamTasks] = useState<Record<string, TaskItem[]>>({});
  const [teamWorkLoading, setTeamWorkLoading] = useState<string | null>(null);

  const toggleTeamWork = async (teamId: string) => {
    if (expandedTeam === teamId) {
      setExpandedTeam(null);
      return;
    }
    setExpandedTeam(teamId);
    if (!teamGoals[teamId] && !teamTasks[teamId]) {
      setTeamWorkLoading(teamId);
      try {
        const [goalsRes, tasksRes] = await Promise.all([
          fetch(`/api/goals?team_id=${encodeURIComponent(teamId)}&limit=10`),
          fetch(`/api/tasks?team_id=${encodeURIComponent(teamId)}&limit=10`),
        ]);
        const [goalsJson, tasksJson] = await Promise.all([
          goalsRes.ok ? goalsRes.json() : { data: [] },
          tasksRes.ok ? tasksRes.json() : { data: [] },
        ]);
        setTeamGoals((prev) => ({ ...prev, [teamId]: goalsJson.data ?? [] }));
        setTeamTasks((prev) => ({ ...prev, [teamId]: tasksJson.data ?? [] }));
      } catch {
        setTeamGoals((prev) => ({ ...prev, [teamId]: [] }));
        setTeamTasks((prev) => ({ ...prev, [teamId]: [] }));
      } finally {
        setTeamWorkLoading(null);
      }
    }
  };

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsRes, deptsRes] = await Promise.all([
        fetch("/api/teams"),
        fetch("/api/departments"),
      ]);
      if (!teamsRes.ok) throw new Error("Failed to fetch teams");
      const teamsJson = await teamsRes.json();
      setTeams(teamsJson.data ?? []);
      if (deptsRes.ok) {
        const deptsJson = await deptsRes.json();
        setDepartments((deptsJson.data ?? []).filter((d: DepartmentOption) => d.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const openEdit = (team: Team) => {
    setEditingTeam(team);
    setEditName(team.name);
    setEditDesc(team.description ?? "");
    setEditLead(team.lead ?? "");
    setEditDept(team.departmentId ?? "");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || undefined,
          lead: createLead.trim() || undefined,
          departmentId: createDept || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to create team");
      }
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      setCreateLead("");
      setCreateDept("");
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!editingTeam?.id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${editingTeam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || undefined,
          description: editDesc.trim() || null,
          lead: editLead.trim() || null,
          departmentId: editDept || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to update team");
      }
      setEditingTeam(null);
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmTeam?.id) return;
    setConfirmBusy(true);
    setError(null);
    try {
      const res =
        confirmAction === "archive"
          ? await fetch(`/api/teams/${confirmTeam.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "archived" }),
            })
          : await fetch(`/api/teams/${confirmTeam.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Action failed");
      }
      setConfirmTeam(null);
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setConfirmBusy(false);
    }
  };

  const deptOptions = departments.length > 0 ? departments : [];

  return (
    <PageErrorBoundary pageName="Teams" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
            Organization
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Teams
          </h1>
          <p className="mt-1 text-sm text-muted">
            First-class teams inside departments. Assign AI employees to teams from the AI Employees page to form focused squads.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Refresh teams" onClick={fetchTeams}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-green-dark"
          >
            <Plus className="h-3.5 w-3.5" /> Create team
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

      {!loading && teams.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">No teams yet</p>
          <p className="mt-1 text-sm text-muted max-w-md mx-auto">
            Create a team to group AI employees around a mission — e.g. Growth, Support, Infrastructure.
            Then assign agents to it from the AI Employees page.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-green-dark"
          >
            <Plus className="h-3.5 w-3.5" /> Create your first team
          </button>
        </div>
      )}

      {!loading && teams.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <article key={team.id} className="rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orq8-dark text-sm font-bold text-orq8-green">
                    <Users className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-ink">{team.name}</h2>
                    <p className="text-xs text-muted">
                      {team.department ?? "No department"}
                      {" · "}
                      {team.agentCount} member{team.agentCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(team)}
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
                    title="Configure team"
                    aria-label={`Configure ${team.name}`}
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfirmTeam(team); setConfirmAction(team.status === "archived" ? "delete" : "archive"); }}
                    className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-red-600"
                    title={team.status === "archived" ? "Delete team" : "Archive team"}
                    aria-label={`Archive ${team.name}`}
                  >
                    {team.status === "archived" ? <Trash2 className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {team.description && (
                <p className="mt-3 text-xs text-muted leading-relaxed">{team.description}</p>
              )}

              <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
                <div className="bg-white px-3 py-2.5">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Members</dt>
                  <dd className="mt-0.5 text-xs font-medium tabular-nums text-ink">{team.agentCount}</dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Active</dt>
                  <dd className="mt-0.5 text-xs font-medium text-ink">{team.activeCount}</dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Lead</dt>
                  <dd className="mt-0.5 truncate text-xs font-medium text-ink">{team.lead ?? "—"}</dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center gap-3">
                <Link
                  href="/app/agents"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-orq8-green transition-colors hover:text-orq8-green-dark"
                >
                  <Users className="h-3.5 w-3.5" /> Assign AI employees
                </Link>
                <button
                  type="button"
                  onClick={() => toggleTeamWork(team.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
                  aria-expanded={expandedTeam === team.id}
                >
                  <Settings className="h-3.5 w-3.5" /> Goals & Tasks
                </button>
              </div>

              {expandedTeam === team.id && (
                <div className="mt-3 rounded-lg border border-hairline bg-canvas/50 p-3">
                  {teamWorkLoading === team.id ? (
                    <p className="text-xs text-muted">Loading team work…</p>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Goals</p>
                        {(teamGoals[team.id] ?? []).length === 0 ? (
                          <p className="mt-1 text-xs text-muted">No goals assigned to this team.</p>
                        ) : (
                          <ul className="mt-1.5 space-y-1.5">
                            {(teamGoals[team.id] ?? []).map((g) => (
                              <li key={g.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate text-ink">{g.title}</span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-hairline">
                                    <span className="block h-full rounded-full bg-orq8-green" style={{ width: `${g.progress}%` }} />
                                  </span>
                                  <span className="font-mono tabular-nums text-muted">{g.progress}%</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Tasks</p>
                        {(teamTasks[team.id] ?? []).length === 0 ? (
                          <p className="mt-1 text-xs text-muted">No tasks assigned to this team.</p>
                        ) : (
                          <ul className="mt-1.5 space-y-1.5">
                            {(teamTasks[team.id] ?? []).map((t) => (
                              <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate text-ink">{t.title}</span>
                                <span className={`shrink-0 font-mono text-2xs uppercase ${t.status === "completed" ? "text-orq8-green" : t.status === "failed" ? "text-red-600" : "text-muted"}`}>
                                  {t.status}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-orq8-dark/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">Create Team</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Name *</label>
                <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Growth, Support, Infrastructure" required className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Department</label>
                <select
                  value={createDept}
                  onChange={(e) => setCreateDept(e.target.value)}
                  className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green"
                >
                  <option value="">No department</option>
                  {deptOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Team Lead</label>
                <input type="text" value={createLead} onChange={(e) => setCreateLead(e.target.value)} placeholder="e.g. Atlas" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Description</label>
                <textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} rows={2} placeholder="What does this team own?" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green resize-none" />
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
      {editingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-orq8-dark/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">Configure {editingTeam.name}</h2>
              <button type="button" onClick={() => setEditingTeam(null)} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Name *</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Department</label>
                <select
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green"
                >
                  <option value="">No department</option>
                  {deptOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Team Lead</label>
                <input type="text" value={editLead} onChange={(e) => setEditLead(e.target.value)} className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">Description</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-hairline px-6 py-4">
              <button type="button" onClick={() => setEditingTeam(null)} className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving || !editName.trim()} className="flex items-center gap-2 rounded-lg bg-orq8-green px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm archive/delete Modal */}
      {confirmTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-orq8-dark/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">
                {confirmAction === "archive" ? "Archive team" : "Delete team"}
              </h2>
              <button type="button" onClick={() => setConfirmTeam(null)} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              {confirmAction === "archive" ? (
                <p className="text-sm text-muted leading-relaxed">
                  Archive <span className="font-medium text-ink">{confirmTeam.name}</span>? Archived teams stay in the audit
                  trail and can be restored. Members are not removed.
                </p>
              ) : (
                <p className="text-sm text-muted leading-relaxed">
                  Delete <span className="font-medium text-ink">{confirmTeam.name}</span>? Deletion is permanent. Teams with
                  members cannot be deleted — archive them instead.
                </p>
              )}
              {confirmTeam.agentCount > 0 && (
                <p className="mt-3 rounded-lg bg-orq8-orange/5 border border-orq8-orange/20 px-3 py-2 text-xs text-orq8-orange">
                  {confirmTeam.agentCount} AI employee{confirmTeam.agentCount !== 1 ? "s" : ""} currently in this team.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-hairline px-6 py-4">
              <button type="button" onClick={() => setConfirmTeam(null)} className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">
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