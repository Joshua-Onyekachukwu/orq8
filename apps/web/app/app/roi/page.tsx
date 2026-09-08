"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  DollarSign,
  Clock,
  TrendingUp,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Settings,
  BarChart3,
  Zap,
  X,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface AgentROI {
  agentId: string;
  agentName: string;
  role: string;
  departmentName: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  successRate: number;
  estimatedHoursSaved: number;
  estimatedCostSaved: number;
  activityCount: number;
  creditsUsed: number;
}

interface DepartmentROI {
  departmentId: string | null;
  departmentName: string;
  agentCount: number;
  tasksCompleted: number;
  estimatedHoursSaved: number;
  estimatedCostSaved: number;
  agentROIs: AgentROI[];
}

interface WeeklyTrend {
  weekStart: string;
  tasksCompleted: number;
  estimatedHoursSaved: number;
  estimatedCostSaved: number;
  activityCount: number;
}

interface WorkforceROI {
  hourlyRate: number;
  totalAgents: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  overallSuccessRate: number;
  totalEstimatedHoursSaved: number;
  totalEstimatedCostSaved: number;
  totalActivityEvents: number;
  founderTimeReclaimed: number;
  aiCostPerTask: number;
  humanCostPerTask: number;
  roiMultiplier: number;
  perAgentROI: AgentROI[];
  departmentROI: DepartmentROI[];
  weeklyTrend: WeeklyTrend[];
  monthlyTrend: WeeklyTrend[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function formatHours(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K hrs`;
  return `${n.toLocaleString()} hrs`;
}

function formatWeek(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`rounded-lg p-1.5 ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <div className="text-2xl font-bold text-ink font-mono tabular-nums">{value}</div>
      {subtext && <div className="text-2xs text-muted mt-1">{subtext}</div>}
    </div>
  );
}

// ── Mini Bar Chart ──────────────────────────────────────────────────────────

function MiniBarChart({ data, maxVal }: { data: number[]; maxVal: number }) {
  const max = maxVal || Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-orq8-green/80 transition-all"
          style={{ height: `${Math.max((v / max) * 100, 2)}%` }}
          title={`${v}`}
        />
      ))}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function ROIPage() {
  const [roi, setROI] = useState<WorkforceROI | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateInput, setRateInput] = useState("75");
  const [activeTab, setActiveTab] = useState<"overview" | "agents" | "departments" | "trends">("overview");

  const loadROI = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/roi");
      if (res.ok) {
        const data = await res.json();
        setROI(data);
        setRateInput(String(data.hourlyRate));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadROI(); }, [loadROI]);

  const updateRate = async () => {
    const rate = Number(rateInput);
    if (isNaN(rate) || rate < 1 || rate > 1000) return;
    await fetch("/api/roi/rate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hourlyRate: rate }),
    });
    setShowRateModal(false);
    loadROI();
  };

  return (
    <PageErrorBoundary pageName="AI Workforce ROI" backHref="/app">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">AI Workforce ROI</h1>
            <p className="mt-1 text-sm text-muted">
              The economic value your AI employees deliver. Real data, real savings.
            </p>
          </div>
          <button
            onClick={() => setShowRateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-muted hover:text-ink hover:border-ink/20 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" /> ${roi?.hourlyRate ?? 75}/hr
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-muted">Calculating ROI…</div>
        ) : !roi ? (
          <div className="text-center py-16 text-sm text-muted">Failed to load ROI data.</div>
        ) : (
          <>
            {/* Hero Metrics */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                icon={DollarSign}
                label="Total Cost Saved"
                value={formatCurrency(roi.totalEstimatedCostSaved)}
                subtext={`vs. ${formatHours(roi.totalEstimatedHoursSaved)} of human work`}
                color="bg-orq8-green"
              />
              <MetricCard
                icon={Clock}
                label="Hours Saved"
                value={formatHours(roi.totalEstimatedHoursSaved)}
                subtext={`${roi.totalTasksCompleted} tasks completed`}
                color="bg-orq8-orange"
              />
              <MetricCard
                icon={Zap}
                label="ROI Multiplier"
                value={`${roi.roiMultiplier}×`}
                subtext={`AI: ${formatCurrency(roi.aiCostPerTask)}/task vs Human: ${formatCurrency(roi.humanCostPerTask)}/task`}
                color="bg-blue-500"
              />
              <MetricCard
                icon={Users}
                label="Founder Time Reclaimed"
                value={`${roi.founderTimeReclaimed} hrs`}
                subtext="Orchestration handled by EA"
                color="bg-purple-500"
              />
            </div>

            {/* Success Rate + Activity */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-hairline bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted">Task Success Rate</span>
                  <span className="text-lg font-bold text-ink font-mono">{roi.overallSuccessRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${roi.overallSuccessRate >= 80 ? "bg-orq8-green" : roi.overallSuccessRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${roi.overallSuccessRate}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-2xs text-muted">
                  <span>{roi.totalTasksCompleted} completed</span>
                  <span>{roi.totalTasksFailed} failed</span>
                </div>
              </div>

              <div className="rounded-xl border border-hairline bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted">AI Activity (30 days)</span>
                  <span className="text-lg font-bold text-ink font-mono">{roi.totalActivityEvents}</span>
                </div>
                <MiniBarChart
                  data={roi.weeklyTrend.map(w => w.activityCount)}
                  maxVal={Math.max(...roi.weeklyTrend.map(w => w.activityCount), 1)}
                />
                <div className="flex items-center justify-between mt-2 text-2xs text-muted">
                  {(() => {
                    const first = roi.weeklyTrend[0];
                    const last = roi.weeklyTrend[roi.weeklyTrend.length - 1];
                    return first && last ? (
                      <>
                        <span>{formatWeek(first.weekStart)}</span>
                        <span>{formatWeek(last.weekStart)}</span>
                      </>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-6 flex items-center gap-1 border-b border-hairline">
              {(["overview", "agents", "departments", "trends"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-orq8-green text-orq8-green"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {tab === "overview" ? "Overview" : tab === "agents" ? "Per-Agent" : tab === "departments" ? "By Department" : "Trends"}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="mt-6 space-y-4">
                {/* Value Equation */}
                <div className="rounded-xl border border-hairline bg-white p-6">
                  <h3 className="text-sm font-semibold text-ink mb-4">Value Equation</h3>
                  <div className="grid gap-4 sm:grid-cols-3 text-center">
                    <div>
                      <div className="text-2xl font-bold text-orq8-green font-mono">{roi.totalAgents}</div>
                      <div className="text-xs text-muted mt-1">AI Employees</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-orq8-orange font-mono">{roi.totalTasksCompleted}</div>
                      <div className="text-xs text-muted mt-1">Tasks Completed</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600 font-mono">{formatCurrency(roi.totalEstimatedCostSaved)}</div>
                      <div className="text-xs text-muted mt-1">Cost Saved</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-hairline text-center">
                    <span className="text-xs text-muted">Each AI employee saves an average of </span>
                    <span className="text-sm font-semibold text-ink font-mono">
                      {roi.totalAgents > 0 ? formatCurrency(Math.round(roi.totalEstimatedCostSaved / roi.totalAgents)) : "$0"}
                    </span>
                    <span className="text-xs text-muted"> in human-equivalent cost</span>
                  </div>
                </div>

                {/* Top Performers */}
                {roi.perAgentROI.length > 0 && (
                  <div className="rounded-xl border border-hairline bg-white p-6">
                    <h3 className="text-sm font-semibold text-ink mb-4">Top Performers</h3>
                    <div className="space-y-3">
                      {roi.perAgentROI.slice(0, 5).map(agent => (
                        <div key={agent.agentId} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-orq8-green/10 flex items-center justify-center text-xs font-bold text-orq8-green">
                            {agent.agentName.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-ink truncate">{agent.agentName}</div>
                            <div className="text-2xs text-muted">{agent.role.replace(/_/g, " ")}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-ink font-mono">{formatCurrency(agent.estimatedCostSaved)}</div>
                            <div className="text-2xs text-muted">{agent.tasksCompleted} tasks</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Per-Agent Tab */}
            {activeTab === "agents" && (
              <div className="mt-6">
                {roi.perAgentROI.length === 0 ? (
                  <div className="rounded-xl border border-hairline bg-white p-10 text-center">
                    <Users className="mx-auto h-8 w-8 text-muted/40" />
                    <p className="mt-3 text-sm font-medium text-ink">No agents yet</p>
                    <p className="mt-1 text-xs text-muted">Hire AI employees to start generating ROI.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-hairline bg-white overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-hairline bg-muted/5">
                          <th className="px-4 py-3 text-left text-2xs font-semibold text-muted uppercase">Agent</th>
                          <th className="px-4 py-3 text-right text-2xs font-semibold text-muted uppercase">Tasks</th>
                          <th className="px-4 py-3 text-right text-2xs font-semibold text-muted uppercase">Success</th>
                          <th className="px-4 py-3 text-right text-2xs font-semibold text-muted uppercase">Hours Saved</th>
                          <th className="px-4 py-3 text-right text-2xs font-semibold text-muted uppercase">Cost Saved</th>
                          <th className="px-4 py-3 text-right text-2xs font-semibold text-muted uppercase">Credits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roi.perAgentROI.map(agent => (
                          <tr key={agent.agentId} className="border-b border-hairline/50 hover:bg-muted/5">
                            <td className="px-4 py-3">
                              <div className="text-xs font-semibold text-ink">{agent.agentName}</div>
                              <div className="text-2xs text-muted">{agent.role.replace(/_/g, " ")}</div>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-mono text-ink">{agent.tasksCompleted}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-xs font-mono ${agent.successRate >= 80 ? "text-orq8-green" : agent.successRate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                {agent.successRate}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-mono text-ink">{agent.estimatedHoursSaved}</td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-orq8-green font-mono">{formatCurrency(agent.estimatedCostSaved)}</td>
                            <td className="px-4 py-3 text-right text-xs font-mono text-muted">{agent.creditsUsed.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Departments Tab */}
            {activeTab === "departments" && (
              <div className="mt-6 space-y-4">
                {roi.departmentROI.length === 0 ? (
                  <div className="rounded-xl border border-hairline bg-white p-10 text-center">
                    <BarChart3 className="mx-auto h-8 w-8 text-muted/40" />
                    <p className="mt-3 text-sm font-medium text-ink">No department data</p>
                    <p className="mt-1 text-xs text-muted">Assign agents to departments to see breakdown.</p>
                  </div>
                ) : (
                  roi.departmentROI.map(dept => (
                    <div key={dept.departmentId ?? "unassigned"} className="rounded-xl border border-hairline bg-white p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-ink">{dept.departmentName}</h4>
                          <span className="text-2xs text-muted">{dept.agentCount} agent{dept.agentCount !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-orq8-green font-mono">{formatCurrency(dept.estimatedCostSaved)}</div>
                          <div className="text-2xs text-muted">{formatHours(dept.estimatedHoursSaved)} saved</div>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orq8-green transition-all"
                          style={{ width: `${Math.min((dept.estimatedCostSaved / (roi.totalEstimatedCostSaved || 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Trends Tab */}
            {activeTab === "trends" && (
              <div className="mt-6 space-y-4">
                {/* Weekly */}
                <div className="rounded-xl border border-hairline bg-white p-6">
                  <h3 className="text-sm font-semibold text-ink mb-4">Weekly Output</h3>
                  <MiniBarChart
                    data={roi.weeklyTrend.map(w => w.estimatedCostSaved)}
                    maxVal={Math.max(...roi.weeklyTrend.map(w => w.estimatedCostSaved), 1)}
                  />
                  <div className="flex items-center justify-between mt-2 text-2xs text-muted">
                    {(() => {
                      const first = roi.weeklyTrend[0];
                      const last = roi.weeklyTrend[roi.weeklyTrend.length - 1];
                      return first && last ? (
                        <>
                          <span>{formatWeek(first.weekStart)}</span>
                          <span>{formatWeek(last.weekStart)}</span>
                        </>
                      ) : null;
                    })()}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    {roi.weeklyTrend.slice(-4).map(w => (
                      <div key={w.weekStart} className="rounded-lg bg-muted/5 p-2">
                        <div className="text-2xs text-muted">{formatWeek(w.weekStart)}</div>
                        <div className="text-xs font-semibold text-ink font-mono">{formatCurrency(w.estimatedCostSaved)}</div>
                        <div className="text-2xs text-muted">{w.tasksCompleted} tasks</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Monthly */}
                <div className="rounded-xl border border-hairline bg-white p-6">
                  <h3 className="text-sm font-semibold text-ink mb-4">Monthly Output</h3>
                  <MiniBarChart
                    data={roi.monthlyTrend.map(m => m.estimatedCostSaved)}
                    maxVal={Math.max(...roi.monthlyTrend.map(m => m.estimatedCostSaved), 1)}
                  />
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {roi.monthlyTrend.slice(-3).map(m => (
                      <div key={m.weekStart} className="rounded-lg bg-muted/5 p-2">
                        <div className="text-2xs text-muted">{new Date(m.weekStart).toLocaleDateString(undefined, { month: "short" })}</div>
                        <div className="text-xs font-semibold text-ink font-mono">{formatCurrency(m.estimatedCostSaved)}</div>
                        <div className="text-2xs text-muted">{m.tasksCompleted} tasks</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Rate Modal */}
        {showRateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowRateModal(false)}>
            <div className="w-full max-w-sm rounded-xl border border-hairline bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Hourly Rate Setting</h3>
                <button onClick={() => setShowRateModal(false)} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
              </div>
              <p className="text-xs text-muted mb-3">
                The hourly rate used to calculate cost savings. Default is $75/hr (senior employee equivalent).
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">$</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={rateInput}
                  onChange={e => setRateInput(e.target.value)}
                  className="flex-1 rounded-lg border border-hairline px-3 py-2 text-sm text-ink font-mono focus:outline-none focus:ring-1 focus:ring-orq8-green"
                />
                <span className="text-xs text-muted">/hr</span>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowRateModal(false)} className="px-3 py-1.5 text-xs text-muted hover:text-ink">Cancel</button>
                <button onClick={updateRate} className="rounded-lg bg-orq8-green px-4 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageErrorBoundary>
  );
}
