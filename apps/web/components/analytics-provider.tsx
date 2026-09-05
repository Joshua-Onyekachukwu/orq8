"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initAnalytics, trackPageView } from "../lib/analytics";

/**
 * PostHog analytics provider — mount ONCE in the root layout.
 * Initializes PostHog on mount and tracks a pageview on every route change
 * (the app is a client-navigating SPA, so URL changes don't fire automatic
 * pageviews).
 *
 * Requires env vars:
 *   NEXT_PUBLIC_POSTHOG_KEY — PostHog project API key
 *   NEXT_PUBLIC_POSTHOG_HOST — PostHog ingest host (optional, defaults to US cloud)
 *
 * User identity is attached separately by <IdentifyUser> in authed layouts.
 */
export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
    // Track the initial page
    trackPageView(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pathname) return;
    trackPageView(pathname);
  }, [pathname]);

  return null; // No UI — side-effect only
}
