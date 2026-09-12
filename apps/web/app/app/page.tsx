import Link from "next/link";

import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Command,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { CommandBar } from "../../components/command-bar";
import { ReliabilityWidget } from "../../components/dashboard/ReliabilityWidget";
import { ModelPerformanceWidget } from "../../components/dashboard/ModelPerformanceWidget";
import { DepartmentActivityWidget } from "../../components/dashboard/DepartmentActivityWidget";

import { QuickActionsHub } from "../../components/dashboard/QuickActionsHub";
import { ContrastSelfCheck } from "../../components/contrast-self-check";
import { ExecutiveAgentPanel } from "../../components/dashboard/ExecutiveAgentPanel";
import { ActivityFeed } from "../../components/dashboard/ActivityFeed";
import { HealthScore } from "../../components/dashboard/HealthScore";
import { GoalExecutionPanel } from "../../components/dashboard/GoalExecutionPanel";
import { fetchWithAuth, formatCost } from "../../lib/api";

export const metadata = { title: "Dashboard" };

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

interface Approval {
  id: string;
  agentId: string | null;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
  status: string;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface ActivityEvent {
  id: number;
  agentId: string | null;
  taskId: string | null;
  type: string;
  summary: string;
  reason: string | null;
  cost: number;
  department: string | null;
  occurredAt: string;
}

interface DashboardData {
  active_agents: number;
  pending_approvals: number;
  weekly_spend: number;
  total_goals: number;
  active_goals: number;
  total_tasks: number;
  completed_tasks: number;
  credits: {
    total: number;
    used: number;
    remaining: number;
    utilizationPercent: number;
    isLow: boolean;
    isCritical: boolean;
    daysRemaining: number | null;
  } | null;
  recent_activity: ActivityEvent[];
}

interface DepartmentProgress {
  departmentId: string;
  departmentName: string;
  taskCount: number;
  completedTaskCount: number;
  activeTaskCount: number;
  blockedTaskCount: number;
  recentOutputs: number;
  agentCount: number;
  activeAgentCount: number;
  progressPct: number;
  status: string;
}

interface CompanyProgressData {
  overallPct: number;
  maturityStage: string;
  departments: DepartmentProgress[];
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  blockedTasks: number;
  recentOutputs: number;
  attentionNeeded: string[];
}

const fetchDashboardData = () => fetchWithAuth<DashboardData>("/v1/dashboard");
const fetchAgents = () => fetchWithAuth<Agent[]>("/v1/agents");
const fetchApprovals = () => fetchWithAuth<Approval[]>("/v1/approvals?status=pending");
const fetchCompanyProgress = () => fetchWithAuth<CompanyProgressData>("/v1/company-progress");
const fetchOrgInfo = () => fetchWithAuth<{ memberships: { org: { id: string; name: string; slug: string; plan: string }; role: string }[]; active_org_id: string | null }>("/v1/auth/me");

function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  color,
  href,
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: React.ElementType;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-hairline bg-white p-5 transition-all hover:border-hairline hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span data-contrast-check="stat-card-label" className="text-xs font-medium text-muted">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p data-contrast-check="stat-card-value" className="mt-2 text-2xl font-bold tracking-tight text-ink">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1">
        <span data-contrast-check="stat-card-subtext" className="text-xs text-muted">{subtext}</span>
        <ArrowUpRight className="h-3 w-3 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  );
}



export default async function AppPage() {
  const [dashboard, agents, approvals, companyProgress, orgInfo] = await Promise.all([
    fetchDashboardData(),
    fetchAgents(),
    fetchApprovals(),
    fetchCompanyProgress(),
    fetchOrgInfo(),
  ]);

  const agentList = agents ?? [];
  const approvalList = approvals ?? [];

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const activeAgents = dashboard?.active_agents ?? 0;
  const pendingApprovals = dashboard?.pending_approvals ?? 0;
  const totalTasks = dashboard?.total_tasks ?? 0;
  const completedTasks = dashboard?.completed_tasks ?? 0;
  const weeklySpend = dashboard?.weekly_spend ?? 0;
  const credits = dashboard?.credits ?? null;
  const recentActivity = dashboard?.recent_activity ?? [];

  const attentionItems: Array<{ icon: React.ElementType; text: string; href: string; color: string }> = [];
  if (pendingApprovals > 0) attentionItems.push({ icon: ClipboardCheck, text: `${pendingApprovals} approval${pendingApprovals !== 1 ? 's' : ''} waiting for your decision`, href: '/app/approvals', color: 'text-orq8-orange' });
  if (credits?.isCritical) attentionItems.push({ icon: Zap, text: 'Work credits critically low — AI employees may pause', href: '/app/budgets', color: 'text-red-500' });
  if (credits?.isLow && !credits?.isCritical) attentionItems.push({ icon: Zap, text: `Only ${credits.remaining} credits remaining`, href: '/app/budgets', color: 'text-amber-600' });
  const recentFailed = recentActivity.filter(e => e.type.toLowerCase().includes('failed'));
  if (recentFailed.length > 0) attentionItems.push({ icon: AlertTriangle, text: `${recentFailed.length} task${recentFailed.length !== 1 ? 's' : ''} failed recently`, href: '/app/goals', color: 'text-red-500' });
  if (activeAgents === 0 && agentList.length > 0) attentionItems.push({ icon: Bot, text: 'All AI employees are paused', href: '/app/agents', color: 'text-muted' });
  if (agentList.length === 0) attentionItems.push({ icon: Bot, text: 'No AI employees yet — hire your first agent to get started', href: '/app/agents', color: 'text-orq8-green' });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Welcome banner */}
      <div className="rounded-xl bg-orq8-dark p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-lime">
              {today}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Company at a glance
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Your AI workforce is {activeAgents > 0 ? `running ${activeAgents} active agent${activeAgents !== 1 ? 's' : ''}` : 'waiting for you to get started'}.
            </p>

            <div className="mt-6 flex flex-wrap gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orq8-orange/15 text-orq8-orange">
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {pendingApprovals} pending approval{pendingApprovals !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-white/50">Awaiting your decision</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orq8-lime/15 text-orq8-lime">
                  <Bot aria-hidden="true" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {activeAgents} active agent{activeAgents !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-white/50">
                    {agentList.length > 0 ? `${agentList.length} total in your roster` : 'Hire agents to get started'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/70">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {completedTasks} task{completedTasks !== 1 ? 's' : ''} completed
                  </p>
                  <p className="text-xs text-white/50">{totalTasks} total tasks</p>
                </div>
              </div>
            </div>
          </div>

          {/* System status */}
          <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-center md:min-w-[160px]">
            <p className="flex items-center gap-1.5 font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-lime">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orq8-lime" />
              System Online
            </p>
            <p className="text-2xl font-bold tracking-tight">{orgInfo?.memberships?.find((m: { org: { id: string }; role: string }) => m.org.id === orgInfo?.active_org_id)?.org?.name ?? "My Company"}</p>
            <p className="text-xs text-white/50">{orgInfo?.memberships?.find((m: { org: { id: string }; role: string }) => m.org.id === orgInfo?.active_org_id)?.role === "owner" ? "Founder & CEO" : "Team Member"}</p>
          </div>
        </div>
      </div>

      {/* Needs Your Attention — surfaced when items exist */}
      {attentionItems.length > 0 && (
        <div className="rounded-xl border border-orq8-orange/20 bg-orq8-orange/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orq8-orange/15">
              <AlertTriangle className="h-3.5 w-3.5 text-orq8-orange" />
            </span>
            <h2 className="text-sm font-semibold text-ink">Needs your attention</h2>
          </div>
          <ul className="space-y-2">
            {attentionItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={i}>
                  <Link href={item.href} className="group flex items-center gap-3 rounded-lg bg-white p-3 transition-colors hover:border-hairline border border-transparent">
                    <Icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                    <span className="flex-1 text-sm text-ink group-hover:text-ink">{item.text}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted group-hover:text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Company Progress — real progress from goals, tasks, activity */}
      {companyProgress && companyProgress.totalTasks > 0 && (
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
                Company Progress
              </p>
              <h2 className="mt-1 text-lg font-semibold text-ink">
                {companyProgress.maturityStage}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-ink">{companyProgress.overallPct}%</p>
              <p className="text-xs text-muted">Overall progress</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-3 rounded-full bg-hairline overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orq8-green to-orq8-lime transition-all duration-500"
              style={{ width: `${companyProgress.overallPct}%` }}
            />
          </div>

          {/* Department breakdown */}
          {companyProgress.departments.length > 0 && (
            <div className="space-y-2">
              {companyProgress.departments.map((dept) => (
                <div key={dept.departmentId} className="flex items-center gap-3">
                  <span className="w-32 truncate text-xs font-medium text-ink">
                    {dept.departmentName}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-hairline overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        dept.progressPct >= 70 ? 'bg-emerald-400' :
                        dept.progressPct >= 40 ? 'bg-amber-400' :
                        dept.progressPct > 0 ? 'bg-orange-400' : 'bg-gray-200'
                      }`}
                      style={{ width: `${Math.max(dept.progressPct, 2)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-xs text-muted">
                    {dept.progressPct}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Summary stats */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
            <span>{companyProgress.completedTasks} / {companyProgress.totalTasks} tasks completed</span>
            <span>·</span>
            <span>{companyProgress.activeTasks} active</span>
            {companyProgress.blockedTasks > 0 && (
              <>
                <span>·</span>
                <span className="text-red-500">{companyProgress.blockedTasks} blocked</span>
              </>
            )}
            <span>·</span>
            <span>{companyProgress.recentOutputs} outputs this week</span>
          </div>

          {/* Attention needed */}
          {companyProgress.attentionNeeded.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs font-medium text-amber-800">Attention needed:</p>
              <ul className="mt-1 space-y-0.5">
                {companyProgress.attentionNeeded.map((item, i) => (
                  <li key={i} className="text-xs text-amber-700">• {item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="AI Employees"
          value={activeAgents}
          subtext={`${agentList.length} total`}
          icon={Bot}
          color="bg-orq8-lime/10 text-orq8-green"
          href="/app/agents"
        />
        <StatCard
          label="Tasks"
          value={totalTasks}
          subtext={`${completedTasks} completed`}
          icon={CheckCircle2}
          color="bg-orq8-orange/10 text-orq8-orange"
          href="/app/goals"
        />
        <StatCard
          label="Work Credits"
          value={credits ? credits.remaining : 0}
          subtext={credits ? `${credits.utilizationPercent}% used` : '0 remaining'}
          icon={Zap}
          color="bg-orq8-lime/10 text-orq8-green"
          href="/app/budgets"
        />
        <StatCard
          label="Weekly Spend"
          value={formatCost(weeklySpend)}
          subtext="This week"
          icon={Wallet}
          color="bg-orq8-orange/10 text-orq8-orange"
          href="/app/budgets"
        />
      </div>

      {/* Daily Brief — what happened recently */}
      {recentActivity.length > 0 && (
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
              What happened recently
            </p>
          </div>
          <div className="space-y-2">
            {recentActivity.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-lg bg-canvas/50 px-3 py-2">
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  event.type.includes('completed') ? 'bg-emerald-400' :
                  event.type.includes('failed') ? 'bg-red-400' :
                  event.type.includes('created') ? 'bg-blue-400' :
                  'bg-gray-300'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink leading-snug">{event.summary}</p>
                  <p className="mt-0.5 text-2xs text-muted">
                    {new Date(event.occurredAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {event.department ? ` · ${event.department}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Company Health + Goal Execution — side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <HealthScore
          activeAgents={activeAgents}
          totalAgents={agentList.length}
          completedTasks={completedTasks}
          totalTasks={totalTasks}
          creditsRemaining={credits?.remaining ?? 0}
          creditsTotal={credits?.total ?? 100}
          pendingApprovals={pendingApprovals}
          activeGoals={dashboard?.active_goals ?? 0}
          totalGoals={dashboard?.total_goals ?? 0}
        />
        <GoalExecutionPanel
          totalGoals={dashboard?.total_goals ?? 0}
          activeGoals={dashboard?.active_goals ?? 0}
          completedTasks={completedTasks}
          totalTasks={totalTasks}
        />
      </div>

      {/* Agent Reliability */}
      <ReliabilityWidget />

      {/* Live department activity — real events, SSE primary + 60s poll fallback */}
      <DepartmentActivityWidget />

      {/* Model performance — measured signals from the §20/§7 pipeline */}
      <ModelPerformanceWidget />

      {/* Two-column layout: Executive Agent + Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Executive Agent Status Panel — left side */}
        <div className="lg:col-span-3">
          <ExecutiveAgentPanel
            agents={agentList}
            approvals={approvalList}
            dashboard={dashboard ?? null}
          />
          {/* Command bar below the panel */}
          <div className="mt-4 rounded-xl border border-hairline bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Command className="h-4 w-4 text-muted" />
              <p className="text-xs font-semibold text-muted">Send a command</p>
            </div>
            <CommandBar />
          </div>
        </div>

        {/* Activity Feed — right side */}
        <div className="lg:col-span-2">
          <ActivityFeed initialActivity={recentActivity} />
        </div>
      </div>

      {/* Quick Actions FAB */}
      <QuickActionsHub />

      {/* Dev-only contrast diagnostic — renders nothing in production */}
      <ContrastSelfCheck />
    </div>
  );
}
