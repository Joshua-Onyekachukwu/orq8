"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Cpu, Loader2 } from "lucide-react";

/**
 * Dashboard widget: measured per-model performance (rolling 30 days) from the
 * §20/§7 signal pipeline. Makes routing improvements visible as real decisions
 * accumulate — every number is measured, thin data says so explicitly.
 */

interface ModelStat {
  model: string;
  provider: string;
  calls: number;
  successRate: number;
  avgDurationMs: number;
}

interface RoutingShiftEntry {
  source: 'measured' | 'static' | 'default';
  calls: number;
}

interface RoutingShift {
  week: RoutingShiftEntry[];
  previousWeek: RoutingShiftEntry[];
  measuredShare: number | null;
  previousMeasuredShare: number | null;
  shiftPct: number | null;
  totalCalls: number;
}

interface ModelsData {
  stats: {
    totalCalls: number;
    sufficientData: boolean;
    models: ModelStat[];
  };
  insights: {
    kind: string;
    title: string;
    detail: string;
  }[];
  routingShift: RoutingShift;
}

export function ModelPerformanceWidget() {
  const [data, setData] = useState<ModelsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d?.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const models = data?.stats.models ?? [];
  const topInsight = data?.insights.find((i) => i.kind !== "insufficient_data") ?? data?.insights[0];
  const shift = data?.routingShift;
  const weekCalls = shift?.week.reduce((a, e) => a + e.calls, 0) ?? 0;

  const shiftLine = (() => {
    if (!shift || weekCalls === 0) {
      return "Routing shift: no measured calls in the last 7 days yet — the share of model choices informed by real history appears here as your organization works.";
    }
    const pct = Math.round((shift.measuredShare ?? 0) * 100);
    const prev = shift.shiftPct;
    const direction =
      prev === null || prev === 0
        ? "steady vs last week"
        : prev > 0
          ? `up ${Math.round(prev * 100)} pts vs last week`
          : `down ${Math.abs(Math.round(prev * 100))} pts vs last week`;
    return `Routing shift: ${pct}% of this week's ${weekCalls} LLM calls were routed from measured history (${direction}).`;
  })();

  return (
    <section className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Cpu className="h-4 w-4 text-orq8-green" />
          Model performance
        </h3>
        <Link
          href="/app/learning"
          className="inline-flex items-center gap-1 text-xs text-orq8-green hover:underline"
        >
          Learning <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading measured stats…
        </div>
      ) : models.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No model calls recorded yet. Stats appear as your AI workforce executes.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {models.slice(0, 5).map((m) => (
              <div key={`${m.provider}:${m.model}`} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{m.model}</p>
                  <p className="text-3xs text-muted">
                    {m.calls} calls · {(m.avgDurationMs / 1000).toFixed(1)}s avg
                  </p>
                </div>
                <div className="w-28 shrink-0">
                  <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full bg-orq8-green"
                      style={{ width: `${Math.min(100, Math.round(m.successRate * 100))}%` }}
                    />
                  </div>
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-ink">
                  {Math.round(m.successRate * 100)}%
                </span>
              </div>
            ))}
          </div>
          {topInsight && (
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-muted">
              <span className="font-medium text-ink">{topInsight.title}</span> — {topInsight.detail}
            </p>
          )}
          <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-muted">{shiftLine}</p>
          <p className="mt-2 text-3xs text-muted">
            Rolling 30 days · {data?.stats.totalCalls ?? 0} measured calls
            {data?.stats.sufficientData === false && " · accumulating (insufficient data for recommendations yet)"}
          </p>
        </>
      )}
    </section>
  );
}
