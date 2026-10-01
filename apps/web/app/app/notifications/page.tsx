"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  RefreshCw,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";

/**
 * Notifications (docs/71 §L, marketing/headquarters-mock-v2.html
 * `screen-notifications`).
 *
 * The mock's composition: the honest framing ("only real events reach this
 * list"), a chip filter row, and notification rows — icon, bold line, detail,
 * time on the right, and **actions that go somewhere** (a gate row links to
 * the approvals queue; a briefing row to briefings). Read state is real and
 * per-founder: mark one, mark all, both write the server.
 */

interface Notification {
  id: string;
  type: "approval" | "task" | "credit" | "agent" | "system";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "approval", label: "Approvals" },
  { key: "task", label: "Work" },
  { key: "credit", label: "Credits" },
  { key: "system", label: "System" },
] as const;

/** The glyph in the row's square — the mock's ✓ / ▤ / ✉ set, plus a dot. */
function glyph(type: string, unread: boolean): string {
  if (type === "approval") return "✓";
  if (type === "task") return "▤";
  if (type === "credit") return "◧";
  if (type === "system") return "✉";
  return unread ? "•" : "✉";
}

/** Where a notification's action goes, derived from its type — no dead links. */
function destination(type: string): { href: string; label: string } | null {
  switch (type) {
    case "approval":
      return { href: "/app/approvals", label: "Review gate" };
    case "task":
      return { href: "/app/tasks", label: "Open the board" };
    case "credit":
      return { href: "/app/budgets", label: "Open budgets" };
    case "system":
      return { href: "/app/briefings", label: "Open briefings" };
    default:
      return null;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<"all" | "unread">("all");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (readFilter === "unread") params.set("read", "false");

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
  }, [typeFilter, readFilter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (!res.ok) return;
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread((prev) => Math.max(0, prev - 1));
    } catch {
      // The row stays unread; the next refresh shows the truth.
    }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!res.ok) return;
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      // Same: refresh wins over optimistic lies.
    }
  };

  return (
    <PageErrorBoundary pageName="Notifications" backHref="/app">
      <div className="space-y-4">
        <header className="console-card flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Inbox · {unread} unread
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Notifications</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Only real events reach this list. Read state is per founder account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fetchNotifications}
              aria-label="Refresh notifications"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated disabled:opacity-40"
            >
              <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="btn-ghost-white inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <CheckCheck aria-hidden="true" className="h-3.5 w-3.5" /> Mark all as read
              </button>
            )}
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = typeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={active}
                onClick={() => setTypeFilter(filter.key)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-hairline-strong bg-elevated text-ink"
                    : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
          <span className="ml-2 flex items-center gap-2">
            {(["all", "unread"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={readFilter === value}
                onClick={() => setReadFilter(value)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  readFilter === value
                    ? "border-hairline-strong bg-elevated text-ink"
                    : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
                }`}
              >
                {value === "all" ? "Read + unread" : "Unread only"}
              </button>
            ))}
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-error-soft/40 px-3.5 py-2.5">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-error-ink" />
            <p className="text-sm text-error-ink">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="console-card flex items-center gap-3 p-6">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-muted" />
            <p className="text-sm text-muted">Loading the inbox…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="console-card p-10 text-center">
            <Bell aria-hidden="true" className="mx-auto h-8 w-8 text-muted/40" />
            <p className="mt-3 text-sm font-medium text-ink">
              {typeFilter !== "all" || readFilter !== "all"
                ? "Nothing matches those filters"
                : "Nothing here yet"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
              {typeFilter !== "all" || readFilter !== "all"
                ? "Notifications will appear as your employees work and as gates open."
                : "When an employee opens a gate, finishes a task, or crosses a budget line, it lands here — nothing is sent for show."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {notifications.map((notif) => {
              const dest = destination(notif.type);
              return (
                <li
                  key={notif.id}
                  className={`console-card flex items-start gap-3.5 p-4 ${
                    notif.read ? "" : "border-hairline-strong"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-sm ${
                      notif.read
                        ? "border-hairline text-muted"
                        : "border-hairline-strong bg-elevated text-ink"
                    }`}
                  >
                    {glyph(notif.type, !notif.read)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${notif.read ? "text-muted" : "font-semibold text-ink"}`}>
                      {notif.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{notif.message}</p>
                    {(!notif.read || dest) && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {!notif.read && (
                          <button
                            type="button"
                            onClick={() => markAsRead(notif.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-2xs text-muted transition-colors hover:border-hairline-strong hover:text-ink"
                          >
                            <Check aria-hidden="true" className="h-3 w-3" />
                            Mark read
                          </button>
                        )}
                        {dest && (
                          <Link
                            href={dest.href}
                            className="rounded-md border border-hairline px-2.5 py-1 text-2xs text-ink transition-colors hover:border-hairline-strong"
                          >
                            {dest.label}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                  <span
                    className="shrink-0 font-mono text-3xs tabular-nums text-muted"
                    title={new Date(notif.createdAt).toLocaleString()}
                  >
                    {timeAgo(notif.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && notifications.length > 0 && (
          <p className="font-mono text-2xs text-muted">
            Showing {notifications.length} of {total} · read state is kept per founder account
          </p>
        )}
      </div>
    </PageErrorBoundary>
  );
}
