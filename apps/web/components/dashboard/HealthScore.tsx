"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { computeScore, type HealthScoreProps } from "../../lib/health-score";

function StatusDot({ status }: { status: "good" | "warning" | "critical" | "neutral" }) {
  const color =
    status === "good" ? "bg-brand-deep" :
    status === "warning" ? "bg-warm" :
    status === "critical" ? "bg-error-fill" :
    "bg-disabled-surface";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

export function HealthScore(props: HealthScoreProps) {
  const { score, label, description, color, strokeColor, segments } = computeScore(props);
  const Icon = score >= 70 ? TrendingUp : score >= 40 ? Minus : TrendingDown;

  // SVG ring calculations
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="rounded-xl border border-hairline bg-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Company Health</h2>
          <p className="mt-0.5 text-overline text-muted">Composite performance score</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-3xs font-semibold uppercase tracking-wide ${color} bg-current/5`}>
          <Icon className="h-3 w-3" />
          {label}
        </span>
      </div>

      {/* Score ring + description */}
      <div className="mt-6 flex items-start gap-6">
        <div className="relative h-24 w-24 shrink-0">
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 88 88">
            {/* Background ring */}
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke="var(--orq-border)"
              strokeWidth="7"
            />
            {/* Score ring */}
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke={strokeColor}
              strokeWidth="7"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tracking-tight text-ink">{score}</span>
            <span className="text-2xs font-medium uppercase tracking-wider text-muted">/ 100</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>

      {/* Segment breakdown */}
      <div className="mt-6 space-y-3">
        {segments.map((seg) => {
          return (
            <div key={seg.label}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={seg.status} />
                  <span className="text-overline font-medium text-ink">{seg.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-3xs font-mono tabular-nums text-muted">{seg.display}</span>
                  <span className="text-3xs font-mono tabular-nums text-muted/60 w-8 text-right">{seg.value}%</span>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-hairline overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    seg.status === "good" ? "bg-brand-deep" :
                    seg.status === "warning" ? "bg-warm" :
                    seg.status === "critical" ? "bg-error" :
                    "bg-disabled-surface"
                  }`}
                  style={{ width: `${seg.value}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
