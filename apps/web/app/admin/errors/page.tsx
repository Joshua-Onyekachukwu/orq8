import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import {
  AlertTriangle,
  XCircle,
  Info,
  AlertOctagon,
  Search,
} from "lucide-react";

export const metadata = { title: "Errors & Audit Trail — Admin" };

interface AuditEvent {
  id: string;
  action: string;
  outcome: string;
  details: string | null;
  actorType: string;
  actorId: string | null;
  orgId: string | null;
  createdAt: string;
}

interface AggregatedError {
  key: string;
  action: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  severity: "critical" | "high" | "medium" | "low";
  orgCount: number;
}

function getSeverity(action: string): "critical" | "high" | "medium" | "low" {
  if (!action) return "low";
  const lower = action.toLowerCase();
  if (lower.includes("auth") || lower.includes("security") || lower.includes("privilege"))
    return "critical";
  if (lower.includes("agent") || lower.includes("task") || lower.includes("provider"))
    return "high";
  if (lower.includes("credit") || lower.includes("usage") || lower.includes("notification"))
    return "medium";
  return "low";
}

type SevStyle = { bg: string; text: string; dot: string };

function getSeverityStyles(severity: string): SevStyle {
  switch (severity) {
    case "critical": return { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" };
    case "high": return { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" };
    case "medium": return { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-500" };
    default: return { bg: "bg-gray-50", text: "text-gray-700", dot: "bg-gray-400" };
  }
}

async function fetchAuditEvents(token: string): Promise<AuditEvent[]> {
  try {
    const res = await fetch(`${API_URL}/v1/admin/audit?limit=200`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const d = await res.json();
    return d.data || [];
  } catch {
    return [];
  }
}

function aggregateErrors(events: AuditEvent[]): AggregatedError[] {
  const errorEvents = events.filter(
    (e) =>
      e.outcome === "failure" ||
      e.action?.includes("failed") ||
      e.action?.includes("error")
  );

  const grouped = new Map<string, AggregatedError>();
  for (const ev of errorEvents) {
    const key = ev.action || "unknown_error";
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        action: ev.action,
        count: 0,
        firstSeen: ev.createdAt,
        lastSeen: ev.createdAt,
        severity: getSeverity(ev.action),
        orgCount: 0,
      });
    }
    const agg = grouped.get(key)!;
    agg.count++;
    if (ev.createdAt < agg.firstSeen) agg.firstSeen = ev.createdAt;
    if (ev.createdAt > agg.lastSeen) agg.lastSeen = ev.createdAt;
    if (ev.orgId) agg.orgCount++;
  }

  return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
}

export default async function AdminErrorsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return (
      <div className="p-8">
        <p className="text-sm text-[#6b7280]">Not authenticated.</p>
      </div>
    );
  }

  const events = await fetchAuditEvents(token);
  const errors = aggregateErrors(events);

  const criticalCount = errors.filter((e) => e.severity === "critical").length;
  const highCount = errors.filter((e) => e.severity === "high").length;
  const totalErrorCount = errors.reduce((s, e) => s + e.count, 0);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0a0a0b]">
          Errors & Audit Trail
        </h1>
        <p className="text-sm text-[#6b7280] mt-1">
          Platform errors, failures, and administrative audit events
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertOctagon className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0a0a0b]">
                {totalErrorCount}
              </p>
              <p className="text-xs text-[#6b7280]">Total Errors</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              <p className="text-xs text-[#6b7280]">Critical</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{highCount}</p>
              <p className="text-xs text-[#6b7280]">High</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1a5c2e]/10 flex items-center justify-center">
              <Info className="w-5 h-5 text-[#1a5c2e]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0a0a0b]">
                {events.length}
              </p>
              <p className="text-xs text-[#6b7280]">Audit Events</p>
            </div>
          </div>
        </div>
      </div>

      {/* Errors Table */}
      <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-sm font-semibold text-[#0a0a0b]">Aggregated Errors</h2>
        </div>
        {errors.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Info className="w-12 h-12 text-[#1a5c2e] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0b]">No errors found</p>
            <p className="text-xs text-[#6b7280] mt-1">
              The platform is running cleanly
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f3f4f6]">
            {errors.map((error) => {
              const colors = getSeverityStyles(error.severity);
              return (
                <div
                  key={error.key}
                  className="px-6 py-4 hover:bg-[#f9fafb] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0a0a0b] font-mono truncate">
                          {error.action}
                        </p>
                        <p className="text-xs text-[#6b7280] mt-0.5">
                          First: {new Date(error.firstSeen).toLocaleString()} ·
                          Last: {new Date(error.lastSeen).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
                      >
                        {error.severity}
                      </span>
                      <span className="text-sm font-medium text-[#0a0a0b]">
                        {error.count}×
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Audit Log */}
      <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-sm font-semibold text-[#0a0a0b]">Audit Log</h2>
        </div>
        {events.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Info className="w-12 h-12 text-[#9ca3af] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#0a0a0b]">
              No audit events
            </p>
            <p className="text-xs text-[#6b7280] mt-1">
              Events will appear as users interact with the platform
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f3f4f6] max-h-[600px] overflow-y-auto">
            {events.map((event) => (
              <div
                key={event.id}
                className="px-6 py-3 hover:bg-[#f9fafb] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        event.outcome === "success"
                          ? "bg-[#1a5c2e]"
                          : event.outcome === "failure"
                            ? "bg-red-500"
                            : "bg-[#9ca3af]"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-[#0a0a0b] font-mono truncate">
                        {event.action}
                      </p>
                      {event.details && (
                        <p className="text-xs text-[#6b7280] mt-0.5 truncate">
                          {event.details}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        event.outcome === "success"
                          ? "bg-[#1a5c2e]/10 text-[#1a5c2e]"
                          : event.outcome === "failure"
                            ? "bg-red-50 text-red-700"
                            : "bg-[#f3f4f6] text-[#6b7280]"
                      }`}
                    >
                      {event.outcome}
                    </span>
                    <span className="text-xs text-[#6b7280]">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
