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

import { QuickActionsHub } from "../../components/dashboard/QuickActionsHub";
import { ExecutiveAgentPanel } from "../../components/dashboard/ExecutiveAgentPanel";
import { ActivityFeed } from "../../components/dashboard/ActivityFeed";
import { HealthScore } from "../../components/dashboard/HealthScore";
import { GoalExecutionPanel } from "../../components/dashboard/GoalExecutionPanel";
import { fetchWithAuth, formatCost } from "../../lib/api";

export const metadata = { title: "Dashboard — ORQ8" };

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

const fetchDashboardData = () => fetchWithAuth<DashboardData>("/v1/dashboard");
const fetchAgents = () => fetchWithAuth<Agent[]>("/v1/agents");
const fetchApprovals = () => fetchWithAuth<Approval[]>("/v1/approvals?status=pending");

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
      className="group rounded-xl border border-gray-100 bg-white p-5 transition-all hover:border-gray-200 hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1">
        <span className="text-xs text-gray-400">{subtext}</span>
        <ArrowUpRight className="h-3 w-3 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  );
}



export default async function AppPage() {
  const [dashboard, agents, approvals] = await Promise.all([
    fetchDashboardData(),
    fetchAgents(),
    fetchApprovals(),
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
  if (pendingApprovals > 0) attentionItems.push({ icon: ClipboardCheck, text: `${pendingApprovals} approval${pendingApprovals !== 1 ? 's' : ''} waiting for your decision`, href: '/app/approvals', color: 'text-[#E86A33]' });
  if (credits?.isCritical) attentionItems.push({ icon: Zap, text: 'Work credits critically low — AI employees may pause', href: '/app/budgets', color: 'text-red-500' });
  if (credits?.isLow && !credits?.isCritical) attentionItems.push({ icon: Zap, text: `Only ${credits.remaining} credits remaining`, href: '/app/budgets', color: 'text-amber-600' });
  const recentFailed = recentActivity.filter(e => e.type.toLowerCase().includes('failed'));
  if (recentFailed.length > 0) attentionItems.push({ icon: AlertTriangle, text: `${recentFailed.length} task${recentFailed.length !== 1 ? 's' : ''} failed recently`, href: '/app/goals', color: 'text-red-500' });
  if (activeAgents === 0 && agentList.length > 0) attentionItems.push({ icon: Bot, text: 'All AI employees are paused', href: '/app/agents', color: 'text-gray-500' });
  if (agentList.length === 0) attentionItems.push({ icon: Bot, text: 'No AI employees yet — hire your first agent to get started', href: '/app/agents', color: 'text-[#1a5c2e]' });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Welcome banner */}
      <div className="rounded-xl bg-[#0a0a0b] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B8FF66]">
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
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E86A33]/15 text-[#E86A33]">
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
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#B8FF66]/15 text-[#B8FF66]">
                  <Bot className="h-4 w-4" />
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
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B8FF66]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#B8FF66]" />
              System Online
            </p>
            <p className="text-2xl font-bold tracking-tight">ORQ8</p>
            <p className="text-xs text-white/50">Company of One</p>
          </div>
        </div>
      </div>

      {/* Needs Your Attention — surfaced when items exist */}
      {attentionItems.length > 0 && (
        <div className="rounded-xl border border-[#E86A33]/20 bg-[#E86A33]/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E86A33]/15">
              <AlertTriangle className="h-3.5 w-3.5 text-[#E86A33]" />
            </span>
            <h2 className="text-sm font-semibold text-gray-900">Needs your attention</h2>
          </div>
          <ul className="space-y-2">
            {attentionItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={i}>
                  <Link href={item.href} className="group flex items-center gap-3 rounded-lg bg-white p-3 transition-colors hover:border-gray-200 border border-transparent">
                    <Icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                    <span className="flex-1 text-sm text-gray-700 group-hover:text-gray-900">{item.text}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="AI Employees"
          value={activeAgents}
          subtext={`${agentList.length} total`}
          icon={Bot}
          color="bg-[#B8FF66]/10 text-[#1a5c2e]"
          href="/app/agents"
        />
        <StatCard
          label="Tasks"
          value={totalTasks}
          subtext={`${completedTasks} completed`}
          icon={CheckCircle2}
          color="bg-[#E86A33]/10 text-[#E86A33]"
          href="/app/goals"
        />
        <StatCard
          label="Work Credits"
          value={credits ? credits.remaining : 0}
          subtext={credits ? `${credits.utilizationPercent}% used` : '0 remaining'}
          icon={Zap}
          color="bg-[#B8FF66]/10 text-[#1a5c2e]"
          href="/app/budgets"
        />
        <StatCard
          label="Weekly Spend"
          value={formatCost(weeklySpend)}
          subtext="This week"
          icon={Wallet}
          color="bg-[#E86A33]/10 text-[#E86A33]"
          href="/app/budgets"
        />
      </div>

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
          <div className="mt-4 rounded-xl border border-gray-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Command className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-500">Send a command</p>
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
    </div>
  );
}
