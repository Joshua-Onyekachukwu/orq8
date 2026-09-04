"use client";

import { useState, useEffect } from "react";
import { Shield, ShieldCheck, ShieldAlert, ShieldX, TrendingUp, TrendingDown, Minus, Users } from "lucide-react";

interface ReliabilityProfile {
  agentId: string;
  agentName: string;
  role: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  revisionTasks: number;
  completionRate: number;
  firstPassSuccessRate: number;
  failureRate: number;
  escalationRate: number;
  averageQAScore: number;
  trend: "improving" | "stable" | "declining";
  autonomyLevel: "trusted" | "watch" | "restricted" | "paused";
  autonomyReason: string;
}

function AutonomyIcon({ level }: { level: string }) {
  switch (level) {
    case "trusted":
      return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
    case "watch":
      return <Shield className="h-4 w-4 text-amber-500" />;
    case "restricted":
      return <ShieldAlert className="h-4 w-4 text-orange-500" />;
    case "paused":
      return <ShieldX className="h-4 w-4 text-red-500" />;
    default:
      return <Shield className="h-4 w-4 text-muted" />;
  }
}

function TrendIcon({ trend }: { trend: string }) {
  switch (trend) {
    case "improving":
      return <TrendingUp className="h-3 w-3 text-emerald-600" />;
    case "declining":
      return <TrendingDown className="h-3 w-3 text-red-500" />;
    default:
      return <Minus className="h-3 w-3 text-muted" />;
  }
}

function autonomyColor(level: string): string {
  switch (level) {
    case "trusted":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "watch":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "restricted":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "paused":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

export function ReliabilityWidget() {
  const [profiles, setProfiles] = useState<ReliabilityProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) {
          // Get reliability for each agent
          return Promise.all(
            d.data.map((agent: { id: string }) =>
              fetch(`/api/quality/reliability/${agent.id}`)
                .then((r) => r.json())
                .then((d) => d?.data)
                .catch(() => null)
            )
          );
        }
        return [];
      })
      .then((results) => {
        setProfiles(results.filter(Boolean));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-hairline bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-muted" />
          <h3 className="text-sm font-semibold text-ink">AI Workforce Reliability</h3>
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-canvas animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-muted" />
          <h3 className="text-sm font-semibold text-ink">AI Workforce Reliability</h3>
        </div>
        <p className="text-sm text-muted text-center py-4">No agents yet. Hire your first AI employee to see reliability metrics.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted" />
          <h3 className="text-sm font-semibold text-ink">AI Workforce Reliability</h3>
        </div>
        <a href="/app/agents" className="text-xs text-orq8-green hover:underline">View all</a>
      </div>

      <div className="space-y-3">
        {profiles.map((p) => (
          <div key={p.agentId} className="flex items-center justify-between rounded-lg border border-hairline p-3 hover:bg-canvas transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <AutonomyIcon level={p.autonomyLevel} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{p.agentName}</p>
                <p className="text-xs text-muted">{p.role.replace(/_/g, " ")}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-semibold text-ink">{p.completionRate}%</p>
                <p className="text-3xs text-muted">completion</p>
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold text-ink">{p.totalTasks}</p>
                <p className="text-3xs text-muted">tasks</p>
              </div>

              <div className="flex items-center gap-1">
                <TrendIcon trend={p.trend} />
              </div>

              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-medium ${autonomyColor(p.autonomyLevel)}`}>
                {p.autonomyLevel}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
