"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Flag,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Target,
  Users,
  X,
} from "lucide-react";

/* ── Types ── */

interface SquadAgent {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface Squad {
  id: string;
  name: string;
  purpose: string | null;
  objective: string;
  status: string;
  parentTaskId: string | null;
  createdAt: string;
  agents: SquadAgent[];
}

interface SquadMonitor {
  squad: Squad;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    agentId: string | null;
    agentName: string | null;
    cost: number;
    updatedAt: string;
  }>;
  summary: {
    totalTasks: number;
    completed: number;
    inProgress: number;
    pending: number;
    failed: number;
    totalCost: number;
    completionRate: number;
  };
}

interface OrgAgent {
  id: string;
  name: string;
  role: string;
  status: string;
}

/* ── Helpers ── */

function statusBadge(status: string) {
  switch (status) {
    case "completed": return { label: "Completed", cls: "bg-emerald-50 text-emerald-700" };
    case "in_progress": return { label: "In progress", cls: "bg-blue-50 text-blue-700" };
    case "failed": return { label: "Failed", cls: "bg-red-50 text-red-700" };
    default: return { label: "Pending", cls: "bg-muted/10 text-muted" };
  }
}

function squadStateBadge(status: string) {
  switch (status) {
    case "active": return { label: "Active", cls: "bg-emerald-50 text-emerald-700" };
    case "completed": return { label: "Completed", cls: "bg-blue-50 text-blue-700" };
    default: return { label: "Archived", cls: "bg-muted/10 text-muted" };
  }
}

/* ── Page ── */

export default function SquadsPage() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [agents, setAgents] = useState<OrgAgent[]>([]);
  const [monitor, setMonitor] = useState<SquadMonitor | null>(null);
  const [selected, setSelected] = useState<Squad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [objective, setObjective] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // Start form — task decomposition
  const [taskRows, setTaskRows] = useState<Array<{ title: string; description: string; role: string }>>([
    { title: "", description: "", role: "" },
  ]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [squadsRes, agentsRes] = await Promise.all([fetch("/api/squads"), fetch("/api/agents")]);
      const squadsJson = await squadsRes.json().catch(() => null);
      const agentsJson = await agentsRes.json().catch(() => null);
      setSquads(squadsJson?.data ?? []);
      setAgents(agentsJson?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load squads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const createSquad = async () => {
    if (!name.trim() || !objective.trim()) {
      setError("Name and objective are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, purpose, objective, agentIds: selectedAgents }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to create squad");
      const squad: Squad = json.data;
      setSquads(prev => [squad, ...prev]);
      setSelected(squad);
      setShowCreate(false);
      setShowStart(true);
      setName("");
      setPurpose("");
      setObjective("");
      setSelectedAgents([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create squad");
    } finally {
      setBusy(false);
    }
  };

  const startSquad = async () => {
    if (!selected) return;
    const tasks = taskRows
      .filter(t => t.title.trim() && t.role.trim())
      .map(t => ({ title: t.title.trim(), description: t.description.trim() || t.title.trim(), suggestedAgentRole: t.role.trim(), priority: "normal" as const }));
    if (tasks.length === 0) {
      setError("Add at least one task with a title and an agent role.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/squads/${selected.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to start squad");
      setShowStart(false);
      await openSquad(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start squad");
    } finally {
      setBusy(false);
    }
  };

  const openSquad = async (id: string) => {
    setError(null);
    try {
      const [squadRes, monitorRes] = await Promise.all([
        fetch(`/api/squads/${id}`),
        fetch(`/api/squads/${id}/monitor`),
      ]);
      const squadJson = await squadRes.json().catch(() => null);
      const monitorJson = await monitorRes.json().catch(() => null);
      setSelected(squadJson?.data ?? null);
      setMonitor(monitorJson?.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load squad");
    }
  };

  const toggleAgent = (id: string) => {
    setSelectedAgents(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  return (
    <PageErrorBoundary pageName="Squads">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orq8-lime/10">
                <Users aria-hidden="true" className="h-4.5 w-4.5 text-orq8-green" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-ink">Cross-Agent Squads</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Assemble AI employees into a squad with a shared objective. The Executive Agent decomposes the work and delegates it in parallel — you monitor distribution and results here.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshAll}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              New squad
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-xs text-red-500 hover:text-red-700">Dismiss</button>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
            <h2 className="text-sm font-semibold text-ink">Create a squad</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-3xs font-semibold uppercase tracking-wide text-muted">Squad name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Launch Squad"
                  className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                />
              </div>
              <div>
                <label className="text-3xs font-semibold uppercase tracking-wide text-muted">Purpose (optional)</label>
                <input
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                  placeholder="Why does this squad exist?"
                  className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-3xs font-semibold uppercase tracking-wide text-muted">Objective</label>
                <textarea
                  value={objective}
                  onChange={e => setObjective(e.target.value)}
                  placeholder="e.g. Launch our new mobile app by end of quarter — marketing, support and engineering in parallel"
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                />
              </div>
            </div>

            <p className="mt-4 text-3xs font-semibold uppercase tracking-wide text-muted">Select AI employees</p>
            {agents.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No AI employees yet — hire some first.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {agents.filter(a => a.status !== "archived").map(a => {
                  const active = selectedAgents.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAgent(a.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? "border-orq8-green bg-orq8-lime/10 text-orq8-green" : "border-hairline bg-white text-muted hover:text-ink"}`}
                    >
                      <Bot className="h-3 w-3" aria-hidden="true" />
                      {a.name}
                      <span className="text-3xs">{a.role}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={createSquad}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                Create squad
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="text-xs text-muted hover:text-ink">Cancel</button>
            </div>
          </div>
        )}

        {/* Start form */}
        {showStart && selected && (
          <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-orq8-green" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-ink">Start “{selected.name}” — decompose the work</h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              List the pieces of work and the role that should own each. The delegation engine assigns them to matching squad members.
            </p>
            <div className="mt-4 space-y-3">
              {taskRows.map((row, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_180px]">
                  <input
                    value={row.title}
                    onChange={e => setTaskRows(prev => prev.map((r, j) => j === i ? { ...r, title: e.target.value } : r))}
                    placeholder="Task title"
                    className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                  />
                  <input
                    value={row.description}
                    onChange={e => setTaskRows(prev => prev.map((r, j) => j === i ? { ...r, description: e.target.value } : r))}
                    placeholder="Description (optional)"
                    className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                  />
                  <div className="flex gap-2">
                    <input
                      value={row.role}
                      onChange={e => setTaskRows(prev => prev.map((r, j) => j === i ? { ...r, role: e.target.value } : r))}
                      placeholder="Agent role"
                      className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                    />
                    {taskRows.length > 1 && (
                      <button type="button" onClick={() => setTaskRows(prev => prev.filter((_, j) => j !== i))} className="shrink-0 rounded-lg border border-hairline p-2 text-muted hover:text-red-600">
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTaskRows(prev => [...prev, { title: "", description: "", role: "" }])}
                className="text-xs font-medium text-orq8-green hover:underline"
              >
                + Add task
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={startSquad}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                Start squad
              </button>
              <button type="button" onClick={() => setShowStart(false)} className="text-xs text-muted hover:text-ink">Cancel</button>
            </div>
          </div>
        )}

        {/* Squads list + monitor */}
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-2">
            {loading && !squads.length ? (
              <div className="rounded-xl border border-hairline bg-white p-8 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted" aria-hidden="true" />
                <p className="mt-2 text-xs text-muted">Loading squads…</p>
              </div>
            ) : squads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-hairline bg-white p-8 text-center">
                <Users className="mx-auto h-8 w-8 text-muted/30" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-ink">No squads yet</p>
                <p className="mt-1 text-xs text-muted">Create a squad to run parallel work across your AI employees.</p>
              </div>
            ) : (
              squads.map(s => {
                const badge = squadStateBadge(s.status);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openSquad(s.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${selected?.id === s.id ? "border-orq8-green bg-orq8-lime/5" : "border-hairline bg-white hover:bg-canvas"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-ink">{s.name}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{s.objective}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-3xs font-semibold uppercase ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-3xs text-muted">
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" aria-hidden="true" /> {s.agents.length} members</span>
                      <span>·</span>
                      <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="lg:col-span-3">
            {!selected ? (
              <div className="rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
                <Target className="mx-auto h-10 w-10 text-muted/30" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-ink">Select a squad to see its execution</p>
                <p className="mt-1 text-xs text-muted">Task distribution, progress and results appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-hairline bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-ink">{selected.name}</h2>
                      {selected.purpose && <p className="mt-1 text-xs text-muted">{selected.purpose}</p>}
                    </div>
                    {!monitor?.squad.parentTaskId && !showStart && (
                      <button
                        type="button"
                        onClick={() => setShowStart(true)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
                      >
                        <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                        Start this squad
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{selected.objective}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.agents.map(a => (
                      <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-2.5 py-1 text-3xs text-ink">
                        <Bot className="h-3 w-3 text-muted" aria-hidden="true" />
                        {a.name}
                        <span className="text-muted">{a.role}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {monitor && (
                  <>
                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: "Total tasks", value: monitor.summary.totalTasks },
                        { label: "Completed", value: monitor.summary.completed },
                        { label: "In progress", value: monitor.summary.inProgress },
                        { label: "Completion", value: `${monitor.summary.completionRate}%` },
                      ].map(m => (
                        <div key={m.label} className="rounded-xl border border-hairline bg-white p-3">
                          <p className="text-3xs font-medium uppercase tracking-wide text-muted">{m.label}</p>
                          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">{m.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Task distribution */}
                    <div className="rounded-xl border border-hairline bg-white p-5">
                      <h2 className="text-sm font-semibold text-ink">Work distribution</h2>
                      {monitor.tasks.length === 0 ? (
                        <div className="mt-3 rounded-lg border border-dashed border-hairline p-6 text-center">
                          <Clock className="mx-auto h-6 w-6 text-muted/30" aria-hidden="true" />
                          <p className="mt-2 text-xs text-muted">No tasks created yet — start the squad to decompose the objective into delegated work.</p>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {monitor.tasks.map(t => {
                            const badge = statusBadge(t.status);
                            return (
                              <div key={t.id} className="flex items-center gap-3 rounded-lg border border-hairline p-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-ink">{t.title}</p>
                                  <p className="text-3xs text-muted">
                                    {t.agentName ?? "Unassigned"} · {t.priority}
                                  </p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-3xs font-semibold uppercase ${badge.cls}`}>{badge.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageErrorBoundary>
  );
}