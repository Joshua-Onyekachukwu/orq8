"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";

interface Notification {
  id: string;
  type: "approval" | "task" | "credit" | "agent" | "system";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const typeColors: Record<string, string> = {
  approval: "bg-amber-50 text-amber-700",
  task: "bg-emerald/10 text-emerald-700",
  credit: "bg-red-50 text-red-600",
  agent: "bg-indigo-50 text-indigo-700",
  system: "bg-canvas text-muted",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const [listRes, unreadRes] = await Promise.all([
        fetch("/api/notifications?limit=20"),
        fetch("/api/notifications/unread"),
      ]);

      if (listRes.ok) {
        const json = await listRes.json();
        setNotifications(json.data ?? []);
      }
      if (unreadRes.ok) {
        const json = await unreadRes.json();
        setUnread(json.data?.count ?? 0);
      }
    } catch {
      // Silent fail — notifications are non-critical
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    setLoading(true);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setUnread(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[9px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-hairline bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Notifications</h3>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={loading}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center">
                  <Bell className="mx-auto h-8 w-8 text-muted/30" />
                  <p className="mt-2 text-sm text-muted">No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-canvas/50 ${
                      !n.read ? "bg-emerald/5" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold ${typeColors[n.type]}`}
                    >
                      {n.type.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!n.read ? "font-medium text-ink" : "text-muted"}`}>
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted line-clamp-2">{n.message}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald" />
                    )}
                  </div>
                ))
              )}
            </div>

            {notifications.length > 0 && (
              <div className="border-t border-hairline px-4 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                  {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
