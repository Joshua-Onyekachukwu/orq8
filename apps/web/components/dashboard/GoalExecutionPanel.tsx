"use client";

import Link from "next/link";
import {
  Target,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";

interface GoalExecutionPanelProps {
  totalGoals: number;
  activeGoals: number;
  completedTasks: number;
  totalTasks: number;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function GoalExecutionPanel({
  totalGoals,
  activeGoals,
  completedTasks,
  totalTasks,
}: GoalExecutionPanelProps) {
  const completionRate = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;
  const completedGoals = totalGoals - activeGoals;

  return (
    <div className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E86A33]/10">
            <Target aria-hidden="true" className="h-4 w-4 text-[#E86A33]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Goal Execution</h2>
            <p className="text-xs text-muted">Tasks driving outcomes</p>
          </div>
        </div>
        <Link
          href="/app/goals"
          className="group inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-hairline"
        >
          View all
          <ArrowUpRight className="h-2.5 w-2.5 text-muted group-hover:text-muted" />
        </Link>
      </div>

      {/* Completion rate ring */}
      <div className="mt-4 flex items-center gap-5">
        <div className="relative h-16 w-16 shrink-0">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="27" fill="none" stroke="#f3f4f6" strokeWidth="5" />
            <circle
              cx="32"
              cy="32"
              r="27"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeDasharray={`${(completionRate / 100) * 169.6} 169.6`}
              strokeLinecap="round"
              className={
                completionRate >= 70 ? "text-[#1a5c2e]" :
                completionRate >= 40 ? "text-[#B8FF66]" :
                "text-[#E86A33]"
              }
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-base font-bold text-ink">{completionRate}%</span>
          </div>
        </div>

        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Goals</span>
            <span className="font-mono text-ink">{completedGoals}/{totalGoals} completed</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Tasks</span>
            <span className="font-mono text-ink">{completedTasks}/{totalTasks} done</span>
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Link href="/app/goals" className="group rounded-lg bg-canvas px-3 py-2.5 text-center transition-colors hover:bg-hairline">
          <CheckCircle2 className="mx-auto h-4 w-4 text-[#1a5c2e]" />
          <p className="mt-1 font-mono text-sm font-bold text-ink">{completedGoals}</p>
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted">Achieved</p>
        </Link>
        <Link href="/app/goals" className="group rounded-lg bg-canvas px-3 py-2.5 text-center transition-colors hover:bg-hairline">
          <Clock className="mx-auto h-4 w-4 text-[#E86A33]" />
          <p className="mt-1 font-mono text-sm font-bold text-ink">{activeGoals}</p>
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted">Active</p>
        </Link>
        <Link href="/app/goals" className="group rounded-lg bg-canvas px-3 py-2.5 text-center transition-colors hover:bg-hairline">
          <AlertCircle className="mx-auto h-4 w-4 text-muted" />
          <p className="mt-1 font-mono text-sm font-bold text-ink">{totalTasks - completedTasks}</p>
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted">Remaining</p>
        </Link>
      </div>
    </div>
  );
}
