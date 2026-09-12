"use client";

/**
 * Live department activity (§7 founder visibility) — "what is each department
 * doing right now?"
 *
 * Driven by REAL system events only:
 *   • Initial state = the org's actual activity_events history (GET /api/activity).
 *   • Updates = the org's SSE stream (/api/events, shared connection via
 *     useRealtime): task.started/completed/failed/qa_*, approval.*,
 *     agent.status_changed, command.processed.
 *
 * Live events resolve to a department through the agent → department map we
 * fetch from the real org roster; events carry agentId/taskId, never a made-up
 * department label. Connection state is shown honestly: "live" only while the
 * SSE stream is actually connected, otherwise "last updated …" from polling.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRealtime } from "../../hooks/use-realtime";
import type { RealtimeEvent } from "../../lib/realtime-client";
import { Loader2, Radio, RefreshCw, WifiOff } from "lucide-react";

interface LiveEvent {
  id: string;
  type: string;
  summary: string;
  department: string | null;
  agentName: string | null;
  occurredAt: string;
}

interface ActivityRow {
  id: number;
  agentId: string | null;
  type: string;
  summary: string;
  reason: string | null;
  department: string | null;
  occurredAt: string;
}

interface AgentRow {
  id: string;
  name: string;
  department: string | null;
  departmentId?: string | null;
}

/** Human line for a realtime event — only fields the backend actually sent. */
function describe(e: RealtimeEvent): string | null {
  const agent = "agentName" in e && typeof e.agentName === "string" ? e.agentName : null;
  switch (e.type) {
    case "task.started":
      return `${agent ?? "An agent"} started a task`;
    case "task.completed":
      return `${agent ?? "An agent"} completed a task`;
    case "task.failed":
      return `${agent ?? "An agent"} failed a task${e.error ? ` — ${e.error.slice(0, 80)}` : ""}`;
    case "approval.created":
      return `Approval requested: ${e.action} — waiting on you`;
    case "approval.decided":
      return `An approval was ${e.status}`;
    case "agent.status_changed":
      return "An AI employee changed status";
    case "command.processed":
      return `The Executive Agent processed a command${e.summary ? ` — ${e.summary.slice(0, 80)}` : ""}`;
    case "credits.consumed":
      return `Work consumed ${e.amount} credit${e.amount === 1 ? "" : "s"} (${e.remaining} remaining)`;
    default:
      return null;
  }
}

function tone(type: string): string {
  if (type.endsWith(".completed") || type.endsWith(".qa_passed") || type === "approval.decided") return "text-orq8-green";
  if (type.endsWith(".failed") || type.endsWith(".qa_failed") || type.endsWith(".blocked")) return "text-red-500";
  if (type.endsWith("escalated") || type.startsWith("approval")) return "text-amber-600";
  return "text-muted";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DepartmentActivityWidget() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [agentDepartments, setAgentDepartments] = useState<Map<string, { name: string; department: string | null }>>(new Map());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connected } = useRealtime({
    onEvent: useCallback(
      (event: RealtimeEvent) => {
        const summary = describe(event);
        if (!summary) return; // only event types we can state honestly
        const agentId = "agentId" in event && typeof event.agentId === "string" && event.agentId ? event.agentId : null;
        const mapping = agentId ? agentDepartments.get(agentId) : undefined;
        const liveAgent = "agentName" in event && typeof event.agentName === "string" ? event.agentName : null;
        setEvents((prev) =>
          [
            {
              id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: event.type,
              summary,
              department: mapping?.department ?? null,
              agentName: mapping?.name ?? liveAgent,
              occurredAt: new Date().toISOString(),
            },
            ...prev,
          ].slice(0, 12),
        );
      },
      [agentDepartments],
    ),
  });

  const load = useCallback(
    async (initial: boolean) => {
      if (initial) setLoading(true);
      else setRefreshing(true);
      try {
        const [actRes, agentsRes] = await Promise.all([
          fetch("/api/activity?limit=12"),
          fetch("/api/agents?all=true"),
        ]);
        const rows: ActivityRow[] = actRes.ok ? (await actRes.json()).data ?? [] : [];
        const agentList: AgentRow[] = agentsRes.ok ? (await agentsRes.json()).data ?? [] : [];
        const map = new Map<string, { name: string; department: string | null }>();
        for (const a of agentList) {
          if (a?.id) map.set(a.id, { name: a.name, department: a.department ?? null });
        }
        setAgentDepartments(map);
        setEvents(
          rows.map((r) => ({
            id: `hist-${r.id}`,
            type: r.type,
            summary: r.summary,
            department: (r.agentId && map.get(r.agentId)?.department) || r.department || null,
            agentName: (r.agentId && map.get(r.agentId)?.name) || null,
            occurredAt: r.occurredAt,
          })),
        );
        setLastPoll(new Date());
      } finally {
        if (initial) setLoading(false);
        else setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(true);
    // Poll fallback every 60s — SSE stays primary; polling covers missed frames.
    pollTimer.current = setInterval(() => load(false), 60_000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Department activity — right now</h3>
          <p className="text-2xs text-muted mt-0.5">
            What each department&apos;s AI employees are actually doing, from real system events.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${
            connected ? "bg-orq8-green/10 text-orq8-green" : "bg-muted/10 text-muted"
          }`}
          title={connected ? "Streaming live events" : lastPoll ? `Last synced ${timeAgo(lastPoll.toISOString())}` : "Connecting…"}
        >
          {connected ? <Radio className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {connected ? "Live" : lastPoll ? `Synced ${timeAgo(lastPoll.toISOString())}` : "Connecting…"}
        </span>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading activity…
        </div>
      ) : events.length === 0 ? (
        <p className="mt-4 text-xs text-muted italic">
          No activity yet — events appear here the moment your AI workforce starts working.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {events.slice(0, 8).map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 text-xs">
              <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${e.type.endsWith(".failed") ? "bg-red-500" : e.type.endsWith(".completed") ? "bg-orq8-green" : "bg-amber-400"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">
                  {e.department && <span className="font-semibold text-ink">{e.department}</span>}
                  {e.department && " · "}
                  {e.summary}
                </p>
                <p className="text-2xs text-muted">
                  <span className={tone(e.type)}>{e.type.replace(/[._]/g, " ")}</span> · {timeAgo(e.occurredAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex items-center justify-between">
        <a href="/app/activity" className="text-2xs font-medium text-orq8-green hover:underline">
          Full activity log →
        </a>
        <button
          type="button"
          onClick={() => load(false)}
          disabled={refreshing}
          className="inline-flex items-center gap-1 text-2xs text-muted transition-colors hover:text-ink disabled:opacity-50"
          aria-label="Refresh activity"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
    </div>
  );
}
