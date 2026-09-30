"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, X, Zap } from "lucide-react";
import { useRealtimeNotifications } from "../hooks/use-realtime-notifications";
import { useNotificationSound } from "../hooks/use-notification-sound";
import { useBrowserPush } from "../hooks/use-browser-push";

interface Notification {
  id: string;
  type: "approval" | "task" | "credit" | "agent" | "system";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const typeColors: Record<string, string> = {
  approval: "bg-warm-soft text-warm-ink",
  task: "bg-ink-accent/10 text-brand-ink",
  credit: "bg-error-soft text-error-ink",
  agent: "bg-warm/10 text-warm-ink",
  system: "bg-surface-secondary text-ink-muted",
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
  const [prefs, setPrefs] = useState({ soundEnabled: true, browserNotifications: true });

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

  // Load notification preferences
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.data?.notifications) {
          setPrefs({
            soundEnabled: json.data.notifications.soundEnabled ?? true,
            browserNotifications: json.data.notifications.browserNotifications ?? true,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Sound + push hooks
  const { playSound, playUrgentSound } = useNotificationSound({ enabled: prefs.soundEnabled });
  const { permission, requestPermission, sendNotification } = useBrowserPush({ enabled: prefs.browserNotifications });

  // Request push permission when user enables browser notifications
  useEffect(() => {
    if (prefs.browserNotifications && permission === 'default') {
      requestPermission();
    }
  }, [prefs.browserNotifications, permission, requestPermission]);

  // Load initial notifications on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Poll every 60 seconds as fallback (SSE is primary)
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);  // SSE real-time notifications — instantly add new notifications, play sound, send push
  const { connected } = useRealtimeNotifications({
    onNotification: useCallback(
      (notif: Notification) => {
        // Add to the top of the list
        setNotifications((prev) => [notif, ...prev].slice(0, 50));
        setUnread((prev) => prev + 1);

        // Play notification sound
        const isUrgent = notif.type === 'credit' || notif.type === 'approval';
        if (isUrgent) {
          playUrgentSound();
        } else {
          playSound();
        }

        // Send browser push notification
        sendNotification(notif.title, {
          body: notif.message,
          tag: notif.id,
          requireInteraction: isUrgent,
        });
      },
      [playSound, playUrgentSound, sendNotification],
    ),
  });

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
        className="relative rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-secondary hover:text-ink"
        title="Notifications"
      >
        <Bell className="h-5 w-5 text-ink-muted" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-fill px-1 font-mono text-2xs font-bold text-white">
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
            <div className="flex items-center justify-between border-b border-hairline-light px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-ink">Notifications</h3>
                {connected && (
                  <span className="flex items-center gap-1 rounded-full bg-ink-accent/10 px-1.5 py-0.5">
                    <Zap className="h-2.5 w-2.5 text-brand-ink" />
                    <span className="font-mono text-[8px] font-semibold uppercase text-brand-ink">live</span>
                  </span>
                )}
              </div>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={loading}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center">
                  <Bell className="mx-auto h-8 w-8 text-ink-muted" />
                  <p className="mt-2 text-sm text-ink-muted">No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-secondary ${
                      !n.read ? "bg-ink-accent/5" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-2xs font-bold ${typeColors[n.type]}`}
                    >
                      {n.type.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!n.read ? "font-medium text-ink" : "text-ink-muted"}`}>
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted line-clamp-2">{n.message}</p>
                      <p className="mt-1 font-mono text-3xs text-ink-muted">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-mark-active" />
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-hairline-light px-4 py-2.5">
              <p className="font-mono text-3xs uppercase tracking-wide text-ink-muted">
                {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
              </p>
              <Link
                href="/app/notifications"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-warm-ink transition-colors hover:text-warm-ink"
              >
                View all notifications
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}