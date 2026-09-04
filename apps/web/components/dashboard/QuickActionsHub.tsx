"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Target, Bot, ShieldCheck, Command, X } from "lucide-react";

const actions = [
  {
    label: "Hire an agent",
    description: "Add a new AI employee to your workforce",
    icon: Bot,
    href: "/app/agents",
    color: "bg-orq8-lime/10 text-orq8-green",
    hoverColor: "hover:bg-orq8-lime/20",
  },
  {
    label: "Set a goal",
    description: "Define what your company should achieve",
    icon: Target,
    href: "/app/goals",
    color: "bg-orq8-orange/10 text-orq8-orange",
    hoverColor: "hover:bg-orq8-orange/20",
  },
  {
    label: "Run a command",
    description: "Tell the Executive Agent what to do",
    icon: Command,
    href: "#command-bar",
    color: "bg-orq8-green/10 text-orq8-green",
    hoverColor: "hover:bg-orq8-green/20",
  },
  {
    label: "Review approvals",
    description: "Check pending decisions from your AI team",
    icon: ShieldCheck,
    href: "/app/approvals",
    color: "bg-amber-50 text-amber-700",
    hoverColor: "hover:bg-amber-100",
  },
];

export function QuickActionsHub() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-30 lg:bottom-8 lg:right-8">
      {/* Action buttons */}
      {open && (
        <div className="mb-3 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-lg transition-all hover:shadow-xl ${action.hoverColor}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${action.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{action.label}</p>
                  <p className="text-xs text-muted">{action.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* FAB button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          open
            ? "bg-orq8-dark text-white rotate-45"
            : "bg-orq8-orange text-white hover:bg-orq8-orange-dark hover:shadow-xl"
        }`}
        title={open ? "Close actions" : "Quick actions"}
      >
        {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>
    </div>
  );
}
