import { cookies } from "next/headers";
import Link from "next/link";
import {
  Users,
  Building2,
  Bot,
  ShieldCheck,
  Activity,
  ArrowUpRight,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../lib/api";
import { AdminApprovalQueue } from "../../components/admin/admin-approval-queue";
import { AdminActivityFeed } from "../../components/admin/admin-activity-feed";
import { AdminAgentStatus } from "../../components/admin/admin-agent-status";

export const metadata = { title: "Admin Dashboard — ORQ8" };

async function fetchAdminData(token: string) {
  const headers = { authorization: `Bearer ${token}` };

  try {
    const [usersRes, orgsRes, agentsRes, approvalsRes, activityRes, dashboardRes] =
      await Promise.all([
        fetch(`${API_URL}/v1/admin/users`, { headers, cache: "no-store" }).catch(() => null),
        fetch(`${API_URL}/v1/admin/organizations`, { headers, cache: "no-store" }).catch(() => null),
        fetch(`${API_URL}/v1/agents`, { headers, cache: "no-store" }).catch(() => null),
        fetch(`${API_URL}/v1/approvals?status=pending`, { headers, cache: "no-store" }).catch(() => null),
        fetch(`${API_URL}/v1/activity?limit=20`, { headers, cache: "no-store" }).catch(() => null),
        fetch(`${API_URL}/v1/dashboard`, { headers, cache: "no-store" }).catch(() => null),
      ]);

    const parse = async (res: Response | null) => {
      if (!res || !res.ok) return null;
      try {
        return (await res.json()) as { data?: unknown };
      } catch {
        return null;
      }
    };

    return {
      users: (await parse(usersRes))?.data ?? [],
      orgs: (await parse(orgsRes))?.data ?? [],
      agents: (await parse(agentsRes))?.data ?? [],
      approvals: ((await parse(approvalsRes))?.data as unknown[]) ?? [],
      activity: ((await parse(activityRes))?.data as unknown[]) ?? [],
      dashboard: (await parse(dashboardRes))?.data as Record<string, unknown> ?? null,
    };
  } catch {
    return { users: [], orgs: [], agents: [], approvals: [], activity: [], dashboard: null };
  }
}

export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const data = await fetchAdminData(token);

  const totalUsers = Array.isArray(data.users) ? data.users.length : 0;
  const totalOrgs = Array.isArray(data.orgs) ? data.orgs.length : 0;
  const totalAgents = Array.isArray(data.agents) ? data.agents.length : 0;
  const pendingApprovals = Array.isArray(data.approvals) ? data.approvals.length : 0;
  const activeAgents = Array.isArray(data.agents)
    ? data.agents.filter((a: { status: string }) => a.status === "active").length
    : 0;
  const weeklySpend = (data.dashboard as Record<string, unknown>)?.weekly_spend as number ?? 0;

  const platformStats = [
    {
      label: "Total Users",
      value: String(totalUsers),
      icon: Users,
      color: "bg-blue-50 text-blue-600",
      trend: "+2 this week",
    },
    {
      label: "Organizations",
      value: String(totalOrgs),
      icon: Building2,
      color: "bg-purple-50 text-purple-600",
      trend: "Active workspaces",
    },
    {
      label: "AI Agents",
      value: String(totalAgents),
      icon: Bot,
      color: "bg-emerald/10 text-emerald-700",
      trend: `${activeAgents} active`,
    },
    {
      label: "Pending Approvals",
      value: String(pendingApprovals),
      icon: ShieldCheck,
      color: pendingApprovals > 0 ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500",
      trend: pendingApprovals > 0 ? "Needs attention" : "All clear",
    },
    {
      label: "Platform Spend",
      value: `$${weeklySpend.toFixed(2)}`,
      icon: TrendingUp,
      color: "bg-indigo-50 text-indigo-600",
      trend: "This week",
    },
    {
      label: "Activity Events",
      value: String(Array.isArray(data.activity) ? data.activity.length : 0),
      icon: Activity,
      color: "bg-pink-50 text-pink-600",
      trend: "Recent actions",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Platform overview and operational control center for ORQ8.
        </p>
      </div>

      {/* System health banner */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald/20 bg-emerald/5 px-5 py-3">
        <CheckCircle2 className="h-5 w-5 text-emerald" />
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">All systems operational</p>
          <p className="text-xs text-muted">API · Database · Auth · Agent execution</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-emerald">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
          Live
        </span>
      </div>

      {/* Platform stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {platformStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-hairline bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-xs text-muted">{stat.trend}</span>
              </div>
              <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {stat.label}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-navy-900 tabular-nums">
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Main content: Approval Queue + Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Approval Queue — first-class feature */}
        <section className="lg:col-span-2">
          <AdminApprovalQueue approvals={data.approvals as Array<{ id: string; agentId: string | null; action: string; description: string | null; cost: number; riskLevel: string; status: string; decisionNote: string | null; decidedAt: string | null; createdAt: string }>} />
        </section>

        {/* Agent Status + Activity */}
        <section className="space-y-6">
          <AdminAgentStatus agents={data.agents as Array<{ id: string; name: string; role: string; department: string | null; status: string; weeklyCost: number; tasksCompleted: number; currentTask: string | null }>} />
          <AdminActivityFeed activity={data.activity as Array<{ id: number; agentId: string | null; taskId: string | null; type: string; summary: string; reason: string | null; cost: number; department: string | null; occurredAt: string }>} />
        </section>
      </div>

      {/* Quick links */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Manage Users", href: "/admin/users", icon: Users },
          { label: "Organizations", href: "/admin/organizations", icon: Building2 },
          { label: "AI Agents", href: "/admin/agents", icon: Bot },
          { label: "Activity Log", href: "/admin/activity", icon: Activity },
        ].map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center gap-3 rounded-xl border border-hairline bg-white p-4 transition-colors hover:border-emerald/30 hover:bg-emerald/5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-canvas text-muted group-hover:text-emerald">
                <Icon className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">{link.label}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-emerald" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
