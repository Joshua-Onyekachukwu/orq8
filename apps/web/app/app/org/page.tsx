"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Building2,
  Users,
  Target,
  Activity,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Wallet,
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
}

interface Goal {
  id: string;
  title: string;
  status: string;
  progress: number;
  priority: string;
}

interface OrgData {
  agents: Agent[];
  departments: Record<string, Agent[]>;
  goals: Goal[];
  stats: {
    totalAgents: number;
    activeAgents: number;
    totalGoals: number;
    activeGoals: number;
    totalTasksCompleted: number;
    weeklyCost: number;
  };
}

export default function OrgPage() {
  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const fetchOrgData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentsRes, goalsRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/goals"),
      ]);

      const agentsJson = agentsRes.ok ? await agentsRes.json() : { data: [] };
      const goalsJson = goalsRes.ok ? await goalsRes.json() : { data: [] };

      const agents: Agent[] = agentsJson.data ?? [];
      const goals: Goal[] = goalsJson.data ?? [];

      // Group agents by department
      const departments: Record<string, Agent[]> = {};
      for (const agent of agents) {
        const dept = agent.department ?? "Unassigned";
        if (!departments[dept]) departments[dept] = [];
        departments[dept].push(agent);
      }

      setData({
        agents,
        departments,
        goals,
        stats: {
          totalAgents: agents.length,
          activeAgents: agents.filter((a) => a.status === "active").length,
          totalGoals: goals.length,
          activeGoals: goals.filter((g) => g.status === "active").length,
          totalTasksCompleted: agents.reduce((sum, a) => sum + a.tasksCompleted, 0),
          weeklyCost: agents.reduce((sum, a) => sum + a.weeklyCost, 0),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load org data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrgData(); }, [fetchOrgData]);

  return (
    <PageErrorBoundary pageName="Org Explorer" backHref="/app">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            Organization
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Org Explorer
          </h1>
          <p className="mt-1 text-sm text-muted">
            Your company at a glance — departments, agents, goals, and how they connect.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchOrgData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-5">
                <div className="h-4 w-1/2 rounded bg-hairline" />
                <div className="mt-2 h-6 w-1/3 rounded bg-hairline" />
              </div>
            ))}
          </div>
          <div className="animate-pulse rounded-xl border border-hairline bg-white p-6">
            <div className="h-40 rounded bg-hairline" />
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Stats row */}
          <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-4">
            {[
              { label: "Agents", value: data.stats.activeAgents, icon: <Users className="h-4 w-4" />, color: "bg-emerald/15 text-emerald-700" },
              { label: "Goals", value: data.stats.activeGoals, icon: <Target className="h-4 w-4" />, color: "bg-purple-50 text-purple-700" },
              { label: "Tasks Done", value: data.stats.totalTasksCompleted, icon: <Activity className="h-4 w-4" />, color: "bg-blue-50 text-blue-700" },
              { label: "Weekly Cost", value: `$${(data.stats.weeklyCost / 100).toFixed(2)}`, icon: <Wallet className="h-4 w-4" />, color: "bg-amber-50 text-amber-700" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-hairline bg-white p-4">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.color}`}>
                  {stat.icon}
                </span>
                <p className="mt-2 text-xl font-bold text-ink">{stat.value}</p>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Org chart */}
          <div className="mt-6 rounded-xl border border-hairline bg-white p-6">
            <h2 className="text-sm font-semibold text-ink mb-4">Organization Structure</h2>

            {/* Root: CEO / Founder */}
            <div className="flex items-center gap-3 rounded-xl border-2 border-emerald/30 bg-emerald/5 px-5 py-4 mb-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald text-lg font-bold text-white">
                CEO
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">Founder / CEO</p>
                <p className="text-xs text-muted">Executive Agent orchestrates all work</p>
              </div>
            </div>

            {/* Connection line */}
            <div className="ml-6 border-l-2 border-hairline" />

            {/* Departments */}
            {Object.entries(data.departments).map(([dept, agents]) => (
              <div key={dept} className="ml-6 mt-2">
                <div className="flex items-center gap-2 rounded-lg border border-hairline bg-canvas px-4 py-3">
                  <Building2 className="h-4 w-4 text-muted" />
                  <span className="text-sm font-semibold text-ink">{dept}</span>
                  <span className="font-mono text-[10px] text-muted">
                    {agents.length} agent{agents.length !== 1 ? "s" : ""}
                  </span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted" />
                </div>

                {/* Agents in department */}
                <div className="ml-6 mt-1 space-y-1 border-l-2 border-hairline pl-4">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        selectedAgent?.id === agent.id
                          ? "bg-navy-900 text-white"
                          : "hover:bg-canvas"
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        agent.status === "active"
                          ? "bg-emerald text-white"
                          : "bg-gray-200 text-gray-500"
                      }`}>
                        {agent.name.charAt(0)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${selectedAgent?.id === agent.id ? "text-white" : "text-ink"}`}>
                          {agent.name}
                        </p>
                        <p className={`text-xs ${selectedAgent?.id === agent.id ? "text-white/70" : "text-muted"}`}>
                          {agent.role}
                        </p>
                      </div>
                      <span className={`font-mono text-[10px] ${
                        selectedAgent?.id === agent.id ? "text-white/60" : "text-muted"
                      }`}>
                        {agent.tasksCompleted} tasks
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {Object.keys(data.departments).length === 0 && (
              <div className="ml-6 mt-2 rounded-lg border border-dashed border-hairline px-4 py-6 text-center">
                <p className="text-sm text-muted">
                  Hire agents and assign them to departments to see your org chart.
                </p>
                <a href="/app/agents" className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline">
                  Hire agents →
                </a>
              </div>
            )}
          </div>

          {/* Selected agent detail */}
          {selectedAgent && (
            <div className="mt-4 rounded-xl border border-hairline bg-white p-5">
              <h3 className="text-sm font-semibold text-ink mb-3">Agent Detail — {selectedAgent.name}</h3>
              <dl className="grid gap-4 sm:grid-cols-4">
                <div>
                  <dt className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Role</dt>
                  <dd className="mt-1 text-sm text-ink">{selectedAgent.role}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Status</dt>
                  <dd className="mt-1 text-sm">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      selectedAgent.status === "active" ? "bg-emerald/15 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {selectedAgent.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Tasks Completed</dt>
                  <dd className="mt-1 text-sm text-ink">{selectedAgent.tasksCompleted}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Weekly Cost</dt>
                  <dd className="mt-1 text-sm tabular-nums text-ink">${(selectedAgent.weeklyCost / 100).toFixed(2)}</dd>
                </div>
              </dl>
              {selectedAgent.currentTask && (
                <div className="mt-3 rounded-lg bg-canvas px-3 py-2">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">Current Task</p>
                  <p className="mt-1 text-sm text-ink">{selectedAgent.currentTask}</p>
                </div>
              )}
            </div>
          )}

          {/* Active goals */}
          {data.goals.length > 0 && (
            <div className="mt-4 rounded-xl border border-hairline bg-white p-5">
              <h3 className="text-sm font-semibold text-ink mb-3">Active Goals</h3>
              <div className="space-y-2">
                {data.goals.filter((g) => g.status === "active").map((goal) => (
                  <div key={goal.id} className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2.5">
                    <Target className="h-4 w-4 shrink-0 text-purple-500" />
                    <span className="flex-1 text-sm text-ink">{goal.title}</span>
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                      goal.priority === "urgent" ? "bg-red-100 text-red-600" :
                      goal.priority === "high" ? "bg-amber-50 text-amber-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {goal.priority}
                    </span>
                    <div className="h-2 w-16 rounded-full bg-muted/10 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald" style={{ width: `${goal.progress}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-muted w-8 text-right">{goal.progress}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </PageErrorBoundary>
  );
}
