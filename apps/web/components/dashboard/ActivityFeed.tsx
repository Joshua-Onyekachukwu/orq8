"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, Bot, CheckCircle2, AlertCircle, Clock, Zap } from "lucide-react";

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
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

function eventIcon(type: string) {
  if (type.includes("completed") || type.includes("deployed") || type.includes("drafted")) return <CheckCircle2 className="h-3.5 w-3.5 text-[#1a5c2e]" />;
  if (type.includes("failed") || type.includes("error")) return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  if (type.includes("started") || type.includes("running") || type.includes("researching")) return <Clock className="h-3.5 w-3.5 text-[#E86A33] animate-pulse" />;
  if (type.includes("approved")) return <CheckCircle2 className="h-3.5 w-3.5 text-[#B8FF66]" />;
  return <Activity className="h-3.5 w-3.5 text-gray-400" />;
}

interface ActivityFeedProps {
  initialActivity?: ActivityEvent[];
}

export function ActivityFeed({ initialActivity = [] }: ActivityFeedProps) {
  const [activity, setActivity] = useState<ActivityEvent[]>(initialActivity);
  const [loading, setLoading] = useState(false);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/activity?limit=10");
      if (res.ok) {
        const json = await res.json();
        setActivity(json.data ?? []);
      }
    } catch {
      // Silent fail
    }
  }, []);

  // Poll every 30 seconds for new activity
  useEffect(() => {
    const interval = setInterval(fetchActivity, 30_000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  // Refresh on mount if empty
  useEffect(() => {
    if (initialActivity.length === 0) {
      setLoading(true);
      fetchActivity().finally(() => setLoading(false));
    }
  }, []);

  if (activity.length === 0 && !loading) {
    return (
      <section aria-labelledby="activity-heading" className="rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="activity-heading" className="text-sm font-semibold text-gray-900">Recent agent actions</h2>
          <Link href="/app/activity" className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600 hover:text-[#1a5c2e]">
            Full log <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="px-5 py-10 text-center">
          <Activity className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-900">No activity yet</p>
          <p className="mt-1 text-xs text-gray-400">Agent actions will appear here as your AI workforce executes tasks.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="activity-heading" className="rounded-xl border border-gray-100 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 id="activity-heading" className="text-sm font-semibold text-gray-900">Recent agent actions</h2>
          {activity.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[#B8FF66]/10 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF66] animate-pulse" />
              <span className="font-mono text-[9px] font-semibold text-[#1a5c2e]">LIVE</span>
            </span>
          )}
        </div>
        <Link href="/app/activity" className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600 hover:text-[#1a5c2e]">
          Full log <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="divide-y divide-gray-100">
        {activity.slice(0, 5).map((event) => (
          <li key={event.id} className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-50">
              {eventIcon(event.type)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900">
                <span className="font-semibold">{event.type}</span>{" "}
                {event.summary}
              </p>
              {event.reason && (
                <p className="mt-0.5 flex items-start gap-1.5 text-xs text-gray-500">
                  <span className="font-mono font-semibold text-[#1a5c2e]">because</span>
                  {event.reason}
                </p>
              )}
              <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-400">
                {event.department && <span>{event.department}</span>}
                {event.cost > 0 && <span className="font-mono">${(event.cost / 100).toFixed(2)}</span>}
                <span>{formatTime(event.occurredAt)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
