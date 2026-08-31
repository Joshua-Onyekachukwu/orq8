'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Browser Push Notification Hook
 *
 * Manages browser notification permission and sends native OS notifications
 * when important events occur. Gated by the user's `browserNotifications` preference.
 *
 * Uses the Web Notification API (not service worker push) for simplicity.
 * Service worker push requires a push server — this approach works without one.
 */
export function useBrowserPush(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Check current permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Request permission from the user
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }

    if (Notification.permission === 'granted') {
      setPermission('granted');
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      setPermission('denied');
      return 'denied';
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  // Send a browser notification (only if permission granted AND enabled)
  const sendNotification = useCallback(
    (title: string, options?: {
      body?: string;
      icon?: string;
      tag?: string;
      requireInteraction?: boolean;
      silent?: boolean;
    }) => {
      if (!enabled) return;
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      try {
        const notification = new Notification(title, {
          body: options?.body,
          icon: options?.icon ?? '/favicon.ico',
          tag: options?.tag, // Prevents duplicate notifications with same tag
          requireInteraction: options?.requireInteraction ?? false,
          silent: options?.silent ?? false,
        });

        // Auto-close after 8 seconds unless requireInteraction
        if (!options?.requireInteraction) {
          setTimeout(() => notification.close(), 8_000);
        }
      } catch {
        // Notification constructor failed — silent fail
      }
    },
    [enabled],
  );

  return { permission, requestPermission, sendNotification };
}
