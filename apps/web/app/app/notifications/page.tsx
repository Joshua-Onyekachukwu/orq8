"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Filter,
  Search,
  RefreshCw,
  AlertCircle,
  FlaskConical,
  ShieldCheck,
  Target,
  Users,
  Wallet,
  Settings,
  Loader2,
} from "lucide-react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";

interface Notification {
  id: string;
  type: "approval" | "task" | "credit" | "agent" | "system";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const typeConfig: {
  [key: string]: { icon: typeof Bell; color: string; bg: string; label: string };
  approval: { icon: typeof Bell; color: string; bg: string; label: string };
  task: { icon: typeof Bell; color: string; bg: string; label: string };
  credit: { icon: typeof Bell; color: string; bg: string; label: string };
  agent: { icon: typeof Bell; color: string; bg: string; label: string };
  system: { icon: typeof Bell; color: string; bg: string; label: string };
} = {
  approval: {
    icon: ShieldCheck,
    color: "text-amber-700",
    bg: "bg-amber-50",
    label: "Approval",
  },
  task: {
    icon: Target,
    color: "text-orq8-green",
    bg: "bg-orq8-lime/10",
    label: "Task",
  },
  credit: {
    icon: Wallet,
    color: "text-red-600",
    bg: "bg-red-50",
    label: "Credit",
  },
  agent: {
    icon: Users,
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    label: "Agent",
  },
  system: {
    icon: Settings,
    color: "text-muted",
    bg: "bg-canvas",
    label: "System",
  },
};

function getTypeConfig(type: string): { icon: typeof Bell; color: string; bg: string; label: string } {
  return typeConfig[type] ?? typeConfig.system;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (readFilter !== "all") params.set("read", readFilter);
      if (search.trim()) params.set("q", search.trim());

      const [listRes, unreadRes] = await Promise.all([
        fetch(`/api/notifications?${params.toString()}`),
        fetch("/api/notifications/unread"),
      ]);

      if (listRes.ok) {
        const json = await listRes.json();
        setNotifications(json.data ?? []);
        setTotal(json.meta?.total ?? 0);
      }
      if (unreadRes.ok) {
        const json = await unreadRes.json();
        setUnread(json.data?.count ?? 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, readFilter, search]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnread((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      // silent
    }
  };

  const seedNotifications = async () => {
    try {
      await fetch("/api/notifications/seed", { method: "POST" });
      fetchNotifications();
    } catch {
      // silent
    }
  };

  return (
    <PageErrorBoundary pageName="Notification History" backHref="/app">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">
              Notification History
            </h1>
            <p className="mt-1 text-sm text-muted">
              All notifications from your AI organization.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={seedNotifications}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              <FlaskConical className="h-3.5 w-3.5" /> Seed
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["all", "approval", "task", "credit", "agent", "system"] as const).map(
            (t) => {
              const count =
                t === "all"
                  ? total
                  : notifications.filter((n) => n.type === t).length;
              if (t === "all") return null;
              const cfg = getTypeConfig(t);
              const Icon = cfg.icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setTypeFilter(typeFilter === t ? "all" : t)
                  }
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                    typeFilter === t
                      ? "border-orq8-dark bg-orq8-dark/5"
                      : "border-hairline bg-white hover:bg-canvas"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg} ${cfg.color}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-ink">{cfg.label}</p>
                    <p className="font-mono text-3xs text-muted">
                      {count} notification{count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </button>
              );
            }
          )}
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-white p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted" />
            <span className="text-xs font-medium text-muted">Filters:</span>
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-hairline bg-canvas px-3 py-1.5 text-xs text-ink outline-none focus:border-orq8-green"
          >
            <option value="all">All types</option>
            <option value="approval">Approvals</option>
            <option value="task">Tasks</option>
            <option value="credit">Credits</option>
            <option value="agent">Agents</option>
            <option value="system">System</option>
          </select>

          {/* Read filter */}
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
            className="rounded-lg border border-hairline bg-canvas px-3 py-1.5 text-xs text-ink outline-none focus:border-orq8-green"
          >
            <option value="all">All status</option>
            <option value="false">Unread only</option>
            <option value="true">Read only</option>
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications..."
              className="w-full rounded-lg border border-hairline bg-canvas py-1.5 pl-8 pr-3 text-xs text-ink outline-none placeholder:text-muted focus:border-orq8-green"
            />
          </div>

          {/* Clear filters */}
          {(typeFilter !== "all" || readFilter !== "all" || search) && (
            <button
              type="button"
              onClick={() => {
                setTypeFilter("all");
                setReadFilter("all");
                setSearch("");
              }}
              className="text-xs font-medium text-muted hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="mt-4">
          {loading ? (
            <div className="rounded-xl border border-hairline bg-white p-12 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted" />
              <p className="mt-3 text-sm text-muted">Loading notifications...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <button
                type="button"
                onClick={fetchNotifications}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:underline"
              >
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-white p-12 text-center">
              <Bell className="mx-auto h-10 w-10 text-muted/30" />
              <p className="mt-3 text-sm font-medium text-ink">
                No notifications
              </p>
              <p className="mt-1 text-xs text-muted">
                {typeFilter !== "all" || readFilter !== "all" || search
                  ? "Try adjusting your filters"
                  : "Notifications will appear here when your AI employees take action"}
              </p>
              {typeFilter === "all" && readFilter === "all" && !search && (
                <button
                  type="button"
                  onClick={seedNotifications}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas"
                >
                  <FlaskConical className="h-3.5 w-3.5" /> Load sample
                  notifications
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notif) => {
                const cfg = getTypeConfig(notif.type);
                const Icon = cfg.icon;
                return (
                  <div
                    key={notif.id}
                    className={`group flex items-start gap-4 rounded-xl border bg-white p-4 transition-colors hover:bg-canvas/50 ${
                      notif.read ? "border-hairline" : "border-orq8-green/20 bg-orq8-green/5"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg} ${cfg.color}`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className={`text-sm ${
                              notif.read
                                ? "text-muted"
                                : "font-semibold text-ink"
                            }`}
                          >
                            {notif.title}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted">
                            {notif.message}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {!notif.read && (
                            <span className="h-2 w-2 rounded-full bg-orq8-green" />
                          )}
                          {!notif.read && (
                            <button
                              type="button"
                              onClick={() => markAsRead(notif.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-ink"
                              title="Mark as read"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-2xs font-semibold uppercase ${cfg.bg} ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                        <span
                          className="font-mono text-3xs text-muted"
                          title={formatDate(notif.createdAt)}
                        >
                          {timeAgo(notif.createdAt)}
                        </span>
                        {notif.read && (
                          <span className="font-mono text-3xs text-muted/60">
                            read
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer stats */}
        {!loading && notifications.length > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-hairline bg-white px-4 py-3">
            <p className="font-mono text-3xs uppercase tracking-wide text-muted">
              {total} notification{total !== 1 ? "s" : ""}
              {unread > 0 && (
                <span className="ml-2 text-orq8-green">
                  ({unread} unread)
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={fetchNotifications}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
            >
              <RefreshCw aria-hidden="true" className="h-3 w-3" /> Refresh
            </button>
          </div>
        )}
      </div>
    </PageErrorBoundary>
  );
}
