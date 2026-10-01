"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  AlertCircle,
  Archive,
  Building2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
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

/** One row of `/api/agents` — only what the member list renders. */
interface AgentRow {
  id: string;
  name: string;
  role: string;
  department: string | null;
  departmentName?: string | null;
  status: string;
  currentTask?: string | null;
  weeklyCost: number;
}

interface Team {
  id: string;
  name: string;
  department: string | null;
  agentCount: number;
  activeCount: number;
  lead: string | null;
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

interface DeptTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mission: string | null;
  functions: string[];
  roles: string[];
  teams: Array<{ name: string; description?: string }>;
  isSystem: boolean;
  orgSize?: string | null;
}

/**
 * Minimum org stage at which a template is appropriate — mirrors the API's
 * parseTemplateStage ("Stage N+ (…)"); unparseable values are Stage 3
 * (conservative: never pollute the lean Stage-1 view).
 */
function templateStage(t: DeptTemplate): number {
  const m = (t.orgSize ?? "").match(/Stage\s+(\d)/i);
  const n = m ? Number.parseInt(m[1] ?? "", 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 3;
}

/** §12 catalog search + stage filter predicate (shared by list and empty-state). */
function matchesCatalogFilter(t: DeptTemplate, query: string, stage: number): boolean {
  const q = query.trim().toLowerCase();
  const matchesQuery = !q || [t.name, t.mission, t.description, ...t.functions].some((s) => (s ?? "").toLowerCase().includes(q));
  const matchesStage = stage === 0 || templateStage(t) <= stage;
  return matchesQuery && matchesStage;
}

const STAGE_FILTERS: Array<{ value: number; label: string }> = [
  { value: 0, label: "All stages" },
  { value: 1, label: "Stage 1 · Idea" },
  { value: 2, label: "Stage 2 · Early startup" },
  { value: 3, label: "Stage 3 · Growing" },
  { value: 4, label: "Stage 4 · Scaling" },
  { value: 5, label: "Stage 5 · Enterprise" },
];

function roleLabel(role: string | null | undefined): string {
  const r = (role ?? "").replace(/_/g, " ").trim();
  if (!r) return "Employee";
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/** Human label for an employee's state: a busy employee is working. */
function memberStatusText(a: AgentRow): string {
  switch (a.status) {
    case "paused":
      return "Paused";
    case "offline":
    case "archived":
      return "Offline";
    case "blocked":
      return "Blocked";
    case "waiting":
      return "Needs you";
    default:
      return a.currentTask ? "Working" : "Idle";
  }
}

function memberStatusDot(a: AgentRow): string | undefined {
  switch (a.status) {
    case "blocked":
      return "blocked";
    case "waiting":
      return "waiting";
    default:
      return a.currentTask && a.status !== "paused" && a.status !== "offline" && a.status !== "archived" ? "working" : undefined;
  }
}

/** The department chip: the strongest signal across its members. */
function deptChip(dept: Department, members: AgentRow[]): { state?: string; label: string } {
  if (dept.status === "archived") return { label: "Archived" };
  if (dept.status === "paused") return { label: "Paused" };
  if (members.length === 0) return { label: "Empty" };
  const working = members.filter((m) => memberStatusDot(m) === "working").length;
  if (working > 0) return { state: "working", label: `${working} working` };
  const waiting = members.filter((m) => m.status === "waiting").length;
  if (waiting > 0) return { state: "waiting", label: "Needs you" };
  const blocked = members.filter((m) => m.status === "blocked").length;
  if (blocked > 0) return { state: "blocked", label: `${blocked} blocked` };
  return { label: "Idle" };
}

function fmtCr(cents: number | null | undefined): string {
  return `${Math.round(cents ?? 0).toLocaleString()} Cr/wk`;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
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

  // Department template catalog (one-click activation) state
  const [showDeptCatalog, setShowDeptCatalog] = useState(false);
  const [deptTemplates, setDeptTemplates] = useState<DeptTemplate[]>([]);
  const [deptTemplatesLoading, setDeptTemplatesLoading] = useState(false);
  const [activatingTemplateId, setActivatingTemplateId] = useState<string | null>(null);
  const [justActivated, setJustActivated] = useState<string | null>(null);
  // §12 catalog UX: search + stage filter over the template's own metadata.
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogStage, setCatalogStage] = useState(0);

  // Hire from Template state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateDeptId, setTemplateDeptId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; slug: string; role: string; description: string | null; capabilities: string[]; suggestedAutonomy: string; typicalTasks: string[] }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [hireName, setHireName] = useState("");
  const [hiring, setHiring] = useState(false);

  // §22 scale: server-side pagination + name search (100+ departments stay fast).
  // Browsing pages 24 at a time; searching fetches up to the server's match cap.
  const DEPT_PAGE_SIZE = 24;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchDeptTemplates = useCallback(async () => {
    setDeptTemplatesLoading(true);
    try {
      const res = await fetch("/api/department-templates");
      if (res.ok) {
        const json = await res.json();
        setDeptTemplates(json.data ?? []);
      }
    } catch {
      setDeptTemplates([]);
    } finally {
      setDeptTemplatesLoading(false);
    }
  }, []);

  const activateDeptTemplate = async (templateId: string) => {
    setActivatingTemplateId(templateId);
    setError(null);
    try {
      const res = await fetch(`/api/department-templates/${templateId}/activate`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? json?.error ?? "Activation failed");
      }
      const name = deptTemplates.find((t) => t.id === templateId)?.name ?? "Department";
      setJustActivated(name);
      setShowDeptCatalog(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setActivatingTemplateId(null);
    }
  };

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
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hire from template");
    } finally {
      setHiring(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Searching → ask the server for name matches (up to its cap); browsing →
      // one page. Teams stay bounded at the server cap for per-card counts.
      const deptQs = debouncedSearch.trim()
        ? `limit=200&q=${encodeURIComponent(debouncedSearch.trim())}`
        : `limit=${DEPT_PAGE_SIZE}&offset=${offset}`;
      const [res, teamsRes, workforceRes, agentsRes] = await Promise.all([
        fetch(`/api/departments?${deptQs}`),
        fetch("/api/teams?limit=1000"),
        fetch("/api/workforce"),
        fetch("/api/agents?limit=200"),
      ]);
      if (!res.ok) throw new Error("Failed to fetch departments");
      const json = await res.json();
      setDepartments((json.data ?? []).filter((d: Department) => d.id !== null));
      setTotal(json.meta?.total ?? (json.data ?? []).length);
      if (teamsRes.ok) {
        const teamsJson = await teamsRes.json();
        setTeams(teamsJson.data ?? []);
      }
      if (workforceRes.ok) {
        const wfJson = await workforceRes.json();
        setWorkforce(wfJson.data?.departments ?? []);
      }
      if (agentsRes.ok) {
        const agentsJson = await agentsRes.json();
        setAgents(agentsJson.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, offset]);

  useEffect(() => { load(); }, [load]);

  // Debounce search input so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0); // new search → back to the first page
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (showTemplateModal) {
      fetchTemplates(templateDeptId);
    }
  }, [showTemplateModal, templateDeptId]);

  // The mock's "Ask Atlas to hire into X" row hands off to the Employees page:
  // its hire modal opens with the department preselected.
  const askAtlasToHire = (dept: Department) => {
    try {
      sessionStorage.setItem("orq8-hire-dept", dept.name ?? "");
    } catch {
      /* storage unavailable — the hire modal just opens without preselection */
    }
    window.location.href = "/app/agents";
  };

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
      load();
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
      load();
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
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setConfirmBusy(false);
    }
  };

  // Derived views: members and teams per department, resolved through the
  // agent row's current department name (the FK wins over the legacy label).
  const deptName = (d: Department) => d.name ?? "";
  const membersOf = new Map<string, AgentRow[]>();
  for (const a of agents) {
    const key = a.departmentName ?? a.department ?? "";
    if (!key) continue;
    const list = membersOf.get(key) ?? [];
    list.push(a);
    membersOf.set(key, list);
  }
  const teamsOf = new Map<string, Team[]>();
  for (const t of teams) {
    const key = t.department ?? "";
    if (!key) continue;
    const list = teamsOf.get(key) ?? [];
    list.push(t);
    teamsOf.set(key, list);
  }
  const wfOf = new Map(workforce.map((w) => [w.departmentId, w]));
  const teamsCount = teams.length;
  const teamsDeptCount = new Set(teams.map((t) => t.department ?? "")).size;

  return (
    <PageErrorBoundary pageName="Departments" backHref="/app">
      <div className="space-y-4">
        <header className="console-card flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Organization
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Departments</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Each department is a team Atlas staffs and directs. Budgets and leads are set by
              authority rules.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowDeptCatalog(true); fetchDeptTemplates(); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated"
            >
              <Building2 aria-hidden="true" className="h-3.5 w-3.5" /> Add from catalog
            </button>
            <button
              type="button"
              aria-label="Refresh departments"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated disabled:opacity-40"
            >
              <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" /> New department
            </button>
          </div>
        </header>

        {error && (
          <div className="console-card flex items-start gap-3 border-border-error p-4 text-sm text-error-ink">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1">{error}</p>
            <button type="button" onClick={() => setError(null)} className="shrink-0 text-xs text-error-ink hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* §22 scale controls — server-side search + pagination */}
        {!loading && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search departments…"
                aria-label="Search departments"
                className="console-composer w-full rounded-md py-2 pl-9 pr-3 text-xs"
              />
            </div>
            <p className="font-mono text-2xs uppercase tracking-wide text-muted" aria-live="polite">
              {debouncedSearch.trim()
                ? `${total} match${total !== 1 ? "es" : ""} for “${debouncedSearch.trim()}”${total > 200 ? " — showing the first 200" : ""}`
                : `${total} department${total !== 1 ? "s" : ""}`}
              {teamsCount > 0 && (
                <>
                  {" · "}
                  <a href="/app/teams" className="normal-case hover:text-ink hover:underline">
                    {teamsCount} team{teamsCount !== 1 ? "s" : ""} in {teamsDeptCount} dept{teamsDeptCount !== 1 ? "s" : ""} — manage
                  </a>
                </>
              )}
            </p>
          </div>
        )}

        {loading && (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="console-card animate-pulse p-5">
                <div className="h-4 w-1/2 rounded bg-hairline" />
                <div className="mt-3 h-3 w-1/3 rounded bg-hairline" />
                <div className="mt-3 h-16 rounded bg-hairline" />
              </div>
            ))}
          </div>
        )}

        {!loading && departments.length === 0 && !debouncedSearch.trim() && (
          <div className="console-card p-10 text-center">
            <Building2 aria-hidden="true" className="mx-auto h-8 w-8 text-muted/40" />
            <p className="mt-3 text-sm font-medium text-ink">No departments yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
              Create your first department directly, activate a ready-made one from the catalog, or
              let departments form when you hire AI employees.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => { setShowDeptCatalog(true); fetchDeptTemplates(); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated"
              >
                <Building2 aria-hidden="true" className="h-3.5 w-3.5" /> Add from catalog
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated"
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Create department
              </button>
            </div>
          </div>
        )}

        {!loading && departments.length === 0 && debouncedSearch.trim() && (
          <div className="console-card p-8 text-center">
            <p className="text-sm text-ink">No departments match “{debouncedSearch.trim()}”</p>
            <button type="button" onClick={() => setSearch("")} className="mt-2 text-xs font-medium text-ink-muted hover:text-ink hover:underline">
              Clear search
            </button>
          </div>
        )}

        {!loading && departments.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2">
            {departments.map((dept) => {
              const members = membersOf.get(deptName(dept)) ?? [];
              const chip = deptChip(dept, members);
              const wf = wfOf.get(dept.id);
              const deptTeams = teamsOf.get(deptName(dept)) ?? [];
              const utilization = wf
                ? `${wf.utilizationPct}%`
                : dept.agentCount > 0
                  ? `${Math.round((dept.activeCount / dept.agentCount) * 100)}%`
                  : "—";
              return (
                <li key={dept.id} className="console-card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-mono text-sm font-semibold"
                        style={{ backgroundColor: "var(--console-tile)", color: "var(--console-tile-text)" }}
                      >
                        {(dept.name ?? "?").charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-ink">
                          <a href={`/app/departments/${dept.id}`} className="transition-colors hover:underline">
                            {dept.name ?? "Untitled department"}
                          </a>
                        </h2>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {dept.head ? `Lead: ${dept.head}` : "No lead assigned"}
                          {dept.budget != null && dept.budget > 0 && ` · ${dept.budget.toLocaleString()} Cr budget`}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 font-mono text-2xs uppercase tracking-wide text-muted">
                      <span className="state-dot" data-state={chip.state} aria-hidden="true" />
                      {chip.label}
                    </span>
                  </div>

                  {dept.description && (
                    <p className="mt-3 text-xs leading-relaxed text-muted">{dept.description}</p>
                  )}

                  {/* Members — the mock's dm rows: who staffs this department */}
                  {members.length > 0 ? (
                    <div className="mt-3 border-t border-hairline pt-2">
                      {members.slice(0, 4).map((m) => (
                        <div key={m.id} className="flex items-center gap-2.5 py-1.5">
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-2xs font-semibold"
                            style={{ backgroundColor: "var(--console-tile)", color: "var(--console-tile-text)" }}
                          >
                            {m.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{m.name}</span>
                          <span className="hidden shrink-0 text-2xs text-muted sm:inline">
                            {roleLabel(m.role)} · {memberStatusText(m)}
                          </span>
                          <span
                            className="state-dot shrink-0"
                            data-state={memberStatusDot(m)}
                            aria-label={memberStatusText(m)}
                            title={memberStatusText(m)}
                          />
                          <span className="shrink-0 font-mono text-2xs tabular-nums text-muted">{fmtCr(m.weeklyCost)}</span>
                        </div>
                      ))}
                      {members.length > 4 && (
                        <p className="pt-1 text-2xs text-muted">+{members.length - 4} more in this department</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
                      No employees yet — hire to staff this department.
                    </p>
                  )}

                  <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-hairline pt-3">
                    <div>
                      <dt className="font-mono text-2xs uppercase tracking-wide text-muted">Capacity</dt>
                      <dd className="mt-0.5 text-xs font-medium tabular-nums text-ink">
                        {wf ? `${Math.round(wf.totalWorkloadHours)}h / ${Math.round(wf.totalCapacityHours)}h` : `${dept.agentCount} agent${dept.agentCount !== 1 ? "s" : ""}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-2xs uppercase tracking-wide text-muted">Teams</dt>
                      <dd className="mt-0.5 text-xs font-medium text-ink">{(wf?.teamCount ?? deptTeams.length) > 0 ? (wf?.teamCount ?? deptTeams.length) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-2xs uppercase tracking-wide text-muted">Utilization</dt>
                      <dd className="mt-0.5 text-xs font-medium tabular-nums text-ink">{utilization}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <a
                      href={`/app/departments/${dept.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated"
                    >
                      Open workspace
                    </a>
                    <button
                      type="button"
                      onClick={() => { setShowTemplateModal(true); setTemplateDeptId(dept.id); }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated"
                    >
                      Hire from template
                    </button>
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(dept)}
                        className="rounded-md p-1.5 text-muted transition-colors hover:bg-elevated hover:text-ink"
                        title="Configure department"
                        aria-label={`Configure ${dept.name ?? "department"}`}
                      >
                        <Settings aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setConfirmDept(dept); setConfirmAction(dept.status === "archived" ? "delete" : "archive"); }}
                        className="rounded-md p-1.5 text-muted transition-colors hover:bg-elevated hover:text-error-ink"
                        title={dept.status === "archived" ? "Delete department" : "Archive department"}
                        aria-label={dept.status === "archived" ? `Delete ${dept.name ?? "department"}` : `Archive ${dept.name ?? "department"}`}
                      >
                        {dept.status === "archived" ? <Trash2 aria-hidden="true" className="h-4 w-4" /> : <Archive aria-hidden="true" className="h-4 w-4" />}
                      </button>
                    </span>
                  </div>

                  {/* The mock's dnew row — hands off to the Employees hire modal */}
                  <button
                    type="button"
                    onClick={() => askAtlasToHire(dept)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-hairline-strong px-3 py-2 text-xs text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
                  >
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Ask Atlas to hire into {dept.name ?? "department"}
                  </button>
                </li>
              );
            })}

            {/* The mock's new-department tile */}
            <li>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="console-card flex h-full w-full flex-col items-start gap-2 border-dashed p-5 text-left transition-colors hover:bg-elevated"
              >
                <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline text-muted">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-ink">New department</span>
                <span className="text-xs text-muted">
                  Name it, set the lead and budget — you approve every hire into it.
                </span>
              </button>
            </li>
          </ul>
        )}

        {/* Pagination — only when browsing (not searching) and more pages exist */}
        {!loading && !debouncedSearch.trim() && total > DEPT_PAGE_SIZE && (
          <nav className="flex items-center justify-between" aria-label="Departments pagination">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - DEPT_PAGE_SIZE))}
              disabled={offset === 0}
              className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="font-mono text-2xs tabular-nums text-muted">
              {offset + 1}–{Math.min(offset + DEPT_PAGE_SIZE, total)} of {total}
            </span>
            <button
              type="button"
              onClick={() => setOffset(offset + DEPT_PAGE_SIZE)}
              disabled={offset + DEPT_PAGE_SIZE >= total}
              className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated disabled:opacity-40"
            >
              Next →
            </button>
          </nav>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-surface/60 p-4">
            <div className="console-card w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">New department</h2>
                <button type="button" onClick={() => setShowCreate(false)} aria-label="Close" className="rounded-md p-1.5 text-muted transition-colors hover:bg-elevated hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4 px-5 py-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink">Name *</label>
                  <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Research, Engineering" required className="console-composer w-full rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink">Description</label>
                  <textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} rows={2} placeholder="What does this department do?" className="console-composer w-full resize-none rounded-md px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink">Lead</label>
                    <input type="text" value={createHead} onChange={(e) => setCreateHead(e.target.value)} placeholder="e.g. Nova" className="console-composer w-full rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink">Budget (Cr)</label>
                    <input type="number" value={createBudget} onChange={(e) => setCreateBudget(e.target.value)} placeholder="e.g. 10000" className="console-composer w-full rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!createName.trim() || creating}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
                  >
                    {creating ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Plus aria-hidden="true" className="h-3.5 w-3.5" />}
                    Create department
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingDept && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-surface/60 p-4">
            <div className="console-card w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">Configure {editingDept.name}</h2>
                <button type="button" onClick={() => setEditingDept(null)} aria-label="Close" className="rounded-md p-1.5 text-muted transition-colors hover:bg-elevated hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4 px-5 py-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink">Lead</label>
                  <input type="text" value={editHead} onChange={(e) => setEditHead(e.target.value)} placeholder="e.g. Nova" className="console-composer w-full rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink">Budget (Cr)</label>
                  <input type="number" value={editBudget} onChange={(e) => setEditBudget(e.target.value)} placeholder="e.g. 10000" className="console-composer w-full rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink">Description</label>
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} placeholder="What does this department do?" className="console-composer w-full resize-none rounded-md px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
                <button type="button" onClick={() => setEditingDept(null)} className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
                >
                  {saving ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Department Template Catalog (one-click activation) */}
        {showDeptCatalog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-surface/60 p-4">
            <div className="console-card flex max-h-[80vh] w-full max-w-2xl flex-col shadow-2xl">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Department catalog</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Activate a ready-made department with its teams — one click, nothing you already run is duplicated.
                  </p>
                </div>
                <button type="button" onClick={() => setShowDeptCatalog(false)} aria-label="Close" className="rounded-md p-1.5 text-muted transition-colors hover:bg-elevated hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {deptTemplatesLoading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted">
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Loading catalog…
                  </div>
                ) : deptTemplates.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">No department templates available yet.</p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <input
                        type="search"
                        value={catalogQuery}
                        onChange={(e) => setCatalogQuery(e.target.value)}
                        placeholder="Search departments…"
                        aria-label="Search department templates"
                        className="console-composer min-w-0 flex-1 rounded-md px-3 py-2 text-xs"
                      />
                      <select
                        value={catalogStage}
                        onChange={(e) => setCatalogStage(Number(e.target.value))}
                        aria-label="Filter by company stage"
                        className="console-composer rounded-md px-2.5 py-2 text-xs"
                      >
                        {STAGE_FILTERS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      {deptTemplates.filter((t) => matchesCatalogFilter(t, catalogQuery, catalogStage)).length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted">No departments match your search or stage filter.</p>
                      ) : deptTemplates.filter((t) => matchesCatalogFilter(t, catalogQuery, catalogStage)).map((t) => {
                        const teamCount = Array.isArray(t.teams) ? t.teams.length : 0;
                        const busy = activatingTemplateId === t.id;
                        const active = justActivated === t.name;
                        return (
                          <div key={t.id} className="rounded-md border border-hairline p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                                  {t.name}
                                  <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-muted">
                                    Stage {templateStage(t)}+
                                  </span>
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.mission ?? t.description ?? ""}</p>
                                {teamCount > 0 && (
                                  <p className="mt-1 text-2xs text-muted">
                                    Includes {teamCount} team{teamCount === 1 ? "" : "s"}: {t.teams.map((x) => x.name).join(", ")}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => activateDeptTemplate(t.id)}
                                disabled={busy || activatingTemplateId !== null}
                                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                                style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
                              >
                                {busy ? "Activating…" : active ? "Activated ✓" : "Activate"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hire from Template Modal */}
        {showTemplateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-surface/60 p-4">
            <div className="console-card flex max-h-[80vh] w-full max-w-lg flex-col shadow-2xl">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">
                  Hire into {departments.find((d) => d.id === templateDeptId)?.name ?? "department"}
                </h2>
                <button type="button" onClick={() => { setShowTemplateModal(false); setSelectedTemplate(null); setHireName(""); }} aria-label="Close" className="rounded-md p-1.5 text-muted transition-colors hover:bg-elevated hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {templatesLoading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted">
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Loading templates…
                  </div>
                ) : templates.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">
                    No templates available. Create templates through the Executive Agent or API.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTemplate(t.id)}
                        className={`w-full rounded-md border p-3 text-left transition-colors ${
                          selectedTemplate === t.id ? "border-warm bg-warm/5" : "border-hairline hover:border-hairline-strong hover:bg-elevated"
                        }`}
                      >
                        <p className="text-sm font-medium text-ink">{t.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{roleLabel(t.role)}</p>
                        {t.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{t.description}</p>}
                        {t.capabilities.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {t.capabilities.slice(0, 3).map((cap) => (
                              <span key={cap} className="rounded-full border border-hairline px-2 py-0.5 text-2xs text-muted">{cap}</span>
                            ))}
                            {t.capabilities.length > 3 && (
                              <span className="rounded-full border border-hairline px-2 py-0.5 text-2xs text-muted">+{t.capabilities.length - 3}</span>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedTemplate && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink">Display name (optional)</label>
                    <input
                      type="text"
                      value={hireName}
                      onChange={(e) => setHireName(e.target.value)}
                      placeholder="Custom name for this employee"
                      className="console-composer w-full rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
                <button type="button" onClick={() => { setShowTemplateModal(false); setSelectedTemplate(null); setHireName(""); }} className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleHireFromTemplate}
                  disabled={!selectedTemplate || hiring}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
                >
                  {hiring ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Plus aria-hidden="true" className="h-3.5 w-3.5" />}
                  Hire
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm archive/delete Modal */}
        {confirmDept && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-surface/60 p-4">
            <div className="console-card w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">
                  {confirmAction === "archive" ? "Archive department" : "Delete department"}
                </h2>
                <button type="button" onClick={() => setConfirmDept(null)} aria-label="Close" className="rounded-md p-1.5 text-muted transition-colors hover:bg-elevated hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-5 py-4">
                {confirmAction === "archive" ? (
                  <p className="text-sm leading-relaxed text-muted">
                    Archive <span className="font-medium text-ink">{confirmDept.name}</span>? Archived departments stay in the
                    audit trail and can be restored. Its agents are not deleted.
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed text-muted">
                    Delete <span className="font-medium text-ink">{confirmDept.name}</span>? Deletion is permanent. Departments
                    with assigned AI employees cannot be deleted — archive them instead.
                  </p>
                )}
                {confirmDept.agentCount > 0 && (
                  <p className="mt-3 rounded-md border border-warm/20 bg-warm/5 px-3 py-2 text-xs text-warm-ink">
                    {confirmDept.agentCount} AI employee{confirmDept.agentCount !== 1 ? "s" : ""} currently assigned to this department.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
                <button type="button" onClick={() => setConfirmDept(null)} className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirmBusy}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--orq-error)", color: "var(--orq-on-error)" }}
                >
                  {confirmBusy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
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
