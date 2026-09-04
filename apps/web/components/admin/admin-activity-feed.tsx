import { Activity, ArrowUpRight } from "lucide-react";
import Link from "next/link";

interface ActivityEvent {
  id: number;
  agentId: string | null;
  taskId: string | null;
  type: string;
  summary: string;
  reason: string | null;
  cost: number;
  department: string | null;
  occurredAt: string;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

function typeColor(type: string) {
  if (type.includes("approved")) return "bg-orq8-lime/10 text-orq8-green";
  if (type.includes("rejected")) return "bg-red-50 text-red-600";
  if (type.includes("deployed") || type.includes("executed")) return "bg-blue-50 text-blue-600";
  if (type.includes("created") || type.includes("hired")) return "bg-purple-50 text-purple-600";
  return "bg-gray-100 text-gray-600";
}

export function AdminActivityFeed({ activity }: { activity: ActivityEvent[] }) {
  const events = Array.isArray(activity) ? activity.slice(0, 8) : [];

  return (
    <div className="rounded-xl border border-hairline bg-white">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
            <Activity className="h-4.5 w-4.5 text-indigo-600" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
            <p className="text-xs text-muted">{events.length} events</p>
          </div>
        </div>
        <Link
          href="/admin/activity"
          className="inline-flex items-center gap-1 text-xs font-medium text-orq8-green hover:underline"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Activity className="mx-auto h-6 w-6 text-muted/30" />
          <p className="mt-2 text-xs text-muted">No activity yet</p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-5 py-3">
              <time className="mt-0.5 w-11 shrink-0 font-mono text-xs tabular-nums text-muted">
                {formatTime(e.occurredAt)}
              </time>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-1.5 py-0.5 font-mono text-2xs font-semibold uppercase ${typeColor(e.type)}`}>
                    {e.type}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink truncate">{e.summary}</p>
              </div>
              {e.cost > 0 && (
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                  ${(e.cost / 100).toFixed(2)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
