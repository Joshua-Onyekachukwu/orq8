'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  subscribeRealtime,
  type RealtimeEvent,
} from '../lib/realtime-client';

export type { RealtimeEvent } from '../lib/realtime-client';

interface UseRealtimeOptions {
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
}

/**
 * Subscribe to the org's realtime stream.
 *
 * Uses the shared single EventSource (lib/realtime-client) — consumers no
 * longer open one connection each (the API caps streams per user, so multiple
 * per-page connections tripped 429). Returns connection status and the latest
 * non-heartbeat event.
 */
export function useRealtime(options: UseRealtimeOptions = {}) {
  const { enabled = true, onEvent } = options;
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    return subscribeRealtime((message) => {
      if (message.kind === 'status') {
        setConnected(message.connected);
        return;
      }
      const event = message.event;
      // Skip heartbeats for UI state (they keep the connection alive only)
      if (event.type === 'heartbeat') return;
      setLastEvent(event);
      onEventRef.current?.(event);
    });
  }, [enabled]);

  return { connected, lastEvent };
}
