"use client";

import Link from "next/link";
import { Users } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  status: string;
  weeklyCost: number;
  tasksCompleted: number;
  currentTask: string | null;
}

interface AgentRosterProps {
  agents: Agent[];
}

export function AgentRoster({ agents }: AgentRosterProps) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">AI Workforce</h2>
        <Link
          href="/app/agents"
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted hover:text-[#1a5c2e]"
        >
          View all
        </Link>
      </div>
      {agents.length === 0 ? (
        <div className="mt-6 text-center">
          <Users className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm font-medium text-ink">No agents yet</p>
          <p className="mt-1 text-xs text-muted">
            Hire your first AI employee to start building your team.
          </p>
          <Link
            href="/app/agents"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#1a5c2e] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#144a24]"
          >
            <Users className="h-3.5 w-3.5" /> Hire an agent
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {agents.slice(0, 5).map((a) => (
            <li key={a.id} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a5c2e] text-xs font-bold text-[#B8FF66]">
                {a.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {a.name}
                </p>
                <p className="truncate text-xs text-muted">{a.role}</p>
              </div>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  a.status === "active" ? "bg-[#B8FF66]" : "bg-hairline"
                }`}
                title={a.status}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
