"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, type RealtimeEvent } from "./use-realtime";
import type { AttentionSnapshot } from "../lib/attention";

/**
 * Founder's Attention client state.
 *
 * Fetches /api/attention (same-origin proxy to GET /v1/attention) and refreshes
 * on the realtime `attention.changed` event. A 60 second poll is only a
 * fallback for a dropped stream, so the badge and the page never show a stale
 * count after an item is created or cleared.
 */
export function useAttention(initial: AttentionSnapshot | null = null) {
  const [data, setData] = useState<AttentionSnapshot | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const res = await fetch("/api/attention", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: AttentionSnapshot };
      if (requestId !== requestRef.current) return; // a newer refresh won
      setData(json.data ?? null);
      setError(null);
    } catch {
      if (requestId !== requestRef.current) return;
      setError("Could not refresh the attention queue.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial === null) void refresh();
  }, [initial, refresh]);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  useRealtime({
    onEvent: useCallback(
      (event: RealtimeEvent) => {
        // `attention.changed` is the explicit signal; the others are real
        // mutations that can add or clear an item even if that signal was
        // dropped (e.g. a task failed while this tab had no stream).
        if (
          event.type === "attention.changed" ||
          event.type === "approval.created" ||
          event.type === "approval.decided" ||
          event.type === "approval.required" ||
          event.type === "task.failed" ||
          event.type === "task.escalated" ||
          event.type === "task.blocked" ||
          event.type === "emergency_stop"
        ) {
          void refresh();
        }
      },
      [refresh],
    ),
  });

  return { data, loading, error, refresh };
}
