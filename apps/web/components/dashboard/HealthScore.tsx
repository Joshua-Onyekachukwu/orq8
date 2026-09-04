"use client";

import { TrendingUp, TrendingDown, Minus, Shield, Zap, Target, Users, ClipboardCheck } from "lucide-react";

interface HealthScoreProps {
  activeAgents: number;
  totalAgents: number;
  completedTasks: number;
  totalTasks: number;
  creditsRemaining: number;
  creditsTotal: number;
  pendingApprovals: number;
  activeGoals: number;
  totalGoals: number;
}

interface ScoreResult {
  score: number;
  label: string;
  description: string;
  color: string;
  strokeColor: string;
  segments: {
    label: string;
    icon: React.ElementType;
    value: number;
    display: string;
    status: "good" | "warning" | "critical" | "neutral";
  }[];
}

function computeScore(props: HealthScoreProps): ScoreResult {
  const {
    activeAgents,
    totalAgents,
    completedTasks,
    totalTasks,
    creditsRemaining,
    creditsTotal,
    pendingApprovals,
    activeGoals,
    totalGoals,
  } = props;

  // Individual scores (0-100)
  const agentScore = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0;
  const taskScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const creditScore = creditsTotal > 0 ? (creditsRemaining / creditsTotal) * 100 : 0;
  const approvalScore = pendingApprovals === 0 ? 100 : Math.max(0, 100 - pendingApprovals * 20);
  const goalScore = totalGoals > 0 ? (activeGoals / totalGoals) * 100 : 0;

  // Weighted: agents 25%, tasks 30%, credits 20%, approvals 10%, goals 15%
  const raw = agentScore * 0.25 + taskScore * 0.30 + creditScore * 0.20 + approvalScore * 0.10 + goalScore * 0.15;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  // Status
  let label: string;
  let description: string;
  let color: string;
  let strokeColor: string;

  if (score >= 80) {
    label = "Thriving";
    description = "Your company is running smoothly. AI employees are productive and goals are on track.";
    color = "text-orq8-green";
    strokeColor = "#1a5c2e";
  } else if (score >= 60) {
    label = "Healthy";
    description = "Good momentum. Some areas could use attention to reach full potential.";
    color = "text-orq8-lime";
    strokeColor = "#B8FF66";
  } else if (score >= 40) {
    label = "Needs Attention";
    description = "Several areas need founder input. Review pending approvals and stalled tasks.";
    color = "text-orq8-orange";
    strokeColor = "#E86A33";
  } else {
    label = "At Risk";
    description = "Critical issues detected. Immediate action needed to get back on track.";
    color = "text-red-500";
    strokeColor = "#ef4444";
  }

  // Determine status for each segment
  const segStatus = (val: number): "good" | "warning" | "critical" | "neutral" =>
    val >= 70 ? "good" : val >= 40 ? "warning" : totalAgents === 0 && val === 0 ? "neutral" : "critical";

  return {
    score,
    label,
    description,
    color,
    strokeColor,
    segments: [
      { label: "Workforce", icon: Users, value: Math.round(agentScore), display: `${activeAgents}/${totalAgents}`, status: segStatus(agentScore) },
      { label: "Execution", icon: Target, value: Math.round(taskScore), display: `${completedTasks}/${totalTasks}`, status: segStatus(taskScore) },
      { label: "Credits", icon: Zap, value: Math.round(creditScore), display: `${creditsRemaining}`, status: segStatus(creditScore) },
      { label: "Approvals", icon: ClipboardCheck, value: Math.round(approvalScore), display: pendingApprovals === 0 ? "Clear" : `${pendingApprovals} pending`, status: segStatus(approvalScore) },
      { label: "Goals", icon: Shield, value: Math.round(goalScore), display: `${activeGoals} active`, status: segStatus(goalScore) },
    ],
  };
}

function StatusDot({ status }: { status: "good" | "warning" | "critical" | "neutral" }) {
  const color =
    status === "good" ? "bg-orq8-green" :
    status === "warning" ? "bg-orq8-orange" :
    status === "critical" ? "bg-red-500" :
    "bg-gray-300";
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
          <p className="mt-0.5 text-[11px] text-muted">Composite performance score</p>
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
              stroke="#f5f5f5"
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
          const SegIcon = seg.icon;
          return (
            <div key={seg.label}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={seg.status} />
                  <span className="text-[11px] font-medium text-ink">{seg.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-3xs font-mono tabular-nums text-muted">{seg.display}</span>
                  <span className="text-3xs font-mono tabular-nums text-muted/60 w-8 text-right">{seg.value}%</span>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-hairline overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    seg.status === "good" ? "bg-orq8-green" :
                    seg.status === "warning" ? "bg-orq8-orange" :
                    seg.status === "critical" ? "bg-red-400" :
                    "bg-gray-200"
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
