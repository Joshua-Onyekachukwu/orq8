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
    color: "bg-[#B8FF66]/10 text-[#1a5c2e]",
    hoverColor: "hover:bg-[#B8FF66]/20",
  },
  {
    label: "Set a goal",
    description: "Define what your company should achieve",
    icon: Target,
    href: "/app/goals",
    color: "bg-[#E86A33]/10 text-[#E86A33]",
    hoverColor: "hover:bg-[#E86A33]/20",
  },
  {
    label: "Run a command",
    description: "Tell the Executive Agent what to do",
    icon: Command,
    href: "#command-bar",
    color: "bg-[#1a5c2e]/10 text-[#1a5c2e]",
    hoverColor: "hover:bg-[#1a5c2e]/20",
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
                className={`flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-lg transition-all hover:shadow-xl ${action.hoverColor}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${action.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{action.label}</p>
                  <p className="text-xs text-gray-500">{action.description}</p>
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
            ? "bg-gray-900 text-white rotate-45"
            : "bg-[#E86A33] text-white hover:bg-[#d45e2a] hover:shadow-xl"
        }`}
        title={open ? "Close actions" : "Quick actions"}
      >
        {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </button>
    </div>
  );
}
