"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Wallet,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  CreditCard,
  BarChart3,
} from "lucide-react";

interface CreditBalance {
  balance: { total: number; used: number; remaining: number };
  utilization: number;
  isLow: boolean;
  isCritical: boolean;
  daysLeft: number;
  periodEnd: string;
}

interface UsageSummary {
  byOperation: Record<string, number>;
  daily: Array<{ date: string; count: number; credits: number }>;
  totalUsed: number;
}

export default function BudgetsPage() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, usageRes] = await Promise.all([
        fetch("/api/credits/balance"),
        fetch("/api/credits/usage"),
      ]);

      if (balRes.ok) {
        const json = await balRes.json();
        setBalance(json.data ?? null);
      }
      if (usageRes.ok) {
        const json = await usageRes.json();
        setUsage(json.data ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load budget data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const remaining = balance?.balance?.remaining ?? 0;
  const total = balance?.balance?.total ?? 0;
  const used = balance?.balance?.used ?? 0;
  const utilization = balance?.utilization ?? 0;
  const isLow = balance?.isLow ?? false;
  const isCritical = balance?.isCritical ?? false;
  const daysLeft = balance?.daysLeft ?? 0;

  return (
    <PageErrorBoundary pageName="Budgets & Limits" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1a5c2e]">
            Governance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Budgets & Work Credits
          </h1>
          <p className="mt-1 text-sm text-muted">
            Track credit usage across your AI workforce. Monitor consumption and manage limits.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      {/* Error state */}
      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Balance cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#B8FF66]/10 text-[#1a5c2e]">
            <Wallet className="h-4 w-4" />
          </span>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Remaining Credits
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            {loading ? "—" : remaining.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            of {total.toLocaleString()} included
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <BarChart3 className="h-4 w-4" />
          </span>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Used This Period
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            {loading ? "—" : used.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {utilization.toFixed(0)}% utilization
          </p>
        </div>

        <div className={`rounded-xl border bg-white p-5 ${isCritical ? "border-red-300" : isLow ? "border-amber-300" : "border-hairline"}`}>
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${isCritical ? "bg-red-100 text-red-700" : isLow ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
            {isCritical ? <AlertTriangle className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
          </span>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {isCritical ? "Critical" : isLow ? "Low Balance" : "Period"}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            {loading ? "—" : `${daysLeft} days`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {isCritical ? "Credits nearly exhausted" : isLow ? "Running low on credits" : "until period resets"}
          </p>
        </div>
      </div>

      {/* Utilization bar */}
      {total > 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-ink">Credit Utilization</p>
            <p className="font-mono text-xs text-muted">{utilization.toFixed(1)}%</p>
          </div>
          <div className="h-3 rounded-full bg-muted/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isCritical ? "bg-red-500" : isLow ? "bg-amber-400" : "bg-[#1a5c2e]"}`}
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
            <span>0 credits used</span>
            <span>{total.toLocaleString()} included</span>
          </div>
        </div>
      )}

      {/* Usage by operation */}
      {usage && usage.byOperation && Object.keys(usage.byOperation).length > 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">Usage by Operation</h2>
          <div className="space-y-3">
            {Object.entries(usage.byOperation)
              .sort(([, a], [, b]) => b - a)
              .map(([op, credits]) => (
                <div key={op} className="flex items-center gap-3">
                  <span className="min-w-[120px] text-xs text-muted capitalize">
                    {op.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-muted/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{
                        width: `${(credits / (usage.totalUsed || 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted w-16 text-right">
                    {credits.toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Daily usage chart */}
      {usage && usage.daily && usage.daily.length > 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">Daily Usage (Last 7 Days)</h2>
          <div className="flex items-end gap-2 h-32">
            {usage.daily.slice(-7).map((day) => {
              const maxCredits = Math.max(...usage.daily.slice(-7).map((d) => d.credits), 1);
              const height = (day.credits / maxCredits) * 100;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="font-mono text-[10px] text-muted">{day.credits}</span>
                  <div
                    className="w-full rounded-t bg-[#1a5c2e]/60 min-h-[2px]"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  <span className="font-mono text-[9px] text-muted">
                    {new Date(day.date).toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !balance && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <Wallet className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">No billing data yet</p>
          <p className="mt-1 text-sm text-muted max-w-md mx-auto">
            Work Credits are allocated when you subscribe to a plan. Start a free trial to begin using your AI workforce.
          </p>
          <a
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0a0a0b] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B8FF66] hover:text-white"
          >
            View plans <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
    </PageErrorBoundary>
  );
}
