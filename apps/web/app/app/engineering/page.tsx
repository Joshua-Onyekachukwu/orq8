"use client";

/**
 * Engineering (docs/86 §6) — the workspace-wide deep dive.
 *
 * The department page carries the *department-scoped* focus read-model
 * (`detail.focus.engineering`: this department's own work and reviews). This
 * page is the other half: the repositories, sandbox runs, capability registry
 * and MCP catalogs that belong to the workspace as a whole and have no owning
 * employee, so they can never be attributed to one department.
 *
 * Rebased onto the shared os/structure layer. It used to hand-roll its own
 * palette (`bg-white`, `text-muted-foreground`, `rounded-xl … shadow-sm`) which
 * is a different design language from `.console` and, worse, `bg-white` does not
 * respond to the ink theme — these surfaces stayed white in dark mode. It also
 * carried its own status mapper; a failed run read `failed` here and `blocked`
 * on the department page. Both now come from one place (`department-focus-panel`
 * exports the three mappers, `os/primitives` owns the state vocabulary).
 */

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Braces,
  CheckCircle2,
  Database,
  GitMerge,
  GitPullRequest,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import { PageContainer } from "../../../components/layout/page-container";
import {
  OsDataTable,
  OsDrawer,
  OsEmptyPanel,
  OsErrorPanel,
  OsFacts,
  OsLoadingRows,
  OsMetricRow,
  OsPanel,
  OsSection,
  OsStateBadge,
  OsToolbar,
  type OsColumn,
  type OsMetric,
} from "../../../components/os/structure";
import { employeeOsStatus, type DotState } from "../../../components/os/primitives";
import {
  prState,
  runState,
  workState,
} from "../../../components/work/department-focus-panel";

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

/** MCP server status → the shared state vocabulary. */
function serverState(status: string): DotState {
  if (status === "connected") return "active";
  if (status === "error" || status === "failed") return "failed";
  if (status === "connecting") return "working";
  return "";
}

const RISK_TONE: Record<string, string> = {
  low: "text-ink",
  medium: "text-warm-ink",
  high: "text-warm-ink",
  critical: "text-error-ink",
};

function riskTone(risk: string): string {
  return RISK_TONE[risk] ?? "text-muted";
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
  const [emInfo, setEmInfo] = useState<string | null>(null);
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

  async function requestMergeApproval(pr: OrgPr) {
    setReviewBusy(true);
    try {
      const res = await fetch(`/api/prs/${pr.id}`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setEmError(json?.error?.message ?? "Request rejected by the server");
        return;
      }
      setEmError(null);
      setEmInfo(
        json?.data?.approval?.status === "approved"
          ? "This PR is already approved — you can merge it now."
          : "Merge approval requested — decide it in Command Center, then merge here.",
      );
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

  /* ── Metrics — the numbers this page is actually judged on ── */

  const metrics: OsMetric[] = [
    { key: "agents", label: "Engineering employees", value: engineeringAgents.length },
    {
      key: "inProgress",
      label: "Work in flight",
      value: inProgress,
      sub: "planning, implemented or running",
      tone: inProgress > 0 ? "warn" : "default",
    },
    { key: "completed", label: "Tasks completed", value: completed },
    {
      key: "failed",
      label: "Tasks failed",
      value: failed,
      sub: failed > 0 ? "needs a look" : "nothing failed",
      tone: failed > 0 ? "bad" : "default",
    },
    { key: "repos", label: "Repositories", value: repos.length, sub: "workspace-wide" },
    {
      key: "runs",
      label: "Sandbox runs",
      value: runs.length,
      sub: `${activeRuns} running or queued`,
    },
    { key: "caps", label: "Reusable capabilities", value: capabilities.length },
    {
      key: "mcp",
      label: "MCP servers connected",
      value: mcpConnected,
      sub: mcpServers.length > 0 ? `of ${mcpServers.length} registered` : undefined,
    },
  ];

  /* ── Columns ── */

  const agentColumns: Array<OsColumn<Agent>> = [
    {
      key: "name",
      header: "Employee",
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{a.name}</p>
          <p className="truncate font-mono text-3xs text-muted">{a.role.replace(/_/g, " ")}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "State",
      cell: (a) => {
        const s = employeeOsStatus(a.status, null);
        return <OsStateBadge state={s.state} label={s.label} />;
      },
    },
    {
      key: "autonomy",
      header: "Autonomy",
      hideOnMobile: true,
      cell: (a) => (
        <span className="font-mono text-3xs text-muted">
          {(a.autonomyLevel ?? "—").replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "capabilities",
      header: "Capabilities",
      hideOnMobile: true,
      cell: (a) => (
        <span className="line-clamp-1 text-2xs text-muted">
          {(a.capabilities ?? []).slice(0, 4).join(", ") || "—"}
        </span>
      ),
    },
  ];

  const taskColumns: Array<OsColumn<EngineeringTask>> = [
    {
      key: "title",
      header: "Work",
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{t.title}</p>
          {t.acceptanceCriteria ? (
            <p className="truncate text-3xs text-muted">{t.acceptanceCriteria}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "State",
      cell: (t) => {
        const s = workState(t.status);
        return <OsStateBadge state={s.state} label={s.label} />;
      },
    },
    {
      key: "branch",
      header: "Branch",
      hideOnMobile: true,
      cell: (t) => <span className="font-mono text-3xs text-muted">{t.branch}</span>,
    },
    {
      key: "pr",
      header: "PR",
      hideOnMobile: true,
      cell: (t) =>
        t.prId ? <GitPullRequest className="h-3.5 w-3.5 text-brand-ink" /> : <span className="text-muted">—</span>,
    },
    {
      key: "created",
      header: "Created",
      hideOnMobile: true,
      cell: (t) => <span className="text-2xs text-muted">{fmtDate(t.createdAt)}</span>,
    },
  ];

  const repoColumns: Array<OsColumn<Repository>> = [
    {
      key: "name",
      header: "Repository",
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <Database className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="truncate text-sm text-ink">{r.name}</span>
        </div>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      cell: (r) => <span className="font-mono text-3xs text-muted">{r.provider}</span>,
    },
    {
      key: "branch",
      header: "Default branch",
      hideOnMobile: true,
      cell: (r) => <span className="font-mono text-3xs text-muted">{r.defaultBranch ?? "—"}</span>,
    },
    {
      key: "updated",
      header: "Synced",
      hideOnMobile: true,
      cell: (r) => <span className="text-2xs text-muted">{fmtDate(r.updatedAt)}</span>,
    },
  ];

  const runColumns: Array<OsColumn<SandboxRun>> = [
    {
      key: "command",
      header: "Command",
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <Play className="h-3 w-3 shrink-0 text-muted" />
          <span className="truncate font-mono text-2xs text-ink">{r.command}</span>
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      cell: (r) => {
        const s = runState(r.state);
        return <OsStateBadge state={s.state} label={s.label} />;
      },
    },
    {
      key: "exit",
      header: "Exit",
      hideOnMobile: true,
      cell: (r) => (
        <span className="font-mono text-3xs text-muted">{r.exitCode === null ? "—" : r.exitCode}</span>
      ),
    },
    {
      key: "started",
      header: "Started",
      hideOnMobile: true,
      cell: (r) => <span className="text-2xs text-muted">{fmtDate(r.startedAt)}</span>,
    },
  ];

  const prColumns: Array<OsColumn<OrgPr>> = [
    {
      key: "title",
      header: "Pull request",
      cell: (pr) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{pr.title}</p>
          <p className="truncate font-mono text-3xs text-muted">
            {pr.repositoryName ?? "repo"} · {pr.headBranch} → {pr.baseBranch}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "State",
      cell: (pr) => {
        const s = prState(pr.status);
        return <OsStateBadge state={s.state} label={s.label} />;
      },
    },
    {
      key: "risk",
      header: "Risk",
      hideOnMobile: true,
      cell: (pr) => {
        const risk = riskLevel(pr);
        return risk ? (
          <span className={`font-mono text-3xs uppercase ${riskTone(risk)}`}>{risk}</span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      cell: (pr) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setReviewPr(pr);
              setEmError(null);
            }}
            className="rounded-md border border-hairline-strong px-2.5 py-1 text-2xs text-ink transition-colors hover:bg-surface-secondary"
          >
            Review
          </button>
          {pr.providerPrUrl ? (
            <a
              href={pr.providerPrUrl}
              target="_blank"
              rel="noreferrer"
              className="text-2xs text-muted underline underline-offset-4 hover:text-ink"
            >
              Open ↗
            </a>
          ) : null}
        </div>
      ),
    },
  ];

  const showLoading = loading && agents.length === 0 && tasks.length === 0 && prs.length === 0;

  return (
    <PageContainer
      kicker="Work"
      title="Engineering Department"
      lede="The software factory: engineering AI employees, repositories, sandbox execution, quality gates and the capability registry."
      actions={
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md border border-hairline-strong px-3 py-1.5 text-2xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </span>
        </button>
      }
      pageName="Engineering"
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <OsErrorPanel
            title="Could not load engineering data."
            detail={error}
            onRetry={() => void load()}
          />
        ) : null}

        {showLoading ? (
          <OsLoadingRows rows={4} />
        ) : (
          <>
            {/* ── Metrics ── */}
            <OsSection
              id="metrics"
              title="At a glance"
              description="Counts are this workspace's real rows, not estimates."
            >
              <OsMetricRow metrics={metrics} />
            </OsSection>

            {/* ── Engineering employees ── */}
            <OsSection
              id="employees"
              title="Engineering employees"
              count={engineeringAgents.length}
              description="Every employee whose department or role is an engineering one. Open a row to work with them directly."
            >
              <OsDataTable
                columns={agentColumns}
                rows={engineeringAgents}
                rowKey={(a) => a.id}
                rowHref={(a) => `/app/agents/${a.id}`}
                empty={
                  <OsEmptyPanel
                    title="No engineering AI employees yet."
                    hint="New playbook companies seed an Engineering department with a manager, architects, engineers and QA."
                    action={{ label: "Open Departments", href: "/app/departments" }}
                  />
                }
              />
            </OsSection>

            {/* ── Engineering work ── */}
            <OsSection
              id="work"
              title="Engineering work"
              count={tasks.length}
              description="Repository tasks in flight. A failed task is settled, not blocked — it will not resolve on its own."
            >
              <OsDataTable
                columns={taskColumns}
                rows={tasks.slice(0, 12)}
                rowKey={(t) => t.id}
                empty={
                  <OsEmptyPanel
                    title="No engineering tasks yet."
                    hint="Import a repository, then create tasks with acceptance criteria and assign an engineer."
                  />
                }
              />
            </OsSection>

            {/* ── Repositories & sandbox — workspace-wide ── */}
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="min-w-0">
                <OsSection
                  id="repositories"
                  title="Repositories"
                  count={repos.length}
                  description="Workspace-wide — a repository belongs to the company, not to one department."
                >
                  <OsDataTable
                    columns={repoColumns}
                    rows={repos.slice(0, 8)}
                    rowKey={(r) => r.id}
                    empty={
                      <OsEmptyPanel
                        title="No repositories imported."
                        hint="Engineers work against isolated branches of real repositories."
                      />
                    }
                  />
                </OsSection>
              </section>

              <section className="min-w-0">
                <OsSection
                  id="sandbox"
                  title="Sandbox runs"
                  count={runs.length}
                  description={`Isolated execution. ${activeRuns} running or queued right now.`}
                >
                  <OsDataTable
                    columns={runColumns}
                    rows={runs.slice(0, 8)}
                    rowKey={(r) => r.id}
                    empty={
                      <OsEmptyPanel
                        title="No sandbox runs recorded."
                        hint="Engineers run commands in a sandbox; every run is recorded here with its exit code."
                      />
                    }
                  />
                </OsSection>
              </section>
            </div>

            {/* ── Pull request reviews ── */}
            <OsSection
              id="reviews"
              title="Pull request reviews"
              count={prs.length}
              description="Merging is server-side approval-gated: request merge approval, decide it in Command Center, then merge. Every approval and merge is audited."
            >
              <OsDataTable
                columns={prColumns}
                rows={prs.slice(0, 12)}
                rowKey={(pr) => pr.id}
                empty={
                  <OsEmptyPanel
                    title="No pull requests yet."
                    hint="PRs opened from engineering tasks appear here for founder review."
                  />
                }
              />
              {approvedPrs.length > 0 ? (
                <p className="text-2xs text-muted">
                  {approvedPrs.length} approved PR{approvedPrs.length !== 1 ? "s" : ""} ready to merge ·{" "}
                  {mergedPrs} merged · {openForReview.length} awaiting a decision
                </p>
              ) : null}
            </OsSection>

            {/* ── Capability registry + MCP ── */}
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="min-w-0">
                <OsSection
                  id="capabilities"
                  title="Capability registry"
                  count={capabilities.length}
                  description="Build-vs-buy surface: before building anything, the Executive Agent and Engineering Manager search here for an existing capability to reuse."
                >
                  <OsToolbar>
                    <div className="relative w-full max-w-xs">
                      <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search capabilities…"
                        aria-label="Search capabilities"
                        className="w-full rounded-md border border-hairline bg-canvas py-1.5 pr-2.5 pl-8 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none"
                      />
                    </div>
                    {Object.entries(categoryCounts).length > 0 ? (
                      <span className="font-mono text-3xs text-muted">
                        {Object.entries(categoryCounts)
                          .map(([category, count]) => `${category} ${count}`)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </OsToolbar>

                  {filteredCaps.length === 0 ? (
                    <OsEmptyPanel
                      title={search ? "No capability matches that search." : "No capabilities registered."}
                      hint={
                        search
                          ? "Clear the search to see the whole registry."
                          : "Capabilities are recorded when the company reuses or builds a tool."
                      }
                    />
                  ) : (
                    <ul className="divide-y divide-[var(--console-line)] overflow-hidden rounded-lg border border-hairline">
                      {filteredCaps.slice(0, 30).map((cap) => (
                        <li key={cap.id} className="flex items-start gap-3 px-3 py-2">
                          <Braces className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-ink">{cap.name}</p>
                            {cap.description ? (
                              <p className="truncate text-2xs text-muted">{cap.description}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded-md border border-hairline px-1.5 py-0.5 font-mono text-3xs text-muted">
                              {cap.category}
                            </span>
                            {cap.status === "available" ? (
                              <ShieldCheck className="h-3.5 w-3.5 text-brand-ink" />
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </OsSection>
              </section>

              <section className="min-w-0">
                <OsSection
                  id="tools"
                  title="MCP servers"
                  count={mcpServers.length}
                  description="Agents discover and invoke tools through MCP servers. Connector-backed servers execute through the capability-checked, approval-gated connector chain — every call is audited."
                >
                  {mcpServers.length === 0 ? (
                    <OsEmptyPanel
                      title="No MCP servers registered."
                      hint="Playbook companies are seeded with GitHub, Gmail and Linear catalogs automatically."
                    />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {mcpServers.map((server) => (
                        <li key={server.id} className="rounded-lg border border-hairline bg-canvas p-3.5">
                          <div className="flex flex-wrap items-center gap-3">
                            <Layers className="h-4 w-4 shrink-0 text-muted" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink">{server.name}</p>
                              <p className="truncate font-mono text-3xs text-muted">
                                {server.provider} · {server.tools.length} tools
                              </p>
                            </div>
                            <OsStateBadge
                              state={serverState(server.status)}
                              label={server.status}
                            />
                            <span
                              className={`font-mono text-3xs tracking-wide uppercase ${riskTone(server.riskLevel)}`}
                            >
                              {server.riskLevel} risk
                            </span>
                          </div>
                          {server.tools.length > 0 ? (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {server.tools.slice(0, 8).map((tool) => (
                                <span
                                  key={tool.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-hairline px-1.5 py-0.5 font-mono text-3xs text-muted"
                                >
                                  <Wrench className="h-3 w-3" />
                                  {tool.name}
                                  {tool.requiresApproval ? (
                                    <span className="text-warm-ink">· approval</span>
                                  ) : null}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </OsSection>
              </section>
            </div>

            {/* ── Engineering Manager ── */}
            <OsSection
              id="now"
              title="Engineering Manager"
              description="Turn a request into an organized plan: capability-registry search, team assembly and tasks with acceptance criteria."
            >
              {emError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-2xs text-error-ink"
                >
                  {emError}
                </div>
              ) : null}
              {emInfo ? (
                <p className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-2xs text-brand-ink">
                  {emInfo}
                </p>
              ) : null}

              <OsPanel>
                <label htmlFor="em-objective" className="block text-2xs text-muted">
                  Engineering request
                </label>
                <textarea
                  id="em-objective"
                  value={emObjective}
                  onChange={(e) => setEmObjective(e.target.value)}
                  rows={2}
                  placeholder="e.g. Add a customer dashboard that shows order history and lets support draft replies"
                  className="mt-1.5 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none"
                />
                <button
                  type="button"
                  onClick={runEngineeringManager}
                  disabled={emPlanning}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-2xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
                >
                  {emPlanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                  {emPlanning ? "Planning…" : "Plan with Engineering Manager"}
                </button>
              </OsPanel>

              {emResult ? (
                <OsPanel>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">
                      Plan {emResult.alreadyPlanned ? "(already planned — idempotent)" : "created"}
                    </p>
                    <span className="font-mono text-3xs text-muted">{emResult.requestId.slice(0, 12)}</span>
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded-md border border-hairline p-3 font-mono text-3xs leading-relaxed whitespace-pre-wrap text-muted">
                    {emResult.report}
                  </pre>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {emResult.team.length > 0 ? (
                      <div className="min-w-0">
                        <p className="font-mono text-3xs tracking-wide text-muted uppercase">Team assembled</p>
                        <ul className="mt-1 space-y-0.5">
                          {emResult.team.map((m) => (
                            <li key={m.agentId} className="truncate text-2xs text-ink">
                              {m.name} — <span className="text-muted">{m.role.replace(/_/g, " ")}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {emResult.tasks.length > 0 ? (
                      <div className="min-w-0">
                        <p className="font-mono text-3xs tracking-wide text-muted uppercase">
                          Tasks created ({emResult.tasks.length})
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {emResult.tasks.map((t, i) => (
                            <li key={i} className="truncate text-2xs text-ink">
                              {t.title}{" "}
                              <span className="text-muted">
                                ({t.assignedRole.replace(/_/g, " ")}
                                {t.agentName ? ` · ${t.agentName}` : ""})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  {emResult.capabilitiesReused.length > 0 || emResult.capabilityGaps.length > 0 ? (
                    <div className="mt-3">
                      <OsFacts
                        columns={2}
                        items={[
                          {
                            label: `Reused capabilities (${emResult.capabilitiesReused.length})`,
                            value:
                              emResult.capabilitiesReused.length === 0 ? (
                                <span className="text-muted">nothing reused</span>
                              ) : (
                                <ul className="space-y-0.5">
                                  {emResult.capabilitiesReused.map((c) => (
                                    <li key={c.name} className="truncate font-mono text-3xs">
                                      {c.name} <span className="text-muted">· {c.category}</span>
                                    </li>
                                  ))}
                                </ul>
                              ),
                          },
                          {
                            label: `Capability gaps (${emResult.capabilityGaps.length})`,
                            value:
                              emResult.capabilityGaps.length === 0 ? (
                                <span className="text-muted">nothing missing</span>
                              ) : (
                                <ul className="space-y-0.5">
                                  {emResult.capabilityGaps.map((gap) => (
                                    <li key={gap} className="truncate font-mono text-3xs text-warm-ink">
                                      {gap}
                                    </li>
                                  ))}
                                </ul>
                              ),
                          },
                        ]}
                      />
                    </div>
                  ) : null}
                </OsPanel>
              ) : null}
            </OsSection>
          </>
        )}
      </div>

      {/* ── PR review drawer — detail without losing the list ── */}
      <OsDrawer
        open={reviewPr !== null}
        onClose={() => setReviewPr(null)}
        title="Review pull request"
        footer={
          reviewPr ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-2xs text-muted">
                State: <span className="text-ink">{prState(reviewPr.status).label}</span>
              </span>
              {reviewPr.status !== "merged" && reviewPr.status !== "approved" ? (
                <>
                  <button
                    type="button"
                    onClick={() => requestMergeApproval(reviewPr)}
                    disabled={reviewBusy}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-2xs font-semibold disabled:opacity-50"
                    style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Request merge approval
                  </button>
                  <button
                    type="button"
                    onClick={() => decidePr(reviewPr, "changes_requested")}
                    disabled={reviewBusy}
                    className="rounded-md border border-hairline-strong px-3 py-1.5 text-2xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-50"
                  >
                    Request changes
                  </button>
                  <button
                    type="button"
                    onClick={() => decidePr(reviewPr, "rejected")}
                    disabled={reviewBusy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-2xs text-error-ink transition-colors hover:bg-error-soft disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </>
              ) : null}
              {reviewPr.status === "approved" ? (
                <button
                  type="button"
                  onClick={() => decidePr(reviewPr, "merged")}
                  disabled={reviewBusy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-2xs font-semibold text-ink transition-colors hover:bg-surface-secondary disabled:opacity-50"
                >
                  <GitMerge className="h-3.5 w-3.5" /> Merge
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {reviewPr ? (
          <div className="flex flex-col gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{reviewPr.title}</p>
              <p className="truncate font-mono text-3xs text-muted">
                {reviewPr.repositoryName ?? "Repository"} · {reviewPr.headBranch} → {reviewPr.baseBranch}
              </p>
              {reviewPr.task ? (
                <p className="mt-1 text-2xs text-muted">Linked task: {reviewPr.task.title}</p>
              ) : null}
              {reviewPr.providerPrUrl ? (
                <a
                  href={reviewPr.providerPrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-2xs text-ink underline underline-offset-4"
                >
                  Open on provider ↗
                </a>
              ) : null}
            </div>

            <OsFacts
              columns={2}
              items={[
                { label: "State", value: prState(reviewPr.status).label },
                { label: "Opened", value: fmtDate(reviewPr.createdAt) },
                { label: "Approved by", value: reviewPr.approvedBy ?? "—" },
                { label: "Merged", value: fmtDate(reviewPr.mergedAt) },
                {
                  label: "Risk assessment",
                  value:
                    reviewPr.riskAssessment && Object.keys(reviewPr.riskAssessment).length > 0 ? (
                      <ul className="space-y-0.5">
                        {Object.entries(reviewPr.riskAssessment).map(([k, v]) => (
                          <li key={k} className="text-2xs">
                            <span className="font-mono text-3xs tracking-wide text-muted uppercase">
                              {k.replace(/_/g, " ")}
                            </span>{" "}
                            <span className="text-ink">
                              {typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted">No structured risk assessment recorded.</span>
                    ),
                },
                {
                  label: "Tests & checks",
                  value: reviewPr.task?.testsSummary ? (
                    <pre className="overflow-x-auto font-mono text-3xs whitespace-pre-wrap text-muted">
                      {JSON.stringify(reviewPr.task.testsSummary, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-muted">No test summary recorded.</span>
                  ),
                },
                {
                  label: "Diff summary",
                  value: reviewPr.task?.diffSummary ? (
                    <pre className="overflow-x-auto font-mono text-3xs whitespace-pre-wrap text-muted">
                      {JSON.stringify(reviewPr.task.diffSummary, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-muted">No diff summary recorded.</span>
                  ),
                },
                {
                  label: "Acceptance criteria",
                  value: reviewPr.task?.acceptanceCriteria ?? (
                    <span className="text-muted">Not recorded.</span>
                  ),
                },
              ]}
            />

            {emError ? (
              <div
                role="alert"
                className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-2xs text-error-ink"
              >
                {emError}
              </div>
            ) : null}
          </div>
        ) : null}
      </OsDrawer>
    </PageContainer>
  );
}

export default function EngineeringPage() {
  return (
    <PageErrorBoundary pageName="Engineering">
      <EngineeringDashboard />
    </PageErrorBoundary>
  );
}
