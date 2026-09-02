import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { CommandBar } from "../../components/command-bar";
import { DashboardRealtime } from "../../components/dashboard-realtime";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

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

async function fetchDashboardData(): Promise<DashboardData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/v1/dashboard`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: DashboardData };
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function fetchAgents(): Promise<Agent[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/v1/agents`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Agent[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

async function fetchApprovals(): Promise<Approval[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/v1/approvals?status=pending`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Approval[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

async function checkOnboarding(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return true;
  try {
    const res = await fetch(`${API_URL}/v1/onboarding`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return true;
    const json = await res.json();
    const state = json.data;
    if (state && !state.completedAt) return false;
    return true;
  } catch {
    return true;
  }
}

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
      className="group rounded-xl border border-hairline bg-white p-5 transition-all hover:border-navy-200 hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-navy-900">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1">
        <span className="text-xs text-muted">{subtext}</span>
        <ArrowUpRight className="h-3 w-3 text-muted/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  );
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTimeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export default async function AppPage() {
  const onboardingComplete = await checkOnboarding();
  if (!onboardingComplete) redirect("/onboarding");

  const [dashboard, agents, approvals] = await Promise.all([
    fetchDashboardData(),
    fetchAgents(),
    fetchApprovals(),
  ]);

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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Welcome banner */}
      <div className="rounded-xl bg-navy-950 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
              {today}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Here&apos;s what&apos;s happening in your organization.
            </p>

            <div className="mt-6 flex flex-wrap gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime/20 text-lime">
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {pendingApprovals} pending approval{pendingApprovals !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-white/50">Awaiting your decision</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald/20 text-emerald">
                  <Bot className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {activeAgents} active agent{activeAgents !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-white/50">
                    {agents.length > 0
                      ? `${agents.length} total in your roster`
                      : "Hire agents to get started"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* System status */}
          <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-center md:min-w-[160px]">
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-lime">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
              System Online
            </p>
            <p className="text-2xl font-bold tracking-tight">ORQ8</p>
            <p className="text-xs text-white/50">Company of One</p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="AI Employees"
          value={activeAgents}
          subtext={`${agents.length} total`}
          icon={Bot}
          color="bg-emerald/10 text-emerald"
          href="/app/agents"
        />
        <StatCard
          label="Tasks"
          value={totalTasks}
          subtext={`${completedTasks} completed`}
          icon={CheckCircle2}
          color="bg-secondary-50 text-secondary-600"
          href="/app/goals"
        />
        <StatCard
          label="Work Credits"
          value={credits ? credits.remaining : 0}
          subtext={credits ? `${credits.utilizationPercent}% used` : "0 remaining"}
          icon={Zap}
          color="bg-purple-50 text-purple-600"
          href="/app/budgets"
        />
        <StatCard
          label="Weekly Spend"
          value={formatCost(weeklySpend)}
          subtext="This week"
          icon={Wallet}
          color="bg-amber-50 text-amber-600"
          href="/app/budgets"
        />
      </div>

      {/* Command Center */}
      <div className="rounded-xl border border-hairline bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900">
            <span className="text-xs font-bold text-white">⌘</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Command Center</h2>
            <p className="text-xs text-muted">Give ORQ8 a natural language command</p>
          </div>
        </div>
        <CommandBar />
      </div>

      {/* Live dashboard data */}
      <DashboardRealtime
        initialStats={{
          activeAgents,
          pendingApprovals,
          weeklySpend,
          recentActivityCount: recentActivity.length,
          totalGoals: dashboard?.total_goals ?? 0,
          activeGoals: dashboard?.active_goals ?? 0,
          totalTasks,
          completedTasks,
          credits,
        }}
        initialApprovals={approvals}
        initialAgents={agents}
        initialActivity={recentActivity}
      />
    </div>
  );
}
