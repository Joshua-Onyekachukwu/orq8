"use client";

import Link from "next/link";
import {
  CircleDollarSign,
  ClipboardCheck,
  ListChecks,
  Users,
} from "lucide-react";

interface StatCardsProps {
  activeAgents: number;
  completedTasks: number;
  totalTasks: number;
  weeklySpend: number;
  credits: {
    total: number;
    used: number;
    remaining: number;
    utilizationPercent: number;
    isCritical: boolean;
  } | null;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const statCards = [
  {
    key: "agents" as const,
    label: "Agents active",
    icon: Users,
    accent: "bg-orq8-lime/10 text-orq8-green",
    href: "/app/agents",
    getValue: (s: StatCardsProps) => String(s.activeAgents).padStart(2, "0"),
    getNote: (s: StatCardsProps) => "working right now",
  },
  {
    key: "tasks" as const,
    label: "Tasks completed",
    icon: ListChecks,
    accent: "bg-orq8-orange/10 text-orq8-orange",
    href: "/app/goals",
    getValue: (s: StatCardsProps) => String(s.completedTasks).padStart(2, "0"),
    getNote: (s: StatCardsProps) => `${s.totalTasks} total tasks`,
  },
  {
    key: "spend" as const,
    label: "Weekly spend",
    icon: CircleDollarSign,
    accent: "bg-amber-50 text-amber-700",
    href: "/app/budgets",
    getValue: (s: StatCardsProps) => formatCost(Math.round(s.weeklySpend * 100)),
    getNote: (s: StatCardsProps) => (s.weeklySpend > 0 ? "this week" : "no spend yet"),
  },
  {
    key: "credits" as const,
    label: "Credits remaining",
    icon: ClipboardCheck,
    accent: "bg-red-50 text-red-600",
    href: "/app/budgets",
    getValue: (s: StatCardsProps) => (s.credits ? String(s.credits.remaining) : "—"),
    getNote: (s: StatCardsProps) =>
      s.credits ? `${s.credits.utilizationPercent}% used` : "no credits yet",
  },
];

export function DashboardStats(props: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {statCards.map((s) => {
        const Icon = s.icon;
        return (
          <Link
            key={s.key}
            href={s.href}
            className="group rounded-xl border border-hairline bg-white p-4 transition-all hover:border-hairline hover:shadow-sm sm:p-5"
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.accent}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <p
              data-contrast-check={`stat-card-label-${s.key}`}
              className="mt-3 font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted"
            >
              {s.label}
            </p>
            <p
              data-contrast-check={`stat-card-value-${s.key}`}
              className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums"
            >
              {s.getValue(props)}
            </p>
            <p data-contrast-check={`stat-card-note-${s.key}`} className="mt-0.5 text-xs text-muted">
              {s.getNote(props)}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
