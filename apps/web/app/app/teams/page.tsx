"use client";

/**
 * Teams (docs/76 Phase 3 migration, worst-first list).
 *
 * Rebased onto the shared `os/` layer. It used to hand-roll its own chrome:
 * a header that disagreed with the console's, `bg-white` cards and modals (which
 * do not respond to the ink theme), `rounded-xl`/`shadow-2xl` surfaces, four
 * copy-pasted modal overlays and a local status colour table. Those overlays are
 * now one shared `OsModal`, the metrics block is `OsFacts`, and a task's state
 * is read through the same vocabulary the Engineering and department pages use
 * (`taskOsStatus`) instead of a third local mapping.
 *
 * What is *unchanged*: the server-side search + pagination contract (debounced
 * 300 ms, `limit`/`offset`/`q`, 24 per page), the create/edit/archive/delete
 * calls and their confirmations, hiring from a template, and the expandable
 * Goals & Tasks panel — including that it fetches team-scoped work lazily and
 * caches it per team.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  AlertCircle,
  RefreshCw,
  Search,
  Settings,
  Loader2,
  Plus,
  Archive,
  Trash2,
} from "lucide-react";
import { PageContainer } from "../../../components/layout/page-container";
import { OrgTabs } from "../../../components/work/org-tabs";
import {
  OsEmptyPanel,
  OsErrorPanel,
  OsFacts,
  OsLoadingRows,
  OsModal,
  OsPagination,
  OsSection,
  OsStateBadge,
  OsToolbar,
} from "../../../components/os/structure";
import { taskOsStatus, type DotState } from "../../../components/os/primitives";

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

/** A team's lifecycle state in the shared vocabulary — archived is paused, not failed. */
function teamState(status: string): { state: DotState; label: string } {
  if (status === "archived") return { state: "paused", label: "Archived" };
  if (status === "active") return { state: "active", label: "Active" };
  return { state: "", label: status };
}

const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-2xs font-semibold disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-2xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-50";
const BTN_ICON =
  "rounded-md border border-hairline p-1.5 text-muted transition-colors hover:border-hairline-strong hover:text-ink disabled:opacity-40";
const PRIMARY_STYLE = { backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" } as const;
const FIELD =
  "mt-1.5 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none";
const LINK_ACTION =
  "inline-flex items-center gap-1.5 text-2xs text-brand-ink transition-colors hover:text-ink";
const ZONE_LABEL = "font-mono text-2xs font-semibold tracking-wider text-muted uppercase";

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

  // Hire from Template state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateTeamId, setTemplateTeamId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; slug: string; role: string; description: string | null; capabilities: string[]; suggestedAutonomy: string; typicalTasks: string[] }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [hireName, setHireName] = useState("");
  const [hiring, setHiring] = useState(false);

  // Team-scoped goals/tasks (Task 8 — team pages show their work)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamGoals, setTeamGoals] = useState<Record<string, Goal[]>>({});
  const [teamTasks, setTeamTasks] = useState<Record<string, TaskItem[]>>({});
  const [teamWorkLoading, setTeamWorkLoading] = useState<string | null>(null);

  // §22 scale: server-side pagination + name search (10k+ teams stay fast).
  const TEAM_PAGE_SIZE = 24;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

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
      const teamQs = debouncedSearch.trim()
        ? `limit=200&q=${encodeURIComponent(debouncedSearch.trim())}`
        : `limit=${TEAM_PAGE_SIZE}&offset=${offset}`;
      const [teamsRes, deptsRes] = await Promise.all([
        fetch(`/api/teams?${teamQs}`),
        fetch("/api/departments?limit=1000"),
      ]);
      if (!teamsRes.ok) throw new Error("Failed to fetch teams");
      const teamsJson = await teamsRes.json();
      setTeams(teamsJson.data ?? []);
      setTotal(teamsJson.meta?.total ?? (teamsJson.data ?? []).length);
      if (deptsRes.ok) {
        const deptsJson = await deptsRes.json();
        setDepartments((deptsJson.data ?? []).filter((d: DepartmentOption) => d.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, offset]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  // Debounce search input so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (showTemplateModal) {
      setTemplatesLoading(true);
      fetch("/api/agent-templates")
        .then((r) => r.ok ? r.json() : { data: [] })
        .then((json) => setTemplates(json.data ?? []))
        .catch(() => setTemplates([]))
        .finally(() => setTemplatesLoading(false));
    }
  }, [showTemplateModal]);

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
          teamId: templateTeamId || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to hire from template");
      }
      setShowTemplateModal(false);
      setSelectedTemplate(null);
      setHireName("");
      setTemplateTeamId(null);
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hire from template");
    } finally {
      setHiring(false);
    }
  };

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
  const page = Math.floor(offset / TEAM_PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / TEAM_PAGE_SIZE));
  const searching = debouncedSearch.trim().length > 0;

  return (
    <PageContainer
      kicker="Organization"
      title="Teams"
      lede="First-class teams inside departments. Assign AI employees to teams from the AI Employees page to form focused squads."
      backHref="/app"
      pageName="Teams"
      actions={
        <>
          <button type="button" aria-label="Refresh teams" onClick={fetchTeams} disabled={loading} className={BTN_ICON}>
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => { setShowTemplateModal(true); setTemplateTeamId(null); }}
            className={BTN_SECONDARY}
          >
            <Plus className="h-3.5 w-3.5" /> Hire from Template
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
            <Plus className="h-3.5 w-3.5" /> Create team
          </button>
        </>
      }
    >
      <OrgTabs />
      <div className="flex flex-col gap-6">
        {/* A load failure with nothing on screen is the error panel; a failed
            action keeps the page and names itself. */}
        {error && teams.length === 0 ? (
          <OsErrorPanel title="Teams did not load." detail={error} onRetry={() => void fetchTeams()} />
        ) : null}
        {error && teams.length > 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-hairline bg-canvas px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-error-ink" aria-hidden="true" />
            <p className="text-2xs text-error-ink">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-2xs text-muted transition-colors hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <OsSection
          id="teams"
          title="Teams"
          count={searching ? undefined : total}
          description={
            searching
              ? `${total} match${total !== 1 ? "es" : ""} for “${debouncedSearch.trim()}”${total > 200 ? " — showing the first 200" : ""}`
              : total > 0
                ? "Search runs on the server; the list pages 24 at a time."
                : undefined
          }
        >
          <OsToolbar>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams…"
                aria-label="Search teams"
                className="w-full rounded-md border border-hairline bg-canvas py-1.5 pr-2.5 pl-8 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none"
              />
            </div>
            {!loading ? (
              <p className="font-mono text-3xs text-muted" aria-live="polite">
                {searching
                  ? `${total} match${total !== 1 ? "es" : ""}`
                  : total > 0
                    ? `${offset + 1}–${Math.min(offset + TEAM_PAGE_SIZE, total)} of ${total}`
                    : "no teams"}
              </p>
            ) : null}
          </OsToolbar>

          {loading ? (
            <OsLoadingRows rows={4} />
          ) : teams.length === 0 && searching ? (
            <OsEmptyPanel
              title={`No teams match “${debouncedSearch.trim()}”`}
              hint="Search looks at team names; clearing it restores the full list."
              action={{ label: "Clear search", onClick: () => setSearch("") }}
            />
          ) : teams.length === 0 ? (
            <OsEmptyPanel
              title="No teams yet."
              hint="Create a team to group AI employees around a mission — e.g. Growth, Support, Infrastructure. Then assign agents to it from the AI Employees page."
              action={{ label: "Create your first team", onClick: () => setShowCreate(true) }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {teams.map((team) => {
                const state = teamState(team.status);
                return (
                  <article key={team.id} className="rounded-lg border border-hairline bg-canvas p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-secondary text-brand-ink">
                          <Users className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-ink">{team.name}</h3>
                          <p className="truncate text-2xs text-muted">
                            {team.department ?? "No department"} · {team.agentCount} member
                            {team.agentCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <OsStateBadge state={state.state} label={state.label} />
                        <button
                          type="button"
                          onClick={() => openEdit(team)}
                          className={BTN_ICON}
                          title="Configure team"
                          aria-label={`Configure ${team.name}`}
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmTeam(team);
                            setConfirmAction(team.status === "archived" ? "delete" : "archive");
                          }}
                          className={BTN_ICON}
                          title={team.status === "archived" ? "Delete team" : "Archive team"}
                          aria-label={`${team.status === "archived" ? "Delete" : "Archive"} ${team.name}`}
                        >
                          {team.status === "archived" ? <Trash2 className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    {team.description ? (
                      <p className="mt-3 text-2xs leading-relaxed text-muted">{team.description}</p>
                    ) : null}

                    <OsFacts
                      className="mt-3"
                      columns={3}
                      items={[
                        { label: "Members", value: team.agentCount },
                        { label: "Active", value: team.activeCount },
                        { label: "Lead", value: team.lead ?? "—" },
                      ]}
                    />

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-3">
                      <button
                        type="button"
                        onClick={() => { setShowTemplateModal(true); setTemplateTeamId(team.id); }}
                        className={LINK_ACTION}
                      >
                        <Plus className="h-3 w-3" /> Hire from Template
                      </button>
                      <Link href="/app/agents" className={LINK_ACTION}>
                        <Users className="h-3 w-3" /> Assign AI employees
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleTeamWork(team.id)}
                        className="inline-flex items-center gap-1.5 text-2xs text-muted transition-colors hover:text-ink"
                        aria-expanded={expandedTeam === team.id}
                      >
                        <Settings className="h-3 w-3" /> Goals &amp; tasks
                      </button>
                    </div>

                    {expandedTeam === team.id ? (
                      <div className="mt-3 rounded-lg border border-hairline bg-surface-secondary p-3">
                        {teamWorkLoading === team.id ? (
                          <p className="text-2xs text-muted">Loading this team&apos;s work…</p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <div>
                              <p className={ZONE_LABEL}>Goals</p>
                              {(teamGoals[team.id] ?? []).length === 0 ? (
                                <p className="mt-1 text-2xs text-muted">No goals assigned to this team.</p>
                              ) : (
                                <ul className="mt-1.5 space-y-1.5">
                                  {(teamGoals[team.id] ?? []).map((g) => (
                                    <li key={g.id} className="flex items-center justify-between gap-2 text-2xs">
                                      <span className="truncate text-ink">{g.title}</span>
                                      <span className="flex shrink-0 items-center gap-2">
                                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-hairline">
                                          <span
                                            className="block h-full rounded-full"
                                            style={{ width: `${g.progress}%`, backgroundColor: "var(--orq-warm)" }}
                                          />
                                        </span>
                                        <span className="font-mono tabular-nums text-muted">{g.progress}%</span>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p className={ZONE_LABEL}>Tasks</p>
                              {(teamTasks[team.id] ?? []).length === 0 ? (
                                <p className="mt-1 text-2xs text-muted">No tasks assigned to this team.</p>
                              ) : (
                                <ul className="mt-1.5 space-y-1.5">
                                  {(teamTasks[team.id] ?? []).map((t) => (
                                    <li key={t.id} className="flex items-center justify-between gap-2 text-2xs">
                                      <span className="truncate text-ink">{t.title}</span>
                                      <OsStateBadge state={taskOsStatus(t.status).state} label={taskOsStatus(t.status).label} />
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          {/* Pagination is only meaningful while browsing, not while searching. */}
          {!loading && !searching ? (
            <OsPagination
              page={page}
              pageCount={pageCount}
              onPage={(p) => setOffset(Math.max(0, (p - 1) * TEAM_PAGE_SIZE))}
            />
          ) : null}
        </OsSection>
      </div>

      {/* ── Create ── */}
      <OsModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create team"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button
              type="submit"
              form="team-create-form"
              disabled={!createName.trim() || creating}
              className={BTN_PRIMARY}
              style={PRIMARY_STYLE}
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </button>
          </div>
        }
      >
        <form id="team-create-form" onSubmit={handleCreate} className="flex flex-col gap-3">
          <div>
            <label htmlFor="team-name" className={ZONE_LABEL}>Name *</label>
            <input
              id="team-name"
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Growth, Support, Infrastructure"
              required
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="team-dept" className={ZONE_LABEL}>Department</label>
            <select id="team-dept" value={createDept} onChange={(e) => setCreateDept(e.target.value)} className={FIELD}>
              <option value="">No department</option>
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="team-lead" className={ZONE_LABEL}>Team lead</label>
            <input
              id="team-lead"
              type="text"
              value={createLead}
              onChange={(e) => setCreateLead(e.target.value)}
              placeholder="e.g. Atlas"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="team-desc" className={ZONE_LABEL}>Description</label>
            <textarea
              id="team-desc"
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              rows={2}
              placeholder="What does this team own?"
              className={`${FIELD} resize-none`}
            />
          </div>
        </form>
      </OsModal>

      {/* ── Configure ── */}
      <OsModal
        open={editingTeam !== null}
        onClose={() => setEditingTeam(null)}
        title={editingTeam ? `Configure ${editingTeam.name}` : "Configure team"}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingTeam(null)} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className={BTN_PRIMARY}
              style={PRIMARY_STYLE}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="team-edit-name" className={ZONE_LABEL}>Name *</label>
            <input
              id="team-edit-name"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="team-edit-dept" className={ZONE_LABEL}>Department</label>
            <select id="team-edit-dept" value={editDept} onChange={(e) => setEditDept(e.target.value)} className={FIELD}>
              <option value="">No department</option>
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="team-edit-lead" className={ZONE_LABEL}>Team lead</label>
            <input
              id="team-edit-lead"
              type="text"
              value={editLead}
              onChange={(e) => setEditLead(e.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="team-edit-desc" className={ZONE_LABEL}>Description</label>
            <textarea
              id="team-edit-desc"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={2}
              className={`${FIELD} resize-none`}
            />
          </div>
        </div>
      </OsModal>

      {/* ── Hire from Template ── */}
      <OsModal
        open={showTemplateModal}
        onClose={() => { setShowTemplateModal(false); setSelectedTemplate(null); setHireName(""); }}
        title="Hire from Template"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowTemplateModal(false); setSelectedTemplate(null); setHireName(""); }}
              className={BTN_SECONDARY}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleHireFromTemplate}
              disabled={!selectedTemplate || hiring}
              className={BTN_PRIMARY}
              style={PRIMARY_STYLE}
            >
              {hiring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Hire
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {templatesLoading ? (
            <OsLoadingRows rows={3} />
          ) : templates.length === 0 ? (
            <OsEmptyPanel title="No templates available." hint="Agent templates are seeded with a company." />
          ) : (
            <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedTemplate === t.id
                      ? "border-hairline-strong bg-surface-secondary"
                      : "border-hairline hover:border-hairline-strong"
                  }`}
                >
                  <p className="text-sm text-ink">{t.name}</p>
                  <p className="mt-0.5 font-mono text-3xs text-muted">{t.role.replace(/_/g, " ")}</p>
                  {t.capabilities.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.capabilities.slice(0, 3).map((cap) => (
                        <span key={cap} className="rounded-md border border-hairline px-1.5 py-0.5 font-mono text-3xs text-muted">
                          {cap}
                        </span>
                      ))}
                      {t.capabilities.length > 3 ? (
                        <span className="rounded-md border border-hairline px-1.5 py-0.5 font-mono text-3xs text-muted">
                          +{t.capabilities.length - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
          {selectedTemplate ? (
            <div>
              <label htmlFor="hire-name" className={ZONE_LABEL}>Display name (optional)</label>
              <input
                id="hire-name"
                type="text"
                value={hireName}
                onChange={(e) => setHireName(e.target.value)}
                placeholder="Custom name for this employee"
                className={FIELD}
              />
            </div>
          ) : null}
        </div>
      </OsModal>

      {/* ── Archive / delete ── */}
      <OsModal
        open={confirmTeam !== null}
        onClose={() => setConfirmTeam(null)}
        title={confirmAction === "archive" ? "Archive team" : "Delete team"}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmTeam(null)} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-2xs font-semibold text-error-ink transition-colors hover:bg-error-soft disabled:opacity-50"
            >
              {confirmBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {confirmAction === "archive" ? "Archive" : "Delete permanently"}
            </button>
          </div>
        }
      >
        {confirmTeam ? (
          <div className="flex flex-col gap-3">
            {confirmAction === "archive" ? (
              <p className="text-2xs leading-relaxed text-muted">
                Archive <span className="text-ink">{confirmTeam.name}</span>? Archived teams stay in the audit trail and
                can be restored. Members are not removed.
              </p>
            ) : (
              <p className="text-2xs leading-relaxed text-muted">
                Delete <span className="text-ink">{confirmTeam.name}</span>? Deletion is permanent. Teams with members
                cannot be deleted — archive them instead.
              </p>
            )}
            {confirmTeam.agentCount > 0 ? (
              <p className="rounded-lg border border-hairline bg-warm-soft px-3 py-2 text-2xs text-warm-ink">
                {confirmTeam.agentCount} AI employee{confirmTeam.agentCount !== 1 ? "s" : ""} currently in this team.
              </p>
            ) : null}
          </div>
        ) : null}
      </OsModal>
    </PageContainer>
  );
}
