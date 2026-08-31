import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ClipboardCheck,
  Activity,
  Users,
} from "lucide-react";
import { CommandBar } from "../../components/command-bar";
import { DashboardRealtime } from "../../components/dashboard-realtime";
import { PageShell } from "../../components/page-shell";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

export const metadata = { title: "Dashboard" };

// Types for real API data
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

interface AgentListData {
  data: Agent[];
}

interface ApprovalListData {
  data: Approval[];
}

interface DashboardResponse {
  data: DashboardData;
}

/** Fetch dashboard data from the API, forwarding the session cookie. */
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
    const json = (await res.json()) as DashboardResponse;
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch agents from the API. */
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
    const json = (await res.json()) as AgentListData;
    return json.data ?? [];
  } catch {
    return [];
  }
}

/** Fetch pending approvals from the API. */
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
    const json = (await res.json()) as ApprovalListData;
    return json.data ?? [];
  } catch {
    return [];
  }
}



/** Check if onboarding is complete. Redirect if not. */
async function checkOnboarding(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return true; // Let auth middleware handle unauthenticated

  try {
    const res = await fetch(`${API_URL}/v1/onboarding`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return true; // Can't check — let dashboard render
    const json = await res.json();
    const state = json.data;
    // If onboarding exists and is NOT complete, redirect
    if (state && !state.completedAt) {
      return false;
    }
    return true;
  } catch {
    return true; // API unreachable — let dashboard render
  }
}

export default async function AppPage() {
  // Check onboarding before rendering dashboard
  const onboardingComplete = await checkOnboarding();
  if (!onboardingComplete) {
    redirect("/onboarding");
  }

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
  const weeklySpend = dashboard?.weekly_spend ?? 0;
  const totalGoals = dashboard?.total_goals ?? 0;
  const activeGoals = dashboard?.active_goals ?? 0;
  const totalTasks = dashboard?.total_tasks ?? 0;
  const completedTasks = dashboard?.completed_tasks ?? 0;
  const credits = dashboard?.credits ?? null;
  const recentActivity = dashboard?.recent_activity ?? [];

  return (
    <PageShell pageName="Dashboard" backHref="/login">
    <div className="mx-auto max-w-6xl">
      {/* Row 1: Welcome banner */}
      <div className="rounded-xl bg-navy-950 p-6 text-white sm:p-8">
        <div className="relative md:pr-[240px]">
          <div className="md:py-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
              {today}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Good morning, Founder
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Here&apos;s what&apos;s happening in your company today.
            </p>

            <div className="mt-6 border-t border-white/10 pb-6 pt-6 sm:flex sm:items-center sm:gap-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime text-navy-950">
                  <ClipboardCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {pendingApprovals} {pendingApprovals === 1 ? "Approval" : "Approvals"} waiting
                  </p>
                  <p className="text-xs text-white/60">Need your sign-off</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 sm:mt-0">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald text-navy-950">
                  <Activity className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {activeAgents} {activeAgents === 1 ? "Agent" : "Agents"} working
                  </p>
                  <p className="text-xs text-white/60">
                    {agents.length > 0
                      ? `${agents.length} total in your roster`
                      : "Hire agents to get started"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* System status */}
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-center md:absolute md:right-0 md:top-1/2 md:mt-0 md:w-[210px] md:-translate-y-1/2">
            <p className="flex items-center justify-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-lime">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
              System online
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-white">
              ORQ8
            </p>
            <p className="mt-1 text-xs text-white/60">Company of One</p>
          </div>
        </div>
      </div>

      {/* Row 2: Command Bar */}
      <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
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

      {/* Row 3–5: Live dashboard data via SSE */}
      <div className="mt-6">
        <DashboardRealtime
          initialStats={{
            activeAgents,
            pendingApprovals,
            weeklySpend,
            recentActivityCount: recentActivity.length,
            totalGoals,
            activeGoals,
            totalTasks,
            completedTasks,
            credits,
          }}
          initialApprovals={approvals}
          initialAgents={agents}
          initialActivity={recentActivity}
        />
      </div>
    </div>
    </PageShell>
  );
}
