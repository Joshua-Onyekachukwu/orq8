import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import {
  Zap,
  Activity,
  DollarSign,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  Server,
  Shield,
} from "lucide-react";

export const metadata = { title: "Model Router — Admin" };

interface ProviderHealth {
  provider: string;
  slug: string;
  status: "healthy" | "degraded" | "down" | "not_configured";
  latencyMs: number;
  configured: boolean;
  keyCount: number;
  modelsAvailable: string[];
  error?: string;
  lastChecked: string;
  baseUrl: string;
  circuitBreaker?: {
    state: string;
    failureCount: number;
    cooldownRemainingMs: number;
  } | null;
}

async function fetchProviders(token: string): Promise<{
  providers: ProviderHealth[];
  summary: { total: number; healthy: number; degraded: number; down: number; notConfigured: number };
} | null> {
  try {
    const res = await fetch(`${API_URL}/v1/admin/providers`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const d = await res.json();
    return { providers: d.data ?? [], summary: d.summary ?? { total: 0, healthy: 0, degraded: 0, down: 0, notConfigured: 0 } };
  } catch {
    return null;
  }
}

async function fetchRouterStats(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/admin/model-router`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json())?.data ?? null;
  } catch {
    return null;
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    healthy: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Healthy" },
    degraded: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Degraded" },
    down: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Down" },
    not_configured: { bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400", label: "Not Configured" },
    closed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Closed" },
    open: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Open" },
    half_open: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Half-Open" },
  };
  const fallback = styles.not_configured!;
  const s = styles[status] ?? fallback;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function ProviderIcon({ slug }: { slug: string }) {
  if (slug === "nvidia") return <Zap className="h-5 w-5 text-emerald-600" />;
  if (slug === "openrouter") return <Activity className="h-5 w-5 text-purple-600" />;
  if (slug === "ollama") return <Server className="h-5 w-5 text-blue-600" />;
  if (slug === "litellm") return <Wifi className="h-5 w-5 text-orange-600" />;
  return <Server className="h-5 w-5 text-gray-500" />;
}

export default async function ModelRouterPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";

  const [healthData, routerStats] = await Promise.all([
    fetchProviders(token),
    fetchRouterStats(token),
  ]);

  const providers = healthData?.providers ?? [];
  const summary = healthData?.summary ?? { total: 0, healthy: 0, degraded: 0, down: 0, notConfigured: 0 };
  const totals = routerStats?.totals ?? { requests: 0, costCents: 0 };
  const byDepartment = routerStats?.byDepartment ?? [];
  const byType = routerStats?.byType ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Model Router</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Real-time provider health, routing decisions, and usage patterns.
        </p>
      </div>

      {/* Health Summary */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-ink-muted font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Healthy
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600 tabular-nums">{summary.healthy}</p>
          <p className="text-xs text-ink-muted">providers responding</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-ink-muted font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Degraded
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600 tabular-nums">{summary.degraded}</p>
          <p className="text-xs text-ink-muted">partial issues</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-ink-muted font-semibold">
            <XCircle className="h-4 w-4 text-red-500" /> Down
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600 tabular-nums">{summary.down}</p>
          <p className="text-xs text-ink-muted">unreachable</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-ink-muted font-semibold">
            <WifiOff className="h-4 w-4 text-ink-muted" /> Not Configured
          </div>
          <p className="mt-2 text-2xl font-bold text-ink-muted tabular-nums">{summary.notConfigured}</p>
          <p className="text-xs text-ink-muted">no keys set</p>
        </div>
      </div>

      {/* Provider Details */}
      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-hairline">
          <h2 className="text-sm font-semibold text-ink">Provider Health</h2>
          <p className="text-xs text-ink-muted mt-0.5">Live status from actual provider API probes</p>
        </div>
        <div className="divide-y divide-hairline-light">
          {providers.map((p) => (
            <div key={p.slug} className="px-6 py-5 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="mt-0.5">
                    <ProviderIcon slug={p.slug} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-ink">{p.provider}</h3>
                      <StatusBadge status={p.status} />
                      {p.circuitBreaker && p.circuitBreaker.state !== "closed" && (
                        <StatusBadge status={p.circuitBreaker.state} />
                      )}
                    </div>
                    <p className="text-xs text-ink-muted mt-1 font-mono truncate">{p.baseUrl}</p>
                    {p.error && (
                      <p className="text-xs text-red-600 mt-1 max-w-lg truncate">{p.error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Latency</p>
                    <p className={`text-sm font-medium tabular-nums ${p.latencyMs > 5000 ? "text-red-600" : p.latencyMs > 2000 ? "text-amber-600" : "text-ink"}`}>
                      {p.latencyMs > 0 ? `${p.latencyMs}ms` : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Keys</p>
                    <p className="text-sm font-medium text-ink">{p.keyCount}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Models</p>
                    <p className="text-sm font-medium text-ink">{p.modelsAvailable.length}</p>
                  </div>
                  {p.circuitBreaker && (
                    <div className="text-right">
                      <p className="text-xs text-ink-muted">Circuit</p>
                      <p className={`text-sm font-medium ${p.circuitBreaker.failureCount > 0 ? "text-amber-600" : "text-ink"}`}>
                        {p.circuitBreaker.failureCount} failures
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {p.modelsAvailable.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.modelsAvailable.slice(0, 8).map((model) => (
                    <span key={model} className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-3xs font-mono text-gray-700">
                      {model}
                    </span>
                  ))}
                  {p.modelsAvailable.length > 8 && (
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-3xs text-gray-700">
                      +{p.modelsAvailable.length - 8} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Routing Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-ink-muted font-semibold">
            <Activity className="h-4 w-4" /> Total Requests
          </div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{totals.requests}</p>
          <p className="text-xs text-ink-muted">all-time routing decisions</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-ink-muted font-semibold">
            <DollarSign className="h-4 w-4" /> Estimated Cost
          </div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">${(totals.costCents / 100).toFixed(2)}</p>
          <p className="text-xs text-ink-muted">total AI infrastructure spend</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-ink-muted font-semibold">
            <BarChart3 className="h-4 w-4" /> Avg Cost/Request
          </div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">
            ${totals.requests > 0 ? (totals.costCents / totals.requests / 100).toFixed(4) : "0.00"}
          </p>
          <p className="text-xs text-ink-muted">per routing decision</p>
        </div>
      </div>

      {/* Usage by Department */}
      {byDepartment.length > 0 && (
        <div className="rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">Usage by Department</h2>
          <div className="space-y-3">
            {byDepartment.map((d: any) => (
              <div key={d.department} className="flex items-center justify-between rounded-lg border border-hairline-light p-3">
                <div>
                  <p className="text-sm font-medium text-ink">{d.department}</p>
                  <p className="text-3xs text-ink-muted">{d.count} events</p>
                </div>
                <span className="font-mono text-sm text-ink">${(d.totalCost / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
