"use client";

import { useEffect } from "react";
import { initAnalytics } from "../lib/analytics";

/**
 * PostHog analytics provider.
 * Initializes PostHog on mount with user info from the layout.
 * Place in the root layout to enable analytics across the app.
 *
 * Requires env vars:
 *   NEXT_PUBLIC_POSTHOG_KEY — PostHog project API key
 *   NEXT_PUBLIC_POSTHOG_HOST — PostHog ingest host (optional, defaults to US cloud)
 */
export function AnalyticsProvider({
  userId,
  orgId,
  userName,
  userEmail,
}: {
  userId?: string;
  orgId?: string;
  userName?: string;
  userEmail?: string;
}) {
  useEffect(() => {
    initAnalytics({ userId, orgId, userName, userEmail });
  }, [userId, orgId, userName, userEmail]);

  return null; // No UI — side-effect only
}
