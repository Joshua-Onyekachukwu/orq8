'use client';

// Shared realtime (SSE) client.
//
// Every consumer (notifications bell, command bar, dashboard) used to open its
// OWN EventSource to the API. The server caps concurrent streams per user
// (3), so a single dashboard page with the bell + command bar + live feed
// tripped the cap (429) — and each stream re-downloaded the same data.
//
// This module opens ONE EventSource (same-origin via /api/events, where the
// session cookie applies and the route proxies to the API with Bearer auth)
// and fans events out to every subscriber. The connection is opened when the
// first subscriber arrives and closed when the last one leaves.

export type RealtimeEvent =
  | { type: 'task.started'; taskId: string; agentId: string; agentName: string }
  | { type: 'task.completed'; taskId: string; agentId: string; agentName: string; result: string }
  | { type: 'task.failed'; taskId: string; agentId: string; agentName: string; error: string }
  | { type: 'approval.created'; approvalId: string; action: string }
  | { type: 'approval.decided'; approvalId: string; status: string }
  | { type: 'agent.status_changed'; agentId: string; status: string }
  | { type: 'command.processed'; commandId: string; summary: string }
  | { type: 'credits.consumed'; amount: number; remaining: number; operationType: string }
  | { type: 'heartbeat'; timestamp: number };

export type RealtimeMessage =
  | { kind: 'status'; connected: boolean }
  | { kind: 'event'; event: RealtimeEvent };

type Subscriber = (message: RealtimeMessage) => void;

let eventSource: EventSource | null = null;
let subscribers = new Set<Subscriber>();
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;
const maxRetryDelay = 30_000;
let manuallyClosed = false;

function broadcast(message: RealtimeMessage) {
  for (const cb of subscribers) {
    try {
      cb(message);
    } catch {
      // A subscriber must not break the shared connection.
    }
  }
}

function teardown() {
  manuallyClosed = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  broadcast({ kind: 'status', connected: false });
}

function connect() {
  if (manuallyClosed || eventSource) return;
  manuallyClosed = false;

  try {
    const es = new EventSource('/api/events');
    eventSource = es;

    es.onopen = () => {
      retryDelay = 1000;
      broadcast({ kind: 'status', connected: true });
    };

    es.onmessage = (raw) => {
      try {
        const event = JSON.parse(raw.data) as RealtimeEvent;
        broadcast({ kind: 'event', event });
      } catch {
        // Ignore malformed frames
      }
    };

    es.onerror = () => {
      // The browser auto-reconnects EventSource, but we manage retry ourselves
      // so status is accurate and backoff is bounded.
      es.close();
      if (eventSource === es) eventSource = null;
      broadcast({ kind: 'status', connected: false });
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
        connect();
      }, retryDelay);
    };
  } catch {
    // EventSource construction failed — retry with backoff
    retryTimer = setTimeout(() => {
      retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
      connect();
    }, retryDelay);
  }
}

/** Subscribe to the shared stream. Returns an unsubscribe function. */
export function subscribeRealtime(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  if (!eventSource) {
    retryDelay = 1000;
    connect();
  }
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && !manuallyClosed) {
      teardown();
    }
  };
}
