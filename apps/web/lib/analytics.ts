/**
 * ORQ8 Analytics — PostHog Integration
 *
 * Thin client-side analytics abstraction over PostHog.
 *
 * When NEXT_PUBLIC_POSTHOG_KEY is set, events are sent to PostHog.
 * When not set, events are logged to console (dev mode) so development
 * never throws or silently drops data.
 *
 * Privacy rules (docs/16):
 *   - Never send API keys, passwords, tokens, provider secrets, or raw
 *     prompt/response bodies. Command events send length only, never content.
 *   - Identifiers are ORQ8 user/org IDs (not emails unless the caller opts in
 *     via the profile payload on identify).
 *
 * Setup:
 *   1. Add NEXT_PUBLIC_POSTHOG_KEY (project API key) to the web app env.
 *   2. Optional NEXT_PUBLIC_POSTHOG_HOST — defaults to US cloud.
 *   3. <AnalyticsProvider> in the root layout initializes + tracks pageviews.
 *
 * Events tracked:
 *   - Page views (automatic)
 *   - Auth (register, login, logout)
 *   - Onboarding (started, completed)
 *   - Conversion (agent hired, goal created)
 *   - Executive Agent commands (sent, completed)
 */

"use client";

import posthog from "posthog-js";

// PostHog singleton — init happens at most once regardless of how many
// providers mount across layouts (root + app subtree).
let initialized = false;
let posthogInstance: typeof posthog | null = null;

function getKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

function getHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
}

/**
 * Initialize PostHog. Safe to call multiple times (idempotent).
 */
export function initAnalytics(): void {
  if (initialized) return;
  const key = getKey();
  if (!key) {
    console.log("[analytics] No NEXT_PUBLIC_POSTHOG_KEY set — events logged to console only");
    initialized = true; // Don't re-warn on every mount
    return;
  }

  try {
    posthog.init(key, {
      api_host: getHost(),
      autocapture: false, // We control what we capture
      persistence: "localStorage",
      capture_pageview: false, // We track pageviews manually via route changes
      capture_pageleave: true,
      disable_session_recording: true,
    });
    posthogInstance = posthog;
    initialized = true;
  } catch {
    console.warn("[analytics] Failed to initialize PostHog");
    initialized = true;
  }
}

function ensureClient(): boolean {
  if (typeof window === "undefined") return false;
  initAnalytics();
  return true;
}

/**
 * Track an analytics event.
 * Falls back to console logging when PostHog is not configured.
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!ensureClient()) return;
  if (posthogInstance) {
    try {
      posthogInstance.capture(event, properties);
    } catch {
      /* never let analytics break the app */
    }
  } else {
    console.log(`[analytics] ${event}`, properties);
  }
}

/**
 * Track a page view for the current path.
 */
export function trackPageView(pathname: string): void {
  track("$pageview", { pathname });
}

/**
 * Identify the current user with safe properties (no email unless profile given).
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
): void {
  if (!userId || !ensureClient()) return;
  if (posthogInstance) {
    try {
      posthogInstance.identify(userId, properties);
    } catch {
      /* non-fatal */
    }
  }
}

/**
 * Reset analytics (on logout).
 */
export function resetAnalytics(): void {
  if (!ensureClient()) return;
  if (posthogInstance) {
    try {
      posthogInstance.reset();
    } catch {
      /* non-fatal */
    }
  }
}

// ─── Preset Events ──────────────────────────────────────────────────────────

export const analytics = {
  // Auth
  userRegistered: (method: "email" | "google") =>
    track("user_registered", { method }),
  userLoggedIn: (method: "email" | "google") =>
    track("user_logged_in", { method }),
  userLoggedOut: () => track("user_logged_out"),

  // Onboarding
  onboardingStarted: (path: "idea" | "existing") =>
    track("onboarding_started", { path }),
  onboardingCompleted: (departments: number, agents: number, goals: number) =>
    track("onboarding_completed", { departments, agents, goals }),

  // Agents
  agentHired: (role: string) => track("agent_hired", { role }),
  agentPaused: (agentId: string) => track("agent_paused", { agent_id: agentId }),
  agentResumed: (agentId: string) => track("agent_resumed", { agent_id: agentId }),
  agentEmergencyStop: () => track("agent_emergency_stop"),

  // Goals
  goalCreated: (priority: string) => track("goal_created", { priority }),
  goalCompleted: (goalId: string) => track("goal_completed", { goal_id: goalId }),

  // Commands — length only, never the command content
  commandSent: (command: string) =>
    track("command_sent", { command_length: command.length }),
  commandCompleted: (status: string, durationMs: number) =>
    track("command_completed", { status, duration_ms: durationMs }),

  // AI Execution
  taskCreated: (agentRole: string) =>
    track("task_created", { agent_role: agentRole }),
  taskCompleted: (agentRole: string, durationMs: number) =>
    track("task_completed", { agent_role: agentRole, duration_ms: durationMs }),
  taskFailed: (agentRole: string) => track("task_failed", { agent_role: agentRole }),

  // Providers
  providerKeyAdded: (provider: string) =>
    track("provider_key_added", { provider }),

  // Credits
  creditsLow: (remaining: number) =>
    track("credits_low", { remaining }),

  // Errors
  apiError: (endpoint: string, status: number) =>
    track("api_error", { endpoint, status }),

  // Navigation
  pageViewed: (page: string) => track("$pageview", { page }),
};
