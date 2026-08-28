import { cookies } from "next/headers";
import {
  HeartPulse,
  CheckCircle2,
  AlertTriangle,
  Circle,
  Server,
  Database,
  Shield,
  Bot,
  Mail,
  CreditCard,
  HardDrive,
  Globe,
  Users,
  Building2,
  Activity,
  ClipboardCheck,
  Zap,
  LogIn,
} from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

export const metadata = { title: "System Health — Admin — ORQ8" };

interface HealthData {
  status: string;
  timestamp: string;
  subsystems: Array<{
    name: string;
    status: string;
    latencyMs: number | null;
  }>;
  stats: {
    users: number;
    organizations: number;
    agents: number;
    activeAgents: number;
    pendingApprovals: number;
    totalActivity: number;
    activeSubscriptions: number;
    activeSessions: number;
  };
}

async function fetchHealth(token: string): Promise<HealthData | null> {
  try {
    const res = await fetch(`${API_URL}/v1/admin/health`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: HealthData };
    return json.data ?? null;
  } catch {
    return null;
  }
}

function subsystemIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("database")) return Database;
  if (lower.includes("redis")) return Server;
  if (lower.includes("api")) return Globe;
  if (lower.includes("auth")) return Shield;
  if (lower.includes("agent")) return Bot;
  if (lower.includes("email") || lower.includes("smtp")) return Mail;
  if (lower.includes("stripe") || lower.includes("billing")) return CreditCard;
  if (lower.includes("file") || lower.includes("s3")) return HardDrive;
  return Circle;
}

function statusConfig(status: string) {
  switch (status) {
    case "operational":
      return {
        color: "bg-emerald/10 text-emerald-700",
        dot: "bg-emerald",
        label: "Operational",
        icon: CheckCircle2,
      };
    case "degraded":
      return {
        color: "bg-amber-50 text-amber-700",
        dot: "bg-amber-400",
        label: "Degraded",
        icon: AlertTriangle,
      };
    case "not_configured":
      return {
        color: "bg-gray-100 text-gray-500",
        dot: "bg-gray-300",
        label: "Not configured",
        icon: Circle,
      };
    case "local_fallback":
      return {
        color: "bg-blue-50 text-blue-600",
        dot: "bg-blue-400",
        label: "Local fallback",
        icon: Circle,
      };
    default:
      return {
        color: "bg-red-50 text-red-600",
        dot: "bg-red-500",
        label: status,
        icon: AlertTriangle,
      };
  }
}

export default async function AdminHealthPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const health = await fetchHealth(token);

  const isOperational = health?.status === "operational";
  const stats = health?.stats;
  const subsystems = health?.subsystems ?? [];

  const platformStats = [
    {
      label: "Users",
      value: stats?.users ?? 0,
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Organizations",
      value: stats?.organizations ?? 0,
      icon: Building2,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Active Agents",
      value: stats?.activeAgents ?? 0,
      icon: Bot,
      color: "bg-emerald/10 text-emerald-700",
    },
    {
      label: "Total Agents",
      value: stats?.agents ?? 0,
      icon: Zap,
      color: "bg-amber-50 text-amber-600",
    },
    {
      label: "Pending Approvals",
      value: stats?.pendingApprovals ?? 0,
      icon: ClipboardCheck,
      color: "bg-red-50 text-red-600",
    },
    {
      label: "Activity Events",
      value: stats?.totalActivity ?? 0,
      icon: Activity,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Active Subscriptions",
      value: stats?.activeSubscriptions ?? 0,
      icon: CreditCard,
      color: "bg-pink-50 text-pink-600",
    },
    {
      label: "Active Sessions",
      value: stats?.activeSessions ?? 0,
      icon: LogIn,
      color: "bg-teal-50 text-teal-600",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">System Health</h1>
        <p className="mt-1 text-sm text-muted">
          Real-time status of all ORQ8 platform subsystems and infrastructure.
        </p>
      </div>

      {/* Overall status banner */}
      <div
        className={`mb-8 flex items-center gap-4 rounded-xl border px-6 py-4 ${
          isOperational
            ? "border-emerald/20 bg-emerald/5"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full ${
            isOperational ? "bg-emerald" : "bg-amber-400"
          }`}
        >
          <HeartPulse className="h-6 w-6 text-white" />
        </span>
        <div className="flex-1">
          <p className="text-lg font-semibold text-ink">
            {isOperational ? "All Systems Operational" : "System Degraded"}
          </p>
          <p className="text-sm text-muted">
            Last checked:{" "}
            {health?.timestamp
              ? new Date(health.timestamp).toLocaleString()
              : "Unknown"}
          </p>
        </div>
        <span
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            isOperational
              ? "bg-emerald/10 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full animate-pulse ${
              isOperational ? "bg-emerald" : "bg-amber-500"
            }`}
          />
          {isOperational ? "Healthy" : "Check subsystems"}
        </span>
      </div>

      {/* Platform stats grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {platformStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-hairline bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.color}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    {stat.label}
                  </p>
                  <p className="text-xl font-bold tabular-nums text-ink">
                    {stat.value.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Subsystem status */}
      <section>
        <h2 className="mb-4 text-sm font-semibold text-ink">
          Subsystem Status
        </h2>
        <div className="rounded-xl border border-hairline bg-white overflow-hidden">
          <div className="divide-y divide-hairline">
            {subsystems.map((sub) => {
              const Icon = subsystemIcon(sub.name);
              const cfg = statusConfig(sub.status);
              const StatusIcon = cfg.icon;
              return (
                <div
                  key={sub.name}
                  className="flex items-center gap-4 px-6 py-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-canvas">
                    <Icon className="h-5 w-5 text-muted" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{sub.name}</p>
                  </div>
                  <span
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${cfg.color}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </div>
              );
            })}

            {subsystems.length === 0 && (
              <div className="px-6 py-10 text-center">
                <Server className="mx-auto h-8 w-8 text-muted/30" />
                <p className="mt-3 text-sm text-muted">
                  Health data unavailable. The API may be unreachable.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Infrastructure info */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold text-ink">
          Infrastructure Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-white p-5">
            <h3 className="text-sm font-medium text-ink mb-3">
              Database
            </h3>
            <dl className="space-y-2">
              <div className="flex justify-between text-xs">
                <dt className="text-muted">Engine</dt>
                <dd className="font-medium text-ink">PostgreSQL</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-muted">ORM</dt>
                <dd className="font-medium text-ink">Drizzle</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium text-emerald-700">Connected</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-hairline bg-white p-5">
            <h3 className="text-sm font-medium text-ink mb-3">
              Cache / Queue
            </h3>
            <dl className="space-y-2">
              <div className="flex justify-between text-xs">
                <dt className="text-muted">Engine</dt>
                <dd className="font-medium text-ink">Redis</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-muted">Usage</dt>
                <dd className="font-medium text-ink">
                  Sessions, rate limiting, idempotency
                </dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-muted">Status</dt>
                <dd className={`font-medium ${
                  health?.subsystems.find((s) => s.name === "Redis")?.status === "operational"
                    ? "text-emerald-700"
                    : "text-amber-600"
                }`}>
                  {health?.subsystems.find((s) => s.name === "Redis")?.status === "operational"
                    ? "Connected"
                    : "Using in-memory fallback"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-hairline bg-white p-5">
            <h3 className="text-sm font-medium text-ink mb-3">
              AI / LLM Gateway
            </h3>
            <dl className="space-y-2">
              <div className="flex justify-between text-xs">
                <dt className="text-muted">Gateway</dt>
                <dd className="font-medium text-ink">LiteLLM</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-muted">Features</dt>
                <dd className="font-medium text-ink">
                  BYOK, model routing, fallbacks
                </dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium text-emerald-700">
                  {process.env.LITELLM_BASE_URL ? "Connected" : "Not configured"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-hairline bg-white p-5">
            <h3 className="text-sm font-medium text-ink mb-3">
              External Services
            </h3>
            <dl className="space-y-2">
              <div className="flex justify-between text-xs">
                <dt className="text-muted">Stripe</dt>
                <dd className={`font-medium ${process.env.STRIPE_SECRET_KEY ? "text-emerald-700" : "text-muted"}`}>
                  {process.env.STRIPE_SECRET_KEY ? "Configured" : "Not configured"}
                </dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-muted">SMTP</dt>
                <dd className={`font-medium ${process.env.SMTP_HOST ? "text-emerald-700" : "text-muted"}`}>
                  {process.env.SMTP_HOST ? "Configured" : "Not configured"}
                </dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-muted">S3/R2</dt>
                <dd className={`font-medium ${process.env.S3_ENDPOINT ? "text-emerald-700" : "text-muted"}`}>
                  {process.env.S3_ENDPOINT ? "Configured" : "Local fallback"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
