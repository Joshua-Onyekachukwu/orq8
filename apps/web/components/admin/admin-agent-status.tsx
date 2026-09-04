import { Bot, ArrowUpRight } from "lucide-react";
import Link from "next/link";

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

function statusDot(status: string) {
  if (status === "active") return "bg-[#1a5c2e]";
  if (status === "paused") return "bg-amber-400";
  return "bg-gray-300";
}

function statusLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  return "Archived";
}

export function AdminAgentStatus({ agents }: { agents: Agent[] }) {
  const list = Array.isArray(agents) ? agents.slice(0, 6) : [];
  const activeCount = list.filter((a) => a.status === "active").length;

  return (
    <div className="rounded-xl border border-hairline bg-white">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#B8FF66]/10">
            <Bot className="h-4.5 w-4.5 text-[#1a5c2e]" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Agent Status</h2>
            <p className="text-xs text-muted">
              {activeCount} active of {list.length}
            </p>
          </div>
        </div>
        <Link
          href="/admin/agents"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#1a5c2e] hover:underline"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Bot className="mx-auto h-6 w-6 text-muted/30" />
          <p className="mt-2 text-xs text-muted">No agents deployed</p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {list.map((agent) => (
            <li key={agent.id} className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a0a0b] text-xs font-bold text-[#1a5c2e]">
                {agent.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{agent.name}</p>
                <p className="truncate text-xs text-muted">{agent.role}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-muted">
                  ${((agent.weeklyCost ?? 0) / 100).toFixed(2)}
                </span>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${statusDot(agent.status)}`}
                  title={statusLabel(agent.status)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
