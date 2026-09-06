"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Activity,
  Bot,
  Braces,
  CheckCircle2,
  Code2,
  Database,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Layers,
  Loader2,
  Package,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  TerminalSquare,
  Users,
  Wrench,
  X,
  XCircle,
} from "lucide-react";

/* ── Types ── */

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
  capabilities: string[];
  autonomyLevel?: string;
}

interface EngineeringTask {
  id: string;
  title: string;
  status: string;
  branch: string;
  assigneeId: string;
  acceptanceCriteria: string | null;
  prId: string | null;
  createdAt: string;
}

interface Repository {
  id: string;
  name: string;
  provider: string;
  defaultBranch: string | null;
  updatedAt: string;
}

interface SandboxRun {
  id: string;
  command: string;
  state: string;
  exitCode: number | null;
  usedCredits: number;
  startedAt: string | null;
  finishedAt: string | null;
}

interface Capability {
  id: string;
  name: string;
  description: string;
  category: string;
  provider: string | null;
  status: string;
  source: string;
}

interface McpServer {
  id: string;
  name: string;
  provider: string;
  status: string;
  riskLevel: string;
  tools: Array<{ id: string; name: string; requiresApproval: boolean; riskLevel: string }>;
}

interface OrgPr {
  id: string;
  title: string;
  status: string;
  headBranch: string;
  baseBranch: string;
  providerPrUrl: string | null;
  repositoryName: string | null;
  authorId: string;
  riskAssessment: Record<string, unknown> | null;
  approvedBy: string | null;
  mergedAt: string | null;
  createdAt: string;
  task: {
    id: string;
    title: string;
    acceptanceCriteria: string | null;
    testsSummary: Record<string, unknown> | null;
    diffSummary: Record<string, unknown> | null;
  } | null;
}

interface EmPlan {
  requestId: string;
  objective: string;
  alreadyPlanned: boolean;
  capabilitiesReused: Array<{ name: string; description: string | null; category: string }>;
  capabilityGaps: string[];
  team: Array<{ agentId: string; name: string; role: string }>;
  tasks: Array<{ title: string; assignedRole: string; agentName: string | null; priority: string }>;
  report: string;
}

/* ── Helpers ── */

function statusBadge(status: string) {
  switch (status) {
    case "completed":
    case "merged":
    case "success":
      return { label: status, cls: "bg-emerald-50 text-emerald-700" };
    case "failed":
    case "error":
      return { label: status, cls: "bg-red-50 text-red-700" };
    case "planning":
    case "queued":
      return { label: status, cls: "bg-slate-100 text-slate-600" };
    case "implemented":
    case "running":
      return { label: status, cls: "bg-blue-50 text-blue-700" };
    default:
      return { label: status, cls: "bg-amber-50 text-amber-700" };
  }
}

function riskBadge(risk: string) {
  switch (risk) {
    case "low": return { label: "Low", cls: "bg-emerald-50 text-emerald-700" };
    case "medium": return { label: "Medium", cls: "bg-blue-50 text-blue-700" };
    case "high": return { label: "High", cls: "bg-orange-50 text-orange-700" };
    default: return { label: "Critical", cls: "bg-red-50 text-red-700" };
  }
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ── Main component ── */

function EngineeringDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<EngineeringTask[]>([]);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [runs, setRuns] = useState<SandboxRun[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [prs, setPrs] = useState<OrgPr[]>([]);
  const [reviewPr, setReviewPr] = useState<OrgPr | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [emObjective, setEmObjective] = useState("");
  const [emPlanning, setEmPlanning] = useState(false);
  const [emResult, setEmResult] = useState<EmPlan | null>(null);
  const [emError, setEmError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentsRes, tasksRes, reposRes, runsRes, capsRes, mcpRes, prsRes] = await Promise.all([
        fetch("/api/agents", { next: { revalidate: 15 } }),
        fetch("/api/engineering/tasks", { next: { revalidate: 15 } }),
        fetch("/api/engineering/repositories", { next: { revalidate: 15 } }),
        fetch("/api/engineering/sandbox-runs", { next: { revalidate: 15 } }),
        fetch("/api/capabilities", { next: { revalidate: 15 } }),
        fetch("/api/mcp/servers", { next: { revalidate: 15 } }),
        fetch("/api/prs", { next: { revalidate: 10 } }),
      ]);
      const [agentsJson, tasksJson, reposJson, runsJson, capsJson, mcpJson, prsJson] = await Promise.all([
        agentsRes.json(), tasksRes.json(), reposRes.json(), runsRes.json(), capsRes.json(), mcpRes.json(), prsRes.json(),
      ]);
      setAgents(agentsJson.data ?? []);
      setTasks(tasksJson.data ?? []);
      setRepos(reposJson.data ?? []);
      setRuns(runsJson.data ?? []);
      setCapabilities(capsJson.data ?? []);
      setMcpServers(mcpJson.data ?? []);
      setPrs(prsJson.data ?? []);
    } catch {
      setError("Could not load engineering data. Is the backend reachable?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const engineeringAgents = agents.filter(
    (a) => (a.department ?? "").toLowerCase().includes("engineer") || (a.role ?? "").toLowerCase().includes("engineer") || (a.role ?? "").toLowerCase().includes("architect") || (a.role ?? "").toLowerCase().includes("qa") || (a.role ?? "").toLowerCase().includes("devops")
  );
  const inProgress = tasks.filter((t) => t.status === "implemented" || t.status === "running" || t.status === "planning").length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const activeRuns = runs.filter((r) => r.state === "running" || r.state === "queued").length;
  const mcpConnected = mcpServers.filter((s) => s.status === "connected").length;

  const openForReview = prs.filter((p) => p.status === "pending_review" || p.status === "changes_requested");
  const approvedPrs = prs.filter((p) => p.status === "approved");
  const mergedPrs = prs.filter((p) => p.status === "merged").length;

  async function decidePr(pr: OrgPr, status: string) {
    setReviewBusy(true);
    try {
      const res = await fetch(`/api/prs/${pr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setEmError(json?.error?.message ?? "Action rejected by the server");
        return;
      }
      setEmError(null);
      setReviewPr(null);
      await load();
    } catch {
      setEmError("Backend unavailable");
    } finally {
      setReviewBusy(false);
    }
  }

  async function runEngineeringManager() {
    if (emObjective.trim().length < 8) {
      setEmError("Describe the engineering objective (at least 8 characters).");
      return;
    }
    setEmPlanning(true);
    setEmError(null);
    try {
      const res = await fetch("/api/engineering-manager/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: emObjective.trim(), priority: "high" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmError(json?.error?.message ?? "Planning failed");
        return;
      }
      setEmResult(json.data ?? null);
      setEmObjective("");
      await load();
    } catch {
      setEmError("Backend unavailable");
    } finally {
      setEmPlanning(false);
    }
  }

  function riskLevel(pr: OrgPr): string | null {
    const r = pr.riskAssessment as Record<string, unknown> | null;
    if (r && typeof r.riskLevel === "string") return r.riskLevel;
    return null;
  }

  const categoryCounts = capabilities.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {});
  const filteredCaps = search.trim()
    ? capabilities.filter(
        (c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.description ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : capabilities;

  const statCards = [
    { label: "Engineering AI employees", value: engineeringAgents.length, icon: Bot, cls: "text-blue-600 bg-blue-50" },
    { label: "Engineering tasks in progress", value: inProgress, icon: Activity, cls: "text-amber-600 bg-amber-50" },
    { label: "Tasks completed", value: completed, icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-50" },
    { label: "Tasks failed", value: failed, icon: XCircle, cls: "text-red-600 bg-red-50" },
    { label: "Repositories", value: repos.length, icon: GitBranch, cls: "text-slate-600 bg-slate-100" },
    { label: "Sandbox runs", value: runs.length, icon: TerminalSquare, cls: "text-violet-600 bg-violet-50" },
    { label: "Reusable capabilities", value: capabilities.length, icon: Package, cls: "text-cyan-600 bg-cyan-50" },
    { label: "MCP servers connected", value: mcpConnected, icon: Server, cls: "text-indigo-600 bg-indigo-50" },
  ];

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Engineering Department</h1>
          <p className="text-sm text-muted mt-1">
            The software factory: engineering AI employees, repositories, sandbox execution, quality gates and the capability registry.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-white p-5 shadow-sm">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${card.cls}`}>
              <card.icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-2xl font-bold">{card.value}</p>
            <p className="text-sm text-muted">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Engineering org */}
      <section className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted" />
          <h2 className="text-lg font-semibold">Engineering organization</h2>
        </div>
        {engineeringAgents.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
            No engineering AI employees yet. New playbook companies seed an Engineering department with a manager, architects, engineers and QA.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {engineeringAgents.map((agent) => (
              <div key={agent.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{agent.name}</p>
                    <p className="text-xs text-muted truncate">{agent.role}</p>
                  </div>
                  <span className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${agent.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {agent.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(agent.capabilities ?? []).slice(0, 6).map((cap) => (
                    <span key={cap} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{cap}</span>
                  ))}
                </div>
                {agent.autonomyLevel && (
                  <p className="mt-2 text-[11px] text-muted">
                    Autonomy: <span className="font-medium text-foreground">{agent.autonomyLevel.replace(/_/g, " ")}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 mt-8 lg:grid-cols-2">
        {/* Engineering work */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Code2 className="h-4 w-4 text-muted" />
            <h2 className="text-lg font-semibold">Engineering tasks</h2>
          </div>
          {tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
              No engineering tasks yet. Import a repository, then create tasks with acceptance criteria and assign an AI engineer.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Task</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Branch</th>
                    <th className="px-4 py-2.5 font-medium">PR</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.slice(0, 8).map((task) => {
                    const badge = statusBadge(task.status);
                    return (
                      <tr key={task.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium max-w-[260px] truncate">{task.title}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted font-mono">{task.branch}</td>
                        <td className="px-4 py-3">{task.prId ? <GitPullRequest className="h-4 w-4 text-emerald-600" /> : <span className="text-muted">—</span>}</td>
                        <td className="px-4 py-3 text-xs text-muted">{fmtDate(task.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Repositories + sandbox runs */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="h-4 w-4 text-muted" />
            <h2 className="text-lg font-semibold">Repositories & sandbox runs</h2>
          </div>
          {repos.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
              No repositories imported. Engineering AI employees work against isolated branches of real repositories.
            </div>
          ) : (
            <div className="space-y-2">
              {repos.slice(0, 4).map((repo) => (
                <div key={repo.id} className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Database className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{repo.name}</p>
                    <p className="text-xs text-muted">{repo.provider}{repo.defaultBranch ? ` · ${repo.defaultBranch}` : ""}</p>
                  </div>
                  <span className="text-xs text-muted">{fmtDate(repo.updatedAt)}</span>
                </div>
              ))}
            </div>
          )}

          {runs.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border bg-white shadow-sm">
              <div className="border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">Recent sandbox runs</div>
              {runs.slice(0, 4).map((run) => {
                const badge = statusBadge(run.state);
                return (
                  <div key={run.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
                    <Play className="h-3.5 w-3.5 text-muted" />
                    <p className="flex-1 truncate text-xs font-mono">{run.command}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{run.state}</span>
                    {run.exitCode !== null && <span className="text-[11px] text-muted">exit {run.exitCode}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 mt-8 lg:grid-cols-2">
        {/* Capability registry */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted" />
              <h2 className="text-lg font-semibold">Capability registry</h2>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search capabilities…"
                className="rounded-lg border border-input bg-white pl-8 pr-3 py-1.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <p className="mb-3 text-xs text-muted">
            Build-vs-buy surface: before building anything, the Executive Agent and Engineering Manager search here for an existing capability to reuse.
          </p>
          {Object.entries(categoryCounts).length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Object.entries(categoryCounts).map(([category, count]) => (
                <span key={category} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {category} · {count}
                </span>
              ))}
            </div>
          )}
          {filteredCaps.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">No capabilities found.</div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-xl border bg-white shadow-sm">
              {filteredCaps.slice(0, 30).map((cap) => (
                <div key={cap.id} className="flex items-start gap-3 border-b px-4 py-2.5 last:border-0">
                  <Braces className="mt-0.5 h-3.5 w-3.5 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{cap.name}</p>
                    {cap.description && <p className="text-xs text-muted truncate">{cap.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{cap.category}</span>
                    {cap.status === "available" && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* MCP servers */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Server className="h-4 w-4 text-muted" />
            <h2 className="text-lg font-semibold">MCP servers</h2>
          </div>
          <p className="mb-3 text-xs text-muted">
            Agents discover and invoke tools through MCP servers. Connector-backed servers (GitHub, Gmail, Linear) execute through the capability-checked, approval-gated connector chain — every call is audited.
          </p>
          {mcpServers.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
              No MCP servers registered. Playbook companies are seeded with GitHub, Gmail and Linear catalogs automatically.
            </div>
          ) : (
            <div className="space-y-2">
              {mcpServers.map((server) => {
                const badge = statusBadge(server.status);
                const risk = riskBadge(server.riskLevel);
                return (
                  <div key={server.id} className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{server.name}</p>
                        <p className="text-xs text-muted">{server.provider} · {server.tools.length} tools</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{server.status}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${risk.cls}`}>{risk.label} risk</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {server.tools.slice(0, 8).map((tool) => (
                        <span key={tool.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          <Wrench className="h-3 w-3" />
                          {tool.name}
                          {tool.requiresApproval && <span className="text-amber-600">· approval</span>}
                        </span>
                      )                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 mt-8 lg:grid-cols-2">
        {/* PR review — approval-gated merge */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <GitPullRequest className="h-4 w-4 text-muted" />
            <h2 className="text-lg font-semibold">Pull request reviews</h2>
          </div>
          <p className="mb-3 text-xs text-muted">
            Merging is server-side approval-gated: approve a PR first, then merge. Approvals and merges are audited.
          </p>
          {prs.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
              No pull requests yet. PRs opened from engineering tasks appear here for founder review.
            </div>
          ) : (
            <div className="space-y-2">
              {prs.slice(0, 8).map((pr) => {
                const badge = statusBadge(pr.status);
                const risk = riskLevel(pr);
                return (
                  <div key={pr.id} className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{pr.title}</p>
                        <p className="text-xs text-muted">
                          {pr.repositoryName ?? "repo"} · {pr.headBranch} → {pr.baseBranch}
                          {pr.task ? ` · ${pr.task.title}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{pr.status}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {risk && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${riskBadge(risk).cls}`}>{risk} risk</span>
                      )}
                      <button
                        onClick={() => { setReviewPr(pr); setEmError(null); }}
                        className="rounded-lg border border-input px-2.5 py-1 text-xs font-medium hover:bg-muted"
                      >
                        Review
                      </button>
                      {pr.providerPrUrl && (
                        <a href={pr.providerPrUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Open ↗</a>
                      )}
                    </div>
                  </div>
                );
              })}
              {approvedPrs.length > 0 && (
                <p className="text-xs text-muted">
                  {approvedPrs.length} approved PR{approvedPrs.length !== 1 ? "s" : ""} ready to merge · {mergedPrs} merged
                </p>
              )}
            </div>
          )}
        </section>

        {/* Engineering Manager loop */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <Bot className="h-4 w-4 text-muted" />
            <h2 className="text-lg font-semibold">Engineering Manager</h2>
          </div>
          <p className="mb-3 text-xs text-muted">
            Turn a request into an organized plan: capability-registry search, team assembly and tasks with acceptance criteria.
          </p>
          {emError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{emError}</div>}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <label className="mb-1.5 block text-sm font-medium">Engineering request</label>
            <textarea
              value={emObjective}
              onChange={(e) => setEmObjective(e.target.value)}
              rows={2}
              placeholder="e.g. Add a customer dashboard that shows order history and lets support draft replies"
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={runEngineeringManager}
              disabled={emPlanning}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {emPlanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              {emPlanning ? "Planning…" : "Plan with Engineering Manager"}
            </button>
          </div>

          {emResult && (
            <div className="mt-3 rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Plan {emResult.alreadyPlanned ? "(already planned — idempotent)" : "created"}</p>
                <span className="text-[11px] text-muted font-mono">{emResult.requestId.slice(0, 12)}</span>
              </div>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-[11px] leading-relaxed">{emResult.report}</pre>
              {emResult.team.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {emResult.team.map((m) => (
                    <span key={m.agentId} className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                      {m.name} — {m.role}
                    </span>
                  ))}
                </div>
              )}
              {emResult.tasks.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {emResult.tasks.map((t, i) => (
                    <li key={i} className="text-xs text-muted">• {t.title} <span className="text-foreground">({t.assignedRole})</span></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      {/* PR review modal */}
      {reviewPr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b px-6 py-4">
              <div className="min-w-0 pr-4">
                <h3 className="text-base font-semibold">Review pull request</h3>
                <p className="truncate text-sm text-muted">
                  {reviewPr.repositoryName ?? "Repository"} · {reviewPr.headBranch} → {reviewPr.baseBranch}
                </p>
              </div>
              <button onClick={() => setReviewPr(null)} className="rounded-lg p-1.5 text-muted hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div>
                <p className="text-sm font-semibold">{reviewPr.title}</p>
                {reviewPr.task && (
                  <p className="mt-0.5 text-xs text-muted">Linked task: {reviewPr.task.title}</p>
                )}
                {reviewPr.providerPrUrl && (
                  <a href={reviewPr.providerPrUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Open on provider ↗</a>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Risk assessment</p>
                {reviewPr.riskAssessment && Object.keys(reviewPr.riskAssessment).length > 0 ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                    {Object.entries(reviewPr.riskAssessment).map(([k, v]) => (
                      <p key={k} className="flex gap-2">
                        <span className="font-medium capitalize w-32 shrink-0 text-muted-foreground">{k.replace(/_/g, " ")}</span>
                        <span className="text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted">No structured risk assessment recorded for this PR.</p>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Tests & checks</p>
                {reviewPr.task?.testsSummary ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(reviewPr.task.testsSummary, null, 2)}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted">No test summary recorded.</p>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Diff summary</p>
                {reviewPr.task?.diffSummary ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(reviewPr.task.diffSummary, null, 2)}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted">No diff summary recorded.</p>
                )}
              </div>

              {reviewPr.task?.acceptanceCriteria && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Acceptance criteria</p>
                  <p className="rounded-lg border bg-muted/30 p-3 text-xs">{reviewPr.task.acceptanceCriteria}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4">
              <span className="mr-auto text-xs text-muted">
                Status: <span className="font-medium text-foreground">{reviewPr.status}</span>
              </span>
              {reviewPr.status !== "merged" && reviewPr.status !== "approved" && (
                <button
                  onClick={() => decidePr(reviewPr, "approved")}
                  disabled={reviewBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </button>
              )}
              {reviewPr.status !== "merged" && reviewPr.status !== "approved" && (
                <button
                  onClick={() => decidePr(reviewPr, "changes_requested")}
                  disabled={reviewBusy}
                  className="rounded-lg border border-input px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  Request changes
                </button>
              )}
              {reviewPr.status !== "merged" && reviewPr.status !== "approved" && (
                <button
                  onClick={() => decidePr(reviewPr, "rejected")}
                  disabled={reviewBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              )}
              {reviewPr.status === "approved" && (
                <button
                  onClick={() => decidePr(reviewPr, "merged")}
                  disabled={reviewBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50"
                >
                  <GitMerge className="h-3.5 w-3.5" /> Merge
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EngineeringPage() {
  return (
    <PageErrorBoundary pageName="Engineering">
      <EngineeringDashboard />
    </PageErrorBoundary>
  );
}