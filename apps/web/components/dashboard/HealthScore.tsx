"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

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

function computeScore(props: HealthScoreProps): {
  score: number;
  label: string;
  color: string;
  bg: string;
  breakdown: { label: string; value: number; max: number; weight: string }[];
} {
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

  // Weighted components (out of 100)
  const agentScore = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0;
  const taskScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const creditScore = creditsTotal > 0 ? (creditsRemaining / creditsTotal) * 100 : 0;
  const approvalScore = pendingApprovals === 0 ? 100 : Math.max(0, 100 - pendingApprovals * 20);
  const goalScore = totalGoals > 0 ? (activeGoals / totalGoals) * 100 : 0;

  // Weighted average: agents 25%, tasks 25%, credits 20%, approvals 15%, goals 15%
  const score = Math.round(
    agentScore * 0.25 +
    taskScore * 0.25 +
    creditScore * 0.20 +
    approvalScore * 0.15 +
    goalScore * 0.15
  );

  const clamped = Math.max(0, Math.min(100, score));

  let label: string;
  let color: string;
  let bg: string;

  if (clamped >= 80) {
    label = "Thriving";
    color = "text-[#1a5c2e]";
    bg = "bg-[#1a5c2e]";
  } else if (clamped >= 60) {
    label = "Healthy";
    color = "text-[#B8FF66]";
    bg = "bg-[#B8FF66]";
  } else if (clamped >= 40) {
    label = "Needs attention";
    color = "text-amber-600";
    bg = "bg-amber-500";
  } else {
    label = "At risk";
    color = "text-red-500";
    bg = "bg-red-500";
  }

  return {
    score: clamped,
    label,
    color,
    bg,
    breakdown: [
      { label: "Agent utilization", value: Math.round(agentScore), max: 100, weight: "25%" },
      { label: "Task completion", value: Math.round(taskScore), max: 100, weight: "25%" },
      { label: "Credit health", value: Math.round(creditScore), max: 100, weight: "20%" },
      { label: "Approval flow", value: Math.round(approvalScore), max: 100, weight: "15%" },
      { label: "Goal momentum", value: Math.round(goalScore), max: 100, weight: "15%" },
    ],
  };
}

export function HealthScore(props: HealthScoreProps) {
  const { score, label, color, bg, breakdown } = computeScore(props);
  const Icon = score >= 70 ? TrendingUp : score >= 40 ? Minus : TrendingDown;

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Company Health</h2>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${color} ${bg}/10`}>
          <Icon className="h-3 w-3" />
          {label}
        </span>
      </div>

      {/* Score ring */}
      <div className="mt-5 flex items-center gap-6">
        <div className="relative h-20 w-20 shrink-0">
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#f3f4f6" strokeWidth="6" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeDasharray={`${(score / 100) * 213.6} 213.6`}
              strokeLinecap="round"
              className={color}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-gray-900">{score}</span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {breakdown.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500">{item.label}</span>
                <span className="font-mono text-gray-400">{item.weight}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    item.value >= 70 ? "bg-[#1a5c2e]" :
                    item.value >= 40 ? "bg-amber-400" :
                    "bg-red-400"
                  }`}
                  style={{ width: `${item.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
