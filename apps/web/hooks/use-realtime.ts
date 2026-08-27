'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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

interface UseRealtimeOptions {
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { enabled = true, onEvent } = options;
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const url = `${apiBase}/v1/events`;

    let retryTimeout: ReturnType<typeof setTimeout>;
    let retryDelay = 1000;
    const maxRetryDelay = 30000;

    function connect() {
      try {
        const es = new EventSource(url, { withCredentials: true });
        eventSourceRef.current = es;

        es.onopen = () => {
          setConnected(true);
          retryDelay = 1000; // Reset retry delay on successful connection
        };

        es.onmessage = (event) => {
          try {
            const data: RealtimeEvent = JSON.parse(event.data);

            // Skip heartbeats for UI state but still reset retry
            if (data.type === 'heartbeat') return;

            setLastEvent(data);
            onEventRef.current?.(data);
          } catch {
            // Ignore parse errors
          }
        };

        es.onerror = () => {
          setConnected(false);
          es.close();
          eventSourceRef.current = null;

          // Reconnect with exponential backoff
          retryTimeout = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
            connect();
          }, retryDelay);
        };
      } catch {
        // EventSource creation failed — retry
        retryTimeout = setTimeout(connect, retryDelay);
      }
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled]);

  return { connected, lastEvent };
}
