import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  ListChecks,
  PencilLine,
  Users,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { CommandBar } from "../../components/command-bar";
import { ApprovalActions } from "../../components/approval-actions";
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

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

function riskBadge(risk: string) {
  if (risk === "high") return "bg-red-100 text-red-700";
  if (risk === "medium") return "bg-amber-50 text-amber-700";
  return "bg-emerald/15 text-emerald-700";
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
  const recentActivity = dashboard?.recent_activity ?? [];

  const stats = [
    {
      label: "Agents active",
      value: String(activeAgents).padStart(2, "0"),
      note: activeAgents === 1 ? "working right now" : "working right now",
      icon: Users,
      accent: "bg-emerald/10 text-emerald-700",
    },
    {
      label: "Tasks this week",
      value: String(recentActivity.length).padStart(2, "0"),
      note: `${recentActivity.length} recent actions`,
      icon: ListChecks,
      accent: "bg-indigo-50 text-indigo-700",
    },
    {
      label: "Weekly spend",
      value: formatCost(Math.round(weeklySpend * 100)),
      note: weeklySpend > 0 ? "this week" : "no spend yet",
      icon: CircleDollarSign,
      accent: "bg-amber-50 text-amber-700",
    },
    {
      label: "Approvals pending",
      value: String(pendingApprovals).padStart(2, "0"),
      note: pendingApprovals === 1 ? "needs your sign-off" : "need your sign-off",
      icon: ClipboardCheck,
      accent: "bg-red-50 text-red-600",
    },
  ];

  return (
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

      {/* Row 3: Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-hairline bg-white p-4 sm:p-5"
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.accent}`}
            >
              <s.icon className="h-4 w-4" />
            </span>
            <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {s.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-navy-900 tabular-nums">
              {s.value}
            </p>
            <p className="mt-0.5 text-xs text-muted">{s.note}</p>
          </div>
        ))}
      </div>

      {/* Row 4: Decision Center + Agent Roster */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Pending Approvals */}
        <section
          aria-labelledby="approvals-heading"
          className="rounded-xl border border-hairline bg-white lg:col-span-2"
        >
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2 id="approvals-heading" className="text-sm font-semibold text-ink">
              Decision Center
            </h2>
            <Link
              href="/app/approvals"
              className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
            >
              All requests <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {approvals.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <ClipboardCheck className="mx-auto h-8 w-8 text-muted/40" />
              <p className="mt-3 text-sm font-medium text-ink">No pending approvals</p>
              <p className="mt-1 text-xs text-muted">
                When AI employees propose actions, they&apos;ll appear here for your review.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-canvas text-left">
                    {["Request", "What", "Risk", "Cost", "Action"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {approvals.slice(0, 5).map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-muted">
                        #{a.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm text-ink">
                          <span className="font-semibold">{a.action}</span>
                          {a.description && (
                            <span className="text-muted"> — {a.description}</span>
                          )}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${riskBadge(a.riskLevel)}`}
                        >
                          {a.riskLevel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-muted">
                        {formatCost(a.cost)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <ApprovalActions approvalId={a.id} status={a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Agent Roster Summary */}
        <section
          aria-labelledby="agents-heading"
          className="rounded-xl border border-hairline bg-white p-5"
        >
          <div className="flex items-center justify-between">
            <h2 id="agents-heading" className="text-sm font-semibold text-ink">
              AI Workforce
            </h2>
            <Link
              href="/app/agents"
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
            >
              View all
            </Link>
          </div>
          {agents.length === 0 ? (
            <div className="mt-6 text-center">
              <Users className="mx-auto h-8 w-8 text-muted/40" />
              <p className="mt-3 text-sm font-medium text-ink">No agents yet</p>
              <p className="mt-1 text-xs text-muted">
                Hire your first AI employee to start building your team.
              </p>
              <Link
                href="/app/agents"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-lime hover:text-navy-950"
              >
                <Users className="h-3.5 w-3.5" /> Hire an agent
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {agents.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-emerald">
                    {a.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                    <p className="truncate text-xs text-muted">{a.role}</p>
                  </div>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      a.status === "active" ? "bg-emerald" : "bg-muted"
                    }`}
                    title={a.status}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Row 5: Recent agent actions */}
      <section
        aria-labelledby="recent-heading"
        className="mt-6 rounded-xl border border-hairline bg-white"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 id="recent-heading" className="text-sm font-semibold text-ink">
            Recent agent actions
          </h2>
          <Link
            href="/app/activity"
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
          >
            Full log <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Activity className="mx-auto h-8 w-8 text-muted/40" />
            <p className="mt-3 text-sm font-medium text-ink">No activity yet</p>
            <p className="mt-1 text-xs text-muted">
              Agent actions will appear here as your AI workforce executes tasks.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {recentActivity.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-start gap-4 px-5 py-3.5">
                <time className="mt-0.5 w-11 shrink-0 font-mono text-xs tabular-nums text-muted">
                  {formatTime(a.occurredAt)}
                </time>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-semibold">{a.type}</span> {a.summary}
                  </p>
                  {a.reason && (
                    <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted">
                      <span aria-hidden className="font-mono font-semibold text-emerald">
                        because
                      </span>
                      {a.reason}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                  {formatCost(a.cost)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
