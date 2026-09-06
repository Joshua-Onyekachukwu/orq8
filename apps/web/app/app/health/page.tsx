"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  HeartPulse,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

/* ── Types ── */

type HealthReasonKind = "positive" | "warning" | "critical" | "info";

interface HealthReason {
  kind: HealthReasonKind;
  message: string;
}

interface HealthFactor {
  key: string;
  label: string;
  score: number;
  weight: number;
  reasons: HealthReason[];
}

interface CompanyHealth {
  orgId: string;
  score: number;
  grade: "excellent" | "good" | "fair" | "poor" | "critical";
  factors: HealthFactor[];
  reasons: HealthReason[];
  scannedAt: string;
}

/* ── Helpers ── */

function gradeMeta(grade: CompanyHealth["grade"]) {
  switch (grade) {
    case "excellent": return { label: "Excellent", color: "bg-emerald-500", text: "text-emerald-700", ring: "border-emerald-200" };
    case "good": return { label: "Good", color: "bg-lime-500", text: "text-lime-700", ring: "border-lime-200" };
    case "fair": return { label: "Fair", color: "bg-amber-500", text: "text-amber-700", ring: "border-amber-200" };
    case "poor": return { label: "Poor", color: "bg-orange-500", text: "text-orange-700", ring: "border-orange-200" };
    default: return { label: "Critical", color: "bg-red-500", text: "text-red-700", ring: "border-red-200" };
  }
}

function factorIcon(key: string) {
  switch (key) {
    case "goals": return Target;
    case "tasks": return Activity;
    case "workforce": return Users;
    case "approvals": return ShieldCheck;
    case "credits": return CircleDollarSign;
    case "connectors": return Plug;
    default: return Gauge;
  }
}

function reasonBadge(kind: HealthReasonKind) {
  switch (kind) {
    case "positive": return { icon: CheckCircle2, cls: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" };
    case "warning": return { icon: AlertTriangle, cls: "text-amber-600", bg: "bg-amber-50 border-amber-200" };
    case "critical": return { icon: AlertTriangle, cls: "text-red-600", bg: "bg-red-50 border-red-200" };
    default: return { icon: Sparkles, cls: "text-muted", bg: "bg-muted/5 border-hairline" };
  }
}

/* ── Page ── */

export default function HealthPage() {
  const [health, setHealth] = useState<CompanyHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? "Failed to load company health");
      setHealth(json?.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load company health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const meta = health ? gradeMeta(health.grade) : null;

  return (
    <PageErrorBoundary pageName="Company Health">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orq8-lime/10">
                <HeartPulse aria-hidden="true" className="h-4.5 w-4.5 text-orq8-green" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-ink">Company Health</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              A deterministic score of how your company is operating right now — computed from your real goals, tasks, AI employees, approvals, spend and integrations. Every deduction is explained; the same state always produces the same score.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchHealth}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-xs text-red-500 hover:text-red-700">Dismiss</button>
          </div>
        )}

        {loading && !health ? (
          <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-hairline bg-white p-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted">Measuring company health…</p>
          </div>
        ) : health && meta ? (
          <>
            {/* Score hero */}
            <div className={`mt-6 flex flex-wrap items-center gap-6 rounded-xl border ${meta.ring} bg-white p-6`}>
              <div className="relative flex h-28 w-28 items-center justify-center">
                <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" aria-hidden="true">
                  <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-muted/15" />
                  <circle
                    cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(health.score / 100) * 264} 264`}
                    className={meta.color}
                  />
                </svg>
                <div className="absolute text-center">
                  <p className="font-mono text-3xl font-semibold tabular-nums text-ink">{health.score}</p>
                  <p className="text-3xs font-medium uppercase tracking-wide text-muted">/ 100</p>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-ink">Company Health</h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-3xs font-semibold uppercase tracking-wide ${meta.text} bg-muted/5`}>{meta.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Scanned {new Date(health.scannedAt).toLocaleString()} · weighted from 6 live factors
                </p>
                <p className="mt-2 text-xs text-muted">
                  This is a projection of operational health from real data — not a future prediction. Fix what the reasons below call out, and the score rises.
                </p>
              </div>
            </div>

            {/* Reasons */}
            {health.reasons.length > 0 && (
              <div className="mt-6 rounded-xl border border-hairline bg-white p-5">
                <h3 className="text-sm font-semibold text-ink">Why this score</h3>
                <div className="mt-3 space-y-2">
                  {health.reasons.map((r, i) => {
                    const b = reasonBadge(r.kind);
                    return (
                      <div key={i} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${b.bg}`}>
                        <b.icon className={`mt-0.5 h-4 w-4 shrink-0 ${b.cls}`} aria-hidden="true" />
                        <p className="text-xs leading-relaxed text-ink">{r.message}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Factor breakdown */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-ink">Factor breakdown</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {health.factors.map(f => {
                  const Icon = factorIcon(f.key);
                  return (
                    <div key={f.key} className="rounded-xl border border-hairline bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/10">
                            <Icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                          </span>
                          <p className="text-xs font-semibold text-ink">{f.label}</p>
                        </div>
                        <p className="font-mono text-sm font-semibold tabular-nums text-ink">{f.score}</p>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/10">
                        <div
                          className={`h-full rounded-full ${f.score >= 70 ? "bg-emerald-500" : f.score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${f.score}%` }}
                        />
                      </div>
                      <p className="mt-1 text-3xs text-muted">weight {f.weight}%</p>
                      {f.reasons.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {f.reasons.map((r, i) => (
                            <li key={i} className="text-3xs leading-relaxed text-muted">• {r.message}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </PageErrorBoundary>
  );
}