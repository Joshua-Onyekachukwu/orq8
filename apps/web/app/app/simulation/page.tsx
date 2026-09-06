"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FlaskConical,
  Gauge,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

/* ── Types ── */

interface OrgState {
  departments: number;
  agents: number;
  activeAgents: number;
  goals: number;
  activeGoals: number;
  tasks: number;
  openTasks: number;
  completedTasks: number;
  completionRate: number;
  tasksLast7Days: number;
  creditsUsedLast7Days: number;
  avgCreditsPerTask: number;
  scannedAt: string;
}

interface SimulationResult {
  id: string;
  projectedWorkload: {
    currentTasksPerWeek: number;
    projectedTasksPerWeek: number;
    increasePercent: number;
  };
  projectedCost: {
    currentWeeklyCredits: number;
    projectedWeeklyCredits: number;
    increaseCents: number;
    monthlyProjectionCents: number;
  };
  projectedRisk: "low" | "medium" | "high" | "critical";
  bottlenecks: string[];
  metrics: {
    currentAgents: number;
    proposedAgents: number;
    currentTasksPerWeek: number;
    proposedTasksPerWeek: number;
    avgCreditsPerTask: number;
    agentUtilization: number;
    projectedUtilization: number;
    baselineFromLiveData: {
      agents: boolean;
      tasksPerWeek: boolean;
      avgCreditsPerTask: boolean;
    };
  };
  recommendation: string;
  baseline: OrgState;
}

interface Simulation {
  id: string;
  name: string;
  objective: string | null;
  changeDescription: string;
  state: string;
  createdAt: string;
  recommendation?: string | null;
}

/* ── Helpers ── */

function riskBadge(risk: string) {
  switch (risk) {
    case "low": return { label: "Low risk", cls: "bg-emerald-50 text-emerald-700" };
    case "medium": return { label: "Medium risk", cls: "bg-amber-50 text-amber-700" };
    case "high": return { label: "High risk", cls: "bg-orange-50 text-orange-700" };
    default: return { label: "Critical risk", cls: "bg-red-50 text-red-700" };
  }
}

function stateBadge(state: string) {
  switch (state) {
    case "draft": return { label: "Draft", cls: "bg-muted/10 text-muted" };
    case "proposed": return { label: "Proposed", cls: "bg-blue-50 text-blue-700" };
    case "reviewed": return { label: "Reviewed", cls: "bg-purple-50 text-purple-700" };
    case "applied": return { label: "Applied", cls: "bg-emerald-50 text-emerald-700" };
    default: return { label: state, cls: "bg-muted/10 text-muted" };
  }
}

function formatCredits(cents: number) {
  if (cents >= 100000) return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function deltaPct(current: number, projected: number) {
  if (current === 0) return projected === 0 ? "0%" : "—";
  const pct = Math.round(((projected - current) / current) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/* ── Page ── */

export default function SimulationPage() {
  const [currentState, setCurrentState] = useState<OrgState | null>(null);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Simulation | null>(null);

  // Form state — prefilled from live data
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [changeDescription, setChangeDescription] = useState("");
  const [proposedAgents, setProposedAgents] = useState(0);
  const [proposedTasks, setProposedTasks] = useState(0);
  const [avgCredits, setAvgCredits] = useState(50);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stateRes, simsRes] = await Promise.all([
        fetch("/api/simulations/current-state"),
        fetch("/api/simulations"),
      ]);
      const stateJson = await stateRes.json().catch(() => null);
      const simsJson = await simsRes.json().catch(() => null);
      if (stateJson?.data) {
        setCurrentState(stateJson.data);
        setProposedAgents(stateJson.data.activeAgents);
        setProposedTasks(Math.max(stateJson.data.tasksLast7Days, 10));
        setAvgCredits(stateJson.data.avgCreditsPerTask > 0 ? stateJson.data.avgCreditsPerTask : 50);
      }
      setSimulations(simsJson?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load simulation data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const createSimulation = async () => {
    if (!name.trim() || !changeDescription.trim()) {
      setError("Name and change description are required.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, objective, changeDescription }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to create simulation");
      const sim: Simulation = json.data;
      setSelected(sim);
      setSimulations(prev => [sim, ...prev]);
      setShowForm(false);
      // Run immediately against the live baseline
      await runSimulation(sim.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create simulation");
    } finally {
      setRunning(false);
    }
  };

  const runSimulation = async (simId: string) => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/simulations/${simId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedAgents, proposedTasksPerWeek: proposedTasks, avgCreditsPerTask: avgCredits }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to run simulation");
      setResult(json.data);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run simulation");
    } finally {
      setRunning(false);
    }
  };

  const openSimulation = async (sim: Simulation) => {
    setSelected(sim);
    setResult(null);
    setApplyMessage(null);
  };

  const proposeAndApply = async () => {
    if (!selected) return;
    setApplying(true);
    setError(null);
    setApplyMessage(null);
    try {
      // Build a structured proposal from the scenario: one new department
      // reflecting the modeled change, with agents for the workforce delta.
      const delta = Math.max(0, proposedAgents - (currentState?.activeAgents ?? 0));
      const department = {
        name: selected.name.length > 60 ? selected.name.slice(0, 57) + "…" : selected.name,
        description: selected.changeDescription,
        agents: Array.from({ length: delta }, (_, i) => ({
          name: `AI Employee ${i + 1}`,
          role: "Generalist",
        })),
      };
      const proposalRes = await fetch(`/api/simulations/${selected.id}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rationale: selected.changeDescription || selected.objective || "Workforce expansion scenario.",
          departments: [department],
        }),
      });
      const proposalJson = await proposalRes.json();
      if (!proposalRes.ok) throw new Error(proposalJson?.error?.message ?? "Failed to save proposal");

      const applyRes = await fetch(`/api/simulations/${selected.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const applyJson = await applyRes.json();
      if (!applyRes.ok) throw new Error(applyJson?.error?.message ?? "Apply request failed");
      setApplyMessage(
        applyJson?.data?.status === "pending_approval"
          ? `Approval requested — no organizational change is created until you approve it (${applyJson.data.approvalId}).`
          : (applyJson?.data?.message ?? "Simulation applied.")
      );
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const liveBadges = [
    { icon: Building2, label: "Departments", value: currentState?.departments ?? 0 },
    { icon: Users, label: "Active AI employees", value: currentState?.activeAgents ?? 0 },
    { icon: Target, label: "Active goals", value: currentState?.activeGoals ?? 0 },
    { icon: Activity, label: "Tasks last 7 days", value: currentState?.tasksLast7Days ?? 0 },
  ];

  return (
    <PageErrorBoundary pageName="Simulation">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orq8-lime/10">
                <FlaskConical aria-hidden="true" className="h-4.5 w-4.5 text-orq8-green" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-ink">Simulation</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Model organizational, workforce and cost changes against your <span className="font-medium text-ink">live organizational data</span> — before applying anything. Everything below marked <span className="font-medium text-ink">Projection</span> is simulated, never an actual result.
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
              onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
            >
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              New simulation
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

        {applyMessage && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-800">{applyMessage}</p>
          </div>
        )}

        {/* Live current state */}
        <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-orq8-green" />
              <h2 className="text-sm font-semibold text-ink">Live organizational state</h2>
              <span className="rounded-full bg-muted/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-muted">
                Actual data
              </span>
            </div>
            <span className="text-3xs text-muted">
              {currentState?.scannedAt ? `Scanned ${new Date(currentState.scannedAt).toLocaleString()}` : "Scanning…"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {liveBadges.map(b => (
              <div key={b.label} className="rounded-lg border border-hairline bg-canvas/50 p-3">
                <div className="flex items-center gap-1.5 text-3xs font-medium uppercase tracking-wide text-muted">
                  <b.icon className="h-3 w-3" aria-hidden="true" />
                  {b.label}
                </div>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{b.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-muted sm:grid-cols-3">
            <span>Open tasks: <span className="font-medium text-ink">{currentState?.openTasks ?? 0}</span></span>
            <span>Completion rate: <span className="font-medium text-ink">{currentState?.completionRate ?? 0}%</span></span>
            <span>Credits used (7d): <span className="font-medium text-ink">{currentState?.creditsUsedLast7Days ?? 0}</span></span>
            <span>Avg credits / task: <span className="font-medium text-ink">{currentState?.avgCreditsPerTask ?? 0}</span></span>
            <span>Total agents: <span className="font-medium text-ink">{currentState?.agents ?? 0}</span></span>
            <span>Total goals: <span className="font-medium text-ink">{currentState?.goals ?? 0}</span></span>
          </div>
        </div>

        {/* New simulation form */}
        {showForm && (
          <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
            <h2 className="text-sm font-semibold text-ink">What-if scenario</h2>
            <p className="mt-1 text-xs text-muted">Describe the change you want to model. Current values are prefilled from your live data — adjust only what the scenario changes.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-3xs font-semibold uppercase tracking-wide text-muted">Scenario name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Expand Marketing to 5 employees"
                  className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                />
              </div>
              <div>
                <label className="text-3xs font-semibold uppercase tracking-wide text-muted">Objective (optional)</label>
                <input
                  value={objective}
                  onChange={e => setObjective(e.target.value)}
                  placeholder="What outcome should this achieve?"
                  className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-3xs font-semibold uppercase tracking-wide text-muted">Change description</label>
                <textarea
                  value={changeDescription}
                  onChange={e => setChangeDescription(e.target.value)}
                  placeholder="e.g. Add 3 AI employees to Marketing, increase weekly task volume to 60"
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                />
              </div>
              <div>
                <label className="text-3xs font-semibold uppercase tracking-wide text-muted">Projected AI employees</label>
                <input
                  type="number"
                  min={0}
                  value={proposedAgents}
                  onChange={e => setProposedAgents(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                />
              </div>
              <div>
                <label className="text-3xs font-semibold uppercase tracking-wide text-muted">Projected tasks / week</label>
                <input
                  type="number"
                  min={0}
                  value={proposedTasks}
                  onChange={e => setProposedTasks(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={createSimulation}
                disabled={running}
                className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Create & run scenario
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-muted hover:text-ink">Cancel</button>
            </div>
          </div>
        )}

        {/* Simulations list + result */}
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* List */}
          <div className="lg:col-span-2 rounded-xl border border-hairline bg-white p-4">
            <h2 className="px-1 text-sm font-semibold text-ink">Scenarios</h2>
            {simulations.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-hairline p-6 text-center">
                <FlaskConical className="mx-auto h-8 w-8 text-muted/30" aria-hidden="true" />
                <p className="mt-2 text-xs text-muted">No simulations yet. Create one to model a change against your live organization.</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {simulations.map(sim => {
                  const badge = stateBadge(sim.state);
                  return (
                    <button
                      key={sim.id}
                      type="button"
                      onClick={() => openSimulation(sim)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${selected?.id === sim.id ? "border-orq8-green bg-orq8-lime/5" : "border-hairline bg-white hover:bg-canvas"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-ink">{sim.name}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-3xs font-semibold uppercase ${badge.cls}`}>{badge.label}</span>
                      </div>
                      {sim.objective && <p className="mt-1 line-clamp-1 text-xs text-muted">{sim.objective}</p>}
                      <p className="mt-1 text-3xs text-muted">{new Date(sim.createdAt).toLocaleDateString()}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail / result */}
          <div className="lg:col-span-3">
            {!selected && !result ? (
              <div className="rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
                <BarChart3 className="mx-auto h-10 w-10 text-muted/30" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-ink">Select a scenario to see its projection</p>
                <p className="mt-1 text-xs text-muted">The engine compares your live organization against the modeled change.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selected && (
                  <div className="rounded-xl border border-hairline bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-ink">{selected.name}</h2>
                      <button
                        type="button"
                        onClick={() => runSimulation(selected.id)}
                        disabled={running || selected.state === "applied"}
                        className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
                      >
                        {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Re-run
                      </button>
                    </div>
                    {selected.objective && <p className="mt-1 text-xs text-muted">{selected.objective}</p>}
                    <p className="mt-2 text-xs leading-relaxed text-muted">{selected.changeDescription}</p>
                  </div>
                )}

                {result && (
                  <>
                    {/* Projection comparison */}
                    <div className="rounded-xl border border-hairline bg-white p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-ink">Projected outcome</h2>
                        <span className="rounded-full bg-orq8-lime/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-orq8-green">
                          Projection — not actual results
                        </span>
                        <span className={`ml-auto rounded-full px-2.5 py-1 text-3xs font-semibold uppercase ${riskBadge(result.projectedRisk).cls}`}>
                          {riskBadge(result.projectedRisk).label}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div className="rounded-lg border border-hairline bg-canvas/50 p-3">
                          <p className="text-3xs font-medium uppercase tracking-wide text-muted">Tasks / week</p>
                          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">
                            {result.metrics.currentTasksPerWeek} <ArrowRight className="inline h-3.5 w-3.5 text-muted" /> {result.metrics.proposedTasksPerWeek}
                          </p>
                          <p className="text-3xs text-muted">{deltaPct(result.metrics.currentTasksPerWeek, result.metrics.proposedTasksPerWeek)} change</p>
                        </div>
                        <div className="rounded-lg border border-hairline bg-canvas/50 p-3">
                          <p className="text-3xs font-medium uppercase tracking-wide text-muted">Weekly credits</p>
                          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">
                            {formatCredits(result.projectedCost.currentWeeklyCredits)} <ArrowRight className="inline h-3.5 w-3.5 text-muted" /> {formatCredits(result.projectedCost.projectedWeeklyCredits)}
                          </p>
                          <p className="text-3xs text-muted">{deltaPct(result.projectedCost.currentWeeklyCredits, result.projectedCost.projectedWeeklyCredits)} cost change</p>
                        </div>
                        <div className="rounded-lg border border-hairline bg-canvas/50 p-3">
                          <p className="text-3xs font-medium uppercase tracking-wide text-muted">AI employees</p>
                          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">
                            {result.metrics.currentAgents} <ArrowRight className="inline h-3.5 w-3.5 text-muted" /> {result.metrics.proposedAgents}
                          </p>
                          <p className="text-3xs text-muted">
                            {result.metrics.baselineFromLiveData.agents ? "baseline from live data" : "manually entered"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted">
                        <span>Monthly projection: <span className="font-medium text-ink">{formatCredits(result.projectedCost.monthlyProjectionCents)}</span></span>
                        <span>Utilization: <span className="font-medium text-ink">{result.metrics.agentUtilization} → {result.metrics.projectedUtilization} tasks/agent</span></span>
                      </div>

                      {result.recommendation && (
                        <div className="mt-4 rounded-lg border border-orq8-lime/30 bg-orq8-lime/5 p-3">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-orq8-green" aria-hidden="true" />
                            <p className="text-3xs font-semibold uppercase tracking-wide text-orq8-green">Recommendation</p>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-ink">{result.recommendation}</p>
                        </div>
                      )}

                      {result.bottlenecks.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-3xs font-semibold uppercase tracking-wide text-muted">Bottlenecks / warnings</p>
                          {result.bottlenecks.map((b, i) => (
                            <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                              <p className="text-xs text-amber-800">{b}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Apply */}
                    {selected && selected.state !== "applied" && (
                      <div className="rounded-xl border border-hairline bg-white p-5">
                        <h2 className="text-sm font-semibold text-ink">Apply this scenario</h2>
                        <p className="mt-1 text-xs text-muted">
                          Applying creates a structured organizational proposal and requests your approval. Nothing changes in your company until you approve it.
                        </p>
                        <button
                          type="button"
                          onClick={proposeAndApply}
                          disabled={applying || running}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                        >
                          {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          {applying ? "Requesting approval…" : "Propose & request approval"}
                        </button>
                      </div>
                    )}
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