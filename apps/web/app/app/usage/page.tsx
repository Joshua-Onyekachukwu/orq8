"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Gauge,
  Users,
  Building2,
  GitBranch,
  Plug,
  Server,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  Wallet,
} from "lucide-react";

interface ResourceUsage {
  resource: "agents" | "departments" | "teams" | "connectors" | "mcp";
  label: string;
  limit: number;
  used: number;
  remaining: number | null;
  reached: boolean;
}

interface Entitlements {
  plan: string;
  planName: string;
  trial: boolean;
  maxAgents: number;
  autonomy: string;
  resources: ResourceUsage[];
}

interface CreditBalance {
  balance: { total: number; used: number; remaining: number };
  utilization: number;
  isLow: boolean;
  isCritical: boolean;
}

const RESOURCE_ICONS: Record<ResourceUsage["resource"], typeof Users> = {
  agents: Users,
  departments: Building2,
  teams: GitBranch,
  connectors: Plug,
  mcp: Server,
};

const AUTONOMY_LABELS: Record<string, string> = {
  observe: "Observe only",
  recommend: "Recommend actions",
  draft: "Draft, no execution",
  execute_with_approval: "Execute with approval",
  autonomous: "Autonomous",
};


export default function UsagePage() {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entRes, balRes] = await Promise.all([
        fetch("/api/entitlements"),
        fetch("/api/credits/balance"),
      ]);
      if (entRes.ok) {
        const json = await entRes.json();
        setEntitlements(json.data ?? null);
      } else if (entRes.status !== 404) {
        throw new Error(`Failed to load entitlements (${entRes.status})`);
      }
      if (balRes.ok) {
        const json = await balRes.json();
        setBalance(json.data ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const reached = entitlements?.resources.filter((r) => r.reached) ?? [];
  const autonomyLabel = entitlements ? AUTONOMY_LABELS[entitlements.autonomy] ?? entitlements.autonomy : null;
  const usedCredits = balance?.balance?.used ?? 0;
  const totalCredits = balance?.balance?.total ?? 0;

  return (
    <PageErrorBoundary pageName="Packages & Usage" backHref="/app">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
              Governance
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Packages &amp; Usage
            </h1>
            <p className="mt-1 text-sm text-muted">
              Your plan entitlements and live usage across the AI workforce.
            </p>
          </div>
          <button
            type="button"
            aria-label="Refresh usage"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </header>

        {error && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border-error bg-error-soft px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-error-ink" />
            <p className="text-sm text-error-ink">{error}</p>
          </div>
        )}

        {/* Reached limits banner */}
        {!loading && !error && reached.length > 0 && (
          <div className="mt-4 rounded-xl border border-warm bg-warm-soft px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warm-ink" />
              <div>
                <p className="text-sm font-semibold text-warm-ink">
                  {reached.length === 1 ? "A plan limit has been reached" : "Plan limits have been reached"}
                </p>
                <p className="mt-0.5 text-sm text-warm-ink">
                  {reached.map((r) => r.label).join(", ")} — archive inactive items to free capacity, or upgrade your plan.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Plan summary */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-hairline bg-white p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-accent/10 text-brand-ink">
              <Gauge className="h-4 w-4" />
            </span>
            <p className="mt-3 font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
              Plan
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {loading ? "—" : entitlements?.planName ?? "Trial"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {entitlements?.trial ? "Free trial" : `${entitlements?.maxAgents ?? 0} AI employee max`}
            </p>
          </div>

          <div className="rounded-xl border border-hairline bg-white p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-ink">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <p className="mt-3 font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
              Autonomy
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {loading ? "—" : autonomyLabel ?? "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Highest level your plan may grant
            </p>
          </div>

          <div className="rounded-xl border border-hairline bg-white p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-deep/10 text-brand-ink">
              <Wallet className="h-4 w-4" />
            </span>
            <p className="mt-3 font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
              Work Credits
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
              {loading ? "—" : `${usedCredits.toLocaleString()} / ${totalCredits.toLocaleString()}`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {balance?.utilization != null ? `${balance.utilization.toFixed(0)}% used this period` : "—"}
            </p>
          </div>
        </div>

        {/* Resource limits */}
        <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Resource usage</h2>
          <p className="mt-1 text-xs text-muted">
            Used / limit for each resource your plan governs. Limits are enforced server-side.
          </p>
          <div className="mt-5 space-y-5">
            {entitlements?.resources.map((r) => {
              const Icon = RESOURCE_ICONS[r.resource];
              const pct = r.limit > 0 ? Math.min((r.used / r.limit) * 100, 100) : 0;
              const barColor = r.reached
                ? "bg-error-fill"
                : r.limit > 0 && r.used / r.limit >= 0.8
                  ? "bg-warm"
                  : "bg-brand-deep";
              return (
                <div key={r.resource}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ink capitalize">{r.label}</p>
                        <p className="shrink-0 font-mono text-xs tabular-nums text-muted">
                          {r.limit > 0 ? (
                            <>
                              {r.used.toLocaleString()} / {r.limit.toLocaleString()}
                              {r.reached && (
                                <span className="ml-1.5 rounded-full bg-error-soft px-1.5 py-0.5 text-3xs font-semibold uppercase text-error-ink">
                                  Full
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              {r.used.toLocaleString()} used
                              <span className="ml-1.5 rounded-full bg-ink-accent/10 px-1.5 py-0.5 text-3xs font-semibold uppercase text-brand-ink">
                                Unlimited
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      {r.limit > 0 && (
                        <div className="mt-1.5 h-2 rounded-full bg-muted/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${Math.max(pct, r.used > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upgrade path */}
        {!loading && !error && entitlements && (
          <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
            <h2 className="text-sm font-semibold text-ink">Need more capacity?</h2>
            <p className="mt-1 text-xs text-muted">
              {reached.length > 0
                ? "You've hit one or more plan limits. Upgrade to unlock more AI employees, departments, teams, and integrations."
                : "Upgrade for more AI employees, departments, teams, connectors, and higher autonomy."}
            </p>
            <a
              href="/"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-deep px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand"
            >
              View plans <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !entitlements && (
          <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
            <Gauge className="mx-auto h-10 w-10 text-muted/30" />
            <p className="mt-4 text-sm font-medium text-ink">No entitlement data yet</p>
            <p className="mt-1 text-sm text-muted max-w-md mx-auto">
              Plan entitlements become available once your organization has a subscription.
            </p>
          </div>
        )}
      </div>
    </PageErrorBoundary>
  );
}