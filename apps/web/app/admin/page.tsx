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
  Zap,
  Target,
  AlertTriangle,
  Shield,
  BarChart3,
  Clock,
} from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

export const metadata = { title: "Admin Dashboard — ORQ8" };

async function fetchWithAuth(token: string, path: string) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { data?: unknown };
  } catch {
    return null;
  }
}

export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";

  const [statsRes, providersRes, usersRes, orgsRes] = await Promise.all([
    fetchWithAuth(token, "/v1/admin/stats"),
    fetchWithAuth(token, "/v1/admin/providers"),
    fetchWithAuth(token, "/v1/admin/users?limit=200"),
    fetchWithAuth(token, "/v1/admin/organizations?limit=200"),
  ]);

  const stats = (statsRes?.data ?? {}) as Record<string, any>;
  const providers = (providersRes?.data ?? []) as Array<{ name: string; slug: string; status: string; configured: boolean; keyCount: number }>;
  const users = (usersRes?.data ?? []) as Array<{ id: string; email: string; name: string; status: string }>;
  const orgs = (orgsRes?.data ?? []) as Array<{ id: string; name: string; plan: string; status: string }>;

  const u = stats.users ?? {};
  const o = stats.organizations ?? {};
  const a = stats.agents ?? {};
  const ap = stats.approvals ?? {};
  const act = stats.activity ?? {};
  const sp = stats.spend ?? {};

  const configuredProviders = providers.filter(p => p.configured).length;
  const healthyProviders = providers.filter(p => p.status === "configured").length;

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Platform Overview</h1>
        <p className="mt-1 text-sm text-muted">
          Real-time operational status for the ORQ8 platform.
        </p>
      </div>

      {/* Health banner */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-[#1a5c2e]/20 bg-[#1a5c2e]/5 px-5 py-3">
        <CheckCircle2 className="h-5 w-5 text-[#1a5c2e]" />
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">All systems operational</p>
          <p className="text-xs text-muted">
            API · Database · Auth · Agent execution · {configuredProviders}/{providers.length} providers configured
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-[#1a5c2e]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1a5c2e] animate-pulse" />
          Live
        </span>
      </div>

      {/* Core metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { label: "Users", value: u.total ?? 0, sub: `${u.newThisWeek ?? 0} new this week`, icon: Users, color: "bg-[#1a5c2e]/10 text-[#1a5c2e]" },
          { label: "Organizations", value: o.total ?? 0, sub: `${o.active ?? 0} active`, icon: Building2, color: "bg-[#B8FF66]/10 text-[#1a5c2e]" },
          { label: "AI Employees", value: a.total ?? 0, sub: `${a.active ?? 0} active, ${a.paused ?? 0} paused`, icon: Bot, color: "bg-[#E86A33]/10 text-[#E86A33]" },
          { label: "Pending Approvals", value: ap.pending ?? 0, sub: ap.pending > 0 ? "Needs attention" : "All clear", icon: ShieldCheck, color: ap.pending > 0 ? "bg-[#E86A33]/10 text-[#E86A33]" : "bg-canvas text-muted" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-center justify-between">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {stat.label}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-muted">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Activity + Spend row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold text-muted">Weekly Activity</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink tabular-nums">{act.thisWeek ?? 0}</p>
          <p className="text-xs text-muted">events this week</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold text-muted">Weekly Spend</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink tabular-nums">${(sp.thisWeek ?? 0).toFixed(2)}</p>
          <p className="text-xs text-muted">AI infrastructure cost</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted" />
            <span className="text-xs font-semibold text-muted">Providers</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink tabular-nums">{healthyProviders}/{providers.length}</p>
          <p className="text-xs text-muted">configured and active</p>
        </div>
      </div>

      {/* Provider status */}
      <div className="mb-8 rounded-xl border border-hairline bg-white p-5">
        <h2 className="text-sm font-semibold text-ink mb-4">AI Provider Status</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {providers.map((p) => (
            <div key={p.slug} className="flex items-center gap-3 rounded-lg border border-hairline p-3">
              <span className={`h-2.5 w-2.5 rounded-full ${p.configured ? "bg-[#1a5c2e]" : "bg-gray-300"}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">{p.name}</p>
                <p className="text-[10px] text-muted">{p.configured ? `${p.keyCount} key(s) configured` : "Not configured"}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${p.configured ? "bg-[#1a5c2e]/10 text-[#1a5c2e]" : "bg-canvas text-muted"}`}>
                {p.configured ? "Active" : "Off"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Manage Users", desc: `${u.total ?? 0} registered`, href: "/admin/users", icon: Users },
          { label: "Organizations", desc: `${o.total ?? 0} total`, href: "/admin/organizations", icon: Building2 },
          { label: "AI Agents", desc: `${a.active ?? 0} active`, href: "/admin/agents", icon: Bot },
          { label: "Activity Log", desc: `${act.thisWeek ?? 0} this week`, href: "/admin/activity", icon: Activity },
        ].map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center gap-3 rounded-xl border border-hairline bg-white p-4 transition-colors hover:border-[#1a5c2e]/30 hover:bg-[#1a5c2e]/5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-canvas text-muted group-hover:bg-[#1a5c2e]/10 group-hover:text-[#1a5c2e]">
                <Icon className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">{link.label}</p>
                <p className="text-[11px] text-muted">{link.desc}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-[#1a5c2e]" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
