'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeRealtime, type RealtimeEvent } from '../lib/realtime-client';

interface Notification {
  id: string;
  type: 'approval' | 'task' | 'credit' | 'agent' | 'system';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

/**
 * Maps SSE realtime events to notification bell entries.
 *
 * Listens to the same shared SSE stream as DashboardRealtime (single
 * connection, lib/realtime-client) but creates in-app notifications instead
 * of just flashing status messages.
 */
export function useRealtimeNotifications(options: {
  enabled?: boolean;
  onNotification?: (notification: Notification) => void;
} = {}) {
  const { enabled = true, onNotification } = options;
  const [connected, setConnected] = useState(false);
  const [lastNotification, setLastNotification] = useState<Notification | null>(null);
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  useEffect(() => {
    if (!enabled) return;

    return subscribeRealtime((message) => {
      if (message.kind === 'status') {
        setConnected(message.connected);
        return;
      }
      const event = message.event;
      // Skip heartbeats
      if (event.type === 'heartbeat') return;

      const notification = mapEventToNotification(event);
      if (notification) {
        setLastNotification(notification);
        onNotificationRef.current?.(notification);
      }
    });
  }, [enabled]);

  return { connected, lastNotification };
}

/** Map a realtime event to a notification entry. Returns null for events that don't need notifications. */
function mapEventToNotification(event: RealtimeEvent): Notification | null {
  const now = new Date().toISOString();
  const id = `rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  switch (event.type) {
    case 'task.completed':
      return {
        id,
        type: 'task',
        title: 'Task Completed',
        message: `${event.agentName} completed a task${event.result ? `: ${event.result.slice(0, 100)}` : ''}`,
        read: false,
        createdAt: now,
      };

    case 'task.failed':
      return {
        id,
        type: 'agent',
        title: 'Task Failed',
        message: `${event.agentName} encountered an error: ${event.error ?? 'Unknown error'}`,
        read: false,
        createdAt: now,
      };

    case 'approval.created':
      return {
        id,
        type: 'approval',
        title: 'Approval Required',
        message: `A new approval request needs your decision: ${event.action.slice(0, 120)}`,
        read: false,
        createdAt: now,
      };

    case 'approval.decided':
      return {
        id,
        type: 'approval',
        title: `Approval ${event.status.charAt(0).toUpperCase() + event.status.slice(1)}`,
        message: `An approval request has been ${event.status}.`,
        read: false,
        createdAt: now,
      };

    case 'agent.status_changed':
      return {
        id,
        type: 'agent',
        title: 'Agent Status Changed',
        message: `An AI employee's status changed to ${event.status}.`,
        read: false,
        createdAt: now,
      };

    case 'credits.consumed':
      // Only notify for significant consumption or low balance
      if (event.remaining <= 10 || event.amount >= 5) {
        return {
          id,
          type: 'credit',
          title: event.remaining <= 10 ? 'Credits Running Low' : 'Credits Consumed',
          message: event.remaining <= 10
            ? `Only ${event.remaining} credits remaining. Consider topping up.`
            : `${event.amount} credits used for ${event.operationType}. ${event.remaining} remaining.`,
          read: false,
          createdAt: now,
        };
      }
      return null;

    case 'command.processed':
      return {
        id,
        type: 'system',
        title: 'Command Processed',
        message: event.summary.slice(0, 200),
        read: false,
        createdAt: now,
      };

    default:
      return null;
  }
}
